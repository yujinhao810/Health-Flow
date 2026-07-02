import type { HealthRecord } from '../api/health';

export type ChartKind = 'sleep' | 'mood' | 'exercise';
export type TimeRange = 'week' | 'month' | 'year';
export type ChartPoint = { date: string; value: number | null };
export type OverviewChartPoint = { date: string; sleep: number | null; mood: number | null; exercise: number | null };
export type DailyValue = { date: string; value: number };

type AggregationMode = 'average' | 'sum';

const rangeDayCounts: Record<TimeRange, number> = {
  week: 7,
  month: 30,
  year: 365,
};

export function getDateRange(range: TimeRange) {
  const to = startOfDay(new Date());
  const from = addDays(to, -(rangeDayCounts[range] - 1));

  return {
    from: toDateKey(from),
    to: toDateKey(to),
  };
}

export function aggregateTrendData(records: HealthRecord[], kind: ChartKind, range: TimeRange): ChartPoint[] {
  switch (kind) {
    case 'sleep':
      return aggregateSleepData(records, range);
    case 'mood':
      return aggregateMoodData(records, range);
    case 'exercise':
      return aggregateExerciseData(records, range);
  }
}

export function aggregateSleepData(records: HealthRecord[], range: TimeRange): ChartPoint[] {
  const values = records
    .filter((record) => record.type === 'sleep' && isInRange(record.recordedAt, range))
    .map((record) => ({ date: toDateKey(new Date(record.recordedAt)), value: getSleepHours(record.payload) }))
    .filter((item): item is DailyValue => item.value !== undefined);

  return buildChartPointsFromDailyValues(values, range, 'average');
}

export function aggregateMoodData(records: HealthRecord[], range: TimeRange): ChartPoint[] {
  const values = records
    .filter((record) => record.type === 'mood' && isInRange(record.recordedAt, range))
    .map((record) => ({ date: toDateKey(new Date(record.recordedAt)), value: getNumber(record.payload.score) }))
    .filter((item): item is DailyValue => item.value !== undefined);

  return buildChartPointsFromDailyValues(values, range, 'average');
}

export function aggregateExerciseData(records: HealthRecord[], range: TimeRange): ChartPoint[] {
  const values = records
    .filter((record) => record.type === 'exercise' && isInRange(record.recordedAt, range))
    .map((record) => ({ date: toDateKey(new Date(record.recordedAt)), value: getNumber(record.payload.durationMinutes) }))
    .filter((item): item is DailyValue => item.value !== undefined && item.value > 0);

  return buildChartPointsFromDailyValues(values, range, 'sum');
}

export function aggregateOverviewData(records: HealthRecord[], range: TimeRange): OverviewChartPoint[] {
  const sleep = new Map(aggregateSleepData(records, range).map((point) => [point.date, normalize(point.value, 12)]));
  const mood = new Map(aggregateMoodData(records, range).map((point) => [point.date, normalize(point.value, 10)]));
  const exercise = new Map(aggregateExerciseData(records, range).map((point) => [point.date, normalize(point.value, 180)]));
  const keys = new Set([...sleep.keys(), ...mood.keys(), ...exercise.keys()]);

  return [...keys].sort().map((date) => ({
    date,
    sleep: sleep.get(date) ?? null,
    mood: mood.get(date) ?? null,
    exercise: exercise.get(date) ?? null,
  }));
}

export function buildChartPointsFromDailyValues(items: DailyValue[], range: TimeRange, mode: AggregationMode = 'average'): ChartPoint[] {
  const { from, to } = getDateRange(range);
  const buckets = new Map<string, number[]>();

  for (const item of items) {
    if (item.date < from || item.date > to || !Number.isFinite(item.value)) continue;
    const bucket = range === 'year' ? getWeekBucket(item.date) : item.date;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), item.value]);
  }

  const data = [...buckets.entries()].map(([date, values]) => ({
    date,
    value: mode === 'sum' ? round(values.reduce((sum, value) => sum + value, 0)) : average(values) ?? null,
  }));

  return fillMissingDates(data, range);
}

export function fillMissingDates(data: ChartPoint[], range: TimeRange): ChartPoint[] {
  const byDate = new Map(data.map((point) => [point.date, point.value]));
  const { from, to } = getDateRange(range);
  const dates = range === 'year' ? getWeekBuckets(from, to) : getDateKeys(from, to);

  return dates.map((date) => ({ date, value: byDate.get(date) ?? null }));
}

export function summarizeChartData(data: ChartPoint[]) {
  const values = data.map((point) => point.value).filter((value): value is number => value !== null && Number.isFinite(value));

  return {
    average: average(values),
    max: values.length ? round(Math.max(...values)) : undefined,
    min: values.length ? round(Math.min(...values)) : undefined,
    recordedDays: values.length,
    totalDays: data.length,
  };
}

export function formatChartDate(value: string, range: TimeRange) {
  const date = parseDateKey(value);
  if (!isValidDate(date)) return value;
  if (range === 'year') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

export function formatTooltipDate(value: string, range: TimeRange) {
  const date = parseDateKey(value);
  if (!isValidDate(date)) return value;
  if (range === 'year') {
    const end = addDays(date, 6);
    return `${date.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }
  return date.toLocaleDateString();
}

function isInRange(value: string, range: TimeRange) {
  const date = toDateKey(new Date(value));
  const { from, to } = getDateRange(range);
  return date >= from && date <= to;
}

function getSleepHours(payload: Record<string, unknown>) {
  if (typeof payload.startedAt !== 'string' || typeof payload.endedAt !== 'string') return undefined;
  const startedAt = new Date(payload.startedAt);
  const endedAt = new Date(payload.endedAt);
  const hours = (endedAt.getTime() - startedAt.getTime()) / 36e5;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return undefined;
  return round(hours);
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalize(value: number | null, max: number) {
  if (value === null) return null;
  return round(Math.min(Math.max(value / max, 0), 1) * 100);
}

function average(values: number[]) {
  if (!values.length) return undefined;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number) {
  return Number(value.toFixed(1));
}

function getDateKeys(from: string, to: string) {
  const dates: string[] = [];
  let cursor = parseDateKey(from);
  const end = parseDateKey(to);

  while (cursor <= end) {
    dates.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function getWeekBuckets(from: string, to: string) {
  const dates: string[] = [];
  let cursor = parseDateKey(getWeekBucket(from));
  const end = parseDateKey(getWeekBucket(to));

  while (cursor <= end) {
    dates.push(toDateKey(cursor));
    cursor = addDays(cursor, 7);
  }

  return dates;
}

function getWeekBucket(dateKey: string) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  return toDateKey(addDays(date, -((day + 6) % 7)));
}

function parseDateKey(value: string) {
  return new Date(`${value}T00:00:00`);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateKey(date: Date) {
  if (!isValidDate(date)) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isValidDate(date: Date) {
  return Number.isFinite(date.getTime());
}
