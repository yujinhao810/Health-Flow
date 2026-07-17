import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, UploadedFile } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import type { ParsedDocument } from "../uploads/parsed-document.types";
import { EmbeddingService } from "./embedding.service";
import { splitParsedDocument } from "./semantic-document-chunker";
import { inferKeywords } from "./text-chunker";

@Injectable()
export class DocumentIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async ingestUploadedFile(
    user: AuthUser,
    file: UploadedFile,
    document: ParsedDocument,
    signal?: AbortSignal,
  ) {
    const normalized = document.text.replace(/\s+/g, " ").trim();
    if (!normalized) {
      throw new BadRequestException("这个文件没有提取到可用于检索的文本内容");
    }

    const chunks = splitParsedDocument(document);
    if (!chunks.length) {
      throw new BadRequestException("这个文件没有足够的文本内容可入库");
    }

    const config = await this.settings.getLlmConfig(user);
    const embedded = await this.embeddings.embedTexts(
      config,
      chunks.map((chunk) => chunk.content),
      signal,
    );
    const title = `${file.originalName} · ${file.id.slice(0, 8)}`;

    return this.prisma.knowledgeDocument.create({
      data: {
        userId: user.id,
        uploadedFileId: file.id,
        title,
        source: file.originalName,
        locale: "zh-CN",
        status: "published",
        tags: ["用户上传", "心理对话", "文档RAG"],
        metadata: {
          kind: "user_upload",
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          chunkCount: chunks.length,
          embeddingProvider: embedded.provider,
          embeddingModel: embedded.model,
          embeddingFallbackReason: embedded.fallbackReason,
          parser: document.parser,
          parserVersion: document.parserVersion,
          detectedMimeType: document.detectedMimeType,
          parsingQuality: document.quality,
          parsingWarnings: document.warnings,
        } satisfies Prisma.InputJsonObject,
        chunks: {
          create: chunks.map((chunk, index) => ({
            ordinal: chunk.ordinal,
            title: `${file.originalName} · 第 ${chunk.pageStart}${chunk.pageEnd === chunk.pageStart ? "" : `-${chunk.pageEnd}`} 页`,
            content: chunk.content,
            keywords: inferKeywords(chunk.content),
            embedding: embedded.vectors[index] as Prisma.InputJsonValue,
            embeddingModel: embedded.model,
            metadata: {
              kind: "user_upload_chunk",
              uploadedFileId: file.id,
              originalName: file.originalName,
              embeddingProvider: embedded.provider,
              pageStart: chunk.pageStart,
              pageEnd: chunk.pageEnd,
              contentType: chunk.contentType,
              headingPath: chunk.headingPath,
              blockIds: chunk.blockIds,
              confidence: chunk.confidence,
            } satisfies Prisma.InputJsonObject,
          })),
        },
      },
      include: {
        chunks: { select: { id: true } },
      },
    });
  }
}
