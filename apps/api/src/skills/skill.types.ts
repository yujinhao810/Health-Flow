import type { LlmConfig, LlmToolDefinition } from '../llm/llm.types';
import type { AuthUser } from '../auth/auth.types';

export type SkillContext = {
  user: AuthUser;
  userInput: string;
  config: LlmConfig;
  signal?: AbortSignal;
};

export type SkillResult = {
  content: string;
  isError?: boolean;
  summary?: string;
  plan?: { title: string; timeframe: string };
};

export type SkillDefinition = LlmToolDefinition & {
  title: string;
};

export interface Skill {
  readonly definition: SkillDefinition;
  execute(input: unknown, context: SkillContext): Promise<SkillResult>;
}
