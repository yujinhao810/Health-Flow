import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigModule, ConfigService } from "@nestjs/config";
import type { RagCitation } from "@health/shared";
import type { AuthUser } from "../src/auth/auth.types";
import { envSchema } from "../src/config/env.schema";
import { EmbeddingService } from "../src/knowledge/embedding.service";
import { RagService } from "../src/knowledge/rag.service";
import { DashscopeRerankProvider } from "../src/knowledge/rerank/providers/dashscope-rerank.provider";
import { RerankService } from "../src/knowledge/rerank/rerank.service";
import { LlmService } from "../src/llm/llm.provider";
import type { LlmConfig } from "../src/llm/llm.types";
import { AnthropicProvider } from "../src/llm/providers/anthropic.provider";
import { MockProvider } from "../src/llm/providers/mock.provider";
import { OpenAiCompatibleProvider } from "../src/llm/providers/openai-compatible.provider";
import { ProviderFactory } from "../src/llm/providers/provider.factory";
import { PrismaService } from "../src/prisma/prisma.service";
import { SettingsService } from "../src/settings/settings.service";

const TOP_K = 5;
const DATASET_PATH = join(
  __dirname,
  "..",
  "evaluation",
  "rag-standard-v1.json",
);

type Relevance = 1 | 2 | 3;
type BenchmarkCase = {
  id: string;
  category: string;
  query: string;
  judgments: Record<string, Relevance>;
};
type Benchmark = {
  name: string;
  version: string;
  locale: string;
  corpusTitles: string[];
  cases: BenchmarkCase[];
};
type Metrics = {
  positiveCount: number;
  negativeCount: number;
  hitAt1: number;
  hitAt3: number;
  hitAt5: number;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  precisionAt3: number;
  precisionAt5: number;
  precisionReturnedAt5: number;
  mrr: number;
  mapAt5: number;
  ndcgAt3: number;
  ndcgAt5: number;
  noAnswerAccuracy: number;
  top1DecisionAccuracy: number;
  hitAt3Confidence95: [number, number];
  noAnswerConfidence95: [number, number];
  latencyP50Ms: number;
  latencyP95Ms: number;
  rerankApplied: number;
  rerankAttempted: number;
  rerankLatencyP50Ms?: number;
  rerankLatencyP95Ms?: number;
  fallbackReasons: string[];
  positiveTopScoreMin?: number;
  positiveTopScoreP10?: number;
  positiveTopScoreP50?: number;
  negativeTopScoreP50?: number;
  negativeTopScoreP90?: number;
  negativeTopScoreMax?: number;
  gateSweep: Array<{
    threshold: number;
    positivePassRate: number;
    negativeRejectRate: number;
    decisionAccuracy: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    count: number;
    hitAt1: number;
    hitAt3: number;
    recallAt3: number;
    ndcgAt3: number;
  }>;
  missedPositiveIds: string[];
  falsePositiveNegativeIds: string[];
};

async function main() {
  const benchmark = loadBenchmark();
  await ConfigModule.forRoot({
    validate: (environment) => envSchema.parse(environment),
  });
  const configService = new ConfigService(envSchema.parse(process.env), {
    skipProcessEnv: true,
  });
  const prisma = new PrismaService();
  const reranker = new RerankService(
    configService,
    new DashscopeRerankProvider(configService),
  );
  const embeddings = new EmbeddingService(
    new LlmService(
      new ProviderFactory(
        new MockProvider(),
        new AnthropicProvider(),
        new OpenAiCompatibleProvider(),
      ),
    ),
  );
  const rag = new RagService(
    prisma,
    embeddings,
    reranker,
  );
  const settings = new SettingsService(prisma, configService);

  try {
    await assertCorpusMatches(prisma, benchmark);
    printDatasetSummary(benchmark);

    const baseline = await evaluate("RRF 基线", benchmark, rag);
    printMetrics(baseline);

    const liveConfig = await resolveLiveConfig(prisma, settings);
    if (!liveConfig) {
      console.log(
        "\n未启用真实 Rerank 对照。设置 RAG_EVAL_USE_SAVED_CONFIG=true，或临时提供 RAG_EVAL_API_KEY 后重试。",
      );
      return;
    }

    const reranked = await evaluate(
      "RRF + gte-rerank-v2",
      benchmark,
      rag,
      liveConfig,
    );
    printMetrics(reranked);
    printComparison(baseline, reranked);
  } finally {
    await prisma.$disconnect();
  }
}

