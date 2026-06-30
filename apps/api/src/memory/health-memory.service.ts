import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { HealthRecord, HealthRecordType } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

type BaselineStats = {
  sleepAverageHours?: number;
  sleepQualityAverage?: number;
  moodAverage?: number;
  exerciseActiveDays: number;
  exerciseTotalMinutes: number;
  medicalVisits: number;
};

@Injectable()
export class HealthMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async refreshPersistentMemory(user: AuthUser) {
    const built = await this.build(user);
    const facts = built.memory.windows as Prisma.InputJsonValue;
    const preferences = inferPreferences(built.memory) as Prisma.InputJsonValue;
    const riskSignals = inferRiskSignals(built.memory) as Prisma.InputJsonValue;
    const sourceStats = { generatedAt: built.memory.generatedAt, trends: built.memory.trends } as Prisma.InputJsonValue;

    return this.prisma.userMemory.upsert({
      where: { userId_scope: { userId: user.id, scope: 'health_profile' } },
      create: {
        userId: user.id,
        scope: 'health_profile',
        summary: buildPersistentSummary(built.memory),
        facts,
        preferences,
        riskSignals,
        sourceStats,
        generatedAt: new Date(built.memory.generatedAt),
      },
      update: {
        summary: buildPersistentSummary(built.memory),
        facts,
        preferences,
        riskSignals,
        sourceStats,
        generatedAt: new Date(built.memory.generatedAt),
      },
    });
  }

  async latestPersistentMemory(user: AuthUser) {
    const existing = await this.prisma.userMemory.findUnique({ where: { userId_scope: { userId: user.id, scope: 'health_profile' } } });
    if (existing && Date.now() - existing.generatedAt.getTime() < 6 * 60 * 60 * 1000) return existing;
    return this.refreshPersistentMemory(user);
  }

  async build(user: AuthUser, query = '') {
    const now = new Date();
    const from180 = daysAgo(now, 180);
    const from90 = daysAgo(now, 90);
    const from30 = daysAgo(now, 30);
    const from60 = daysAgo(now, 60);

    const records = await this.prisma.healthRecord.findMany({
      where: { userId: user.id, recordedAt: { gte: from180, lte: now } },
      orderBy: { recordedAt: 'desc' },
      take: 700,
    });

    const last90 = records.filter((record) => record.recordedAt >= from90);
    const last30 = records.filter((record) => record.recordedAt >= from30);
    const previous30 = records.filter((record) => record.recordedAt >= from60 && record.recordedAt < from30);
    const relevantRecords = selectRelevantRecords(records, query);

    const memory = {
      generatedAt: now.toISOString(),
      windows: {
        last30Days: summarize(last30),
        previous30Days: summarize(previous30),
        last90Days: summarize(last90),
        last180DaysRecordCount: records.length,
      },
      trends: compareWindows(summarize(last30), summarize(previous30)),
      relevantRecords: relevantRecords.map(toMemoryRecord),
    };

    return {
      memory,
      text: buildMemoryText(memory),
    };
  }
}

function summarize(records: HealthRecord[]): BaselineStats {
  const sleepHours = records.filter((record) => record.type === 'sleep').map((record) => getSleepHours(record)).filter(isNumber);
  const sleepQualities = records
    .filter((record) => record.type === 'sleep')
    .map((record) => readNumber(record.payload, 'quality'))
    .filter(isNumber);
  const moods = records.filter((record) => record.type === 'mood').map((record) => readNumber(record.payload, 'score')).filter(isNumber);
  const exercises = records.filter((record) => record.type === 'exercise');
  const exerciseActiveDays = new Set(exercises.map((record) => dateKey(record.recordedAt))).size;
  const exerciseTotalMinutes = exercises.map((record) => readNumber(record.payload, 'durationMinutes') ?? 0).reduce((sum, value) => sum + value, 0);
  const medicalVisits = records.filter((record) => record.type === 'medical').length;

  return {
    sleepAverageHours: average(sleepHours),
    sleepQualityAverage: average(sleepQualities),
    moodAverage: average(moods),
    exerciseActiveDays,
    exerciseTotalMinutes,
    medicalVisits,
  };
}

function compareWindows(current: BaselineStats, previous: BaselineStats) {
  return {
    sleepHoursDelta: diff(current.sleepAverageHours, previous.sleepAverageHours),
    moodDelta: diff(current.moodAverage, previous.moodAverage),
    exerciseMinutesDelta: current.exerciseTotalMinutes - previous.exerciseTotalMinutes,
    medicalVisitsDelta: current.medicalVisits - previous.medicalVisits,
  };
}

