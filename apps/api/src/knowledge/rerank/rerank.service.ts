import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DashscopeRerankProvider } from "./providers/dashscope-rerank.provider";
import type { RerankOutcome, RerankRequest } from "./rerank.types";

@Injectable()
export class RerankService {
  constructor(
    private readonly config: ConfigService,
    private readonly dashscope: DashscopeRerankProvider,
  ) {}

  get candidateLimit() {
    return numericConfig(
      this.config.get<number | string>("RAG_RERANK_CANDIDATE_K"),
      20,
    );
  }

  get minimumScore() {
    return numericConfig(
      this.config.get<number | string>("RAG_RERANK_MIN_SCORE"),
      0,
      true,
    );
  }

  get publicMinimumScore() {
    return numericConfig(
      this.config.get<number | string>("RAG_PUBLIC_RERANK_MIN_SCORE"),
      0.15,
      true,
    );
  }

  async rerank(request: RerankRequest): Promise<RerankOutcome> {
    const startedAt = Date.now();
    const enabled =
      (
        this.config.get<string>("RAG_RERANK_ENABLED") ?? "true"
      ).toLowerCase() !== "false";
    const model = this.dashscope.model;
    const baseTrace = {
      enabled,
      attempted: false,
      applied: false,
      provider: "dashscope" as const,
      model,
      candidateCount: request.documents.length,
      resultCount: 0,
      durationMs: 0,
    };
    if (!enabled) {
      return {
        results: [],
        trace: { ...baseTrace, fallbackReason: "Rerank 已关闭" },
      };
    }
    if (request.documents.length <= 1) {
      return {
        results: [],
        trace: { ...baseTrace, fallbackReason: "候选片段不足，无需重排" },
      };
    }

    const apiKey =
      this.config.get<string>("RAG_RERANK_API_KEY") ||
      (request.config.provider === "qwen" ? request.config.apiKey : undefined);
    if (!apiKey) {
      return {
        results: [],
        trace: {
          ...baseTrace,
          fallbackReason: "没有可用的 DashScope API Key",
        },
      };
    }

    try {
      const results = await this.dashscope.rerank({
        query: request.query,
        documents: request.documents,
        topN: request.topN,
        apiKey,
        signal: request.signal,
      });
      return {
        results,
        trace: {
          ...baseTrace,
          attempted: true,
          applied: true,
          resultCount: results.length,
          durationMs: Date.now() - startedAt,
          topScore: results[0]?.score,
        },
      };
    } catch (error) {
      if (request.signal?.aborted) throw error;
      return {
        results: [],
        trace: {
          ...baseTrace,
          attempted: true,
          durationMs: Date.now() - startedAt,
          fallbackReason:
            error instanceof Error ? error.message : "Rerank 调用失败",
        },
      };
    }
  }
}

function numericConfig(
  value: number | string | undefined,
  fallback: number,
  allowZero = false,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0)
    ? parsed
    : fallback;
}
