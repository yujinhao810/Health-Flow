import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RagCitation } from '@health/shared';
import type { AuthUser } from '../auth/auth.types';
import type { LlmConfig } from '../llm/llm.types';
import { PrismaService } from '../prisma/prisma.service';
import { asNumberVector, cosineSimilarity, EmbeddingService } from './embedding.service';

type RagRow = {
  chunkId: string;
  documentId: string;
  title: string | null;
  documentTitle: string;
  source: string | null;
  sourceUrl: string | null;
  content: string;
  score: number;
};

const EXCERPT_MAX_CHARS = 1200;
const EXCERPT_WINDOW_CHARS = 720;

@Injectable()
export class RagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async retrieve(
    query: string,
    options?: { topK?: number; locale?: string; tags?: string[]; user?: AuthUser; config?: LlmConfig; signal?: AbortSignal },
  ): Promise<RagCitation[]> {
    const normalizedQuery = query.replace(/\s+/g, ' ').trim();
    if (!normalizedQuery) return [];

    const topK = Math.min(Math.max(options?.topK ?? 5, 1), 10);
    const [publicCitations, userCitations] = await Promise.all([
      this.retrievePublicKnowledge(normalizedQuery, { ...options, topK }),
      this.retrieveUserDocuments(normalizedQuery, { ...options, topK }),
    ]);

    return mergeCitations([...userCitations, ...publicCitations]).slice(0, topK);
  }

  private async retrievePublicKnowledge(
    normalizedQuery: string,
    options?: { topK?: number; locale?: string; tags?: string[] },
  ): Promise<RagCitation[]> {
    const topK = Math.min(Math.max(options?.topK ?? 5, 1), 10);
    const locale = options?.locale ?? 'zh-CN';
    const tags = options?.tags ?? [];

    const rows = await this.prisma.$queryRaw<RagRow[]>(Prisma.sql`
      SELECT
        c."id" AS "chunkId",
        d."id" AS "documentId",
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
        )
      ORDER BY "score" DESC, c."updatedAt" DESC
      LIMIT ${topK};
    `);

    return rows.map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      title: normalizeDisplayText(row.title || row.documentTitle),
      source: row.source ? normalizeDisplayText(row.source) : undefined,
      sourceUrl: row.sourceUrl ?? undefined,
      excerpt: ragExcerpt(row.content, normalizedQuery),
      score: Number(row.score) || 0,
    }));
  }

  private async retrieveUserDocuments(
    normalizedQuery: string,
    options?: { topK?: number; user?: AuthUser; config?: LlmConfig; signal?: AbortSignal },
  ): Promise<RagCitation[]> {
    if (!options?.user || !options.config) return [];

    const topK = Math.min(Math.max(options.topK ?? 5, 1), 10);
    const embedded = await this.embeddings.embedTexts(options.config, [normalizedQuery], options.signal);
    const queryVector = embedded.vectors[0];
    if (!queryVector) return [];

    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: {
        document: {
          userId: options.user.id,
          status: 'published',
        },
      },
      include: { document: true },
      orderBy: { updatedAt: 'desc' },
      take: 2000,
    });

    const candidates = chunks
      .filter((chunk) => isReadableText(chunk.content))
      .map((chunk) => {
        const vector = asNumberVector(chunk.embedding);
        const vectorScore = vector ? cosineSimilarity(queryVector, vector) : 0;
        const keywordScore = lexicalScore(normalizedQuery, `${chunk.title ?? ''} ${chunk.content} ${chunk.keywords.join(' ')}`);
        const usesLocalEmbedding = isLocalEmbeddingModel(embedded.model) || isLocalEmbeddingModel(chunk.embeddingModel);
        const vectorWeight = usesLocalEmbedding ? 0.55 : 0.85;
        const score = vectorScore * vectorWeight + keywordScore * (1 - vectorWeight);
        const documentMetadata = metadataAsObject(chunk.document.metadata);
        const originalName =
          typeof documentMetadata.originalName === 'string' ? documentMetadata.originalName : chunk.document.source ?? chunk.document.title;

        return {
          chunk,
          citation: {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          title: normalizeDisplayText(originalName),
          source: '用户上传文档',
          sourceUrl: undefined,
          excerpt: ragExcerpt(chunk.content, normalizedQuery),
            score,
          } satisfies RagCitation,
        };
      })
      .sort((left, right) => right.citation.score - left.citation.score);

    return expandNeighborChunks(candidates.filter((candidate) => candidate.citation.score > 0.04), candidates, topK).map(
      (candidate) => candidate.citation,
    );
  }
}

