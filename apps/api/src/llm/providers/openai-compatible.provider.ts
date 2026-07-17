import { Injectable } from "@nestjs/common";
import { LLM_PROVIDER_METADATA } from "@health/shared";
import https, { type RequestOptions } from "node:https";
import net from "node:net";
import tls from "node:tls";
import { Readable } from "node:stream";
import {
  LlmConfig,
  LlmContentBlock,
  LlmEmbeddingRequest,
  LlmProvider,
  LlmStreamEvent,
  LlmStreamRequest,
  LlmStructuredRequest,
  LlmToolStreamEvent,
  LlmToolStreamRequest,
} from "../llm.types";

type ChatCompletionChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type EmbeddingResponse = {
  data?: Array<{ index?: number; embedding?: number[] }>;
  model?: string;
};

type OpenAiChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?:
    | string
    | null
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

@Injectable()
export class OpenAiCompatibleProvider implements LlmProvider {
  name = "openai" as const;
  capabilities = { supportsToolUse: true, supportsEmbeddings: true };

  async validate(config: LlmConfig) {
    try {
      const response = await this.fetchChatCompletions(
        config,
        {
          model: config.model,
          stream: false,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        },
        AbortSignal.timeout(15000),
      );

      if (!response.ok) {
        return { valid: false, message: await formatHttpError(response) };
      }

      return { valid: true, message: "连接验证成功" };
    } catch (error) {
      return { valid: false, message: formatUnknownError(error) };
    }
  }

