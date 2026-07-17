import type { GenerationStatus } from "@health/shared";
import { api } from "./client";

export type AgentRunStep = {
  at: string;
  type: string;
  title?: string;
  status?: string;
  data?: unknown;
};

export type AgentRun = {
  id: string;
  kind: string;
  status: "running" | "completed" | "failed" | string;
  conversationId?: string | null;
  diagnosisSessionId?: string | null;
  input?: unknown;
  memorySnapshot?: unknown;
  steps: AgentRunStep[];
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  startedAt: string;
  completedAt?: string | null;
  error?: string | null;
  conversation?: {
    id: string;
    title?: string | null;
    summary?: string | null;
  } | null;
  diagnosisSession?: {
    id: string;
    status: string;
    safetyLevel?: string | null;
    generationStatus?: GenerationStatus | null;
    createdAt: string;
  } | null;
};

export function listAgentRuns(limit = 6) {
  return api<AgentRun[]>(`/agent-runs?limit=${limit}`);
}

export function getAgentRun(id: string) {
  return api<AgentRun>(`/agent-runs/${id}`);
}
