import { Card, Col, Progress, Row, Space, Statistic, Tag, Typography } from 'antd';
import type { HealthRecord } from '../api/health';
import { SnapshotCard } from '../components/snapshots/SnapshotCard';
import { useHealthRecords } from '../hooks/useHealthRecords';

export function DashboardPage() {
  const { records } = useHealthRecords();
  const data = records.data ?? [];
  const mood = getTodayMood(data);
  const sleep = getSleepTrend(data);
  const exercise = getExerciseFrequency(data);

  return (
    <>
      <div className="page-intro">
        <Typography.Title level={2}>健康总览</Typography.Title>
        <Typography.Paragraph type="secondary">
          从每日记录中看见身体与情绪的细微变化，用更平和的节奏照顾自己。
        </Typography.Paragraph>
      </div>
      <Row gutter={[18, 18]}>
        <Col xs={24} md={8}>
          <Card className="metric-card">
            <Statistic title="今日心情" value={mood.latestScore ? `${mood.latestScore} / 10` : '待记录'} />
            <div className="dashboard-metric-detail">
              {mood.latestScore ? `今日平均 ${mood.averageScore ?? '-'} 分` : '今天还没有心情记录'}
            </div>
            <Space wrap size={[4, 4]}>
              {mood.tags.map((tag) => <Tag key={tag} color="purple">{tag}</Tag>)}
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="metric-card">
            <Statistic title="睡眠趋势" value={sleep.averageHours ? sleep.averageHours : '暂无数据'} suffix={sleep.averageHours ? '小时' : undefined} />
            <div className="dashboard-metric-detail">
              {sleep.latestHours ? `最近一次 ${sleep.latestHours} 小时${sleep.diffText ? ` · ${sleep.diffText}` : ''}` : '近 7 天暂无睡眠记录'}
            </div>
            <MiniMetricBars data={sleep.dailyHours} max={Math.max(8, ...sleep.dailyHours.map((item) => item.value))} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="metric-card">
            <Statistic title="运动频率" value={exercise.activeDays ? `${exercise.activeDays} / 7 天` : '暂无运动'} />
            <div className="dashboard-metric-detail">
              {exercise.count ? `共 ${exercise.totalMinutes} 分钟 · ${exercise.count} 条记录` : '近 7 天还没有运动记录'}
            </div>
            <Progress
              className="dashboard-mini-progress"
              percent={Math.round((exercise.activeDays / 7) * 100)}
              showInfo={false}
              strokeColor={{ '0%': '#38bdf8', '100%': '#6d5dfc' }}
            />
          </Card>
        </Col>
        <Col span={24}><SnapshotCard /></Col>
      </Row>
    </>
  );
}

function getTodayMood(records: HealthRecord[]) {
  const todayMood = records
    .filter((record) => record.type === 'mood' && isToday(record.recordedAt))
    .map((record) => ({ record, score: getMoodScore(record.payload), tags: getMoodTags(record.payload) }))
    .filter((item): item is { record: HealthRecord; score: number; tags: string[] } => item.score !== undefined)
    .sort((a, b) => new Date(b.record.recordedAt).getTime() - new Date(a.record.recordedAt).getTime());

  return {
    latestScore: todayMood[0]?.score,
    averageScore: average(todayMood.map((item) => item.score)),
    tags: [...new Set(todayMood.flatMap((item) => item.tags))].slice(0, 4),
  };
}

function getSleepTrend(records: HealthRecord[]) {
  const sleeps = records
    .filter((record) => record.type === 'sleep' && isWithinLastDays(record.recordedAt, 7))
    .map((record) => ({ record, hours: getSleepHours(record.payload) }))
    .filter((item): item is { record: HealthRecord; hours: number } => item.hours !== undefined)
    .sort((a, b) => new Date(b.record.recordedAt).getTime() - new Date(a.record.recordedAt).getTime());

  const latestHours = sleeps[0]?.hours;
  const previousHours = sleeps[1]?.hours;
  const diff = latestHours !== undefined && previousHours !== undefined ? Number((latestHours - previousHours).toFixed(1)) : undefined;

  return {
    averageHours: average(sleeps.map((item) => item.hours)),
    latestHours,
    diffText: diff === undefined ? undefined : diff === 0 ? '较上次持平' : `较上次 ${diff > 0 ? '+' : ''}${diff} 小时`,
    dailyHours: aggregateDailyValues(sleeps.map((item) => ({ date: dateKey(item.record.recordedAt), value: item.hours }))),
  };
}

function getExerciseFrequency(records: HealthRecord[]) {
  const exercises = records
    .filter((record) => record.type === 'exercise' && isWithinLastDays(record.recordedAt, 7))
    .map((record) => ({ record, minutes: getExerciseMinutes(record.payload) }))
    .filter((item): item is { record: HealthRecord; minutes: number } => item.minutes !== undefined);
  const activeDays = new Set(exercises.map((item) => dateKey(item.record.recordedAt))).size;

  return {
    activeDays,
    totalMinutes: exercises.reduce((sum, item) => sum + item.minutes, 0),
    count: exercises.length,
  };
}

function MiniMetricBars({ data, max }: { data: Array<{ date: string; value: number }>; max: number }) {
  if (!data.length) return null;
  const safeMax = Math.max(max, 1);
  return (
    <div className="dashboard-mini-bars">
      {data.map((item) => (
        <span key={item.date} className="dashboard-mini-bar" style={{ height: `${Math.max((item.value / safeMax) * 100, 10)}%` }} />
      ))}
    </div>
  );
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function isWithinLastDays(value: string, days: number) {
  const date = new Date(value);
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return Number.isFinite(date.getTime()) && date >= threshold;
}

function getMoodScore(payload: Record<string, unknown>) {
  return typeof payload.score === 'number' ? payload.score : undefined;
}

function getMoodTags(payload: Record<string, unknown>) {
  return Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag)) : [];
}

function getSleepHours(payload: Record<string, unknown>) {
  if (typeof payload.startedAt !== 'string' || typeof payload.endedAt !== 'string') return undefined;
  const startedAt = new Date(payload.startedAt);
  const endedAt = new Date(payload.endedAt);
  const hours = (endedAt.getTime() - startedAt.getTime()) / 36e5;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return undefined;
  return Number(hours.toFixed(1));
}

function getExerciseMinutes(payload: Record<string, unknown>) {
  return typeof payload.durationMinutes === 'number' && payload.durationMinutes > 0 ? payload.durationMinutes : undefined;
}

function dateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function aggregateDailyValues(items: Array<{ date: string; value: number }>) {
  const buckets = new Map<string, number[]>();
  for (const item of items) {
    buckets.set(item.date, [...(buckets.get(item.date) ?? []), item.value]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, value: average(values) ?? 0 }));
}

function average(values: number[]) {
  if (!values.length) return undefined;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}