function mergeCitations(citations: RagCitation[]) {
  const seen = new Set<string>();
  return citations
    .filter((citation) => {
      if (seen.has(citation.chunkId)) return false;
      seen.add(citation.chunkId);
      return true;
    })
    .sort((left, right) => right.score - left.score);
}

type UserChunkCandidate = {
  chunk: { documentId: string; ordinal: number };
  citation: RagCitation;
};

function expandNeighborChunks<T extends UserChunkCandidate>(primary: T[], allCandidates: T[], topK: number) {
  const byChunk = new Map(allCandidates.map((candidate) => [chunkPositionKey(candidate.chunk.documentId, candidate.chunk.ordinal), candidate]));
  const seen = new Set<string>();
  const result: T[] = [];

  const add = (candidate: T | undefined) => {
    if (!candidate || seen.has(candidate.citation.chunkId) || result.length >= topK) return;
    seen.add(candidate.citation.chunkId);
    result.push(candidate);
  };

  for (const candidate of primary) {
    add(candidate);
    if (candidate.citation.score < 0.08) continue;
    add(byChunk.get(chunkPositionKey(candidate.chunk.documentId, candidate.chunk.ordinal - 1)));
    add(byChunk.get(chunkPositionKey(candidate.chunk.documentId, candidate.chunk.ordinal + 1)));
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

function lexicalScore(query: string, content: string) {
  const normalized = content.toLowerCase();
  const exactQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const directScore = weightedTermScore(normalized, baseQueryTerms(query), 12);
  const expansionScore = weightedTermScore(normalized, expandedQueryTerms(query), 10);
  const exactBonus = exactQuery && normalized.includes(exactQuery) ? 0.2 : 0;
  return Math.min(1, Math.max(directScore, expansionScore * 0.95) + exactBonus);
}

function weightedTermScore(content: string, terms: Array<{ value: string; weight: number }>, normalizationCap: number) {
  if (!terms.length) return 0;
  const deduped = dedupeWeightedTerms(terms);
  const totalWeight = Math.min(
    deduped.reduce((sum, term) => sum + term.weight, 0),
    normalizationCap,
  );
  const hitWeight = deduped.reduce((sum, term) => (content.includes(term.value) ? sum + term.weight : sum), 0);
  return Math.min(hitWeight / Math.max(totalWeight, 1), 1);
}

function baseQueryTerms(query: string) {
  const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const terms: Array<{ value: string; weight: number }> = [];

  for (const term of normalized.match(/[a-z0-9][a-z0-9_.%+-]{1,}/giu) ?? []) {
    terms.push({ value: term, weight: Math.min(term.length + 4, 8) });
  }

  const cjkChars = normalized.match(/[\u4e00-\u9fff]/gu) ?? [];
  for (let size = 4; size >= 2; size -= 1) {
    for (let index = 0; index <= cjkChars.length - size; index += 1) {
      const value = cjkChars.slice(index, index + size).join('');
      if (!CJK_QUERY_STOP_TERMS.has(value)) terms.push({ value, weight: size });
    }
  }

  return terms;
}

function expandedQueryTerms(query: string) {
  const normalized = query.toLowerCase();
  const terms: Array<{ value: string; weight: number }> = [];

  for (const group of SEMANTIC_QUERY_EXPANSIONS) {
    if (!group.triggers.some((trigger) => normalized.includes(trigger))) continue;
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

const CJK_QUERY_STOP_TERMS = new Set(['多少', '什么', '怎么', '如何', '建议', '资料', '文档', '里面', '里的', '如果', '应该', '可以']);

const SEMANTIC_QUERY_EXPANSIONS = [
  {
    triggers: ['睡不着', '睡不好', '失眠', '入睡', '躺很久', '很久睡', '睡眠'],
    terms: ['入睡困难', '入睡潜伏期', '固定起床', '睡前', '睡前降噪', '雾灯流程', '夜醒'],
    weight: 3,
  },
  {
    triggers: ['半夜醒', '夜里醒', '夜间醒', '夜醒', '醒来'],
    terms: ['夜醒处理', '夜间醒来', '超过 20 分钟', '离床', '安静角落', '4 分钟', '缓慢呼吸'],
    weight: 3,
  },
  {
    triggers: ['灯光', '卧室', '光线', '亮度', 'lux'],
    terms: ['卧室灯光', '灯光目标', '18 lux', '低亮度暖光', '雾灯流程'],
    weight: 3,
  },
  {
    triggers: ['午睡', '午休', '补觉', '窗口', '最长', '时长'],
    terms: ['白天补觉', '午睡', '13:00-15:00', '22 分钟', '傍晚补觉'],
    weight: 3,
  },
  {
    triggers: ['咖啡', '咖啡因', '浓茶', '奶茶'],
    terms: ['14:30', '咖啡因', '浓茶', '能量饮料', '高咖啡因奶茶'],
    weight: 3,
  },
];

function isReadableText(text: string) {
  if (!text.trim()) return false;
  const replacementCount = text.match(/�/g)?.length ?? 0;
  const mojibakeCount = text.match(/[\u00c0-\u00ff]/g)?.length ?? 0;
  const usefulCount = text.match(/[\p{L}\p{N}\u4e00-\u9fff，。！？、；：“”‘’（）《》【】,.!?;:'"()[\]\s/%+\-]/gu)?.length ?? 0;
  const badRatio = (replacementCount + mojibakeCount) / text.length;
  return usefulCount / text.length >= 0.55 && badRatio < 0.08;
}

function normalizeDisplayText(value: string) {
  const decoded = decodeLatin1Utf8(value);
  return readabilityScore(decoded) > readabilityScore(value) + 0.15 ? decoded : value;
}

function decodeLatin1Utf8(value: string) {
  try {
    return Buffer.from(value, 'latin1').toString('utf8');
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
  return (cjkCount + asciiCount) / text.length - (replacementCount + mojibakeCount) / text.length;
}

function metadataAsObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ragExcerpt(content: string, query: string) {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (compact.length <= EXCERPT_MAX_CHARS) return compact;

  const index = bestExcerptIndex(compact, query);
  const start = Math.max((index < 0 ? 0 : index) - 160, 0);
  const text = compact.slice(start, start + EXCERPT_WINDOW_CHARS);
  return `${start > 0 ? '...' : ''}${text}${start + EXCERPT_WINDOW_CHARS < compact.length ? '...' : ''}`;
}

function bestExcerptIndex(content: string, query: string) {
  const normalizedContent = content.toLowerCase();
  const terms = queryTerms(query);
  let bestIndex = -1;
  let bestWeight = 0;

  for (const term of terms) {
    const index = normalizedContent.indexOf(term.value);
    if (index < 0) continue;
    if (term.weight > bestWeight || (term.weight === bestWeight && (bestIndex < 0 || index < bestIndex))) {
      bestIndex = index;
      bestWeight = term.weight;
    }
  }

  return bestIndex;
}

function queryTerms(query: string) {
  const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const terms = new Map<string, number>();

  for (const term of normalized.split(/\s+/).filter((item) => item.length >= 2)) {
    terms.set(term, Math.max(terms.get(term) ?? 0, term.length + 6));
  }

  for (const match of normalized.matchAll(/[a-z0-9][a-z0-9_.%+-]{1,}/giu)) {
    const value = match[0];
    terms.set(value, Math.max(terms.get(value) ?? 0, value.length + 5));
  }

  const cjkChars = normalized.match(/[\u4e00-\u9fff]/gu) ?? [];
  for (let size = 4; size >= 2; size -= 1) {
    for (let index = 0; index <= cjkChars.length - size; index += 1) {
      const value = cjkChars.slice(index, index + size).join('');
      if (CJK_QUERY_STOP_TERMS.has(value)) continue;
      terms.set(value, Math.max(terms.get(value) ?? 0, size));
    }
  }

  return [...terms.entries()]
    .map(([value, weight]) => ({ value, weight }))
    .sort((left, right) => right.weight - left.weight);
}

function excerpt(content: string, query: string) {
  const compact = content.replace(/\s+/g, ' ').trim();
  const terms = query.split(/\s+/).filter(Boolean);
  const index = terms.reduce((best, term) => {
    const found = compact.indexOf(term);
    if (found < 0) return best;
    return best < 0 ? found : Math.min(best, found);
  }, -1);
  const start = Math.max((index < 0 ? 0 : index) - 80, 0);
  const text = compact.slice(start, start + 260);
  return `${start > 0 ? '…' : ''}${text}${start + 260 < compact.length ? '…' : ''}`;
}
