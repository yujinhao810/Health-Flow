import { Injectable } from "@nestjs/common";
import {
  LlmConfig,
  LlmContentBlock,
  LlmEmbeddingRequest,
  LlmMessage,
  LlmStreamEvent,
  LlmStreamRequest,
  LlmStructuredRequest,
  LlmToolStreamEvent,
  LlmToolStreamRequest,
} from "../llm.types";
import {
  OpenAiCompatibleProvider,
  buildStructuredSystemPrompt,
  formatHttpError,
  formatUnknownError,
  isMaxTokensError,
  parseJsonPayload,
  structuredMaxTokenAttempts,
} from "./openai-compatible.provider";

type ResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

type ResponsesContent = { type: "output_text"; text?: string } | { type: "refusal"; refusal?: string };

type ResponsesOutputItem =
  | {
      type: "message";
      id?: string;
      role?: "assistant";
      content?: ResponsesContent[];
    }
  | {
      type: "function_call";
      id?: string;
      call_id?: string;
      name?: string;
      arguments?: string;
    };

type ResponsesPayload = {
  id?: string;
  status?: string;
  output?: ResponsesOutputItem[];
  usage?: ResponsesUsage;
  error?: { message?: string } | null;
};

type ResponsesStreamEvent = {
  type?: string;
  delta?: string;
  text?: string;
  item_id?: string;
  output_index?: number;
  item?: ResponsesOutputItem;
  response?: ResponsesPayload;
  error?: { message?: string };
};

type ResponsesInputItem =
  | {
      role: "system" | "user" | "assistant";
      content: string | Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }>;
    }
  | {
      type: "function_call";
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: "function_call_output";
      call_id: string;
      output: string;
    };

const STRUCTURED_TRANSIENT_RETRY_DELAYS_MS = [350, 900] as const;

@Injectable()
export class OpenAiResponsesProvider extends OpenAiCompatibleProvider {
  async validate(config: LlmConfig) {
    try {
      const response = await this.fetchResponses(
        config,
        {
          model: config.model,
          input: "ping",
          stream: false,
          store: false,
          max_output_tokens: 64,
        },
        AbortSignal.timeout(15000),
      );

      if (!response.ok) {
        return { valid: false, message: await formatHttpError(response) };
      }

      const payload = (await response.json()) as ResponsesPayload;
      const text = extractResponsesText(payload);
      if (!text.trim()) {
        return {
          valid: false,
          message: "连接成功，但返回内容不是有效的 Responses API 响应",
        };
      }

      return { valid: true, message: "Responses API 连接验证成功" };
    } catch (error) {
      return { valid: false, message: formatUnknownError(error) };
    }
  }

  async *streamChat(request: LlmStreamRequest): AsyncIterable<LlmStreamEvent> {
    const response = await this.fetchResponses(
      request.config,
      buildResponsesBody(request, { stream: true }),
      request.signal,
    );
    await assertStreamingResponse(response);

    let fullText = "";
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    for await (const event of readResponsesStream(response)) {
      if (event.type === "response.output_text.delta" && event.delta) {
        fullText += event.delta;
        yield { type: "delta", text: event.delta };
      }
      if (event.type === "response.completed" && event.response) {
        assertCompletedResponse(event.response);
        if (!fullText) {
          const text = extractResponsesText(event.response);
          if (text) {
            fullText = text;
            yield { type: "delta", text };
          }
        }
        inputTokens = event.response.usage?.input_tokens;
        outputTokens = event.response.usage?.output_tokens;
      }
      if (event.type === "error" || event.type === "response.failed") {
        throw new Error(event.error?.message || event.response?.error?.message || "Responses API 请求失败");
      }
    }

    if (!fullText.trim()) {
      throw new Error("模型服务返回成功，但 Responses 流中没有文本内容");
    }

    yield { type: "usage", inputTokens, outputTokens };
    yield { type: "done", fullText };
  }

