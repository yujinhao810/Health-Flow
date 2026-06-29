import { Injectable } from '@nestjs/common';
import { LLM_PROVIDER_METADATA } from '@health/shared';
import { LlmConfig, LlmProvider, LlmStreamEvent, LlmStreamRequest, LlmStructuredRequest } from '../llm.types';

type ChatCompletionChunk = {
  choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

@Injectable()
export class OpenAiCompatibleProvider implements LlmProvider {
  name = 'openai' as const;
  capabilities = { supportsToolUse: false };

  async validate(config: LlmConfig) {
    try {
      const response = await this.fetchChatCompletions(
        config,
        {
          model: config.model,
          stream: false,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        },
        AbortSignal.timeout(15000),
      );

      if (!response.ok) {
        return { valid: false, message: await formatHttpError(response) };
      }

      return { valid: true, message: '连接验证成功' };
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
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          ...request.messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({ role: message.role, content: message.content })),
        ],
      },
      request.signal,
    );

    if (!response.ok) {
      throw new Error(await formatHttpError(response));
    }
    if (!response.body) {
      throw new Error('Provider did not return a streaming response body');
    }

    let fullText = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const payloads = parseSsePayloads(block);
        for (const payload of payloads) {
          if (payload === '[DONE]') continue;
          const chunk = parseProviderChunk(payload);
          if (!chunk) continue;
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) {
            fullText += text;
            yield { type: 'delta', text };
          }
          inputTokens = chunk.usage?.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage?.completion_tokens ?? outputTokens;
        }
      }
    }

    if (buffer.trim()) {
      for (const payload of parseSsePayloads(buffer)) {
        if (payload === '[DONE]') continue;
        const chunk = parseProviderChunk(payload);
        if (!chunk) continue;
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) {
          fullText += text;
          yield { type: 'delta', text };
        }
        inputTokens = chunk.usage?.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage?.completion_tokens ?? outputTokens;
      }
    }

    yield { type: 'usage', inputTokens, outputTokens };
    yield { type: 'done', fullText };
  }

  async generateStructured<T = unknown>(request: LlmStructuredRequest) {
    const messages = [
      ...(request.system ? [{ role: 'system', content: buildStructuredSystemPrompt(request.system, request.schema) }] : []),
      ...request.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({ role: message.role, content: message.content })),
    ];

    const attempts = [
      {
        response_format: {
          type: 'json_schema',
          json_schema: { name: request.schemaName, strict: true, schema: request.schema },
        },
      },
      { response_format: { type: 'json_object' } },
      {},
    ];
    const errors: string[] = [];

    for (const attempt of attempts) {
      try {
        const response = await this.fetchChatCompletions(
          request.config,
          {
            model: request.config.model,
            stream: false,
            max_tokens: 8192,
            ...attempt,
            messages,
          },
          request.signal,
        );

        if (!response.ok) {
          const message = await formatHttpError(response);
          errors.push(message);
          if (response.status === 400) continue;
          throw new Error(message);
        }

        const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        const rawText = payload.choices?.[0]?.message?.content?.trim();
        if (!rawText) {
          errors.push('Provider 未返回可解析的结构化内容');
          continue;
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
        errors.push(error instanceof Error ? error.message : '结构化输出失败');
      }
    }

    throw new Error(`Provider 结构化输出失败：${errors.filter(Boolean).join('；')}`);
  }

  private fetchChatCompletions(config: LlmConfig, body: Record<string, unknown>, signal?: AbortSignal) {
    const metadata = LLM_PROVIDER_METADATA[config.provider];
    const defaultBaseUrl = 'defaultBaseUrl' in metadata ? metadata.defaultBaseUrl : undefined;
    const baseUrl = trimTrailingSlash(config.baseUrl || defaultBaseUrl);
    if (!baseUrl) {
      throw new Error(`${metadata.label} Base URL is required`);
    }
    if (metadata.requiresApiKey && !config.apiKey) {
      throw new Error(`${metadata.label} API key is required`);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    return fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  }
}

function trimTrailingSlash(value?: string) {
  return value?.replace(/\/+$/, '');
}

function buildStructuredSystemPrompt(system: string, schema: unknown) {
  return [
    system,
    '你必须只返回一个合法 JSON 对象，不能包含 Markdown、代码块、解释性前后缀或额外文本。',
    'JSON 对象必须满足以下 JSON Schema；缺失信息请用空数组、空字符串或保守的安全提示补足，不要省略 required 字段。',
    JSON.stringify(schema),
  ].join('\n');
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
    const first = rawText.indexOf('{');
    const last = rawText.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(rawText.slice(first, last + 1)) as T;
    throw new Error('结构化输出不是合法 JSON');
  }
}

function parseSsePayloads(block: string) {
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter(Boolean);
}

async function formatHttpError(response: Response) {
  const body = await response.text();
  const detail = safeJsonMessage(body) || body.slice(0, 300) || response.statusText;
  if (response.status === 401 || response.status === 403) return `认证失败：请检查 API Key 或权限（HTTP ${response.status}）`;
  if (response.status === 404) return `接口或模型不存在：请检查 Base URL 和模型 ID（HTTP ${response.status}）`;
  if (response.status === 429) return `额度不足或触发限流（HTTP ${response.status}）：${detail}`;
  return `连接验证失败（HTTP ${response.status}）：${detail}`;
}

function safeJsonMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    return parsed.error?.message || parsed.message;
  } catch {
    return undefined;
  }
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return '连接超时或请求已取消';
    return error.message;
  }
  return '连接验证失败';
}
