import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { knowledgeDocuments } from "../prisma/seed-knowledge";

type Benchmark = {
  corpusTitles: string[];
  cases: Array<{
    id: string;
    category: string;
    query: string;
    judgments: Record<string, number>;
  }>;
};

function loadBenchmark(version: "v1" | "v2") {
  const path = join(
    __dirname,
    "..",
    "evaluation",
    `rag-standard-${version}.json`,
  );
  return JSON.parse(readFileSync(path, "utf8")) as Benchmark;
}

test("standard RAG benchmark has unique cases and complete valid judgments", () => {
  const benchmark = loadBenchmark("v1");
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

test("v2 holdout benchmark is larger, independent and fully judged", () => {
  const v1 = loadBenchmark("v1");
  const v2 = loadBenchmark("v2");
  const ids = v2.cases.map((item) => item.id);
  const titles = new Set(v2.corpusTitles);
  const v1Queries = new Set(v1.cases.map((item) => normalizeQuery(item.query)));
  const positives = v2.cases.filter((item) => Object.keys(item.judgments).length > 0);
  const negatives = v2.cases.filter((item) => Object.keys(item.judgments).length === 0);
  const hardNegatives = v2.cases.filter((item) => item.category === "hard_no_answer");

  assert.deepEqual([...v2.corpusTitles].sort(), [...v1.corpusTitles].sort());
  assert.equal(v2.cases.length, 120);
  assert.equal(positives.length, 90);
  assert.equal(negatives.length, 30);
  assert.equal(hardNegatives.length, 21);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(v2.cases.every((item) => item.id.startsWith("v2-")));
  assert.ok(v2.cases.every((item) => !v1Queries.has(normalizeQuery(item.query))));

  for (const item of v2.cases) {
    assert.ok(item.query.trim().length >= 12);
    for (const [title, relevance] of Object.entries(item.judgments)) {
      assert.ok(titles.has(title), `${item.id} references unknown title ${title}`);
      assert.ok([1, 2, 3].includes(relevance));
    }
  }
});

test("built-in knowledge documents have governed provenance and semantic chunks", () => {
  const benchmark = loadBenchmark("v1");
  const titles = knowledgeDocuments.map((document) => document.title).sort();
  const chunkTitles = new Set<string>();
  const chunkContents = new Set<string>();

  assert.equal(knowledgeDocuments.length, 7);
  assert.deepEqual(titles, [...benchmark.corpusTitles].sort());

  for (const document of knowledgeDocuments) {
    assert.match(document.sourceUrl, /^https:\/\//);
    assert.ok(document.tags.length >= 4, `${document.title} needs richer tags`);
    assert.equal(document.metadata.version, "2.0.0");
    assert.match(document.metadata.editorialStatus, /临床专业人员复核/);
    assert.match(document.metadata.lastReviewedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(document.metadata.nextReviewDueAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(document.chunks.length >= 3, `${document.title} needs semantic chunks`);

    for (const chunk of document.chunks) {
      assert.ok(chunk.title.trim().length >= 6);
      assert.ok(chunk.keywords.length >= 5, `${document.title}/${chunk.title} needs aliases`);
      assert.ok(chunk.content.length >= 80 && chunk.content.length <= 500);
      assert.equal(chunkTitles.has(`${document.title}/${chunk.title}`), false);
      assert.equal(chunkContents.has(chunk.content), false);
      chunkTitles.add(`${document.title}/${chunk.title}`);
      chunkContents.add(chunk.content);
    }
  }

  const crisis = knowledgeDocuments.find(
    (document) => document.title === "危机与紧急情况处理原则",
  );
  const supporterText = crisis?.chunks.map((chunk) => chunk.content).join(" ") ?? "";
  assert.match(supporterText, /朋友或家人/);
  assert.match(supporterText, /不要承诺替对方保密/);
});

function normalizeQuery(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").replace(/[，。！？、,.!?]/g, "").toLowerCase();
}