  async *streamChatWithTools(request: LlmToolStreamRequest): AsyncIterable<LlmToolStreamEvent> {
    const response = await this.fetchResponses(
      request.config,
      buildResponsesBody(request, {
        stream: true,
        tools: request.tools.map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          strict: tool.strict ?? false,
        })),
        tool_choice: toResponsesToolChoice(request.toolChoice),
      }),
      request.signal,
    );
    await assertStreamingResponse(response);

    let fullText = "";
    let completedResponse: ResponsesPayload | undefined;
    const streamedItems = new Map<string, ResponsesOutputItem>();
    const announcedCalls = new Set<string>();

    for await (const event of readResponsesStream(response)) {
      if (event.type === "response.output_text.delta" && event.delta) {
        fullText += event.delta;
        yield { type: "delta", text: event.delta };
      }

      if ((event.type === "response.output_item.added" || event.type === "response.output_item.done") && event.item) {
        const key = responseItemKey(event.item, event);
        streamedItems.set(key, mergeResponseItem(streamedItems.get(key), event.item));
        if (event.item.type === "function_call") {
          const id = event.item.call_id || event.item.id || key;
          if (event.item.name && !announcedCalls.has(id)) {
            announcedCalls.add(id);
            yield { type: "tool_call", id, name: event.item.name, input: {} };
          }
        }
      }

      if (event.type === "response.function_call_arguments.delta" && event.delta) {
        const key = event.item_id || `output_${event.output_index ?? 0}`;
        const current = streamedItems.get(key);
        if (current?.type === "function_call") {
          streamedItems.set(key, {
            ...current,
            arguments: `${current.arguments ?? ""}${event.delta}`,
          });
        }
      }

      if (event.type === "response.completed" && event.response) {
        assertCompletedResponse(event.response);
        completedResponse = event.response;
        if (!fullText) {
          const text = extractResponsesText(event.response);
          if (text) {
            fullText = text;
            yield { type: "delta", text };
          }
        }
      }

      if (event.type === "error" || event.type === "response.failed") {
        throw new Error(event.error?.message || event.response?.error?.message || "Responses API 请求失败");
      }
    }

    const output = completedResponse?.output ?? [...streamedItems.values()];
    const content = responsesOutputToContent(output, fullText);
    if (!content.length) {
      throw new Error("模型服务返回成功，但 Responses 流中没有文本或工具调用");
    }

    yield {
      type: "message",
      content,
      stopReason: responseStopReason(output),
      inputTokens: completedResponse?.usage?.input_tokens,
      outputTokens: completedResponse?.usage?.output_tokens,
    };
  }

  async generateStructured<T = unknown>(request: LlmStructuredRequest) {
    const strictSchema = toStrictJsonSchema(request.schema);
    const fallbackInstructions = buildStructuredSystemPrompt(request.system, strictSchema);
    const stream = isCustomResponsesRelay(request.config);
    const formats = [
      {
        body: {
          text: {
            format: {
              type: "json_schema",
              name: request.schemaName,
              strict: true,
              schema: strictSchema,
            },
          },
        },
        instructions: buildStrictResponsesInstructions(request.system),
      },
      {
        body: { text: { format: { type: "json_object" } } },
        instructions: fallbackInstructions,
      },
      { body: {}, instructions: fallbackInstructions },
    ];
    const errors: string[] = [];
    const maxTokenAttempts = structuredMaxTokenAttempts(request.config.provider, request.maxOutputTokens);

    formatAttempt: for (const format of formats) {
      tokenAttempt: for (let index = 0; index < maxTokenAttempts.length; index += 1) {
        let transientRetryIndex = 0;
        while (true) {
          try {
            const response = await this.fetchResponses(
              request.config,
              {
                model: request.config.model,
                stream,
                store: false,
                instructions: format.instructions,
                input: toResponsesInput(request.messages),
                max_output_tokens: maxTokenAttempts[index],
                ...format.body,
              },
              request.signal,
            );

            if (!response.ok) {
              const status = response.status;
              const retryAfter = response.headers.get("retry-after");
              const message = await formatHttpError(response);
              appendUniqueError(errors, message);
              if (
                isTransientStructuredStatus(status) &&
                transientRetryIndex < STRUCTURED_TRANSIENT_RETRY_DELAYS_MS.length
              ) {
                await waitForStructuredRetry(transientRetryIndex, request.schemaName, retryAfter, request.signal);
                transientRetryIndex += 1;
                continue;
              }
              if (status === 400 && isMaxTokensError(message) && index < maxTokenAttempts.length - 1) {
                continue tokenAttempt;
              }
              if (status === 400) continue formatAttempt;
              throw new Error(message);
            }

            const structuredResponse = await readStructuredResponse(response, stream);
            const payload = structuredResponse.payload;
            assertCompletedResponse(payload);
            const rawText = structuredResponse.rawText.trim();
            if (!rawText) {
              appendUniqueError(errors, "Responses API 未返回可解析的结构化内容");
              continue formatAttempt;
            }

            return {
              parsed: parseJsonPayload<T>(rawText),
              rawText,
              usage: {
                inputTokens: payload.usage?.input_tokens,
                outputTokens: payload.usage?.output_tokens,
              },
            };
          } catch (error) {
            if (request.signal?.aborted) throw error;
            appendUniqueError(errors, error instanceof Error ? error.message : "Responses API 结构化输出失败");
            continue formatAttempt;
          }
        }
      }
    }

    throw new Error(`Responses API 结构化输出失败：${errors.filter(Boolean).join("；")}`);
  }

  async embedTexts(request: LlmEmbeddingRequest) {
    return super.embedTexts(request);
  }

  private fetchResponses(config: LlmConfig, body: Record<string, unknown>, signal?: AbortSignal) {
    return this.fetchProviderEndpoint(config, "/responses", body, signal);
  }
}

