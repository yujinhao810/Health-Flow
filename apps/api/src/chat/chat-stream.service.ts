import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { AgentRunService } from "../agent-runs/agent-run.service";
import { CrisisPolicyService } from "../safety/crisis-policy.service";
import { AgentRuntimeService } from "./agent-runtime.service";
import { ChatContextService } from "./chat-context.service";
import { ChatService } from "./chat.service";
import { SendMessageDto } from "./dto/send-message.dto";

@Injectable()
export class ChatStreamService {
  constructor(
    private readonly context: ChatContextService,
    private readonly runtime: AgentRuntimeService,
    private readonly chat: ChatService,
    private readonly crisis: CrisisPolicyService,
    private readonly agentRuns: AgentRunService,
  ) {}

  async *stream(
    user: AuthUser,
    threadId: string,
    input: SendMessageDto,
    signal?: AbortSignal,
  ) {
    const userMessage = await this.chat.addUserMessage(user, threadId, input);

    yield {
      type: "conversation_started",
      conversationId: threadId,
      messageId: userMessage.id,
    } as const;

    if (this.crisis.detect(input.content)) {
      const fullText = this.crisis.buildResponse();
      const assistant = await this.chat.addAssistantMessage(
        threadId,
        fullText,
        { safety: "crisis_policy" },
      );
      const run = await this.agentRuns.start({
        user,
        kind: "chat_safety_override",
        conversationId: threadId,
        requestInput: {
          content: input.content,
          attachmentIds: input.attachmentIds,
          ragEnabled: input.ragEnabled,
        },
      });
      await this.agentRuns.addStep(run.id, {
        type: "safety_override",
        title: "危机安全策略",
        status: "complete",
        data: { reason: "crisis_policy" },
      });
      await this.agentRuns.complete(run.id);

      yield {
        type: "warning",
        message:
          "我注意到你可能正在经历危险或强烈痛苦。请优先确保安全，并尽快联系身边可信任的人或当地紧急服务。",
      } as const;
      yield { type: "assistant_delta", text: fullText } as const;
      yield {
        type: "assistant_done",
        messageId: assistant.id,
        fullText,
      } as const;
      return;
    }

    const {
      config,
      system,
      messages,
      ragEnabled,
      retrievalQuery,
      citations,
      retrievalTrace,
      attachments,
      longTermMemory,
    } = await this.context.buildContext(user, threadId, {
      userInput: input.content,
      attachmentIds: input.attachmentIds,
      ragEnabled: input.ragEnabled,
    });
    const run = await this.agentRuns.start({
      user,
      kind: "chat",
      conversationId: threadId,
      requestInput: {
        content: input.content,
        attachmentIds: input.attachmentIds,
        ragEnabled: input.ragEnabled,
      },
      memorySnapshot: longTermMemory,
      provider: config.provider,
      model: config.model,
    });
    await this.agentRuns.addStep(run.id, {
      type: "memory_loaded",
      title: "加载长期记忆",
      status: "complete",
      data: longTermMemory,
    });
    if (ragEnabled) {
      yield { type: "retrieval_started", query: retrievalQuery } as const;
      await this.agentRuns.addStep(run.id, {
        type: "retrieval_started",
        title: "知识库检索",
        data: { query: retrievalQuery },
      });
      yield { type: "retrieval_done", citations } as const;
      await this.agentRuns.addStep(run.id, {
        type: "retrieval_done",
        title: retrievalTrace?.rerank.applied
          ? "检索与 Rerank 完成"
          : "检索完成",
        status: "complete",
        data: { citations, retrievalTrace },
      });
    }

    let fullText = "";
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    try {
      for await (const event of this.runtime.run({
        user,
        config,
        system,
        messages,
        userInput: input.content,
        signal,
      })) {
        if (event.type === "assistant_delta") {
          fullText += event.text;
          yield event;
        } else if (event.type === "usage") {
          inputTokens = event.inputTokens;
          outputTokens = event.outputTokens;
          yield {
            type: "usage",
            provider: config.provider,
            model: config.model,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
          } as const;
        } else if (event.type === "done") {
          fullText = event.fullText || fullText;
          inputTokens = event.inputTokens ?? inputTokens;
          outputTokens = event.outputTokens ?? outputTokens;
        } else {
          if (event.type === "tool_call") {
            await this.agentRuns.addStep(run.id, {
              type: "tool_call",
              title: event.name,
              status: "running",
              data: event,
            });
          } else if (event.type === "tool_result") {
            await this.agentRuns.addStep(run.id, {
              type: "tool_result",
              title: event.name,
              status: event.ok ? "complete" : "failed",
              data: event,
            });
          } else if (event.type === "agent_step") {
            await this.agentRuns.addStep(run.id, {
              type: "agent_step",
              title: event.message,
              status: "running",
            });
          }
          yield event;
        }
      }

      if (inputTokens !== undefined || outputTokens !== undefined) {
        yield {
          type: "usage",
          provider: config.provider,
          model: config.model,
          inputTokens,
          outputTokens,
        } as const;
      }

      const metadata = {
        provider: config.provider,
        model: config.model,
        rag: { enabled: ragEnabled, citations, retrievalTrace },
        attachments,
      } as Prisma.JsonObject;
      const assistant = await this.chat.addAssistantMessage(
        threadId,
        fullText,
        metadata,
      );
      await this.agentRuns.complete(run.id, { inputTokens, outputTokens });
      yield {
        type: "assistant_done",
        messageId: assistant.id,
        fullText,
      } as const;
    } catch (error) {
      await this.agentRuns.fail(run.id, error);
      throw error;
    }
  }
}
