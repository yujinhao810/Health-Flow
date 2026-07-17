import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, UploadedFile, UploadedFilePurpose } from "@prisma/client";
import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { extname, join, resolve } from "path";
import type { ChatAttachment } from "@health/shared";
import type { AuthUser } from "../auth/auth.types";
import { DocumentIngestionService } from "../knowledge/document-ingestion.service";
import type { LlmContentBlock } from "../llm/llm.types";
import { PrismaService } from "../prisma/prisma.service";
import { assertDocumentQuality } from "./document-quality-gate";
import { FileExtractionService } from "./file-extraction.service";
import type { ParsedDocument } from "./parsed-document.types";

const DEFAULT_UPLOAD_DIR = resolve(process.cwd(), "storage", "uploads");
const PURPOSES: UploadedFilePurpose[] = ["chat_attachment", "knowledge_source"];
const VISION_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly extraction: FileExtractionService,
    private readonly documents: DocumentIngestionService,
  ) {}

  async create(
    user: AuthUser,
    file: Express.Multer.File | undefined,
    purpose: UploadedFilePurpose,
  ) {
    if (!file) throw new BadRequestException("请选择要上传的文件");
    if (!PURPOSES.includes(purpose))
      throw new BadRequestException("不支持的上传用途");

    const id = randomUUID();
    const originalName = normalizeOriginalName(file.originalname);
    const detected = this.extraction.detect(
      file.buffer,
      originalName,
      file.mimetype,
    );
    this.assertAllowed(file, detected.mimeType);
    const uploadDir = this.getUploadDir();
    const userDir = join(uploadDir, user.id);
    const extension = detected.extension;
    const storagePath = join(userDir, `${id}${extension}`);
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    let parsedDocument: ParsedDocument | undefined;
    let parsingWarning: string | undefined;
    if (purpose === "knowledge_source") {
      parsedDocument = await this.extraction.extract(
        file.buffer,
        originalName,
        file.mimetype,
      );
      assertDocumentQuality(
        parsedDocument,
        this.config.get<number>("DOCUMENT_PARSER_MIN_QUALITY") ?? 0.55,
      );
    } else if (detected.category === "image") {
      try {
        parsedDocument = await this.extraction.extract(
          file.buffer,
          originalName,
          file.mimetype,
        );
      } catch (error) {
        parsingWarning =
          error instanceof Error ? error.message : "图片 OCR 失败";
      }
    }
    const extractedText = parsedDocument?.text.slice(0, 500_000);

    await mkdir(userDir, { recursive: true });
    await writeFile(storagePath, file.buffer);

    let uploaded = await this.prisma.uploadedFile.create({
      data: {
        id,
        userId: user.id,
        purpose,
        originalName,
        mimeType: detected.mimeType,
        sizeBytes: file.size,
        storagePath,
        sha256,
        status: purpose === "knowledge_source" ? "pending" : "ready",
        extractedText,
        metadata: {
          hasExtractedText: Boolean(extractedText),
          detectedMimeType: detected.mimeType,
          declaredMimeType: file.mimetype,
          parser: parsedDocument?.parser,
          parserVersion: parsedDocument?.parserVersion,
          parsingQuality: parsedDocument?.quality,
          parsingWarnings: parsedDocument?.warnings,
          pageCount: parsedDocument?.pages.length,
          parsingWarning,
        },
      },
    });

    if (purpose === "knowledge_source") {
      try {
        const document = await this.documents.ingestUploadedFile(
          user,
          uploaded,
          parsedDocument!,
        );
        uploaded = await this.prisma.uploadedFile.update({
          where: { id: uploaded.id },
          data: {
            status: "ready",
            metadata: {
              ...metadataAsObject(uploaded.metadata),
              hasExtractedText: true,
              knowledgeDocumentId: document.id,
              chunkCount: document.chunks.length,
              parser: parsedDocument?.parser,
              parserVersion: parsedDocument?.parserVersion,
              parsingQuality: parsedDocument?.quality,
              parsingWarnings: parsedDocument?.warnings,
              pageCount: parsedDocument?.pages.length,
            } satisfies Prisma.InputJsonObject,
          },
        });
      } catch (error) {
        await this.prisma.uploadedFile.update({
          where: { id: uploaded.id },
          data: {
            status: "failed",
            metadata: {
              ...metadataAsObject(uploaded.metadata),
              hasExtractedText: Boolean(extractedText),
              error: error instanceof Error ? error.message : "文档入库失败",
            } satisfies Prisma.InputJsonObject,
          },
        });
        throw error;
      }
    }

    return this.toPublicAttachment(uploaded);
  }

  async get(user: AuthUser, id: string) {
    const file = await this.getOwnedFile(user, id);
    return this.toPublicAttachment(file);
  }

  async list(user: AuthUser, purpose?: UploadedFilePurpose) {
    if (purpose && !PURPOSES.includes(purpose))
      throw new BadRequestException("不支持的上传用途");
    const files = await this.prisma.uploadedFile.findMany({
      where: {
        userId: user.id,
        purpose,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return files.map((file) => this.toPublicAttachment(file));
  }

  async getOwnedFile(user: AuthUser, id: string) {
    const file = await this.prisma.uploadedFile.findFirst({
      where: { id, userId: user.id },
    });
    if (!file) throw new NotFoundException("Attachment not found");
    return file;
  }

  async getOwnedFiles(user: AuthUser, ids: string[]) {
    if (!ids.length) return [];
    const files = await this.prisma.uploadedFile.findMany({
      where: { id: { in: ids }, userId: user.id },
    });
    if (files.length !== new Set(ids).size)
      throw new NotFoundException("Attachment not found");
    return files;
  }

  async remove(user: AuthUser, id: string) {
    const file = await this.getOwnedFile(user, id);
    await this.prisma.uploadedFile.delete({ where: { id: file.id } });
    await rm(file.storagePath, { force: true });
    return { id, deleted: true };
  }

  async removeUnlinkedFiles(user: AuthUser, ids: string[]) {
    if (!ids.length) return;
    const files = await this.prisma.uploadedFile.findMany({
      where: { id: { in: ids }, userId: user.id },
      select: { id: true, storagePath: true },
    });

    await Promise.all(
      files.map(async (file) => {
        const deleted = await this.prisma.uploadedFile.deleteMany({
          where: {
            id: file.id,
            userId: user.id,
            messageLinks: { none: {} },
          },
        });
        if (deleted.count) await rm(file.storagePath, { force: true });
      }),
    );
  }

  toPublicAttachment(file: UploadedFile): ChatAttachment {
    const metadata = metadataAsObject(file.metadata);
    return {
      id: file.id,
      originalName: normalizeOriginalName(file.originalName),
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      purpose: file.purpose,
      status: file.status,
      documentId:
        typeof metadata.knowledgeDocumentId === "string"
          ? metadata.knowledgeDocumentId
          : undefined,
      chunkCount:
        typeof metadata.chunkCount === "number"
          ? metadata.chunkCount
          : undefined,
      pageCount:
        typeof metadata.pageCount === "number" ? metadata.pageCount : undefined,
      parser: typeof metadata.parser === "string" ? metadata.parser : undefined,
      parsingQualityScore:
        typeof metadata.parsingQuality === "object" &&
        metadata.parsingQuality !== null &&
        !Array.isArray(metadata.parsingQuality) &&
        typeof (metadata.parsingQuality as Record<string, unknown>).score ===
          "number"
          ? ((metadata.parsingQuality as Record<string, unknown>)
              .score as number)
          : undefined,
      parsingWarnings: Array.isArray(metadata.parsingWarnings)
        ? metadata.parsingWarnings.filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
      hasExtractedText:
        typeof metadata.hasExtractedText === "boolean"
          ? metadata.hasExtractedText
          : undefined,
      contentUrl: `/uploads/${file.id}/content`,
      createdAt: file.createdAt.toISOString(),
    };
  }

  buildAttachmentContext(
    files: UploadedFile[],
    options?: { visionEnabled?: boolean },
  ) {
    if (!files.length) return "";

    const lines = files.map((file) => {
      const base = [
        `- 文件名：${file.originalName}`,
        `类型：${file.mimeType}`,
        `大小：${file.sizeBytes} bytes`,
      ].join("，");
      if (file.extractedText)
        return `${base}\n  可提取文本摘录：${file.extractedText.slice(0, 3000)}`;
      const imageMimeType = getSupportedImageMimeType(file);
      if (file.mimeType.startsWith("image/") || imageMimeType) {
        if (options?.visionEnabled && imageMimeType) {
          return `${base}\n  这张图片已随本轮消息作为视觉输入发送给模型。请直接基于可见内容回答；不要输出“等待几秒钟”“模拟图片分析过程”等舞台提示；看不清的细节要说明无法确认，不要编造具体数值。`;
        }
        return `${base}\n  这是用户上传的图片。当前版本不会直接读取图片内容，请邀请用户补充图片中的关键信息后再给出保守建议。`;
      }
      return `${base}\n  当前版本无法提取该文件内容，请让用户概述文件中的关键信息。`;
    });

    return ["用户本轮上传附件：", ...lines].join("\n");
  }

  async buildUserMessageContent(
    content: string,
    files: UploadedFile[],
    options?: { visionEnabled?: boolean },
  ): Promise<string | LlmContentBlock[]> {
    const imageFiles = options?.visionEnabled
      ? files.filter((file) => getSupportedImageMimeType(file)).slice(0, 4)
      : [];
    if (!imageFiles.length) return content;

    const images = await Promise.all(
      imageFiles.map(async (file) => ({
        type: "image" as const,
        mediaType: getSupportedImageMimeType(file) ?? file.mimeType,
        data: (await readFile(file.storagePath)).toString("base64"),
      })),
    );

    return [{ type: "text", text: content }, ...images];
  }

  private assertAllowed(file: Express.Multer.File, detectedMimeType: string) {
    const maxBytes =
      this.config.get<number>("MAX_UPLOAD_BYTES") ?? 10 * 1024 * 1024;
    if (file.size > maxBytes)
      throw new BadRequestException(
        `文件不能超过 ${Math.round(maxBytes / 1024 / 1024)} MB`,
      );

    const allowed = new Set(
      (this.config.get<string>("ALLOWED_UPLOAD_MIME_TYPES") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
    if (detectedMimeType === "application/octet-stream") {
      throw new BadRequestException(
        "无法根据文件内容识别真实类型，请确认文件没有损坏或伪装扩展名",
      );
    }
    if (allowed.size && !allowed.has(detectedMimeType)) {
      throw new BadRequestException(`不支持的文件类型：${detectedMimeType}`);
    }
  }

  private getUploadDir() {
    return resolve(this.config.get<string>("UPLOAD_DIR") || DEFAULT_UPLOAD_DIR);
  }
}

function getSupportedImageMimeType(file: UploadedFile) {
  if (VISION_MIME_TYPES.has(file.mimeType)) return file.mimeType;
  const extension = extname(file.originalName).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return undefined;
}

function metadataAsObject(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizeOriginalName(value: string) {
  const cleaned =
    value
      .replace(/[\\/]/g, "_")
      .replace(/[\u0000-\u001f]/g, "")
      .trim() || "upload";
  const decoded = decodeLatin1Utf8(cleaned);
  return readabilityScore(decoded) > readabilityScore(cleaned) + 0.15
    ? decoded
    : cleaned;
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