function buildResponsesBody(request: LlmStreamRequest, extra: Record<string, unknown>) {
  return {
    model: request.config.model,
    store: false,
    instructions: request.system || undefined,
    input: toResponsesInput(request.messages),
    ...extra,
  };
}

function toResponsesInput(messages: LlmMessage[]): ResponsesInputItem[] {
  const result: ResponsesInputItem[] = [];

  for (const message of messages) {
    if (typeof message.content === "string") {
      if (message.content.trim()) {
        result.push({ role: message.role, content: message.content });
      }
      continue;
    }

    const text = message.content
      .filter((block): block is Extract<LlmContentBlock, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("");
    const images = message.content.filter(
      (block): block is Extract<LlmContentBlock, { type: "image" }> => block.type === "image",
    );
    const toolUses = message.content.filter(
      (block): block is Extract<LlmContentBlock, { type: "tool_use" }> => block.type === "tool_use",
    );
    const toolResults = message.content.filter(
      (block): block is Extract<LlmContentBlock, { type: "tool_result" }> => block.type === "tool_result",
    );

    if (text || images.length) {
      result.push({
        role: message.role,
        content: images.length
          ? [
              ...(text ? [{ type: "input_text" as const, text }] : []),
              ...images.map((image) => ({
                type: "input_image" as const,
                image_url: `data:${image.mediaType};base64,${image.data}`,
              })),
            ]
          : text,
      });
    }

    for (const toolUse of toolUses) {
      result.push({
        type: "function_call",
        call_id: toolUse.id,
        name: toolUse.name,
        arguments: JSON.stringify(toolUse.input ?? {}),
      });
    }
    for (const toolResult of toolResults) {
      result.push({
        type: "function_call_output",
        call_id: toolResult.toolUseId,
        output: toolResult.content,
      });
    }
  }

  return result;
}

function toResponsesToolChoice(toolChoice: LlmToolStreamRequest["toolChoice"]) {
  if (!toolChoice || toolChoice.type === "auto") return "auto";
  return { type: "function", name: toolChoice.name };
}

function extractResponsesText(payload: ResponsesPayload) {
  return (payload.output ?? [])
    .filter((item): item is Extract<ResponsesOutputItem, { type: "message" }> => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((content): content is Extract<ResponsesContent, { type: "output_text" }> => content.type === "output_text")
    .map((content) => content.text ?? "")
    .join("");
}

function responsesOutputToContent(output: ResponsesOutputItem[], streamedText: string): LlmContentBlock[] {
  const content: LlmContentBlock[] = [];
  const text = streamedText || extractResponsesText({ output });
  if (text.trim()) content.push({ type: "text", text });

  for (const item of output) {
    if (item.type !== "function_call" || !item.name) continue;
    content.push({
      type: "tool_use",
      id: item.call_id || item.id || `call_${content.length}`,
      name: item.name,
      input: parseToolArguments(item.arguments ?? ""),
    });
  }
  return content;
}

function responseStopReason(output: ResponsesOutputItem[]) {
  if (output.some((item) => item.type === "function_call")) return "tool_use";
  if (output.some((item) => item.type === "message" && item.content?.some((content) => content.type === "refusal"))) {
    return "refusal";
  }
  return "end_turn";
}

function responseItemKey(item: ResponsesOutputItem, event: ResponsesStreamEvent) {
  return (
    item.id ||
    (item.type === "function_call" ? item.call_id : undefined) ||
    event.item_id ||
    `output_${event.output_index ?? 0}`
  );
}

function mergeResponseItem(
  current: ResponsesOutputItem | undefined,
  incoming: ResponsesOutputItem,
): ResponsesOutputItem {
  if (!current || current.type !== incoming.type) return incoming;
  if (incoming.type === "function_call" && current.type === "function_call") {
    return {
      ...current,
      ...incoming,
      arguments: incoming.arguments || current.arguments,
    };
  }
  return incoming;
}

function parseToolArguments(raw: string) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw };
  }
}

