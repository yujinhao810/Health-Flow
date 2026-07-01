import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { HealthMemoryService } from '../memory/health-memory.service';

type CandidateInsight = {
  type: string;
  severity: 'info' | 'watch' | 'warning';
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  recommendation: string;
};

@Injectable()
export class HealthInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: HealthMemoryService,
  ) {}

  async refresh(user: AuthUser) {
    const built = await this.memory.build(user);
    await this.memory.refreshPersistentMemory(user);
    const candidates = buildInsightCandidates(built.memory);
    const now = new Date();
    const activeTypes = candidates.map((candidate) => candidate.type);

    await this.prisma.healthInsight.updateMany({
      where: {
        userId: user.id,
        status: { not: 'dismissed' },
        ...(activeTypes.length ? { type: { notIn: activeTypes } } : {}),
      },
      data: { status: 'dismissed', dismissedAt: now },
    });

    for (const candidate of candidates) {
      const recentlyDismissed = await this.prisma.healthInsight.findFirst({
        where: {
          userId: user.id,
          type: candidate.type,
          status: 'dismissed',
          dismissedAt: { gte: daysAgo(now, 3) },
        },
      });
      if (recentlyDismissed) continue;

      const existing = await this.prisma.healthInsight.findFirst({
        where: {
          userId: user.id,
          type: candidate.type,
          status: { not: 'dismissed' },
        },
        orderBy: { generatedAt: 'desc' },
      });

      if (existing) {
        const changed = insightChanged(existing, candidate);
        await this.prisma.healthInsight.update({
          where: { id: existing.id },
          data: {
            severity: candidate.severity,
            title: candidate.title,
            summary: candidate.summary,
            evidence: candidate.evidence as Prisma.InputJsonValue,
            recommendation: candidate.recommendation,
            generatedAt: now,
            status: changed ? 'new' : existing.status,
            readAt: changed ? null : existing.readAt,
          },
        });
        continue;
      }

      await this.prisma.healthInsight.create({
        data: {
          userId: user.id,
          type: candidate.type,
          severity: candidate.severity,
          title: candidate.title,
          summary: candidate.summary,
          evidence: candidate.evidence as Prisma.InputJsonValue,
          recommendation: candidate.recommendation,
        },
      });
    }

    return this.findActive(user);
  }

  async list(user: AuthUser) {
    return this.refresh(user);
  }

  async markRead(user: AuthUser, id: string) {
    return this.prisma.healthInsight.updateMany({
      where: { id, userId: user.id },
      data: { status: 'read', readAt: new Date() },
    });
  }

  async dismiss(user: AuthUser, id: string) {
    return this.prisma.healthInsight.updateMany({
      where: { id, userId: user.id },
      data: { status: 'dismissed', dismissedAt: new Date() },
    });
  }

  private findActive(user: AuthUser) {
    return this.prisma.healthInsight.findMany({
      where: { userId: user.id, status: { not: 'dismissed' } },
      orderBy: [{ status: 'asc' }, { generatedAt: 'desc' }],
      take: 20,
    });
  }
}

function insightChanged(
  existing: {
    severity: string;
    title: string;
    summary: string;
    evidence: Prisma.JsonValue;
    recommendation: string;
  },
  candidate: CandidateInsight,
) {
  return (
    existing.severity !== candidate.severity ||
    existing.title !== candidate.title ||
    existing.summary !== candidate.summary ||
    existing.recommendation !== candidate.recommendation ||
    stableJson(existing.evidence) !== stableJson(candidate.evidence)
  );
}

function stableJson(value: unknown) {
  return JSON.stringify(value, (_key, input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
  });
}