  async *streamChat(request: LlmStreamRequest): AsyncIterable<LlmStreamEvent> {
    const response = await this.fetchChatCompletions(
      request.config,
      {
        model: request.config.model,
        stream: true,
        messages: toOpenAiMessages(request.system, request.messages),
      },
      request.signal,
    );

    if (!response.ok) {
      throw new Error(await formatHttpError(response));
    }
    if (!response.body) {
      throw new Error("Provider did not return a streaming response body");
    }

    let fullText = "";
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const payloads = parseSsePayloads(block);
        for (const payload of payloads) {
          if (payload === "[DONE]") continue;
          const chunk = parseProviderChunk(payload);
          if (!chunk) continue;
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) {
            fullText += text;
            yield { type: "delta", text };
          }
          inputTokens = chunk.usage?.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage?.completion_tokens ?? outputTokens;
        }
      }
    }

    if (buffer.trim()) {
      for (const payload of parseSsePayloads(buffer)) {
        if (payload === "[DONE]") continue;
        const chunk = parseProviderChunk(payload);
        if (!chunk) continue;
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) {
          fullText += text;
          yield { type: "delta", text };
        }
        inputTokens = chunk.usage?.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage?.completion_tokens ?? outputTokens;
      }
    }

    yield { type: "usage", inputTokens, outputTokens };
    yield { type: "done", fullText };
  }

  async *streamChatWithTools(
    request: LlmToolStreamRequest,
  ): AsyncIterable<LlmToolStreamEvent> {
    const response = await this.fetchChatCompletions(
      request.config,
      {
        model: request.config.model,
        stream: true,
        messages: toOpenAiMessages(request.system, request.messages),
        tools: request.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            strict: tool.strict ?? false,
          },
        })),
        tool_choice: toOpenAiToolChoice(request.toolChoice),
      },
      request.signal,
    );

    if (!response.ok) {
      throw new Error(await formatHttpError(response));
    }
    if (!response.body) {
      throw new Error("Provider did not return a streaming response body");
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    const toolCalls = new Map<
      number,
      { id?: string; name: string; arguments: string }
    >();
    const emittedToolCallIndexes = new Set<number>();
    let buffer = "";
    let fullText = "";
    let finishReason: string | null = null;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    const handleChunk = async function* (
      chunk: ChatCompletionChunk,
    ): AsyncIterable<LlmToolStreamEvent> {
      const choice = chunk.choices?.[0];
      const text = choice?.delta?.content;
      if (text) {
        fullText += text;
        yield { type: "delta" as const, text };
      }

      for (const call of choice?.delta?.tool_calls ?? []) {
        const index = call.index ?? 0;
        const current = toolCalls.get(index) ?? { name: "", arguments: "" };
        if (call.id) current.id = call.id;
        if (call.function?.name) current.name += call.function.name;
        if (call.function?.arguments)
          current.arguments += call.function.arguments;
        toolCalls.set(index, current);

        if (!emittedToolCallIndexes.has(index) && current.id && current.name) {
          emittedToolCallIndexes.add(index);
          yield {
            type: "tool_call" as const,
            id: current.id,
            name: current.name,
            input: {},
          };
        }
      }

      finishReason = choice?.finish_reason ?? finishReason;
      inputTokens = chunk.usage?.prompt_tokens ?? inputTokens;
      outputTokens = chunk.usage?.completion_tokens ?? outputTokens;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        for (const payload of parseSsePayloads(block)) {
          if (payload === "[DONE]") continue;
          const chunk = parseProviderChunk(payload);
          if (!chunk) continue;
          for await (const event of handleChunk(chunk)) yield event;
        }
      }
    }

    if (buffer.trim()) {
      for (const payload of parseSsePayloads(buffer)) {
        if (payload === "[DONE]") continue;
        const chunk = parseProviderChunk(payload);
        if (!chunk) continue;
        for await (const event of handleChunk(chunk)) yield event;
      }
    }

    if (inputTokens !== undefined || outputTokens !== undefined) {
      yield { type: "usage", inputTokens, outputTokens };
    }

    const content: LlmContentBlock[] = [];
    if (fullText.trim()) content.push({ type: "text", text: fullText });
    for (const [index, call] of [...toolCalls.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      if (!call.name) continue;
      content.push({
        type: "tool_use",
        id: call.id || `tool_call_${index}`,
        name: call.name,
        input: parseToolArguments(call.arguments),
      });
    }

    yield {
      type: "message",
      content,
      stopReason: finishReason,
      inputTokens,
      outputTokens,
    };
  }

  async embedTexts(request: LlmEmbeddingRequest) {
    const model =
      request.model ||
      request.config.embeddingModel ||
      defaultEmbeddingModel(request.config.provider);
    const response = await this.fetchEmbeddings(
      request.config,
      {
        model,
        input: request.texts,
      },
      request.signal,
    );

    if (!response.ok) {
      throw new Error(await formatHttpError(response));
    }

    const payload = (await response.json()) as EmbeddingResponse;
    const vectors = (payload.data ?? [])
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => item.embedding)
      .filter((embedding): embedding is number[] => Array.isArray(embedding));

    if (vectors.length !== request.texts.length) {
      throw new Error("Embedding API 返回的向量数量与输入文本数量不一致");
    }

    return { vectors, model: payload.model || model };
  }

  async generateStructured<T = unknown>(request: LlmStructuredRequest) {
    const messages = [
      ...(request.system
        ? [
            {
              role: "system",
              content: buildStructuredSystemPrompt(
                request.system,
                request.schema,
              ),
            },
          ]
        : []),
      ...toOpenAiMessages("", request.messages).filter(
        (message) => message.role !== "system",
      ),
    ];

    const jsonSchemaAttempt = {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: request.schemaName,
          strict: true,
          schema: request.schema,
        },
      },
    };
    const jsonObjectAttempt = { response_format: { type: "json_object" } };
    const attempts =
      request.config.provider === "qwen"
        ? [jsonObjectAttempt, jsonSchemaAttempt, {}]
        : [jsonSchemaAttempt, jsonObjectAttempt, {}];
    const errors: string[] = [];
    const maxTokenAttempts = structuredMaxTokenAttempts(
      request.config.provider,
      request.maxOutputTokens,
    );

    for (const attempt of attempts) {
      for (
        let maxTokenIndex = 0;
        maxTokenIndex < maxTokenAttempts.length;
        maxTokenIndex += 1
      ) {
        const maxTokens = maxTokenAttempts[maxTokenIndex];
        try {
          const response = await this.fetchChatCompletions(
            request.config,
            {
              model: request.config.model,
              stream: false,
              max_tokens: maxTokens,
              ...(request.config.provider === "qwen"
                ? { enable_thinking: false }
                : {}),
              ...attempt,
              messages,
            },
            request.signal,
          );

          if (!response.ok) {
            const message = await formatHttpError(response);
            errors.push(message);
            if (
              response.status === 400 &&
              isMaxTokensError(message) &&
              maxTokenIndex < maxTokenAttempts.length - 1
            )
              continue;
            if (response.status === 400) break;
            throw new Error(message);
          }

          const payload = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const rawText = payload.choices?.[0]?.message?.content?.trim();
          if (!rawText) {
            errors.push("Provider 未返回可解析的结构化内容");
            break;
          }

          return {
            parsed: parseJsonPayload<T>(rawText),
            rawText,
            usage: {
              inputTokens: payload.usage?.prompt_tokens,
              outputTokens: payload.usage?.completion_tokens,
            },
          };
        } catch (error) {
          if (request.signal?.aborted) throw error;
          errors.push(
            error instanceof Error ? error.message : "结构化输出失败",
          );
          break;
        }
      }
    }

    throw new Error(
      `Provider 结构化输出失败：${errors.filter(Boolean).join("；")}`,
    );
  }

  private fetchChatCompletions(
    config: LlmConfig,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    return this.fetchProviderEndpoint(
      config,
      "/chat/completions",
      body,
      signal,
    );
  }

  private fetchEmbeddings(
    config: LlmConfig,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    return this.fetchProviderEndpoint(config, "/embeddings", body, signal, {
      apiKey: config.embeddingApiKey ?? config.apiKey,
      baseUrl: config.embeddingBaseUrl ?? config.baseUrl,
    });
  }

  private async fetchProviderEndpoint(
    config: LlmConfig,
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
    override?: { apiKey?: string; baseUrl?: string },
  ) {
    const metadata = LLM_PROVIDER_METADATA[config.provider];
    const defaultBaseUrl =
      "defaultBaseUrl" in metadata ? metadata.defaultBaseUrl : undefined;
    const baseUrl = trimTrailingSlash(
      override?.baseUrl || config.baseUrl || defaultBaseUrl,
    );
    const apiKey = override?.apiKey ?? config.apiKey;
    if (!baseUrl) {
      throw new Error(`${metadata.label} Base URL is required`);
    }
    if (metadata.requiresApiKey && !apiKey) {
      throw new Error(`${metadata.label} API key is required`);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    try {
      return await fetchWithOptionalProxy(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw new Error(formatUnknownError(error), { cause: error });
    }
  }
}

function trimTrailingSlash(value?: string) {
  return value?.replace(/\/+$/, "");
}

function buildStructuredSystemPrompt(system: string, schema: unknown) {
  return [
    system,
    "你必须只返回一个合法 JSON 对象，不要包含 Markdown、代码块、解释性前后缀或额外文本。",
    "JSON 对象必须满足以下 JSON Schema；缺失信息请用空数组、空字符串或保守的安全提示补足，不要省略 required 字段。",
    JSON.stringify(schema),
  ].join("\n");
}

function toOpenAiMessages(
  system: string,
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | LlmContentBlock[];
  }>,
) {
  const result: OpenAiChatMessage[] = [];
  if (system) result.push({ role: "system", content: system });

  for (const message of messages) {
    if (message.role === "system") {
      if (typeof message.content === "string" && message.content.trim()) {
        result.push({ role: "system", content: message.content });
      }
      continue;
    }

    if (typeof message.content === "string") {
      result.push({ role: message.role, content: message.content });
      continue;
    }

    const text = message.content
      .filter(
        (block): block is Extract<LlmContentBlock, { type: "text" }> =>
          block.type === "text",
      )
      .map((block) => block.text)
      .join("");
    const images = message.content.filter(
      (block): block is Extract<LlmContentBlock, { type: "image" }> =>
        block.type === "image",
    );
    const toolUses = message.content.filter(
      (block): block is Extract<LlmContentBlock, { type: "tool_use" }> =>
        block.type === "tool_use",
    );
    const toolResults = message.content.filter(
      (block): block is Extract<LlmContentBlock, { type: "tool_result" }> =>
        block.type === "tool_result",
    );

    if (toolUses.length) {
      result.push({
        role: "assistant",
        content: text || null,
        tool_calls: toolUses.map((toolUse) => ({
          id: toolUse.id,
          type: "function",
          function: {
            name: toolUse.name,
            arguments: JSON.stringify(toolUse.input ?? {}),
          },
        })),
      });
    } else if (text || images.length) {
      result.push({
        role: message.role,
        content: buildOpenAiContent(text, images),
      });
    }

    for (const block of toolResults) {
      result.push({
        role: "tool",
        tool_call_id: block.toolUseId,
        content: block.content,
      });
    }
  }

  return result;
}