async function assertStreamingResponse(response: Response) {
  if (!response.ok) throw new Error(await formatHttpError(response));
  if (!response.body) throw new Error("Responses API 未返回流式响应体");
}

function assertCompletedResponse(payload: ResponsesPayload) {
  if (payload.error?.message) throw new Error(payload.error.message);
  if (
    payload.status === "failed" ||
    payload.status === "cancelled" ||
    payload.status === "incomplete"
  ) {
    throw new Error(`Responses API 返回状态：${payload.status}`);
  }
}

async function* readResponsesStream(response: Response): AsyncIterable<ResponsesStreamEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      for (const event of parseResponsesEvents(block)) yield event;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const event of parseResponsesEvents(buffer)) yield event;
  }
}

function parseResponsesEvents(block: string) {
  const events: ResponsesStreamEvent[] = [];
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      events.push(JSON.parse(payload) as ResponsesStreamEvent);
    } catch {
      throw new Error("无法解析 Responses API 流式事件");
    }
  }
  return events;
}

function isCustomResponsesRelay(config: LlmConfig) {
  if (!config.baseUrl) return false;
  try {
    const url = new URL(config.baseUrl);
    return url.hostname.toLowerCase() !== "api.openai.com";
  } catch {
    return true;
  }
}

function buildStrictResponsesInstructions(system: string) {
  return [
    system,
    "严格遵循响应格式中提供的 JSON Schema。",
    "只返回符合该 Schema 的 JSON 对象，不要包含 Markdown、代码块、解释性前后缀或额外文本。",
    "缺失信息请用空数组、空字符串或保守的安全提示补足，不要省略字段。",
  ].join("\n");
}

async function readStructuredResponse(response: Response, streamed: boolean) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!streamed || !contentType.includes("text/event-stream")) {
    const payload = (await response.json()) as ResponsesPayload;
    return { payload, rawText: extractResponsesText(payload) };
  }

  let payload: ResponsesPayload | undefined;
  let rawText = "";
  for await (const event of readResponsesStream(response)) {
    if (event.type === "response.output_text.delta" && event.delta) {
      rawText += event.delta;
    }
    if (event.type === "response.output_text.done" && !rawText && event.text) {
      rawText = event.text;
    }
    if (event.type === "response.completed" && event.response) {
      payload = event.response;
    }
    if (event.type === "error" || event.type === "response.failed") {
      throw new Error(
        event.error?.message || event.response?.error?.message || "Responses API 请求失败",
      );
    }
  }

  if (!payload) throw new Error("Responses API 流结束时没有 completed 响应");
  return { payload, rawText: rawText || extractResponsesText(payload) };
}

function toStrictJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toStrictJsonSchema);
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const normalized = Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, toStrictJsonSchema(entry)]));
  const properties = normalized.properties;
  if (normalized.type === "object" && properties && typeof properties === "object" && !Array.isArray(properties)) {
    normalized.required = Object.keys(properties as Record<string, unknown>);
    normalized.additionalProperties = false;
  }
  return normalized;
}

function isTransientStructuredStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function waitForStructuredRetry(
  retryIndex: number,
  schemaName: string,
  retryAfter: string | null,
  signal?: AbortSignal,
) {
  const headerDelay = retryAfterMilliseconds(retryAfter);
  const baseDelay = STRUCTURED_TRANSIENT_RETRY_DELAYS_MS[retryIndex] ?? 900;
  const delay = headerDelay ?? baseDelay + (stableHash(schemaName) % 200);
  if (delay <= 0) {
    throwIfAborted(signal);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryAfterMilliseconds(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function stableHash(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

function appendUniqueError(errors: string[], message: string) {
  if (message && !errors.includes(message)) errors.push(message);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortReason(signal);
}

function abortReason(signal?: AbortSignal) {
  return signal?.reason instanceof Error ? signal.reason : new Error("Responses API 请求已取消");
}
