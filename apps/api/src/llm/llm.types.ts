import type { LlmProviderName, LlmValidationResult } from '@health/shared';

export type { LlmProviderName, LlmValidationResult };

export type LlmTextBlock = {
  type: 'text';
  text: string;
};

export type LlmToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
};

export type LlmToolResultBlock = {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
};

export type LlmImageBlock = {
  type: 'image';
  mediaType: string;
  data: string;
};

export type LlmProviderContentBlock = {
  type: 'provider_content';
  provider: 'anthropic';
  content: unknown;
};

export type LlmContentBlock = LlmTextBlock | LlmImageBlock | LlmToolUseBlock | LlmToolResultBlock | LlmProviderContentBlock;

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentBlock[];
};

export type LlmConfig = {
  provider: LlmProviderName;
  model: string;
  diagnosisWesternModel?: string;
  diagnosisTcmModel?: string;
  diagnosisReviewerModel?: string;
  diagnosisIntegratorModel?: string;
  apiKey?: string;
  baseUrl?: string;
  embeddingApiKey?: string;
  embeddingBaseUrl?: string;
  embeddingModel?: string;
  ragEnabled?: boolean;
  ragTopK?: number;
  visionEnabled?: boolean;
};

export type LlmToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  strict?: boolean;
};

export type LlmProviderCapabilities = {
  supportsToolUse: boolean;
  supportsEmbeddings: boolean;
};

export type LlmStreamRequest = {
  config: LlmConfig;
  system: string;
  messages: LlmMessage[];
  signal?: AbortSignal;
};

export type LlmToolStreamRequest = LlmStreamRequest & {
  tools: LlmToolDefinition[];
  toolChoice?: { type: 'auto' } | { type: 'tool'; name: string };
};

export type LlmStructuredRequest = {
  config: LlmConfig;
  system: string;
  messages: LlmMessage[];
  schemaName: string;
  schema: unknown;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type LlmStructuredResult<T = unknown> = {
  parsed: T;
  rawText?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export type LlmEmbeddingRequest = {
  config: LlmConfig;
  texts: string[];
  model?: string;
  signal?: AbortSignal;
};

export type LlmEmbeddingResult = {
  vectors: number[][];
  model: string;
};

export type LlmStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'done'; fullText: string };

export type LlmToolStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'message'; content: LlmContentBlock[]; stopReason: string | null; inputTokens?: number; outputTokens?: number };

export interface LlmProvider {
  name: LlmProviderName;
  capabilities: LlmProviderCapabilities;
  validate(config: LlmConfig): Promise<LlmValidationResult>;
  streamChat(request: LlmStreamRequest): AsyncIterable<LlmStreamEvent>;
  streamChatWithTools?(request: LlmToolStreamRequest): AsyncIterable<LlmToolStreamEvent>;
  embedTexts?(request: LlmEmbeddingRequest): Promise<LlmEmbeddingResult>;
  generateStructured<T = unknown>(request: LlmStructuredRequest): Promise<LlmStructuredResult<T>>;
}