function toOpenAiToolChoice(toolChoice: LlmToolStreamRequest["toolChoice"]) {
  if (!toolChoice || toolChoice.type === "auto") return "auto";
  return { type: "function", function: { name: toolChoice.name } };
}

function buildOpenAiContent(
  text: string,
  images: Array<Extract<LlmContentBlock, { type: "image" }>>,
) {
  if (!images.length) return text;
  return [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...images.map((image) => ({
      type: "image_url" as const,
      image_url: { url: `data:${image.mediaType};base64,${image.data}` },
    })),
  ];
}

function parseToolArguments(raw: string) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw };
  }
}

function defaultEmbeddingModel(provider: LlmConfig["provider"]) {
  const defaults: Partial<Record<LlmConfig["provider"], string>> = {
    openai: "text-embedding-3-small",
    openrouter: "text-embedding-3-small",
    ollama: "nomic-embed-text",
    qwen: "text-embedding-v4",
    zhipu: "embedding-3",
    baidu: "bge-large-zh",
    volcengine: "doubao-embedding-large-text-240915",
  };
  return defaults[provider] ?? "text-embedding-3-small";
}

function structuredMaxTokenAttempts(
  provider: LlmConfig["provider"],
  requestedMax?: number,
) {
  if (requestedMax !== undefined) {
    const maximum = Math.max(256, Math.floor(requestedMax));
    const reduced = Math.max(256, Math.floor(maximum / 2));
    return maximum === reduced ? [maximum] : [maximum, reduced];
  }
  if (provider === "qwen") return [4096, 2048];
  return [8192, 4096, 2048];
}

