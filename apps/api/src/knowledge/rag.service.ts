import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { RagCitation } from "@health/shared";
import type { AuthUser } from "../auth/auth.types";
import type { LlmConfig } from "../llm/llm.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  asNumberVector,
  cosineSimilarity,
  EmbeddingService,
} from "./embedding.service";
import { RerankService } from "./rerank/rerank.service";
import type { RerankResult, RerankTrace } from "./rerank/rerank.types";

type RagRow = {
  chunkId: string;
  documentId: string;
  ordinal: number;
  title: string | null;
  documentTitle: string;
  source: string | null;
  sourceUrl: string | null;
  content: string;
  score: number;
};

export type RagRetrievalTrace = {
  publicCandidateCount: number;
  publicLexicalCandidateCount: number;
  publicSemanticCandidateCount: number;
  userCandidateCount: number;
  fusedCandidateCount: number;
  rerank: RerankTrace;
};

export type RagRetrievalResult = {
  citations: RagCitation[];
  trace: RagRetrievalTrace;
};

const EXCERPT_MAX_CHARS = 1200;
const EXCERPT_WINDOW_CHARS = 720;
const RRF_K = 60;
const MAX_CANDIDATES = 30;

const publicSemanticInclude = { document: true } satisfies Prisma.KnowledgeChunkInclude;
type PublicSemanticChunk = Prisma.KnowledgeChunkGetPayload<{
  include: typeof publicSemanticInclude;
}>;

