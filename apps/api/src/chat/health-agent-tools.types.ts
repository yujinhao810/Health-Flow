import type { LlmConfig, LlmToolDefinition } from '../llm/llm.types';
import type { AuthUser } from '../auth/auth.types';

export type HealthAgentToolContext = {
  user: AuthUser;
  userInput: string;
  config: LlmConfig;
  signal?: AbortSignal;
};

export type HealthAgentToolResult = {
  content: string;
  isError?: boolean;
  summary?: string;
  plan?: { title: string; timeframe: string };
};

export type HealthAgentTool = LlmToolDefinition & {
  title: string;
};