function buildInsightCandidates(memory: { windows: Record<string, unknown>; trends: Record<string, unknown> }): CandidateInsight[] {
  const last30 = memory.windows.last30Days as { sleepAverageHours?: number; moodAverage?: number; exerciseActiveDays?: number; exerciseTotalMinutes?: number; medicalVisits?: number } | undefined;
  const trends = memory.trends as { sleepHoursDelta?: number; moodDelta?: number; exerciseMinutesDelta?: number; medicalVisitsDelta?: number };
  const insights: CandidateInsight[] = [];

  if (trends.sleepHoursDelta !== undefined && trends.sleepHoursDelta <= -0.7) {
    insights.push({
      type: 'sleep_drop',
      severity: trends.sleepHoursDelta <= -1.2 ? 'warning' : 'watch',
      title: '睡眠基线下降',
      summary: `近 30 天平均睡眠较前一阶段下降 ${Math.abs(trends.sleepHoursDelta)} 小时。`,
      evidence: { last30, trends },
      recommendation: '今晚先做一个轻量调整：固定上床提醒、睡前 30 分钟减少屏幕刺激，并继续记录 3 天观察变化。',
    });
  }

  if (trends.moodDelta !== undefined && trends.moodDelta <= -1) {
    insights.push({
      type: 'mood_drop',
      severity: trends.moodDelta <= -2 ? 'warning' : 'watch',
      title: '心情评分持续走低',
      summary: `近 30 天平均心情较前一阶段下降 ${Math.abs(trends.moodDelta)} 分。`,
      evidence: { last30, trends },
      recommendation: '建议记录诱因、睡眠和压力来源；如果低落或焦虑持续影响生活，可以考虑联系线下专业支持。',
    });
  }

  if (last30 && (last30.exerciseActiveDays ?? 0) < 6) {
    insights.push({
      type: 'low_activity',
      severity: 'info',
      title: '近期运动偏少',
      summary: `近 30 天只有 ${last30.exerciseActiveDays ?? 0} 天运动记录。`,
      evidence: { last30 },
      recommendation: '从低门槛开始更容易坚持：每周 3 次 15-20 分钟散步或拉伸即可。',
    });
  }

  if (trends.medicalVisitsDelta !== undefined && trends.medicalVisitsDelta > 1) {
    insights.push({
      type: 'medical_increase',
      severity: 'watch',
      title: '就医记录增多',
      summary: '近期就医/咨询记录较前一阶段增加。',
      evidence: { last30, trends },
      recommendation: '建议整理症状时间线、用药和检查结果；如症状反复或加重，优先线下复诊。',
    });
  }

  if (insights.length === 0 && hasRecentData(last30)) {
    insights.push({
      type: 'health_stable',
      severity: 'info',
      title: '近期状态整体平稳',
      summary: buildStableSummary(last30),
      evidence: { last30, trends },
      recommendation: '继续保持当前记录节奏。若之后出现睡眠、情绪、运动或就医频率的明显变化，主动洞察会在这里提醒你。',
    });
  }

  return insights;
}

function hasRecentData(
  last30:
    | {
        sleepAverageHours?: number;
        moodAverage?: number;
        exerciseActiveDays?: number;
        exerciseTotalMinutes?: number;
        medicalVisits?: number;
      }
    | undefined,
): last30 is {
  sleepAverageHours?: number;
  moodAverage?: number;
  exerciseActiveDays?: number;
  exerciseTotalMinutes?: number;
  medicalVisits?: number;
} {
  return Boolean(
    last30 &&
      (last30.sleepAverageHours !== undefined ||
        last30.moodAverage !== undefined ||
        (last30.exerciseActiveDays ?? 0) > 0 ||
        (last30.medicalVisits ?? 0) > 0),
  );
}

function buildStableSummary(last30: {
  sleepAverageHours?: number;
  moodAverage?: number;
  exerciseActiveDays?: number;
  exerciseTotalMinutes?: number;
  medicalVisits?: number;
}) {
  const parts = [
    last30.sleepAverageHours !== undefined ? `近 30 天平均睡眠 ${last30.sleepAverageHours} 小时` : undefined,
    last30.moodAverage !== undefined ? `平均心情 ${last30.moodAverage}/10` : undefined,
    (last30.exerciseActiveDays ?? 0) > 0
      ? `运动活跃 ${last30.exerciseActiveDays ?? 0} 天、累计 ${last30.exerciseTotalMinutes ?? 0} 分钟`
      : undefined,
    (last30.medicalVisits ?? 0) > 0 ? `就医/咨询记录 ${last30.medicalVisits} 条` : undefined,
  ].filter(Boolean);

  return `${parts.join('；')}。目前没有触发需要额外提醒的下降或偏离信号。`;
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}
