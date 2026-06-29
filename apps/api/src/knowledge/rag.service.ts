import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RagCitation } from '@health/shared';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async retrieve(query: string, options?: { topK?: number; locale?: string; tags?: string[] }): Promise<RagCitation[]> {
    const normalizedQuery = query.replace(/\s+/g, ' ').trim();
    if (!normalizedQuery) return [];

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
      title: row.title || row.documentTitle,
      source: row.source ?? undefined,
      sourceUrl: row.sourceUrl ?? undefined,
      excerpt: excerpt(row.content, normalizedQuery),
      score: Number(row.score) || 0,
    }));
  }
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