function loadBenchmark() {
  const value = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as Benchmark;
  if (!value.name || !value.version || value.cases.length < 50) {
    throw new Error("RAG 评测集缺少元数据，或样本量少于 50");
  }
  const ids = new Set<string>();
  const corpusTitles = new Set(value.corpusTitles);
  for (const item of value.cases) {
    if (!item.id || ids.has(item.id)) throw new Error(`重复评测 ID：${item.id}`);
    ids.add(item.id);
    if (!item.query.trim()) throw new Error(`评测问题为空：${item.id}`);
    for (const [title, relevance] of Object.entries(item.judgments)) {
      if (!corpusTitles.has(title)) {
        throw new Error(`${item.id} 标注了语料库之外的文档：${title}`);
      }
      if (![1, 2, 3].includes(relevance)) {
        throw new Error(`${item.id} 的相关性等级无效：${relevance}`);
      }
    }
  }
  return value;
}

async function assertCorpusMatches(prisma: PrismaService, benchmark: Benchmark) {
  const documents = await prisma.knowledgeDocument.findMany({
    where: { userId: null, status: "published", locale: benchmark.locale },
    select: { title: true },
    orderBy: { title: "asc" },
  });
  const expected = [...benchmark.corpusTitles].sort();
  const actual = documents.map((document) => document.title).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      [
        "当前公共知识库与标准集锁定的语料不一致，拒绝输出可能失真的 Precision。",
        `标准集：${expected.join("、")}`,
        `数据库：${actual.join("、")}`,
      ].join("\n"),
    );
  }
}

