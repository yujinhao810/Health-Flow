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
      excerpt: excerpt(row.content, normalizedQuery),
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

    return chunks
      .filter((chunk) => isReadableText(chunk.content))
      .map((chunk) => {
        const vector = asNumberVector(chunk.embedding);
        const vectorScore = vector ? cosineSimilarity(queryVector, vector) : 0;
        const keywordScore = lexicalScore(normalizedQuery, `${chunk.title ?? ''} ${chunk.content} ${chunk.keywords.join(' ')}`);
        const score = vectorScore * 0.85 + keywordScore * 0.15;
        const documentMetadata = metadataAsObject(chunk.document.metadata);
        const originalName =
          typeof documentMetadata.originalName === 'string' ? documentMetadata.originalName : chunk.document.source ?? chunk.document.title;

        return {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          title: normalizeDisplayText(originalName),
          source: '用户上传文档',
          sourceUrl: undefined,
          excerpt: excerpt(chunk.content, normalizedQuery),
          score,
        } satisfies RagCitation;
      })
      .filter((citation) => citation.score > 0.04)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
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

function lexicalScore(query: string, content: string) {
  const normalized = content.toLowerCase();
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]{2,}|[\u4e00-\u9fff]/gu) ?? [];
  if (!terms.length) return normalized.includes(query.toLowerCase()) ? 0.2 : 0;
  const hits = terms.filter((term) => normalized.includes(term)).length;
  return hits / terms.length;
}

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
