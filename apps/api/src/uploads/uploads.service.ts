import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadedFile, UploadedFilePurpose } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import type { ChatAttachment } from '@health/shared';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { FileExtractionService } from './file-extraction.service';

const DEFAULT_UPLOAD_DIR = resolve(process.cwd(), 'storage', 'uploads');
const PURPOSES: UploadedFilePurpose[] = ['chat_attachment', 'knowledge_source'];

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly extraction: FileExtractionService,
  ) {}

  async create(user: AuthUser, file: Express.Multer.File | undefined, purpose: UploadedFilePurpose) {
    if (!file) throw new BadRequestException('请选择要上传的文件');
    if (!PURPOSES.includes(purpose)) throw new BadRequestException('不支持的上传用途');

    this.assertAllowed(file);

    const id = randomUUID();
    const uploadDir = this.getUploadDir();
    const userDir = join(uploadDir, user.id);
    const extension = safeExtension(file.originalname);
    const storagePath = join(userDir, `${id}${extension}`);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const extractedText = this.extraction.extract(file.buffer, file.mimetype);

    await mkdir(userDir, { recursive: true });
    await writeFile(storagePath, file.buffer);

    const uploaded = await this.prisma.uploadedFile.create({
      data: {
        id,
        userId: user.id,
        purpose,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
        sha256,
        status: 'ready',
        extractedText,
        metadata: { hasExtractedText: Boolean(extractedText) },
      },
    });

    return this.toPublicAttachment(uploaded);
  }

  async get(user: AuthUser, id: string) {
    const file = await this.getOwnedFile(user, id);
    return this.toPublicAttachment(file);
  }

  async getOwnedFile(user: AuthUser, id: string) {
    const file = await this.prisma.uploadedFile.findFirst({ where: { id, userId: user.id } });
    if (!file) throw new NotFoundException('Attachment not found');
    return file;
  }

  async getOwnedFiles(user: AuthUser, ids: string[]) {
    if (!ids.length) return [];
    const files = await this.prisma.uploadedFile.findMany({ where: { id: { in: ids }, userId: user.id } });
    if (files.length !== new Set(ids).size) throw new NotFoundException('Attachment not found');
    return files;
  }

  async remove(user: AuthUser, id: string) {
    const file = await this.getOwnedFile(user, id);
    await this.prisma.uploadedFile.delete({ where: { id: file.id } });
    await rm(file.storagePath, { force: true });
    return { id, deleted: true };
  }

  toPublicAttachment(file: UploadedFile): ChatAttachment {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      purpose: file.purpose,
      status: file.status,
      contentUrl: `/uploads/${file.id}/content`,
      createdAt: file.createdAt.toISOString(),
    };
  }

  buildAttachmentContext(files: UploadedFile[]) {
    if (!files.length) return '';

    const lines = files.map((file) => {
      const base = [`- 文件名：${file.originalName}`, `类型：${file.mimeType}`, `大小：${file.sizeBytes} bytes`].join('，');
      if (file.extractedText) return `${base}\n  可提取文本摘录：${file.extractedText.slice(0, 3000)}`;
      if (file.mimeType.startsWith('image/')) {
        return `${base}\n  这是用户上传的图片。当前版本不会直接读取图片内容，请邀请用户补充图片中的关键信息后再给出保守建议。`;
      }
      return `${base}\n  当前版本无法提取该文件内容，请让用户概述文件中的关键信息。`;
    });

    return ['用户本轮上传附件：', ...lines].join('\n');
  }

  private assertAllowed(file: Express.Multer.File) {
    const maxBytes = this.config.get<number>('MAX_UPLOAD_BYTES') ?? 10 * 1024 * 1024;
    if (file.size > maxBytes) throw new BadRequestException(`文件不能超过 ${Math.round(maxBytes / 1024 / 1024)} MB`);

    const allowed = new Set(
      (this.config.get<string>('ALLOWED_UPLOAD_MIME_TYPES') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );
    if (allowed.size && !allowed.has(file.mimetype)) throw new BadRequestException(`不支持的文件类型：${file.mimetype}`);
  }

  private getUploadDir() {
    return resolve(this.config.get<string>('UPLOAD_DIR') || DEFAULT_UPLOAD_DIR);
  }
}

function safeExtension(filename: string) {
  const extension = extname(filename).toLowerCase();
  return /^[a-z0-9.]+$/.test(extension) ? extension : '';
}