function isMaxTokensError(message: string) {
  return /max[_\s-]?(?:completion[_\s-]?)?tokens?|output tokens?|maximum|too large|exceed|range|token.*limit|最大|输出.*token|超出|超过/i.test(
    message,
  );
}

function parseProviderChunk(payload: string) {
  try {
    return JSON.parse(payload) as ChatCompletionChunk;
  } catch {
    return undefined;
  }
}

function parseJsonPayload<T>(rawText: string): T {
  try {
    return JSON.parse(rawText) as T;
  } catch {
    const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match) return JSON.parse(match[1]) as T;
    const first = rawText.indexOf("{");
    const last = rawText.lastIndexOf("}");
    if (first >= 0 && last > first)
      return JSON.parse(rawText.slice(first, last + 1)) as T;
    throw new Error("结构化输出不是合法 JSON");
  }
}

function parseSsePayloads(block: string) {
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter(Boolean);
}

async function formatHttpError(response: Response) {
  const body = await response.text();
  const detail =
    safeJsonMessage(body) || body.slice(0, 300) || response.statusText;
  if (response.status === 401 || response.status === 403)
    return `认证失败：请检查 API Key 或权限（HTTP ${response.status}）：${detail}`;
  if (response.status === 404)
    return `接口或模型不存在：请检查 Base URL 和模型 ID（HTTP ${response.status}）：${detail}`;
  if (response.status === 429)
    return `额度不足或触发限流（HTTP ${response.status}）：${detail}`;
  return `连接验证失败（HTTP ${response.status}）：${detail}`;
}

function safeJsonMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string };
      message?: string;
    };
    return parsed.error?.message || parsed.message;
  } catch {
    return undefined;
  }
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return "连接超时：后端在 15 秒内没有连上模型服务，请检查网络、代理或 Base URL。";
    }

    const cause = (error as Error & { cause?: unknown }).cause;
    const causeMessage = formatErrorCause(cause);
    if (error.message === "fetch failed") {
      return [
        "后端无法连接到模型服务：fetch failed。",
        "这通常不是 API Key 或模型名错误，而是网络、代理、DNS、证书，或 Base URL 无法从后端访问。",
        causeMessage ? `底层原因：${causeMessage}` : undefined,
      ]
        .filter(Boolean)
        .join(" ");
    }

    return causeMessage ? `${error.message}：${causeMessage}` : error.message;
  }
  return "连接验证失败";
}

