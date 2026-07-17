import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { assertAllowedModel } from '../model-policy';
import {
  LlmConfig,
  LlmContentBlock,
  LlmMessage,
  LlmProvider,
  LlmStreamRequest,
  LlmStreamEvent,
  LlmStructuredRequest,
  LlmToolStreamEvent,
  LlmToolStreamRequest,
} from '../llm.types';

@Injectable()
export class AnthropicProvider implements LlmProvider {
  name = 'anthropic' as const;
  capabilities = { supportsToolUse: true, supportsEmbeddings: false };

  async validate(config: LlmConfig) {
    if (!config.apiKey) {
      return { valid: false, message: 'Anthropic API key is required' };
    }

    try {
      assertAllowedModel(config.provider, config.model);
      const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
      await client.messages.create({
        model: config.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { valid: true, message: '连接验证成功' };
    } catch (error) {
      return { valid: false, message: formatAnthropicError(error) };
    }
  }

  async *streamChat(request: LlmStreamRequest): AsyncIterable<LlmStreamEvent> {
    const { config } = request;
    const model = config.model;
    assertAllowedModel(config.provider, model);

    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
    const stream = client.messages.stream(
      {
        model,
        max_tokens: 64000,
        system: request.system,
        ...(usesAlwaysOnThinking(model) ? {} : { thinking: { type: 'adaptive' as const } }),
        output_config: { effort: 'high' },
        messages: toAnthropicMessages(request.messages),
      },
      { signal: request.signal },
    );

    let fullText = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        yield { type: 'delta', text: event.delta.text };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: 'usage',
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    };
    yield { type: 'done', fullText };
  }

  async *streamChatWithTools(request: LlmToolStreamRequest): AsyncIterable<LlmToolStreamEvent> {
    const { config } = request;
    const model = config.model;
    assertAllowedModel(config.provider, model);

    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
    const stream = client.messages.stream(
      {
        model,
        max_tokens: 64000,
        system: request.system,
        ...(usesAlwaysOnThinking(model) ? {} : { thinking: { type: 'adaptive' as const } }),
        output_config: { effort: 'high' },
        messages: toAnthropicMessages(request.messages),
        tool_choice: toAnthropicToolChoice(request.toolChoice),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
          strict: tool.strict ?? false,
        })),
      } as Anthropic.MessageCreateParamsStreaming,
      { signal: request.signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'delta', text: event.delta.text };
      }
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        yield {
          type: 'tool_call',
          id: event.content_block.id,
          name: event.content_block.name,
          input: {},
        };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: 'message',
      content: toLlmContentBlocks(finalMessage.content),
      stopReason: finalMessage.stop_reason,
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    };
  }

  async generateStructured<T = unknown>(request: LlmStructuredRequest) {
    const { config } = request;
    const model = config.model;
    assertAllowedModel(config.provider, model);

    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
    const response = await client.messages.create(
      {
        model,
        max_tokens: request.maxOutputTokens ?? 16000,
        system: request.system,
        ...(usesAlwaysOnThinking(model) ? {} : { thinking: { type: 'adaptive' as const } }),
        output_config: {
          effort: 'high',
          format: { type: 'json_schema', schema: request.schema },
        },
        messages: toAnthropicMessages(request.messages),
      } as Anthropic.MessageCreateParamsNonStreaming,
      { signal: request.signal },
    );

    if (response.stop_reason === 'refusal') {
      throw new Error('模型出于安全原因拒绝了本次结构化输出请求');
    }

    const rawText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!rawText) {
      throw new Error('Anthropic 未返回可解析的结构化内容');
    }

    return {
      parsed: parseJsonPayload<T>(rawText),
      rawText,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

function usesAlwaysOnThinking(model: string) {
  return model === 'claude-fable-5' || model === 'claude-mythos-5';
}

function toAnthropicToolChoice(toolChoice: LlmToolStreamRequest['toolChoice']) {
  if (!toolChoice || toolChoice.type === 'auto') return { type: 'auto' as const };
  return { type: 'tool' as const, name: toolChoice.name };
}

function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: toAnthropicContent(message),
    }));
}

function toAnthropicContent(message: LlmMessage): Anthropic.MessageParam['content'] {
  if (typeof message.content === 'string') return message.content;

  const providerContent = message.content.find((block) => block.type === 'provider_content' && block.provider === 'anthropic');
  if (message.role === 'assistant' && providerContent?.type === 'provider_content') {
    return providerContent.content as Anthropic.MessageParam['content'];
  }

  return message.content
    .filter((block) => block.type !== 'provider_content')
    .map((block) => {
      if (block.type === 'text') return { type: 'text' as const, text: block.text };
      if (block.type === 'tool_result') {
        return {
          type: 'tool_result' as const,
          tool_use_id: block.toolUseId,
          content: block.content,
          is_error: block.isError,
        };
      }
      if (block.type === 'image') {
        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: block.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: block.data,
          },
        };
      }
      return {
        type: 'tool_use' as const,
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    }) as Anthropic.MessageParam['content'];
}

function toLlmContentBlocks(content: Anthropic.Message['content']): LlmContentBlock[] {
  const blocks: LlmContentBlock[] = [{ type: 'provider_content', provider: 'anthropic', content }];

  for (const block of content) {
    if (block.type === 'text') {
      blocks.push({ type: 'text', text: block.text });
    }
    if (block.type === 'tool_use') {
      blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
    }
  }

  return blocks;
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

function formatAnthropicError(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    const causeMessage = formatErrorCause(cause);
    if (error.message === 'fetch failed') {
      return [
        '后端无法连接到 Anthropic：fetch failed。',
        '这通常不是 API Key 或模型名错误，而是网络、代理、DNS、证书，或 Base URL 无法从后端访问。',
        causeMessage ? `底层原因：${causeMessage}` : undefined,
      ]
        .filter(Boolean)
        .join(' ');
    }

    return causeMessage ? `${error.message}：${causeMessage}` : error.message;
  }
  return 'Anthropic 连接验证失败';
}

function formatErrorCause(cause: unknown) {
  if (!cause) return undefined;
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'object') {
    const value = cause as { code?: string; message?: string; reason?: string };
    return [value.code, value.message, value.reason].filter(Boolean).join(' ');
  }
  return String(cause);
}
