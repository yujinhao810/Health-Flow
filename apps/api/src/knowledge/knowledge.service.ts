import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  listDocuments() {
    return this.prisma.knowledgeDocument.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { chunks: { orderBy: { ordinal: 'asc' } } },
    });
  }
}