function formatErrorCause(cause: unknown) {
  if (!cause) return undefined;
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "object") {
    const value = cause as { code?: string; message?: string; reason?: string };
    return [value.code, value.message, value.reason].filter(Boolean).join(" ");
  }
  return String(cause);
}

async function fetchWithOptionalProxy(url: string, init: RequestInit) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return fetch(url, init);
  return fetchViaHttpProxy(url, init, proxyUrl);
}

function getProxyUrl() {
  return (
    process.env.LLM_HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY
  );
}

function fetchViaHttpProxy(
  url: string,
  init: RequestInit,
  proxyUrl: string,
): Promise<Response> {
  const target = new URL(url);
  const proxy = new URL(proxyUrl);
  if (target.protocol !== "https:" || !/^https?:$/.test(proxy.protocol)) {
    return fetch(url, init);
  }

  return new Promise((resolve, reject) => {
    const body =
      typeof init.body === "string" || Buffer.isBuffer(init.body)
        ? init.body
        : undefined;
    const headers = new Headers(init.headers);
    headers.set("Host", target.host);
    if (body !== undefined && !headers.has("Content-Length")) {
      headers.set("Content-Length", String(Buffer.byteLength(body)));
    }

    const requestOptions: RequestOptions = {
      method: init.method ?? "GET",
      host: target.hostname,
      port: target.port ? Number(target.port) : 443,
      path: `${target.pathname}${target.search}`,
      headers: Object.fromEntries(headers.entries()),
      signal: init.signal ?? undefined,
      createConnection: (_options, callback) => {
        createProxyTunnel(proxy, target, (error, socket) => {
          if (error) {
            callback(error, undefined as unknown as tls.TLSSocket);
            return;
          }
          callback(null, socket as tls.TLSSocket);
        });
        return undefined as unknown as net.Socket;
      },
    };

    const request = https.request(requestOptions, (upstream) => {
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (Array.isArray(value)) responseHeaders.set(key, value.join(", "));
        else if (value !== undefined) responseHeaders.set(key, String(value));
      }

      resolve(
        new Response(Readable.toWeb(upstream) as ReadableStream, {
          status: upstream.statusCode ?? 500,
          statusText: upstream.statusMessage,
          headers: responseHeaders,
        }),
      );
    });

    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function createProxyTunnel(
  proxy: URL,
  target: URL,
  callback: (error: Error | null, socket?: net.Socket) => void,
) {
  const proxyPort = proxy.port
    ? Number(proxy.port)
    : proxy.protocol === "https:"
      ? 443
      : 80;
  const proxySocket = net.connect(proxyPort, proxy.hostname);
  let buffer = Buffer.alloc(0);

  proxySocket.once("connect", () => {
    const targetPort = target.port || "443";
    const auth = proxy.username
      ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}\r\n`
      : "";
    proxySocket.write(
      `CONNECT ${target.hostname}:${targetPort} HTTP/1.1\r\nHost: ${target.hostname}:${targetPort}\r\n${auth}Connection: keep-alive\r\n\r\n`,
    );
  });

  proxySocket.on("data", function onData(chunk) {
    buffer = Buffer.concat([buffer, chunk]);
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;

    proxySocket.off("data", onData);
    const header = buffer.slice(0, headerEnd).toString("utf8");
    if (!/^HTTP\/1\.[01] 200/i.test(header)) {
      callback(
        new Error(
          `代理连接失败：${header.split("\r\n")[0] || "unknown response"}`,
        ),
      );
      proxySocket.destroy();
      return;
    }

    const rest = buffer.slice(headerEnd + 4);
    const secureSocket = tls.connect(
      { socket: proxySocket, servername: target.hostname },
      () => {
        if (rest.length) secureSocket.unshift(rest);
        callback(null, secureSocket);
      },
    );
    secureSocket.once("error", callback);
  });

  proxySocket.once("error", callback);
}
