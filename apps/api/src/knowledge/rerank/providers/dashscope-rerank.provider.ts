import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { RerankDocument, RerankResult } from "../rerank.types";

const DEFAULT_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank";
const DEFAULT_MODEL = "gte-rerank-v2";

type DashscopeRerankResponse = {
  output?: {
    results?: Array<{
      index?: number;
      relevance_score?: number;
    }>;
  };
  request_id?: string;
  code?: string;
  message?: string;
};

@Injectable()
export class DashscopeRerankProvider {
  constructor(private readonly config: ConfigService) {}

  get model() {
    return this.config.get<string>("RAG_RERANK_MODEL") || DEFAULT_MODEL;
  }

  async rerank(input: {
    query: string;
    documents: RerankDocument[];
    topN: number;
    apiKey: string;
    signal?: AbortSignal;
  }): Promise<RerankResult[]> {
    const timeoutMs = numericConfig(
      this.config.get<number | string>("RAG_RERANK_TIMEOUT_MS"),
      5_000,
    );
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal;
    const endpoint =
      this.config.get<string>("RAG_RERANK_BASE_URL") || DEFAULT_ENDPOINT;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: {
          query: input.query,
          documents: input.documents.map((document) => document.text),
        },
        parameters: {
          return_documents: false,
          top_n: Math.min(Math.max(input.topN, 1), input.documents.length),
        },
      }),
      signal,
    });

    const body = (await response.json().catch(() => undefined)) as
      DashscopeRerankResponse | undefined;
    if (!response.ok) {
      throw new Error(
        `DashScope Rerank 请求失败（HTTP ${response.status}）：${body?.message || body?.code || response.statusText}`,
      );
    }

    const valid = new Map<number, number>();
    for (const result of body?.output?.results ?? []) {
      if (
        !Number.isInteger(result.index) ||
        result.index === undefined ||
        result.index < 0 ||
        result.index >= input.documents.length ||
        typeof result.relevance_score !== "number" ||
        !Number.isFinite(result.relevance_score)
      ) {
        continue;
      }
      valid.set(
        result.index,
        Math.max(valid.get(result.index) ?? -Infinity, result.relevance_score),
      );
    }
    const ranked = [...valid.entries()].sort(
      ([leftIndex, leftScore], [rightIndex, rightScore]) =>
        rightScore - leftScore || leftIndex - rightIndex,
    );
    if (!ranked.length) {
      throw new Error("DashScope Rerank 未返回有效排序结果");
    }

    return ranked.map(([index, score], rank) => ({
      id: input.documents[index].id,
      index,
      score,
      rank,
    }));
  }
}

function numericConfig(value: number | string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
