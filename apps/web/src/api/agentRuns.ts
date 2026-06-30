import { api } from './client';

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
  status: 'running' | 'completed' | 'failed' | string;
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
};

export function listAgentRuns(limit = 6) {
  return api<AgentRun[]>(`/agent-runs?limit=${limit}`);
}