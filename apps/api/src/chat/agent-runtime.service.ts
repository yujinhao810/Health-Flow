import { Injectable } from '@nestjs/common';
import type { StreamEvent } from '@health/shared';
import { LlmService } from '../llm/llm.provider';
import type { LlmContentBlock, LlmMessage, LlmStreamEvent, LlmToolStreamEvent } from '../llm/llm.types';
import { HealthAgentToolsService } from './health-agent-tools.service';

const MAX_TOOL_ITERATIONS = 5;

type AgentRuntimeRequest = {
  config: Parameters<LlmService['streamChat']>[0]['config'];
  system: string;
  messages: LlmMessage[];
  userInput: string;
  signal?: AbortSignal;
};

export type AgentRuntimeEvent =
  | Extract<StreamEvent, { type: 'assistant_delta' | 'warning' | 'agent_step' | 'tool_call' | 'tool_result' | 'plan_generated' }>
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'done'; fullText: string; inputTokens?: number; outputTokens?: number };

@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly llm: LlmService,
    private readonly tools: HealthAgentToolsService,
  ) {}

  async *run(request: AgentRuntimeRequest): AsyncIterable<AgentRuntimeEvent> {
    const deterministicRecord = await this.tools.tryCreateRecordFromUserText(request.userInput);
    if (deterministicRecord) {
      yield {
        type: 'tool_result',
        id: 'deterministic_health_record_create',
        name: 'health_record_create',
        ok: true,
        summary: deterministicRecord.summary,
      };
      yield { type: 'assistant_delta', text: deterministicRecord.assistantText };
      yield { type: 'done', fullText: deterministicRecord.assistantText, inputTokens: 0, outputTokens: deterministicRecord.assistantText.length };
      return;
    }

    if (!this.llm.supportsToolUse(request.config)) {
      yield { type: 'warning', message: '当前模型提供商暂不支持健康工具调用，本轮将使用普通聊天模式。' };
      yield* this.runPlainChat(request);
      return;
    }

    const messages = [...request.messages];
    let fullText = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      let finalMessage: Extract<LlmToolStreamEvent, { type: 'message' }> | undefined;

      const forceRecordCreate = iteration === 0 && this.tools.shouldForceRecordCreate(request.userInput);
      for await (const event of this.llm.streamChatWithTools({
        config: request.config,
        system: request.system,
        messages,
        tools: this.tools.getTools(),
        toolChoice: forceRecordCreate ? { type: 'tool', name: 'health_record_create' } : { type: 'auto' },
        signal: request.signal,
      })) {
        if (event.type === 'delta') {
          fullText += event.text;
          yield { type: 'assistant_delta', text: event.text };
        } else if (event.type === 'tool_call') {
          yield {
            type: 'tool_call',
            id: event.id,
            name: event.name,
            title: this.tools.getTitle(event.name),
            inputPreview: previewInput(event.input),
          };
        } else if (event.type === 'usage') {
          totalInputTokens += event.inputTokens ?? 0;
          totalOutputTokens += event.outputTokens ?? 0;
          yield { type: 'usage', inputTokens: event.inputTokens, outputTokens: event.outputTokens };
        } else if (event.type === 'message') {
          finalMessage = event;
          totalInputTokens += event.inputTokens ?? 0;
          totalOutputTokens += event.outputTokens ?? 0;
        }
      }

      if (!finalMessage) {
        yield { type: 'done', fullText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
        return;
      }

      const toolUses = finalMessage.content.filter((block): block is Extract<LlmContentBlock, { type: 'tool_use' }> => block.type === 'tool_use');

      if (finalMessage.stopReason === 'refusal') {
        const message = '模型出于安全原因拒绝了本次请求。你可以换一种方式描述需求，或寻求专业人士帮助。';
        fullText += fullText ? '' : message;
        if (!fullText.includes(message)) yield { type: 'assistant_delta', text: message };
        yield { type: 'done', fullText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
        return;
      }

      if (!toolUses.length || finalMessage.stopReason === 'end_turn') {
        yield { type: 'done', fullText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
        return;
      }

      messages.push({ role: 'assistant', content: finalMessage.content });
      yield { type: 'agent_step', message: `正在执行 ${toolUses.length} 个健康工具...` };

      const toolResults: LlmContentBlock[] = [];
      for (const toolUse of toolUses) {
        const result = await this.tools.execute(toolUse.name, toolUse.input, {
          userInput: request.userInput,
          config: request.config,
          signal: request.signal,
        });

        yield {
          type: 'tool_result',
          id: toolUse.id,
          name: toolUse.name,
          ok: !result.isError,
          summary: result.summary,
        };
        if (result.plan) {
          yield { type: 'plan_generated', title: result.plan.title, timeframe: result.plan.timeframe };
        }

        toolResults.push({
          type: 'tool_result',
          toolUseId: toolUse.id,
          content: result.content,
          isError: result.isError,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    const warning = '健康工具调用已达到本轮上限，我会基于已获得的信息先给出保守建议。';
    yield { type: 'warning', message: warning };
    yield { type: 'done', fullText: fullText || warning, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
  }

  private async *runPlainChat(request: AgentRuntimeRequest): AsyncIterable<AgentRuntimeEvent> {
    let fullText = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    for await (const event of this.llm.streamChat({
      config: request.config,
      system: request.system,
      messages: request.messages,
      signal: request.signal,
    })) {
      if (event.type === 'delta') {
        fullText += event.text;
        yield { type: 'assistant_delta', text: event.text };
      } else if (event.type === 'usage') {
        inputTokens = event.inputTokens;
        outputTokens = event.outputTokens;
        yield { type: 'usage', inputTokens, outputTokens };
      }
    }

    yield { type: 'done', fullText, inputTokens, outputTokens };
  }
}

function previewInput(input: unknown) {
  const raw = JSON.stringify(input ?? {});
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
}
