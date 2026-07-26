import assert from 'node:assert/strict';
import test from 'node:test';
import type { LlmConfig } from '../src/llm/llm.types';
import { formatHttpError, OpenAiCompatibleProvider } from '../src/llm/providers/openai-compatible.provider';
import { OpenAiResponsesProvider } from '../src/llm/providers/openai-responses.provider';

const config: LlmConfig = {
  provider: 'openai',
  model: 'gpt-test',
  apiProtocol: 'responses',
  apiKey: 'test-key',
  baseUrl: 'https://relay.example',
};

test('Responses validation checks response content instead of accepting any HTTP 200', async () => {
  const valid = new StubResponsesProvider([
    jsonResponse({
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'pong' }],
        },
      ],
    }),
  ]);
  assert.deepEqual(await valid.validate(config), {
    valid: true,
    message: 'Responses API 连接验证成功',
  });
  assert.equal(valid.requests[0]?.path, '/responses');
  assert.equal(valid.requests[0]?.body.model, 'gpt-test');

  const invalid = new StubResponsesProvider([jsonResponse({ ok: true })]);
  assert.deepEqual(await invalid.validate(config), {
    valid: false,
    message: '连接成功，但返回内容不是有效的 Responses API 响应',
  });
});

test('Responses text stream emits deltas, usage and a complete answer', async () => {
  const provider = new StubResponsesProvider([
    sseResponse([
      { type: 'response.created', response: { status: 'in_progress' } },
      { type: 'response.output_text.delta', delta: '你' },
      { type: 'response.output_text.delta', delta: '好' },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: '你好' }],
            },
          ],
          usage: { input_tokens: 3, output_tokens: 2 },
        },
      },
    ]),
  ]);

  const events = [];
  for await (const event of provider.streamChat({
    config,
    system: 'system prompt',
    messages: [{ role: 'user', content: '你好' }],
  })) {
    events.push(event);
  }

  assert.deepEqual(events, [
    { type: 'delta', text: '你' },
    { type: 'delta', text: '好' },
    { type: 'usage', inputTokens: 3, outputTokens: 2 },
    { type: 'done', fullText: '你好' },
  ]);
  assert.equal(provider.requests[0]?.body.stream, true);
  assert.equal(provider.requests[0]?.body.instructions, 'system prompt');
  assert.deepEqual(provider.requests[0]?.body.input, [{ role: 'user', content: '你好' }]);
});

test('Responses tool stream converts function calls to the shared agent format', async () => {
  const functionCall = {
    type: 'function_call',
    id: 'item_1',
    call_id: 'call_1',
    name: 'health_records_list',
    arguments: '{"days":7}',
  };
  const provider = new StubResponsesProvider([
    sseResponse([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...functionCall, arguments: '' },
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'item_1',
        output_index: 0,
        delta: '{"days":7}',
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: functionCall,
      },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [functionCall],
          usage: { input_tokens: 8, output_tokens: 5 },
        },
      },
    ]),
  ]);

  const events = [];
  for await (const event of provider.streamChatWithTools({
    config,
    system: '',
    messages: [{ role: 'user', content: '查询最近记录' }],
    tools: [
      {
        name: 'health_records_list',
        description: 'List records',
        inputSchema: { type: 'object' },
      },
    ],
    toolChoice: { type: 'auto' },
  })) {
    events.push(event);
  }

  assert.equal(events[0]?.type, 'tool_call');
  assert.deepEqual(events.at(-1), {
    type: 'message',
    content: [
      {
        type: 'tool_use',
        id: 'call_1',
        name: 'health_records_list',
        input: { days: 7 },
      },
    ],
    stopReason: 'tool_use',
    inputTokens: 8,
    outputTokens: 5,
  });
  assert.equal(provider.requests[0]?.body.tool_choice, 'auto');
});

