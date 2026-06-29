import type { LlmConfig, LlmToolDefinition } from '../llm/llm.types';

export type HealthAgentToolContext = {
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
