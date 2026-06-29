import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CrisisPolicyService } from '../safety/crisis-policy.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { ChatContextService } from './chat-context.service';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class ChatStreamService {
  constructor(
    private readonly context: ChatContextService,
    private readonly runtime: AgentRuntimeService,
    private readonly chat: ChatService,
    private readonly crisis: CrisisPolicyService,
  ) {}

  async *stream(threadId: string, input: SendMessageDto, signal?: AbortSignal) {
    const userMessage = await this.chat.addUserMessage(threadId, input);

    yield { type: 'conversation_started', conversationId: threadId, messageId: userMessage.id } as const;

    if (this.crisis.detect(input.content)) {
      const fullText = this.crisis.buildResponse();
      const assistant = await this.chat.addAssistantMessage(threadId, fullText, { safety: 'crisis_policy' });

      yield {
        type: 'warning',
        message: '我注意到你可能正在经历危险或强烈痛苦。请优先确保安全，并尽快联系身边可信任的人或当地紧急服务。',
      } as const;
      yield { type: 'assistant_delta', text: fullText } as const;
      yield { type: 'assistant_done', messageId: assistant.id, fullText } as const;
      return;
    }

    const { config, system, messages, ragEnabled, citations, attachments } = await this.context.buildContext(threadId, {
      userInput: input.content,
      attachmentIds: input.attachmentIds,
      ragEnabled: input.ragEnabled,
    });
    if (ragEnabled) {
      yield { type: 'retrieval_started', query: input.content } as const;
      yield { type: 'retrieval_done', citations } as const;
    }

    let fullText = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    for await (const event of this.runtime.run({
      config,
      system,
      messages,
      userInput: input.content,
      signal,
    })) {
      if (event.type === 'assistant_delta') {
        fullText += event.text;
        yield event;
      } else if (event.type === 'usage') {
        inputTokens = event.inputTokens;
        outputTokens = event.outputTokens;
        yield {
          type: 'usage',
          provider: config.provider,
          model: config.model,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
        } as const;
      } else if (event.type === 'done') {
        fullText = event.fullText || fullText;
        inputTokens = event.inputTokens ?? inputTokens;
        outputTokens = event.outputTokens ?? outputTokens;
      } else {
        yield event;
      }
    }

    if (inputTokens !== undefined || outputTokens !== undefined) {
      yield { type: 'usage', provider: config.provider, model: config.model, inputTokens, outputTokens } as const;
    }

    const metadata = {
      provider: config.provider,
      model: config.model,
      rag: { enabled: ragEnabled, citations },
      attachments,
    } as Prisma.JsonObject;
    const assistant = await this.chat.addAssistantMessage(threadId, fullText, metadata);
    yield { type: 'assistant_done', messageId: assistant.id, fullText } as const;
  }
}
