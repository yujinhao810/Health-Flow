import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

type Benchmark = {
  corpusTitles: string[];
  cases: Array<{
    id: string;
    category: string;
    query: string;
    judgments: Record<string, number>;
  }>;
};

test("standard RAG benchmark has unique cases and complete valid judgments", () => {
  const path = join(
    __dirname,
    "..",
    "evaluation",
    "rag-standard-v1.json",
  );
  const benchmark = JSON.parse(readFileSync(path, "utf8")) as Benchmark;
  const ids = benchmark.cases.map((item) => item.id);
  const titles = new Set(benchmark.corpusTitles);
  const positives = benchmark.cases.filter(
    (item) => Object.keys(item.judgments).length > 0,
  );
  const negatives = benchmark.cases.filter(
    (item) => Object.keys(item.judgments).length === 0,
  );

  assert.equal(benchmark.corpusTitles.length, 7);
  assert.equal(benchmark.cases.length, 72);
  assert.equal(positives.length, 58);
  assert.equal(negatives.length, 14);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(benchmark.cases.every((item) => item.query.trim().length >= 8));

  for (const item of benchmark.cases) {
    for (const [title, relevance] of Object.entries(item.judgments)) {
      assert.ok(titles.has(title), `${item.id} references unknown title ${title}`);
      assert.ok([1, 2, 3].includes(relevance));
    }
  }
});
