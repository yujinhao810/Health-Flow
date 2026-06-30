import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { SendMessageDto } from './dto/send-message.dto';

const messageInclude = {
  attachments: {
    include: { uploadedFile: true },
  },
} satisfies Prisma.ChatMessageInclude;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async createThread(user: AuthUser, input: CreateThreadDto) {
    return this.prisma.conversation.create({
      data: {
        userId: user.id,
        title: input.title,
      },
    });
  }

  async listThreads(user: AuthUser) {
    const threads = await this.prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 20, include: messageInclude } },
    });

    return threads.map((thread) => ({
      ...thread,
      messages: thread.messages.map((message) => this.toPublicMessage(message)),
    }));
  }

  async getThread(user: AuthUser, id: string) {
    const thread = await this.prisma.conversation.findFirst({
      where: { id, userId: user.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, include: messageInclude } },
    });

    if (!thread) throw new NotFoundException('Conversation not found');
    return {
      ...thread,
      messages: thread.messages.map((message) => this.toPublicMessage(message)),
    };
  }

  async addUserMessage(user: AuthUser, threadId: string, input: SendMessageDto) {
    const thread = await this.getThread(user, threadId);
    const attachmentIds = [...new Set(input.attachmentIds ?? [])];
    const files = await this.uploads.getOwnedFiles(user, attachmentIds);
    const message = await this.prisma.chatMessage.create({
      data: {
        conversationId: thread.id,
        role: 'user',
        content: input.content,
        metadata: input.ragEnabled === undefined ? undefined : { ragEnabled: input.ragEnabled },
        attachments: attachmentIds.length
          ? {
              create: files.map((file) => ({ uploadedFileId: file.id })),
            }
          : undefined,
      },
      include: messageInclude,
    });

    return this.toPublicMessage(message);
  }

  async removeThread(user: AuthUser, id: string) {
    const result = await this.prisma.conversation.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) {
      throw new NotFoundException('Conversation not found');
    }

    return { id, deleted: true };
  }

  async addAssistantMessage(threadId: string, content: string, metadata?: Prisma.JsonValue) {
    const message = await this.prisma.chatMessage.create({
      data: {
        conversationId: threadId,
        role: 'assistant',
        content,
        metadata: metadata ?? undefined,
      },
      include: messageInclude,
    });
    return this.toPublicMessage(message);
  }

  private toPublicMessage(message: Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      createdAt: message.createdAt.toISOString(),
      attachments: message.attachments.map((attachment) => this.uploads.toPublicAttachment(attachment.uploadedFile)),
    };
  }
}
