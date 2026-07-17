import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { DashscopeRerankProvider } from "../src/knowledge/rerank/providers/dashscope-rerank.provider";
import { RerankService } from "../src/knowledge/rerank/rerank.service";

test("DashScope provider validates indexes and returns score order", async () => {
  const config = new ConfigService({
    RAG_RERANK_MODEL: "gte-rerank-v2",
    RAG_RERANK_BASE_URL: "https://example.test/rerank",
    RAG_RERANK_TIMEOUT_MS: "5000",
  });
  const provider = new DashscopeRerankProvider(config);
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        output: {
          results: [
            { index: 0, relevance_score: 0.42 },
            { index: 99, relevance_score: 1 },
            { index: 1, relevance_score: 0.96 },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const result = await provider.rerank({
      query: "睡眠建议",
      documents: [
        { id: "a", text: "普通内容" },
        { id: "b", text: "睡眠建议内容" },
      ],
      topN: 2,
      apiKey: "test-key",
    });
    assert.deepEqual(
      result.map((item) => item.id),
      ["b", "a"],
    );
    assert.equal(requestBody?.model, "gte-rerank-v2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Rerank service skips safely when no DashScope key is available", async () => {
  const config = new ConfigService({
    RAG_RERANK_ENABLED: "true",
    RAG_RERANK_MODEL: "gte-rerank-v2",
  });
  const provider = new DashscopeRerankProvider(config);
  const service = new RerankService(config, provider);
  const outcome = await service.rerank({
    query: "query",
    documents: [
      { id: "a", text: "a" },
      { id: "b", text: "b" },
    ],
    topN: 2,
    config: { provider: "openai", model: "gpt-4.1" },
  });

  assert.equal(outcome.trace.applied, false);
  assert.match(outcome.trace.fallbackReason ?? "", /API Key/);
});

test("Rerank service falls back when the provider request fails", async () => {
  const config = new ConfigService({
    RAG_RERANK_ENABLED: "true",
    RAG_RERANK_MODEL: "gte-rerank-v2",
  });
  const provider = {
    model: "gte-rerank-v2",
    rerank: async () => {
      throw new Error("network unavailable");
    },
  } as unknown as DashscopeRerankProvider;
  const service = new RerankService(config, provider);
  const outcome = await service.rerank({
    query: "query",
    documents: [
      { id: "a", text: "a" },
      { id: "b", text: "b" },
    ],
    topN: 2,
    config: { provider: "qwen", model: "qwen-plus", apiKey: "test-key" },
  });

  assert.equal(outcome.trace.attempted, true);
  assert.equal(outcome.trace.applied, false);
  assert.match(outcome.trace.fallbackReason ?? "", /network unavailable/);
});
