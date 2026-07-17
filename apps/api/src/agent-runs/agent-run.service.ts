import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

export type AgentRunStep = {
  at: string;
  type: string;
  title?: string;
  status?: string;
  data?: unknown;
};

@Injectable()
export class AgentRunService {
  constructor(private readonly prisma: PrismaService) {}

  async start(input: {
    user: AuthUser;
    kind: string;
    conversationId?: string;
    diagnosisSessionId?: string;
    requestInput?: unknown;
    memorySnapshot?: unknown;
    provider?: string;
    model?: string;
  }) {
    return this.prisma.agentRun.create({
      data: {
        userId: input.user.id,
        kind: input.kind,
        conversationId: input.conversationId,
        diagnosisSessionId: input.diagnosisSessionId,
        input:
          input.requestInput === undefined
            ? undefined
            : (input.requestInput as Prisma.InputJsonValue),
        memorySnapshot:
          input.memorySnapshot === undefined
            ? undefined
            : (input.memorySnapshot as Prisma.InputJsonValue),
        provider: input.provider,
        model: input.model,
        steps: [],
      },
    });
  }

  async addStep(runId: string | undefined, step: Omit<AgentRunStep, "at">) {
    if (!runId) return;
    const run = await this.prisma.agentRun.findUnique({
      where: { id: runId },
      select: { steps: true },
    });
    if (!run) return;
    const steps = Array.isArray(run.steps) ? run.steps : [];
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        steps: [
          ...steps,
          { ...step, at: new Date().toISOString() },
        ] as Prisma.InputJsonValue,
      },
    });
  }

  async complete(
    runId: string | undefined,
    usage?: { inputTokens?: number; outputTokens?: number },
  ) {
    if (!runId) return;
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        completedAt: new Date(),
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
      },
    });
  }

  async fail(runId: string | undefined, error: unknown) {
    if (!runId) return;
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  async list(user: AuthUser, limit = 20) {
    return this.prisma.agentRun.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async get(user: AuthUser, id: string) {
    return this.prisma.agentRun.findFirst({
      where: { id, userId: user.id },
      include: {
        conversation: { select: { id: true, title: true, summary: true } },
        diagnosisSession: {
          select: {
            id: true,
            status: true,
            safetyLevel: true,
            generationStatus: true,
            createdAt: true,
          },
        },
      },
    });
  }
}
