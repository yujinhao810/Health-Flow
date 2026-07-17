import type { LlmConfig } from "../../llm/llm.types";

export type RerankDocument = {
  id: string;
  text: string;
};

export type RerankRequest = {
  query: string;
  documents: RerankDocument[];
  topN: number;
  config: LlmConfig;
  signal?: AbortSignal;
};

export type RerankResult = {
  id: string;
  index: number;
  score: number;
  rank: number;
};

export type RerankTrace = {
  enabled: boolean;
  attempted: boolean;
  applied: boolean;
  provider: "dashscope";
  model: string;
  candidateCount: number;
  resultCount: number;
  durationMs: number;
  topScore?: number;
  fallbackReason?: string;
};

export type RerankOutcome = {
  results: RerankResult[];
  trace: RerankTrace;
};