async function resolveLiveConfig(
  prisma: PrismaService,
  settings: SettingsService,
): Promise<LlmConfig | undefined> {
  const explicitApiKey = process.env.RAG_EVAL_API_KEY?.trim();
  if (explicitApiKey) {
    return { provider: "qwen", model: "qwen-plus", apiKey: explicitApiKey };
  }
  const useSavedConfig =
    process.env.RAG_EVAL_USE_SAVED_CONFIG === "true" ||
    process.argv.includes("--use-saved-config");
  if (!useSavedConfig) return undefined;

  const saved = await prisma.userLlmConfig.findFirst({
    where: {
      enabled: true,
      provider: "qwen",
      encryptedApiKey: { not: null },
    },
    include: { user: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!saved) {
    console.log("\n没有找到启用中的 Qwen/DashScope 用户配置，跳过真实 Rerank。");
    return undefined;
  }
  return settings.getLlmConfig(saved.user as AuthUser);
}

async function evaluate(
  label: string,
  benchmark: Benchmark,
  rag: RagService,
  config?: LlmConfig,
) {
  const rows: Array<{
    item: BenchmarkCase;
    citations: RagCitation[];
    durationMs: number;
    rerank: {
      applied: boolean;
      attempted: boolean;
      durationMs: number;
      topScore?: number;
      fallbackReason?: string;
    };
  }> = [];

  console.log(`\n${label}：执行 ${benchmark.cases.length} 道题`);
  for (const [index, item] of benchmark.cases.entries()) {
    const startedAt = Date.now();
    const result = await rag.retrieveWithTrace(item.query, {
      topK: TOP_K,
      config,
    });
    rows.push({
      item,
      citations: result.citations,
      durationMs: Date.now() - startedAt,
      rerank: result.trace.rerank,
    });
    if ((index + 1) % 12 === 0 || index + 1 === benchmark.cases.length) {
      console.log(`  已完成 ${index + 1}/${benchmark.cases.length}`);
    }
  }

  return calculateMetrics(rows);
}

function calculateMetrics(
  rows: Array<{
    item: BenchmarkCase;
    citations: RagCitation[];
    durationMs: number;
    rerank: {
      applied: boolean;
      attempted: boolean;
      durationMs: number;
      topScore?: number;
      fallbackReason?: string;
    };
  }>,
): Metrics {
  const positives = rows.filter((row) => relevantTitles(row.item).length > 0);
  const negatives = rows.filter((row) => relevantTitles(row.item).length === 0);
  const relevanceAt = (row: (typeof rows)[number], index: number) =>
    row.item.judgments[row.citations[index]?.title] ?? 0;
  const relevantAt = (row: (typeof rows)[number], k: number) =>
    row.citations.slice(0, k).filter((citation) => row.item.judgments[citation.title]).length;
  const recallAt = (row: (typeof rows)[number], k: number) =>
    relevantAt(row, k) / relevantTitles(row.item).length;
  const hitAt = (row: (typeof rows)[number], k: number) =>
    relevantAt(row, k) > 0 ? 1 : 0;
  const firstRelevantRank = (row: (typeof rows)[number]) =>
    row.citations.findIndex((citation) => row.item.judgments[citation.title]);
  const averagePrecisionAt5 = (row: (typeof rows)[number]) => {
    let hits = 0;
    let sum = 0;
    row.citations.slice(0, 5).forEach((citation, index) => {
      if (!row.item.judgments[citation.title]) return;
      hits += 1;
      sum += hits / (index + 1);
    });
    return sum / relevantTitles(row.item).length;
  };
  const ndcgAt = (row: (typeof rows)[number], k: number) => {
    const dcg = Array.from({ length: k }, (_, index) =>
      discountedGain(relevanceAt(row, index), index),
    ).reduce((sum, value) => sum + value, 0);
    const ideal = Object.values(row.item.judgments)
      .sort((left, right) => right - left)
      .slice(0, k)
      .map((relevance, index) => discountedGain(relevance, index))
      .reduce((sum, value) => sum + value, 0);
    return ideal ? dcg / ideal : 0;
  };

  const hit1 = positives.map((row) => hitAt(row, 1));
  const hit3 = positives.map((row) => hitAt(row, 3));
  const negativeCorrect = negatives.map((row) => (row.citations.length ? 0 : 1));
  const latencies = rows.map((row) => row.durationMs);
  const rerankLatencies = rows
    .filter((row) => row.rerank.applied)
    .map((row) => row.rerank.durationMs);
  const fallbackReasons = [
    ...new Set(
      rows
        .map((row) => row.rerank.fallbackReason)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const positiveCategories = [...new Set(positives.map((row) => row.item.category))];
  const positiveTopScores = positives
    .map((row) => row.rerank.topScore)
    .filter((value): value is number => value !== undefined);
  const negativeTopScores = negatives
    .map((row) => row.rerank.topScore)
    .filter((value): value is number => value !== undefined);
  const gateSweep = [0.01, 0.02, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5].map(
    (threshold) => {
      const positivePassed = positives.filter(
        (row) => (row.rerank.topScore ?? -Infinity) >= threshold,
      );
      const negativeRejected = negatives.filter(
        (row) => (row.rerank.topScore ?? -Infinity) < threshold,
      );
      const correctPositiveDecisions = positivePassed.filter(
        (row) => hitAt(row, 1) > 0,
      ).length;
      return {
        threshold,
        positivePassRate: positivePassed.length / positives.length,
        negativeRejectRate: negativeRejected.length / negatives.length,
        decisionAccuracy:
          (correctPositiveDecisions + negativeRejected.length) / rows.length,
      };
    },
  );

  return {
    positiveCount: positives.length,
    negativeCount: negatives.length,
    hitAt1: mean(hit1),
    hitAt3: mean(hit3),
    hitAt5: mean(positives.map((row) => hitAt(row, 5))),
    recallAt1: mean(positives.map((row) => recallAt(row, 1))),
    recallAt3: mean(positives.map((row) => recallAt(row, 3))),
    recallAt5: mean(positives.map((row) => recallAt(row, 5))),
    precisionAt3: mean(positives.map((row) => relevantAt(row, 3) / 3)),
    precisionAt5: mean(positives.map((row) => relevantAt(row, 5) / 5)),
    precisionReturnedAt5: mean(
      positives.map((row) =>
        row.citations.length
          ? relevantAt(row, 5) / Math.min(row.citations.length, 5)
          : 0,
      ),
    ),
    mrr: mean(
      positives.map((row) => {
        const rank = firstRelevantRank(row);
        return rank >= 0 ? 1 / (rank + 1) : 0;
      }),
    ),
    mapAt5: mean(positives.map(averagePrecisionAt5)),
    ndcgAt3: mean(positives.map((row) => ndcgAt(row, 3))),
    ndcgAt5: mean(positives.map((row) => ndcgAt(row, 5))),
    noAnswerAccuracy: mean(negativeCorrect),
    top1DecisionAccuracy:
      (hit1.reduce((sum, value) => sum + value, 0) +
        negativeCorrect.reduce((sum, value) => sum + value, 0)) /
      rows.length,
    hitAt3Confidence95: wilsonInterval(
      hit3.reduce((sum, value) => sum + value, 0),
      positives.length,
    ),
    noAnswerConfidence95: wilsonInterval(
      negativeCorrect.reduce((sum, value) => sum + value, 0),
      negatives.length,
    ),
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
    rerankApplied: rows.filter((row) => row.rerank.applied).length,
    rerankAttempted: rows.filter((row) => row.rerank.attempted).length,
    rerankLatencyP50Ms: rerankLatencies.length
      ? percentile(rerankLatencies, 0.5)
      : undefined,
    rerankLatencyP95Ms: rerankLatencies.length
      ? percentile(rerankLatencies, 0.95)
      : undefined,
    fallbackReasons,
    positiveTopScoreMin: scoreMinimum(positiveTopScores),
    positiveTopScoreP10: scorePercentile(positiveTopScores, 0.1),
    positiveTopScoreP50: scorePercentile(positiveTopScores, 0.5),
    negativeTopScoreP50: scorePercentile(negativeTopScores, 0.5),
    negativeTopScoreP90: scorePercentile(negativeTopScores, 0.9),
    negativeTopScoreMax: scoreMaximum(negativeTopScores),
    gateSweep,
    categoryBreakdown: positiveCategories.map((category) => {
      const categoryRows = positives.filter(
        (row) => row.item.category === category,
      );
      return {
        category,
        count: categoryRows.length,
        hitAt1: mean(categoryRows.map((row) => hitAt(row, 1))),
        hitAt3: mean(categoryRows.map((row) => hitAt(row, 3))),
        recallAt3: mean(categoryRows.map((row) => recallAt(row, 3))),
        ndcgAt3: mean(categoryRows.map((row) => ndcgAt(row, 3))),
      };
    }),
    missedPositiveIds: positives
      .filter((row) => !hitAt(row, 5))
      .map((row) => row.item.id),
    falsePositiveNegativeIds: negatives
      .filter((row) => row.citations.length > 0)
      .map((row) => row.item.id),
  };
}

function printDatasetSummary(benchmark: Benchmark) {
  const categories = new Map<string, number>();
  for (const item of benchmark.cases) {
    categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
  }
  const positives = benchmark.cases.filter((item) => relevantTitles(item).length);
  console.log(`${benchmark.name} v${benchmark.version}`);
  console.log(
    `语料 ${benchmark.corpusTitles.length} 篇；问题 ${benchmark.cases.length} 道；正例 ${positives.length}；无答案 ${benchmark.cases.length - positives.length}`,
  );
  console.log(
    `类别：${[...categories.entries()].map(([name, count]) => `${name}=${count}`).join("，")}`,
  );
}

function printMetrics(metrics: Metrics) {
  console.log(`  Hit@1 / @3 / @5       ${metricTriplet(metrics.hitAt1, metrics.hitAt3, metrics.hitAt5)}`);
  console.log(`  Recall@1 / @3 / @5    ${metricTriplet(metrics.recallAt1, metrics.recallAt3, metrics.recallAt5)}`);
  console.log(`  Precision@3 / @5      ${percent(metrics.precisionAt3)} / ${percent(metrics.precisionAt5)}`);
  console.log(`  返回结果 Precision@5  ${percent(metrics.precisionReturnedAt5)}`);
  console.log(`  MRR / MAP@5           ${metrics.mrr.toFixed(3)} / ${metrics.mapAt5.toFixed(3)}`);
  console.log(`  nDCG@3 / @5           ${metrics.ndcgAt3.toFixed(3)} / ${metrics.ndcgAt5.toFixed(3)}`);
  console.log(
    `  无答案准确率          ${percent(metrics.noAnswerAccuracy)}（95% CI ${interval(metrics.noAnswerConfidence95)}）`,
  );
  console.log(`  Top-1/拒答综合准确率  ${percent(metrics.top1DecisionAccuracy)}`);
  console.log(
    `  Hit@3 95% CI          ${interval(metrics.hitAt3Confidence95)}`,
  );
  console.log(
    `  端到端延迟 P50/P95    ${metrics.latencyP50Ms}/${metrics.latencyP95Ms} ms`,
  );
  console.log("  分类型结果（Hit@1 / Hit@3 / Recall@3 / nDCG@3）");
  for (const category of metrics.categoryBreakdown) {
    console.log(
      `    ${category.category.padEnd(16)} n=${String(category.count).padStart(2)}  ${percent(category.hitAt1)} / ${percent(category.hitAt3)} / ${percent(category.recallAt3)} / ${category.ndcgAt3.toFixed(3)}`,
    );
  }
  if (metrics.rerankAttempted || metrics.rerankApplied) {
    console.log(
      `  Rerank applied        ${metrics.rerankApplied}/${metrics.rerankAttempted} 次尝试（总题数 ${metrics.positiveCount + metrics.negativeCount}）`,
    );
    console.log(
      `  Rerank 延迟 P50/P95   ${metrics.rerankLatencyP50Ms ?? "-"}/${metrics.rerankLatencyP95Ms ?? "-"} ms`,
    );
    console.log(
      `  正例 TopScore min/P10/P50  ${score(metrics.positiveTopScoreMin)}/${score(metrics.positiveTopScoreP10)}/${score(metrics.positiveTopScoreP50)}`,
    );
    console.log(
      `  负例 TopScore P50/P90/max  ${score(metrics.negativeTopScoreP50)}/${score(metrics.negativeTopScoreP90)}/${score(metrics.negativeTopScoreMax)}`,
    );
    console.log("  无答案门控阈值（正例通过 / 负例拒绝 / 综合准确率）");
    for (const gate of metrics.gateSweep) {
      console.log(
        `    ${gate.threshold.toFixed(2)}  ${percent(gate.positivePassRate)} / ${percent(gate.negativeRejectRate)} / ${percent(gate.decisionAccuracy)}`,
      );
    }
  }
  if (metrics.fallbackReasons.length) {
    console.log(`  降级原因              ${metrics.fallbackReasons.join("；")}`);
  }
  console.log(
    `  Top5 漏召回正例       ${metrics.missedPositiveIds.join("、") || "无"}`,
  );
  console.log(
    `  无答案误召回          ${metrics.falsePositiveNegativeIds.join("、") || "无"}`,
  );
}

function printComparison(baseline: Metrics, reranked: Metrics) {
  console.log("\nRerank 相对 RRF 的变化");
  console.log(`  Hit@1       ${delta(baseline.hitAt1, reranked.hitAt1)}`);
  console.log(`  Recall@3    ${delta(baseline.recallAt3, reranked.recallAt3)}`);
  console.log(`  MRR         ${delta(baseline.mrr, reranked.mrr)}`);
  console.log(`  nDCG@5      ${delta(baseline.ndcgAt5, reranked.ndcgAt5)}`);
  console.log(
    `  P95 延迟    ${reranked.latencyP95Ms - baseline.latencyP95Ms >= 0 ? "+" : ""}${reranked.latencyP95Ms - baseline.latencyP95Ms} ms`,
  );
}

function relevantTitles(item: BenchmarkCase) {
  return Object.keys(item.judgments);
}

function discountedGain(relevance: number, index: number) {
  return (2 ** relevance - 1) / Math.log2(index + 2);
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(Math.ceil(sorted.length * quantile) - 1, sorted.length - 1)];
}

function scorePercentile(values: number[], quantile: number) {
  return values.length ? percentile(values, quantile) : undefined;
}

function scoreMinimum(values: number[]) {
  return values.length ? Math.min(...values) : undefined;
}

function scoreMaximum(values: number[]) {
  return values.length ? Math.max(...values) : undefined;
}

function score(value: number | undefined) {
  return value === undefined ? "-" : value.toFixed(4);
}

function wilsonInterval(successes: number, total: number): [number, number] {
  if (!total) return [0, 0];
  const z = 1.96;
  const proportion = successes / total;
  const denominator = 1 + z ** 2 / total;
  const center = (proportion + z ** 2 / (2 * total)) / denominator;
  const margin =
    (z /
      denominator) *
    Math.sqrt(
      (proportion * (1 - proportion)) / total + z ** 2 / (4 * total ** 2),
    );
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function metricTriplet(first: number, third: number, fifth: number) {
  return `${percent(first)} / ${percent(third)} / ${percent(fifth)}`;
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function interval(value: [number, number]) {
  return `${percent(value[0])}-${percent(value[1])}`;
}

function delta(before: number, after: number) {
  const value = after - before;
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} pp`;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
