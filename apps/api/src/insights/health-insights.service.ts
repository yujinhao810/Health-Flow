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
    const created = [];

    for (const candidate of candidates) {
      const recentDuplicate = await this.prisma.healthInsight.findFirst({
        where: {
          userId: user.id,
          type: candidate.type,
          generatedAt: { gte: daysAgo(new Date(), 3) },
          status: { not: 'dismissed' },
        },
      });
      if (recentDuplicate) continue;

      created.push(
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
        }),
      );
    }

    return created;
  }

  async list(user: AuthUser) {
    await this.refresh(user);
    return this.prisma.healthInsight.findMany({
      where: { userId: user.id, status: { not: 'dismissed' } },
      orderBy: [{ status: 'asc' }, { generatedAt: 'desc' }],
      take: 20,
    });
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

  return insights;
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}
