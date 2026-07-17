import { Injectable } from '@nestjs/common';
import type { DiagnosisInput } from '@health/shared';
import type { AuthUser } from '../auth/auth.types';
import { RagService } from '../knowledge/rag.service';
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
    private readonly rag: RagService,
  ) {}

  getUser(user: AuthUser) {
    return user;
  }

  async build(user: AuthUser, input: DiagnosisInput) {
    const config = await this.settings.getLlmConfig(user);
    const [snapshot, longTermMemory, evidence] = await Promise.all([
      input.includeRecentHealthContext ? this.snapshots.latest(user) : Promise.resolve(null),
      input.includeRecentHealthContext ? this.memory.build(user, JSON.stringify(input)) : Promise.resolve(null),
      this.rag.retrieve(buildDiagnosisEvidenceQuery(input), { topK: 6, user, config, tags: ['健康安全', '辅助分诊'] }),
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
      evidence: evidence.map((citation) => ({
        evidenceId: citation.evidenceId,
        title: citation.title,
        source: citation.source,
        locator: citation.locator,
        trustLevel: citation.trustLevel,
        excerpt: citation.excerpt,
      })),
    };

    return { config, user, contextSnapshot };
  }
}

function buildDiagnosisEvidenceQuery(input: DiagnosisInput) {
  return [
    input.chiefComplaint,
    ...input.symptoms.flatMap((symptom) => [symptom.name, symptom.bodyPart, symptom.quality, ...symptom.associatedSymptoms]),
    ...input.medicalContext.chronicConditions,
    ...input.medicalContext.medications,
    ...input.medicalContext.recentDiagnoses,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 1000);
}
