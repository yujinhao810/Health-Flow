import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { SnapshotBuilderService } from './snapshot-builder.service';

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: SnapshotBuilderService,
  ) {}

  async latest(user: AuthUser) {
    const existing = await this.prisma.healthSnapshot.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return existing ?? this.generateWeekly(user);
  }

  async generateWeekly(user: AuthUser) {
    const endedAt = new Date();
    const startedAt = new Date(endedAt);
    startedAt.setDate(startedAt.getDate() - 7);

    const records = await this.prisma.healthRecord.findMany({
      where: { userId: user.id, recordedAt: { gte: startedAt, lte: endedAt } },
    });
    const snapshot = this.builder.build(records);

    return this.prisma.healthSnapshot.create({
      data: {
        userId: user.id,
        period: 'weekly',
        startedAt,
        endedAt,
        summary: snapshot.summary,
        signals: snapshot.signals,
        recommendations: snapshot.recommendations,
      },
    });
  }
}
