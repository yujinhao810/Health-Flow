import { Injectable } from '@nestjs/common';
import { HealthRecord } from '@prisma/client';
import type { HealthSnapshotSignals } from '@health/shared';

type JsonPayload = Record<string, unknown>;

@Injectable()
export class SnapshotBuilderService {
  build(records: HealthRecord[]) {
    const signals = buildSignals(records);
    const summary = buildSummary(signals);
    const recommendations = buildRecommendations(signals);

    return { summary, signals, recommendations };
  }
}

function buildSignals(records: HealthRecord[]): HealthSnapshotSignals {
  const sleepDurations: Array<{ date: string; hours: number; quality?: number }> = [];
  const moodScores: Array<{ date: string; score: number; recordedAt: Date }> = [];
  const exerciseEntries: Array<{ date: string; minutes: number; activity: string; intensity?: 'low' | 'medium' | 'high' }> = [];
  const moodTagCounts = new Map<string, number>();

  for (const record of records) {
    const payload = normalizePayload(record.payload);
    const date = dateKey(record.recordedAt);

    if (record.type === 'sleep') {
      const hours = getSleepHours(payload);
      const quality = typeof payload.quality === 'number' ? payload.quality : undefined;
      if (hours !== undefined) sleepDurations.push({ date, hours, quality });
    }

    if (record.type === 'mood') {
      const score = typeof payload.score === 'number' ? payload.score : undefined;
      if (score !== undefined) {
        moodScores.push({ date, score, recordedAt: record.recordedAt });
      }
      if (Array.isArray(payload.tags)) {
        for (const tag of payload.tags) {
          if (typeof tag !== 'string' || !tag.trim()) continue;
          moodTagCounts.set(tag, (moodTagCounts.get(tag) ?? 0) + 1);
        }
      }
    }

    if (record.type === 'exercise') {
      const minutes = typeof payload.durationMinutes === 'number' ? payload.durationMinutes : undefined;
      if (minutes && minutes > 0) {
        const intensity = isIntensity(payload.intensity) ? payload.intensity : undefined;
        exerciseEntries.push({
          date,
          minutes,
          activity: typeof payload.activity === 'string' && payload.activity ? payload.activity : '运动',
          intensity,
        });
      }
    }
  }

  const dailyHours = aggregateByDate(sleepDurations, 'hours');
  const dailyScores = aggregateByDate(moodScores, 'score');
  const dailyMinutes = aggregateByDate(exerciseEntries, 'minutes');
  const exerciseDates = new Set(exerciseEntries.map((entry) => entry.date));

  return {
    recordCount: records.length,
    sleep: {
      count: records.filter((record) => record.type === 'sleep').length,
      averageDurationHours: average(sleepDurations.map((entry) => entry.hours)),
      averageQuality: average(sleepDurations.map((entry) => entry.quality).filter(isNumber)),
      dailyHours,
    },
    mood: {
      count: records.filter((record) => record.type === 'mood').length,
      averageScore: average(moodScores.map((entry) => entry.score)),
      latestScore: moodScores.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0]?.score,
      dailyScores,
      topTags: [...moodTagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, count })),
    },
    exercise: {
      count: records.filter((record) => record.type === 'exercise').length,
      totalMinutes: exerciseEntries.reduce((sum, entry) => sum + entry.minutes, 0),
      activeDays: exerciseDates.size,
      frequencyPerWeek: Number((exerciseDates.size / 7).toFixed(2)),
      dailyMinutes,
      byActivity: aggregateActivities(exerciseEntries),
      byIntensity: aggregateIntensity(exerciseEntries),
    },
  };
}

function buildSummary(signals: HealthSnapshotSignals) {
  const moodText = signals.mood.averageScore ? `平均心情 ${signals.mood.averageScore} 分` : '暂无心情评分';
  const sleepText = signals.sleep.averageDurationHours
    ? `平均睡眠 ${signals.sleep.averageDurationHours} 小时`
    : '暂无有效睡眠时长';
  const exerciseText = signals.exercise.count
    ? `运动 ${signals.exercise.activeDays} 天，共 ${signals.exercise.totalMinutes} 分钟`
    : '暂无运动记录';

  return `近 ${signals.recordCount} 条健康记录中，${moodText}，${sleepText}，${exerciseText}。`;
}

function buildRecommendations(signals: HealthSnapshotSignals) {
  const recommendations: string[] = [];

  if (signals.recordCount < 3) recommendations.push('继续保持规律记录，数据越完整，健康洞察会越准确。');
  if (signals.sleep.averageDurationHours !== undefined && signals.sleep.averageDurationHours < 6) {
    recommendations.push('近期平均睡眠偏短，建议优先安排稳定的入睡和起床时间。');
  }
  if (signals.mood.averageScore !== undefined && signals.mood.averageScore < 5) {
    recommendations.push('近期心情分偏低，可以记录触发因素，并在必要时寻求可信任的人或专业支持。');
  }
  if (signals.exercise.activeDays === 0) {
    recommendations.push('本周还没有运动记录，可以从 10-15 分钟轻松散步开始。');
  } else if (signals.exercise.activeDays < 3) {
    recommendations.push('运动频率仍有提升空间，可以尝试把轻量活动分散到更多天。');
  }

  recommendations.push('如持续不适或出现明显身心症状，请及时咨询专业人士。');
  return recommendations;
}

function normalizePayload(payload: unknown): JsonPayload {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as JsonPayload) : {};
}

function getSleepHours(payload: JsonPayload) {
  if (typeof payload.startedAt !== 'string' || typeof payload.endedAt !== 'string') return undefined;
  const startedAt = new Date(payload.startedAt);
  const endedAt = new Date(payload.endedAt);
  const hours = (endedAt.getTime() - startedAt.getTime()) / 36e5;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return undefined;
  return Number(hours.toFixed(1));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function aggregateByDate<T extends Record<string, unknown>, K extends keyof T & string>(items: T[], valueKey: K) {
  const buckets = new Map<string, number[]>();
  for (const item of items) {
    const value = item[valueKey];
    if (typeof item.date !== 'string' || typeof value !== 'number') continue;
    buckets.set(item.date, [...(buckets.get(item.date) ?? []), value]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, [valueKey]: average(values) ?? 0 })) as Array<{ date: string } & Record<K, number>>;
}

function aggregateActivities(entries: Array<{ activity: string; minutes: number }>) {
  const buckets = new Map<string, { count: number; minutes: number }>();
  for (const entry of entries) {
    const current = buckets.get(entry.activity) ?? { count: 0, minutes: 0 };
    buckets.set(entry.activity, { count: current.count + 1, minutes: current.minutes + entry.minutes });
  }
  return [...buckets.entries()]
    .map(([activity, value]) => ({ activity, ...value }))
    .sort((a, b) => b.minutes - a.minutes);
}

function aggregateIntensity(entries: Array<{ intensity?: 'low' | 'medium' | 'high' }>) {
  const result: Partial<Record<'low' | 'medium' | 'high', number>> = {};
  for (const entry of entries) {
    if (!entry.intensity) continue;
    result[entry.intensity] = (result[entry.intensity] ?? 0) + 1;
  }
  return result;
}

function average(values: number[]) {
  if (!values.length) return undefined;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIntensity(value: unknown): value is 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high';
}
