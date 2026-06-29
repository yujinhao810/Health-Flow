import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SnapshotBuilderService } from './snapshot-builder.service';

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly builder: SnapshotBuilderService,
  ) {}

  async latest() {
    const user = await this.settings.getDemoUser();
    const existing = await this.prisma.healthSnapshot.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return existing ?? this.generateWeekly();
  }

  async generateWeekly() {
    const user = await this.settings.getDemoUser();
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
