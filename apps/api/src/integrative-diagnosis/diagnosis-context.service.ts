import { Injectable } from '@nestjs/common';
import type { DiagnosisInput } from '@health/shared';
import type { AuthUser } from '../auth/auth.types';
import { HealthMemoryService } from '../memory/health-memory.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SnapshotsService } from '../snapshots/snapshots.service';

@Injectable()
export class DiagnosisContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly snapshots: SnapshotsService,
    private readonly memory: HealthMemoryService,
  ) {}

  getUser(user: AuthUser) {
    return user;
  }

  async build(user: AuthUser, input: DiagnosisInput) {
    const [config, snapshot, longTermMemory] = await Promise.all([
      this.settings.getLlmConfig(user),
      input.includeRecentHealthContext ? this.snapshots.latest(user) : Promise.resolve(null),
      input.includeRecentHealthContext ? this.memory.build(user, JSON.stringify(input)) : Promise.resolve(null),
    ]);

    const records = input.includeRecentHealthContext
      ? await this.prisma.healthRecord.findMany({
          where: { userId: user.id },
          orderBy: { recordedAt: 'desc' },
          take: 30,
        })
      : [];

    const contextSnapshot = {
      snapshot: snapshot
        ? {
            summary: snapshot.summary,
            signals: snapshot.signals,
            recommendations: snapshot.recommendations,
            startedAt: snapshot.startedAt.toISOString(),
            endedAt: snapshot.endedAt.toISOString(),
          }
        : null,
      recentRecords: records.map((record) => ({
        type: record.type,
        recordedAt: record.recordedAt.toISOString(),
        note: record.note,
        payload: record.payload,
      })),
      longTermMemory: longTermMemory?.memory ?? null,
      longTermMemoryText: longTermMemory?.text ?? null,
    };

    return { config, user, contextSnapshot };
  }
}