test('Responses structured output reads output_text JSON', async () => {
  const provider = new StubResponsesProvider([
    jsonResponse({
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '{"ok":true}' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 4 },
    }),
  ]);

  const result = await provider.generateStructured<{ ok: boolean }>({
    config,
    system: 'Return JSON',
    messages: [{ role: 'user', content: 'status' }],
    schemaName: 'status_result',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        note: { type: 'string' },
        details: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            source: { type: 'string' },
          },
          required: ['value'],
        },
      },
      required: ['ok'],
      additionalProperties: false,
    },
  });

  assert.deepEqual(result.parsed, { ok: true });
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 4 });
  assert.equal((provider.requests[0]?.body.text as { format?: { type?: string } }).format?.type, 'json_schema');
  const sentSchema = (
    provider.requests[0]?.body.text as {
      format?: {
        schema?: {
          required?: string[];
          properties?: {
            details?: { required?: string[]; additionalProperties?: boolean };
          };
        };
      };
    }
  ).format?.schema;
  assert.deepEqual(sentSchema?.required, ['ok', 'note', 'details']);
  assert.deepEqual(sentSchema?.properties?.details?.required, ['value', 'source']);
  assert.equal(sentSchema?.properties?.details?.additionalProperties, false);
});

test('Responses structured output retries a transient gateway failure with the same format', async () => {
  const provider = new StubResponsesProvider([
    htmlResponse(502, { 'Retry-After': '0' }),
    jsonResponse({
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '{"ok":true}' }],
        },
      ],
    }),
  ]);

  const result = await provider.generateStructured<{ ok: boolean }>({
    config,
    system: 'Return JSON',
    messages: [{ role: 'user', content: 'status' }],
    schemaName: 'retry_result',
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    },
    maxOutputTokens: 512,
  });

  assert.deepEqual(result.parsed, { ok: true });
  assert.equal(provider.requests.length, 2);
  assert.equal((provider.requests[0]?.body.text as { format?: { type?: string } }).format?.type, 'json_schema');
  assert.equal((provider.requests[1]?.body.text as { format?: { type?: string } }).format?.type, 'json_schema');
});

test('Responses structured output serializes calls to the same custom relay', async () => {
  const provider = new ConcurrentResponsesProvider();
  const request = (schemaName: string) =>
    provider.generateStructured<{ ok: boolean }>({
      config,
      system: 'Return JSON',
      messages: [{ role: 'user', content: 'status' }],
      schemaName,
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      },
    });

  await Promise.all([request('western_assessment'), request('tcm_assessment')]);
  assert.equal(provider.maximumConcurrentRequests, 1);
});

test('HTML gateway errors are summarized without leaking the response page', async () => {
  const message = await formatHttpError(htmlResponse(502));
  assert.equal(message, '模型服务暂时不可用（HTTP 502）：上游网关返回了 HTML 错误页');
  assert.doesNotMatch(message, /DOCTYPE|<html/i);
});

test('Chat Completions validation rejects an unrelated successful response', async () => {
  const provider = new StubChatProvider([jsonResponse({ ok: true })]);
  assert.deepEqual(await provider.validate({ ...config, apiProtocol: 'chat_completions' }), {
    valid: false,
    message: '连接成功，但返回内容不是有效的 Chat Completions 响应',
  });
});

class StubResponsesProvider extends OpenAiResponsesProvider {
  readonly requests: Array<{ path: string; body: Record<string, unknown> }> = [];

  constructor(private readonly responses: Response[]) {
    super();
  }

  protected async fetchProviderEndpoint(_config: LlmConfig, path: string, body: Record<string, unknown>) {
    this.requests.push({ path, body });
    const response = this.responses.shift();
    if (!response) throw new Error('Missing stub response');
    return response;
  }
}

class StubChatProvider extends OpenAiCompatibleProvider {
  constructor(private readonly responses: Response[]) {
    super();
  }

  protected async fetchProviderEndpoint() {
    const response = this.responses.shift();
    if (!response) throw new Error('Missing stub response');
    return response;
  }
}

class ConcurrentResponsesProvider extends OpenAiResponsesProvider {
  private concurrentRequests = 0;
  maximumConcurrentRequests = 0;

  protected async fetchProviderEndpoint() {
    this.concurrentRequests += 1;
    this.maximumConcurrentRequests = Math.max(this.maximumConcurrentRequests, this.concurrentRequests);
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.concurrentRequests -= 1;
    return jsonResponse({
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '{"ok":true}' }],
        },
      ],
    });
  }
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(status: number, headers?: Record<string, string>) {
  return new Response('<!DOCTYPE html><html><title>Bad gateway</title></html>', {
    status,
    headers: { 'Content-Type': 'text/html', ...headers },
  });
}

function sseResponse(events: unknown[]) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