@Injectable()
export class RagService {
  private readonly publicEmbeddingCache = new Map<
    string,
    { vectors: number[][]; chunks: PublicSemanticChunk[] }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly reranker: RerankService,
  ) {}

  async retrieve(
    query: string,
    options?: {
      topK?: number;
      locale?: string;
      tags?: string[];
      user?: AuthUser;
      conversationId?: string;
      config?: LlmConfig;
      signal?: AbortSignal;
    },
  ): Promise<RagCitation[]> {
    return (await this.retrieveWithTrace(query, options)).citations;
  }

  async retrieveWithTrace(
    query: string,
    options?: {
      topK?: number;
      locale?: string;
      tags?: string[];
      user?: AuthUser;
      conversationId?: string;
      config?: LlmConfig;
      signal?: AbortSignal;
    },
  ): Promise<RagRetrievalResult> {
    const normalizedQuery = query.replace(/\s+/g, " ").trim();
    if (!normalizedQuery) {
      return {
        citations: [],
        trace: emptyRetrievalTrace(),
      };
    }

    const topK = Math.min(Math.max(options?.topK ?? 5, 1), 10);
    const rerankCandidateK = Math.min(
      Math.max(this.reranker.candidateLimit, topK),
      MAX_CANDIDATES,
    );
    const candidateK = Math.min(
      Math.max(topK * 4, rerankCandidateK, 12),
      MAX_CANDIDATES,
    );
    const [publicLexicalCitations, publicSemanticCitations, userCitations] =
      await Promise.all([
      this.retrievePublicKnowledge(normalizedQuery, {
        ...options,
        topK: candidateK,
      }),
      this.retrievePublicSemanticKnowledge(normalizedQuery, {
        ...options,
        topK: candidateK,
      }),
      this.retrieveUserDocuments(normalizedQuery, {
        ...options,
        topK: candidateK,
      }),
      ]);

    const fallbackGroups: RankedCitationGroup[] = [
      { citations: userCitations, weight: 1, trustLevel: "personal" },
      {
        citations: publicLexicalCitations,
        weight: 1.08,
        trustLevel: "curated",
      },
    ];
    const candidateGroups: RankedCitationGroup[] = [
      ...fallbackGroups,
      {
        citations: publicSemanticCitations,
        weight: 1,
        trustLevel: "curated",
      },
    ];
    const fallbackCitations = fuseRankedCitations(fallbackGroups, topK);
    const candidatePool = fuseRankedCitations(
      candidateGroups,
      rerankCandidateK,
      4,
    );
    const reranked = options?.config
      ? await this.reranker.rerank({
          query: normalizedQuery,
          documents: candidatePool.map((citation) => ({
            id: citation.chunkId,
            text: rerankDocumentText(citation),
          })),
          topN: candidatePool.length,
          config: options.config,
          signal: options.signal,
        })
      : {
          results: [],
          trace: {
            ...emptyRetrievalTrace().rerank,
            candidateCount: candidatePool.length,
            fallbackReason: "缺少模型配置，未执行 Rerank",
          },
        };
    const rankedCitations = reranked.trace.applied
      ? combineRerankedCitations(
          candidatePool,
          reranked.results,
          topK,
          this.reranker.minimumScore,
          2,
          this.reranker.publicMinimumScore,
        )
      : fallbackCitations;

    return {
      citations: rankedCitations.map((citation, index) => ({
        ...citation,
        evidenceId: `E${index + 1}`,
      })),
      trace: {
        publicCandidateCount: new Set(
          [...publicLexicalCitations, ...publicSemanticCitations].map(
            (citation) => citation.chunkId,
          ),
        ).size,
        publicLexicalCandidateCount: publicLexicalCitations.length,
        publicSemanticCandidateCount: publicSemanticCitations.length,
        userCandidateCount: userCitations.length,
        fusedCandidateCount: candidatePool.length,
        rerank: reranked.trace,
      },
    };
  }

  private async retrievePublicSemanticKnowledge(
    normalizedQuery: string,
    options?: {
      topK?: number;
      locale?: string;
      config?: LlmConfig;
      signal?: AbortSignal;
    },
  ): Promise<RagCitation[]> {
    if (!options?.config) return [];
    const topK = Math.min(Math.max(options.topK ?? 5, 1), MAX_CANDIDATES);
    const locale = options.locale ?? "zh-CN";
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: {
        document: {
          userId: null,
          status: "published",
          locale,
        },
      },
      include: publicSemanticInclude,
      orderBy: { updatedAt: "desc" },
      take: 3_000,
    });
    if (!chunks.length) return [];

    const embeddedQuery = await this.embeddings.embedTexts(
      options.config,
      [normalizedQuery],
      options.signal,
    );
    const queryVector = embeddedQuery.vectors[0];
    if (!queryVector) return [];

    const fingerprint = chunks
      .map((chunk) => `${chunk.id}:${chunk.updatedAt.getTime()}`)
      .sort()
      .join("|");
    const cacheKey = `${embeddedQuery.model}:${fingerprint}`;
    let cached = this.publicEmbeddingCache.get(cacheKey);
    if (!cached) {
      const embeddedDocuments = await this.embeddings.embedTexts(
        options.config,
        chunks.map(publicEmbeddingText),
        options.signal,
      );
      if (
        embeddedDocuments.model !== embeddedQuery.model ||
        embeddedDocuments.vectors.length !== chunks.length
      ) {
        return [];
      }
      cached = { vectors: embeddedDocuments.vectors, chunks };
      this.publicEmbeddingCache.clear();
      this.publicEmbeddingCache.set(cacheKey, cached);
    }

    return cached.chunks
      .map((chunk, index) => {
        const vectorScore = cosineSimilarity(
          queryVector,
          cached!.vectors[index] ?? [],
        );
        const keywordScore = lexicalScore(
          normalizedQuery,
          publicEmbeddingText(chunk),
        );
        return {
          chunk,
          score: vectorScore * 0.9 + keywordScore * 0.1,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, topK)
      .map(({ chunk, score }) => ({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        title: normalizeDisplayText(chunk.document.title),
        source: chunk.document.source
          ? normalizeDisplayText(chunk.document.source)
          : undefined,
        sourceUrl: chunk.document.sourceUrl ?? undefined,
        locator: chunk.title
          ? normalizeDisplayText(chunk.title)
          : `分块 ${chunk.ordinal}`,
        trustLevel: "curated" as const,
        excerpt: ragExcerpt(chunk.content, normalizedQuery),
        score,
      }));
  }

  private async retrievePublicKnowledge(
    normalizedQuery: string,
    options?: { topK?: number; locale?: string; tags?: string[] },
  ): Promise<RagCitation[]> {
    const topK = Math.min(Math.max(options?.topK ?? 5, 1), MAX_CANDIDATES);
    const locale = options?.locale ?? "zh-CN";
    const tags = options?.tags ?? [];
    const searchTerms = publicSearchTerms(normalizedQuery);

    const rows = await this.prisma.$queryRaw<RagRow[]>(Prisma.sql`
      SELECT
        c."id" AS "chunkId",
        d."id" AS "documentId",
        c."ordinal" AS "ordinal",
        c."title" AS "title",
        d."title" AS "documentTitle",
        d."source" AS "source",
        d."sourceUrl" AS "sourceUrl",
        c."content" AS "content",
        (
          ts_rank_cd(
            to_tsvector('simple', coalesce(c."title", '') || ' ' || c."content" || ' ' || array_to_string(c."keywords", ' ')),
            plainto_tsquery('simple', ${normalizedQuery})
          ) * 2
          + similarity(c."content", ${normalizedQuery})
          + similarity(coalesce(c."title", d."title"), ${normalizedQuery}) * 1.5
          + CASE WHEN c."keywords" && ${tags}::text[] THEN 0.3 ELSE 0 END
          + COALESCE((
            SELECT count(*)::double precision / GREATEST(cardinality(${searchTerms}::text[]), 1)
            FROM unnest(${searchTerms}::text[]) AS term
            WHERE lower(coalesce(c."title", '') || ' ' || c."content" || ' ' || array_to_string(c."keywords", ' '))
              LIKE '%' || lower(term) || '%'
          ), 0) * 1.4
        ) AS "score"
      FROM "KnowledgeChunk" c
      JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
      WHERE d."status" = 'published'::"KnowledgeDocumentStatus"
        AND d."userId" IS NULL
        AND d."locale" = ${locale}
        AND (
          to_tsvector('simple', coalesce(c."title", '') || ' ' || c."content" || ' ' || array_to_string(c."keywords", ' ')) @@ plainto_tsquery('simple', ${normalizedQuery})
          OR c."content" % ${normalizedQuery}
          OR coalesce(c."title", d."title") % ${normalizedQuery}
          OR c."keywords" && regexp_split_to_array(${normalizedQuery}, '\\s+')
          OR EXISTS (
            SELECT 1
            FROM unnest(${searchTerms}::text[]) AS term
            WHERE lower(coalesce(c."title", '') || ' ' || c."content" || ' ' || array_to_string(c."keywords", ' '))
              LIKE '%' || lower(term) || '%'
          )
        )
      ORDER BY "score" DESC, c."updatedAt" DESC
      LIMIT ${topK};
    `);

    return rows.map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      title: normalizeDisplayText(row.documentTitle),
      source: row.source ? normalizeDisplayText(row.source) : undefined,
      sourceUrl: row.sourceUrl ?? undefined,
      locator: row.title
        ? normalizeDisplayText(row.title)
        : `分块 ${row.ordinal}`,
      trustLevel: "curated",
      excerpt: ragExcerpt(row.content, normalizedQuery),
      score: Number(row.score) || 0,
    }));
  }

  private async retrieveUserDocuments(
    normalizedQuery: string,
    options?: {
      topK?: number;
      user?: AuthUser;
      conversationId?: string;
      config?: LlmConfig;
      signal?: AbortSignal;
    },
  ): Promise<RagCitation[]> {
    if (!options?.user || !options.config || !options.conversationId) return [];

    const topK = Math.min(Math.max(options.topK ?? 5, 1), MAX_CANDIDATES);
    const embedded = await this.embeddings.embedTexts(
      options.config,
      [normalizedQuery],
      options.signal,
    );
    const queryVector = embedded.vectors[0];
    if (!queryVector) return [];

    const ownershipFilter = userDocumentOwnershipFilter(
      options.user.id,
      options.conversationId,
    );
    const lexicalTerms = publicSearchTerms(normalizedQuery).slice(0, 8);
    const [vectorChunks, lexicalChunks] = await Promise.all([
      this.prisma.knowledgeChunk.findMany({
        where: { document: ownershipFilter, embeddingModel: embedded.model },
        include: { document: true },
        orderBy: { updatedAt: "desc" },
        take: 3000,
      }),
      this.prisma.knowledgeChunk.findMany({
        where: {
          document: ownershipFilter,
          OR: [
            { keywords: { hasSome: lexicalTerms } },
            ...lexicalTerms.map((term) => ({
              content: { contains: term, mode: "insensitive" as const },
            })),
          ],
        },
        include: { document: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
    ]);
    const chunks = [
      ...new Map(
        [...vectorChunks, ...lexicalChunks].map((chunk) => [chunk.id, chunk]),
      ).values(),
    ];

    const candidates = chunks
      .filter((chunk) => isReadableText(chunk.content))
      .map((chunk) => {
        const vector = asNumberVector(chunk.embedding);
        const compatibleEmbedding = areEmbeddingsCompatible(
          embedded.model,
          queryVector,
          chunk.embeddingModel,
          vector,
        );
        const vectorScore =
          compatibleEmbedding && vector
            ? cosineSimilarity(queryVector, vector)
            : 0;
        const keywordScore = lexicalScore(
          normalizedQuery,
          `${chunk.title ?? ""} ${chunk.content} ${chunk.keywords.join(" ")}`,
        );
        const usesLocalEmbedding = isLocalEmbeddingModel(embedded.model);
        const vectorWeight = compatibleEmbedding
          ? usesLocalEmbedding
            ? 0.55
            : 0.85
          : 0;
        const score =
          vectorScore * vectorWeight + keywordScore * (1 - vectorWeight);
        const documentMetadata = metadataAsObject(chunk.document.metadata);
        const originalName =
          typeof documentMetadata.originalName === "string"
            ? documentMetadata.originalName
            : (chunk.document.source ?? chunk.document.title);

        return {
          chunk,
          citation: {
            chunkId: chunk.id,
            documentId: chunk.documentId,
            title: normalizeDisplayText(originalName),
            source: "用户上传文档",
            sourceUrl: undefined,
            locator: `分块 ${chunk.ordinal}`,
            trustLevel: "personal",
            excerpt: ragExcerpt(chunk.content, normalizedQuery),
            score,
          } satisfies RagCitation,
        };
      })
      .sort((left, right) => right.citation.score - left.citation.score);

    return expandNeighborChunks(
      candidates.filter((candidate) => candidate.citation.score > 0.08),
      candidates,
      topK,
    ).map((candidate) => candidate.citation);
  }
}

export function userDocumentOwnershipFilter(
  userId: string,
  conversationId: string,
) {
  return {
    userId,
    status: "published" as const,
    uploadedFile: {
      is: {
        messageLinks: {
          some: { message: { conversationId } },
        },
      },
    },
  };
}

type RankedCitationGroup = {
  citations: RagCitation[];
  weight: number;
  trustLevel: NonNullable<RagCitation["trustLevel"]>;
};

export function fuseRankedCitations(
  groups: RankedCitationGroup[],
  topK: number,
  maxPerDocument = 2,
) {
  const fused = new Map<
    string,
    RagCitation & { fusionScore: number; bestRawScore: number }
  >();

  for (const group of groups) {
    group.citations.forEach((citation, index) => {
      const fusionScore = group.weight / (RRF_K + index + 1);
      const current = fused.get(citation.chunkId);
      if (current) {
        current.fusionScore += fusionScore;
        current.bestRawScore = Math.max(current.bestRawScore, citation.score);
        return;
      }
      fused.set(citation.chunkId, {
        ...citation,
        trustLevel: citation.trustLevel ?? group.trustLevel,
        fusionScore,
        bestRawScore: citation.score,
      });
    });
  }

  const perDocument = new Map<string, number>();
  const result: RagCitation[] = [];
  const ranked = [...fused.values()].sort(
    (left, right) =>
      right.fusionScore - left.fusionScore ||
      right.bestRawScore - left.bestRawScore,
  );
  for (const citation of ranked) {
    const count = perDocument.get(citation.documentId) ?? 0;
    if (count >= maxPerDocument) continue;
    perDocument.set(citation.documentId, count + 1);
    const { fusionScore, bestRawScore: _bestRawScore, ...value } = citation;
    result.push({ ...value, score: fusionScore });
    if (result.length >= topK) break;
  }
  return result;
}

export function combineRerankedCitations(
  candidates: RagCitation[],
  reranked: RerankResult[],
  topK: number,
  minimumRerankScore = 0,
  maxPerDocument = 2,
  publicMinimumRerankScore = minimumRerankScore,
) {
  const rerankedById = new Map(reranked.map((result) => [result.id, result]));
  const publicEvidenceAccepted = hasRerankEvidence(
    candidates.filter((citation) => citation.trustLevel === "curated"),
    reranked,
    publicMinimumRerankScore,
  );
  const ranked = candidates
    .map((citation, retrievalRank) => {
      const rerank = rerankedById.get(citation.chunkId);
      if (citation.trustLevel === "curated" && !publicEvidenceAccepted)
        return undefined;
      if (rerank && rerank.score < minimumRerankScore) return undefined;
      const retrievalScore = 0.25 / (RRF_K + retrievalRank + 1);
      const rerankScore = rerank ? 0.75 / (RRF_K + rerank.rank + 1) : 0;
      return {
        citation: { ...citation, score: retrievalScore + rerankScore },
        rawRerankScore: rerank?.score ?? -Infinity,
        rerankRank: rerank?.rank ?? Number.MAX_SAFE_INTEGER,
        retrievalRank,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort(
      (left, right) =>
        right.citation.score - left.citation.score ||
        right.rawRerankScore - left.rawRerankScore ||
        left.rerankRank - right.rerankRank ||
        left.retrievalRank - right.retrievalRank,
    );

  const perDocument = new Map<string, number>();
  const result: RagCitation[] = [];
  for (const item of ranked) {
    const count = perDocument.get(item.citation.documentId) ?? 0;
    if (count >= maxPerDocument) continue;
    perDocument.set(item.citation.documentId, count + 1);
    result.push(item.citation);
    if (result.length >= topK) break;
  }
  return result;
}

export function hasRerankEvidence(
  citations: RagCitation[],
  reranked: RerankResult[],
  minimumScore: number,
) {
  const citationIds = new Set(citations.map((citation) => citation.chunkId));
  return reranked.some(
    (result) => citationIds.has(result.id) && result.score >= minimumScore,
  );
}

function rerankDocumentText(citation: RagCitation) {
  return [citation.title, citation.locator, citation.excerpt]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_000);
}

function emptyRetrievalTrace(): RagRetrievalTrace {
  return {
    publicCandidateCount: 0,
    publicLexicalCandidateCount: 0,
    publicSemanticCandidateCount: 0,
    userCandidateCount: 0,
    fusedCandidateCount: 0,
    rerank: {
      enabled: false,
      attempted: false,
      applied: false,
      provider: "dashscope",
      model: "gte-rerank-v2",
      candidateCount: 0,
      resultCount: 0,
      durationMs: 0,
      fallbackReason: "没有可重排的候选片段",
    },
  };
}

function publicEmbeddingText(chunk: {
  title: string | null;
  content: string;
  keywords: string[];
  document: { title: string; tags: string[] };
}) {
  return [
    chunk.document.title,
    chunk.title,
    chunk.document.tags.join(" "),
    chunk.keywords.join(" "),
    chunk.content,
  ]
    .filter(Boolean)
    .join("\n");
}

export function areEmbeddingsCompatible(
  queryModel: string | null | undefined,
  queryVector: number[] | undefined,
  chunkModel: string | null | undefined,
  chunkVector: number[] | undefined,
) {
  return Boolean(
    queryModel &&
    chunkModel &&
    queryModel === chunkModel &&
    queryVector?.length &&
    queryVector.length === chunkVector?.length,
  );
}

type UserChunkCandidate = {
  chunk: { documentId: string; ordinal: number };
  citation: RagCitation;
};

function expandNeighborChunks<T extends UserChunkCandidate>(
  primary: T[],
  allCandidates: T[],
  topK: number,
) {
  const byChunk = new Map(
    allCandidates.map((candidate) => [
      chunkPositionKey(candidate.chunk.documentId, candidate.chunk.ordinal),
      candidate,
    ]),
  );
  const seen = new Set<string>();
  const result: T[] = [];

  const add = (candidate: T | undefined) => {
    if (
      !candidate ||
      seen.has(candidate.citation.chunkId) ||
      result.length >= topK
    )
      return;
    seen.add(candidate.citation.chunkId);
    result.push(candidate);
  };

  for (const candidate of primary) {
    add(candidate);
    if (candidate.citation.score < 0.08) continue;
    add(
      byChunk.get(
        chunkPositionKey(
          candidate.chunk.documentId,
          candidate.chunk.ordinal - 1,
        ),
      ),
    );
    add(
      byChunk.get(
        chunkPositionKey(
          candidate.chunk.documentId,
          candidate.chunk.ordinal + 1,
        ),
      ),
    );
  }

  for (const candidate of primary) add(candidate);
  return result.slice(0, topK);
}

function chunkPositionKey(documentId: string, ordinal: number) {
  return `${documentId}:${ordinal}`;
}

function isLocalEmbeddingModel(model: string | null | undefined) {
  return Boolean(model && /local|hash|mock/i.test(model));
}

export function lexicalScore(query: string, content: string) {
  const normalized = content.toLowerCase();
  const exactQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  const directScore = weightedTermScore(normalized, baseQueryTerms(query), 12);
  const expansionScore = weightedTermScore(
    normalized,
    expandedQueryTerms(query),
    10,
  );
  const exactBonus = exactQuery && normalized.includes(exactQuery) ? 0.2 : 0;
  return Math.min(1, Math.max(directScore, expansionScore * 0.95) + exactBonus);
}

function weightedTermScore(
  content: string,
  terms: Array<{ value: string; weight: number }>,
  normalizationCap: number,
) {
  if (!terms.length) return 0;
  const deduped = dedupeWeightedTerms(terms);
  const totalWeight = Math.min(
    deduped.reduce((sum, term) => sum + term.weight, 0),
    normalizationCap,
  );
  const hitWeight = deduped.reduce(
    (sum, term) => (content.includes(term.value) ? sum + term.weight : sum),
    0,
  );
  return Math.min(hitWeight / Math.max(totalWeight, 1), 1);
}

function baseQueryTerms(query: string) {
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  const terms: Array<{ value: string; weight: number }> = [];

  for (const term of normalized.match(/[a-z0-9][a-z0-9_.%+-]{1,}/giu) ?? []) {
    terms.push({ value: term, weight: Math.min(term.length + 4, 8) });
  }

  const cjkChars = normalized.match(/[\u4e00-\u9fff]/gu) ?? [];
  for (let size = 4; size >= 2; size -= 1) {
    for (let index = 0; index <= cjkChars.length - size; index += 1) {
      const value = cjkChars.slice(index, index + size).join("");
      if (!CJK_QUERY_STOP_TERMS.has(value)) terms.push({ value, weight: size });
    }
  }

  return terms;
}

function expandedQueryTerms(query: string) {
  const normalized = query.toLowerCase();
  const terms: Array<{ value: string; weight: number }> = [];

  for (const group of SEMANTIC_QUERY_EXPANSIONS) {
    if (!group.triggers.some((trigger) => normalized.includes(trigger)))
      continue;
    for (const value of group.terms) {
      terms.push({ value: value.toLowerCase(), weight: group.weight });
    }
  }

  return terms;
}

function dedupeWeightedTerms(terms: Array<{ value: string; weight: number }>) {
  const result = new Map<string, number>();
  for (const term of terms) {
    const value = term.value.trim().toLowerCase();
    if (value.length < 2) continue;
    result.set(value, Math.max(result.get(value) ?? 0, term.weight));
  }
  return [...result.entries()].map(([value, weight]) => ({ value, weight }));
}

function publicSearchTerms(query: string) {
  const expanded = dedupeWeightedTerms(expandedQueryTerms(query))
    .sort(
      (left, right) =>
        right.weight - left.weight || right.value.length - left.value.length,
    )
    .map((term) => term.value)
    .slice(0, 8);
  const direct = dedupeWeightedTerms(baseQueryTerms(query))
    .sort(
      (left, right) =>
        right.weight - left.weight || right.value.length - left.value.length,
    )
    .map((term) => term.value)
    .slice(0, 12);
  const terms = [...new Set([...expanded, ...direct])].slice(0, 18);
  return terms.length ? terms : [query.slice(0, 120)];
}

const CJK_QUERY_STOP_TERMS = new Set([
  "多少",
  "什么",
  "怎么",
  "如何",
  "建议",
  "资料",
  "文档",
  "里面",
  "里的",
  "如果",
  "应该",
  "可以",
]);

const SEMANTIC_QUERY_EXPANSIONS = [
  {
    triggers: ["睡不着", "睡不好", "失眠", "入睡", "躺很久", "很久睡", "睡眠"],
    terms: [
      "入睡困难",
      "入睡潜伏期",
      "固定起床",
      "睡前",
      "睡前降噪",
      "雾灯流程",
      "夜醒",
    ],
    weight: 3,
  },
  {
    triggers: ["半夜醒", "夜里醒", "夜间醒", "夜醒", "醒来"],
    terms: [
      "夜醒处理",
      "夜间醒来",
      "超过 20 分钟",
      "离床",
      "安静角落",
      "4 分钟",
      "缓慢呼吸",
    ],
    weight: 3,
  },
  {
    triggers: ["灯光", "卧室", "光线", "亮度", "lux"],
    terms: ["卧室灯光", "灯光目标", "18 lux", "低亮度暖光", "雾灯流程"],
    weight: 3,
  },
  {
    triggers: ["午睡", "午休", "补觉", "窗口", "最长", "时长"],
    terms: ["白天补觉", "午睡", "13:00-15:00", "22 分钟", "傍晚补觉"],
    weight: 3,
  },
  {
    triggers: ["咖啡", "咖啡因", "浓茶", "奶茶"],
    terms: ["14:30", "咖啡因", "浓茶", "能量饮料", "高咖啡因奶茶"],
    weight: 3,
  },
  {
    triggers: ["药", "停药", "换药", "剂量", "加量", "减量", "副作用"],
    terms: [
      "用药",
      "停止",
      "加量",
      "减量",
      "联合用药",
      "副作用",
      "开药医生",
      "药师",
    ],
    weight: 4,
  },
  {
    triggers: ["焦虑", "惊恐", "恐慌", "呼吸很急", "稳定下来"],
    terms: ["焦虑", "惊恐", "稳定", "缓慢呼气", "呼吸节奏", "双脚放在地面"],
    weight: 4,
  },
  {
    triggers: ["自伤", "自杀", "伤害自己", "活不下去", "不想活"],
    terms: ["伤害自己", "即时危险", "现场安全", "紧急服务", "可信任的人"],
    weight: 5,
  },
];

function isReadableText(text: string) {
  if (!text.trim()) return false;
  const replacementCount = text.match(/�/g)?.length ?? 0;
  const mojibakeCount = text.match(/[\u00c0-\u00ff]/g)?.length ?? 0;
  const usefulCount =
    text.match(
      /[\p{L}\p{N}\u4e00-\u9fff，。！？、；：“”‘’（）《》【】,.!?;:'"()[\]\s/%+\-]/gu,
    )?.length ?? 0;
  const badRatio = (replacementCount + mojibakeCount) / text.length;
  return usefulCount / text.length >= 0.55 && badRatio < 0.08;
}

function normalizeDisplayText(value: string) {
  const decoded = decodeLatin1Utf8(value);
  return readabilityScore(decoded) > readabilityScore(value) + 0.15
    ? decoded
    : value;
}

function decodeLatin1Utf8(value: string) {
  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function readabilityScore(text: string) {
  if (!text) return 0;
  const replacementCount = text.match(/�/g)?.length ?? 0;
  const mojibakeCount = text.match(/[\u00c0-\u00ff]/g)?.length ?? 0;
  const cjkCount = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const asciiCount = text.match(/[a-z0-9_.\- ()[\]]/gi)?.length ?? 0;
  return (
    (cjkCount + asciiCount) / text.length -
    (replacementCount + mojibakeCount) / text.length
  );
}

function metadataAsObject(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function ragExcerpt(content: string, query: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= EXCERPT_MAX_CHARS) return compact;

  const index = bestExcerptIndex(compact, query);
  const start = Math.max((index < 0 ? 0 : index) - 160, 0);
  const text = compact.slice(start, start + EXCERPT_WINDOW_CHARS);
  return `${start > 0 ? "..." : ""}${text}${start + EXCERPT_WINDOW_CHARS < compact.length ? "..." : ""}`;
}

function bestExcerptIndex(content: string, query: string) {
  const normalizedContent = content.toLowerCase();
  const terms = queryTerms(query);
  let bestIndex = -1;
  let bestWeight = 0;

  for (const term of terms) {
    const index = normalizedContent.indexOf(term.value);
    if (index < 0) continue;
    if (
      term.weight > bestWeight ||
      (term.weight === bestWeight && (bestIndex < 0 || index < bestIndex))
    ) {
      bestIndex = index;
      bestWeight = term.weight;
    }
  }

  return bestIndex;
}

function queryTerms(query: string) {
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  const terms = new Map<string, number>();

  for (const term of normalized
    .split(/\s+/)
    .filter((item) => item.length >= 2)) {
    terms.set(term, Math.max(terms.get(term) ?? 0, term.length + 6));
  }

  for (const match of normalized.matchAll(/[a-z0-9][a-z0-9_.%+-]{1,}/giu)) {
    const value = match[0];
    terms.set(value, Math.max(terms.get(value) ?? 0, value.length + 5));
  }

  const cjkChars = normalized.match(/[\u4e00-\u9fff]/gu) ?? [];
  for (let size = 4; size >= 2; size -= 1) {
    for (let index = 0; index <= cjkChars.length - size; index += 1) {
      const value = cjkChars.slice(index, index + size).join("");
      if (CJK_QUERY_STOP_TERMS.has(value)) continue;
      terms.set(value, Math.max(terms.get(value) ?? 0, size));
    }
  }

  return [...terms.entries()]
    .map(([value, weight]) => ({ value, weight }))
    .sort((left, right) => right.weight - left.weight);
}

function excerpt(content: string, query: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  const terms = query.split(/\s+/).filter(Boolean);
  const index = terms.reduce((best, term) => {
    const found = compact.indexOf(term);
    if (found < 0) return best;
    return best < 0 ? found : Math.min(best, found);
  }, -1);
  const start = Math.max((index < 0 ? 0 : index) - 80, 0);
  const text = compact.slice(start, start + 260);
  return `${start > 0 ? "…" : ""}${text}${start + 260 < compact.length ? "…" : ""}`;
}