function selectRelevantRecords(records: HealthRecord[], query: string) {
  const requestedTypes = detectRequestedTypes(query);
  const keywords = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2)
    .slice(0, 12);

  return records
    .map((record) => ({ record, score: scoreRecord(record, requestedTypes, keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.record.recordedAt.getTime() - a.record.recordedAt.getTime())
    .slice(0, 8)
    .map((item) => item.record);
}

function detectRequestedTypes(query: string): HealthRecordType[] {
  const pairs: Array<[RegExp, HealthRecordType]> = [
    [/睡眠|睡觉|失眠|早醒|入睡/i, 'sleep'],
    [/运动|跑步|散步|训练|锻炼|骑行|瑜伽/i, 'exercise'],
    [/心情|情绪|焦虑|压力|低落|烦躁/i, 'mood'],
    [/就医|复诊|体检|用药|诊断|医院/i, 'medical'],
  ];
  return pairs.filter(([pattern]) => pattern.test(query)).map(([, type]) => type);
}

function scoreRecord(record: HealthRecord, requestedTypes: HealthRecordType[], keywords: string[]) {
  let score = 0;
  if (requestedTypes.includes(record.type)) score += 8;
  const haystack = `${record.note ?? ''} ${JSON.stringify(record.payload)}`.toLowerCase();
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 2;
  }
  const ageDays = (Date.now() - record.recordedAt.getTime()) / 86_400_000;
  score += Math.max(0, 3 - ageDays / 30);
  return score;
}

function toMemoryRecord(record: HealthRecord) {
  return {
    type: record.type,
    recordedAt: record.recordedAt.toISOString(),
    note: record.note,
    payload: record.payload,
  };
}

function buildMemoryText(input: { windows: Record<string, unknown>; trends: Record<string, unknown>; relevantRecords: unknown[] }) {
  return [
    '长期健康记忆（由真实健康记录滚动生成，供 Agent 参考，不是诊断）：',
    `基线窗口：${JSON.stringify(input.windows)}`,
    `近期变化：${JSON.stringify(input.trends)}`,
    input.relevantRecords.length ? `与当前问题相关的历史记录：${JSON.stringify(input.relevantRecords)}` : '与当前问题相关的历史记录：暂无强匹配。',
    '使用规则：回答时优先结合这些长期基线；如果当前症状与个人基线明显偏离，应说明偏离点和保守处理建议。',
  ].join('\n');
}

function getSleepHours(record: HealthRecord) {
  const startedAt = readString(record.payload, 'startedAt');
  const endedAt = readString(record.payload, 'endedAt');
  if (!startedAt || !endedAt) return undefined;
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const hours = (end.getTime() - start.getTime()) / 36e5;
  return Number.isFinite(hours) && hours > 0 && hours < 24 ? Number(hours.toFixed(1)) : undefined;
}

function readString(value: unknown, key: string) {
  return value && typeof value === 'object' && typeof (value as Record<string, unknown>)[key] === 'string'
    ? ((value as Record<string, unknown>)[key] as string)
    : undefined;
}

function readNumber(value: unknown, key: string) {
  return value && typeof value === 'object' && typeof (value as Record<string, unknown>)[key] === 'number'
    ? ((value as Record<string, unknown>)[key] as number)
    : undefined;
}

function average(values: number[]) {
  if (!values.length) return undefined;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function diff(current?: number, previous?: number) {
  return current === undefined || previous === undefined ? undefined : Number((current - previous).toFixed(1));
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function buildPersistentSummary(memory: { windows: Record<string, BaselineStats | number>; trends: Record<string, unknown> }) {
  const last30 = memory.windows.last30Days as BaselineStats | undefined;
  const parts = [
    last30?.sleepAverageHours !== undefined ? `近 30 天平均睡眠 ${last30.sleepAverageHours} 小时` : undefined,
    last30?.moodAverage !== undefined ? `平均心情 ${last30.moodAverage}/10` : undefined,
    last30 ? `运动活跃 ${last30.exerciseActiveDays} 天、累计 ${last30.exerciseTotalMinutes} 分钟` : undefined,
    last30?.medicalVisits ? `有 ${last30.medicalVisits} 条就医记录` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join('；') : '健康记录仍较少，长期画像会随着记录增加逐步稳定。';
}

function inferPreferences(memory: { windows: Record<string, BaselineStats | number> }) {
  const last90 = memory.windows.last90Days as BaselineStats | undefined;
  return {
    planningStyle: '低压力、可执行、先观察再调整',
    exercisePattern: last90 && last90.exerciseActiveDays >= 20 ? '已有较稳定运动记录' : '运动记录偏少，适合轻量起步',
    sleepPattern: last90?.sleepAverageHours ? `睡眠基线约 ${last90.sleepAverageHours} 小时` : '睡眠基线不足',
  };
}

function inferRiskSignals(memory: { windows: Record<string, BaselineStats | number>; trends: Record<string, unknown> }) {
  const last30 = memory.windows.last30Days as BaselineStats | undefined;
  const trends = memory.trends as { sleepHoursDelta?: number; moodDelta?: number; exerciseMinutesDelta?: number; medicalVisitsDelta?: number };
  return [
    trends.sleepHoursDelta !== undefined && trends.sleepHoursDelta <= -0.7 ? { type: 'sleep_drop', message: '近 30 天睡眠较前 30 天下滑明显' } : undefined,
    trends.moodDelta !== undefined && trends.moodDelta <= -1 ? { type: 'mood_drop', message: '近 30 天心情评分较前 30 天下滑' } : undefined,
    last30 && last30.exerciseActiveDays < 6 ? { type: 'low_activity', message: '近 30 天运动活跃天数较少' } : undefined,
    trends.medicalVisitsDelta !== undefined && trends.medicalVisitsDelta > 1 ? { type: 'medical_increase', message: '近期就医记录增加' } : undefined,
  ].filter(Boolean);
}
