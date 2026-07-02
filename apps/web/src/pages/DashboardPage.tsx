import { useMemo, useState } from 'react';
import { Button, Card, Col, Empty, List, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';
import type { AgentRun } from '../api/agentRuns';
import type { HealthInsight, HealthRecord } from '../api/health';
import { CompactTrendChart } from '../components/charts/CompactTrendChart';
import { TrendDetailModal } from '../components/charts/TrendDetailModal';
import { SnapshotCard } from '../components/snapshots/SnapshotCard';
import { useAgentRuns } from '../hooks/useAgentRuns';
import { useHealthInsights } from '../hooks/useHealthInsights';
import { useHealthRecords } from '../hooks/useHealthRecords';
import type { ChartKind } from '../lib/chart-data';
import { aggregateTrendData } from '../lib/chart-data';

export function DashboardPage() {
  const { records } = useHealthRecords();
  const [selectedChart, setSelectedChart] = useState<ChartKind | null>(null);
  const data = records.data ?? [];
  const weeklyTrends = useMemo(
    () => ({
      mood: aggregateTrendData(data, 'mood', 'week'),
      sleep: aggregateTrendData(data, 'sleep', 'week'),
      exercise: aggregateTrendData(data, 'exercise', 'week'),
    }),
    [data],
  );
  const mood = getTodayMood(data);
  const sleep = getSleepTrend(data);
  const exercise = getExerciseFrequency(data);

  return (
    <>
      <div className="page-intro">
        <Typography.Title level={2}>健康总览</Typography.Title>
        <Typography.Paragraph type="secondary">
          Agent 会持续读取你的长期健康基线、近期变化和对话执行轨迹，把值得关注的信号放在这里。
        </Typography.Paragraph>
      </div>
      <Row gutter={[18, 18]}>
        <Col xs={24} md={8}>
          <Card className="metric-card">
            <Statistic title="今日心情" value={mood.latestScore !== undefined ? `${mood.latestScore} / 10` : '待记录'} />
            <div className="dashboard-metric-detail">
              {mood.latestScore !== undefined ? `今日平均 ${mood.averageScore ?? '-'} 分` : '今天还没有心情记录'}
            </div>
            <Space wrap size={[4, 4]}>
              {mood.tags.map((tag) => <Tag key={tag} color="purple">{tag}</Tag>)}
            </Space>
            <CompactTrendChart type="mood" data={weeklyTrends.mood} onExpand={setSelectedChart} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="metric-card">
            <Statistic title="睡眠趋势" value={sleep.averageHours ?? '暂无数据'} suffix={sleep.averageHours !== undefined ? '小时' : undefined} />
            <div className="dashboard-metric-detail">
              {sleep.latestHours !== undefined ? `最近一次 ${sleep.latestHours} 小时${sleep.diffText ? ` · ${sleep.diffText}` : ''}` : '近 7 天暂无睡眠记录'}
            </div>
            <CompactTrendChart type="sleep" data={weeklyTrends.sleep} onExpand={setSelectedChart} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="metric-card">
            <Statistic title="运动频率" value={exercise.count ? `${exercise.activeDays} / 7 天` : '暂无运动'} />
            <div className="dashboard-metric-detail">
              {exercise.count ? `共 ${exercise.totalMinutes} 分钟 · ${exercise.count} 条记录` : '近 7 天还没有运动记录'}
            </div>
            <CompactTrendChart type="exercise" data={weeklyTrends.exercise} onExpand={setSelectedChart} />
          </Card>
        </Col>
        <Col xs={24} xl={14}><HealthInsightsPanel /></Col>
        <Col xs={24} xl={10}><AgentRunsPanel /></Col>
        <Col span={24}>{records.isLoading ? <Spin /> : <SnapshotCard />}</Col>
      </Row>
      <TrendDetailModal open={selectedChart !== null} type={selectedChart} records={data} onClose={() => setSelectedChart(null)} />
    </>
  );
}

function HealthInsightsPanel() {
  const { insights, refresh, markRead, dismiss } = useHealthInsights();
  const items = insights.data ?? [];

  return (
    <Card
      className="agent-insights-card"
      title="主动洞察"
      extra={<Button size="small" onClick={() => refresh.mutate()} loading={refresh.isPending}>刷新</Button>}
    >
      {insights.isLoading ? (
        <Spin />
      ) : items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无需要提醒的健康信号" />
      ) : (
        <List
          className="agent-insight-list"
          dataSource={items.slice(0, 5)}
          renderItem={(item) => (
            <List.Item
              actions={[
                item.status === 'new' ? <Button key="read" type="link" size="small" onClick={() => markRead.mutate(item.id)}>已读</Button> : null,
                <Button key="dismiss" type="link" size="small" onClick={() => dismiss.mutate(item.id)}>忽略</Button>,
              ].filter(Boolean)}
            >
              <InsightItem insight={item} />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}

function InsightItem({ insight }: { insight: HealthInsight }) {
  return (
    <List.Item.Meta
      title={
        <Space wrap size={8}>
          <Typography.Text strong>{insight.title}</Typography.Text>
          <Tag color={insightSeverityColor(insight.severity)}>{insightSeverityText(insight.severity)}</Tag>
          {insight.status === 'new' ? <Tag color="blue">新</Tag> : null}
        </Space>
      }
      description={
        <Space direction="vertical" size={4} className="agent-insight-copy">
          <Typography.Text>{insight.summary}</Typography.Text>
          <Typography.Text type="secondary">{insight.recommendation}</Typography.Text>
        </Space>
      }
    />
  );
}

function AgentRunsPanel() {
  const runs = useAgentRuns(6);
  const items = runs.data ?? [];

  return (
    <Card className="agent-runs-card" title="最近 Agent 运行">
      {runs.isLoading ? (
        <Spin />
      ) : items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="对话或辅助分诊后会显示运行轨迹" />
      ) : (
        <List
          className="agent-run-list"
          dataSource={items}
          renderItem={(run) => (
            <List.Item>
              <AgentRunItem run={run} />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}

function AgentRunItem({ run }: { run: AgentRun }) {
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const latestStep = steps[steps.length - 1];
  return (
    <div className="agent-run-item">
      <div className="agent-run-head">
        <Space wrap size={8}>
          <Typography.Text strong>{run.kind === 'chat' ? '健康对话' : '辅助分诊'}</Typography.Text>
          <Tag color={runStatusColor(run.status)}>{runStatusText(run.status)}</Tag>
        </Space>
        <Typography.Text type="secondary">{formatTime(run.startedAt)}</Typography.Text>
      </div>
      <Typography.Text type="secondary" className="agent-run-detail">
        {steps.length} 个步骤{latestStep?.title ? ` · 最近：${latestStep.title}` : ''}
      </Typography.Text>
      {run.error ? <Typography.Text type="danger" className="agent-run-detail">{run.error}</Typography.Text> : null}
    </div>
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

function insightSeverityColor(severity: string) {
  if (severity === 'warning') return 'red';
  if (severity === 'watch') return 'gold';
  return 'cyan';
}

function insightSeverityText(severity: string) {
  if (severity === 'warning') return '需关注';
  if (severity === 'watch') return '观察';
  return '提示';
}

function runStatusColor(status: string) {
  if (status === 'completed') return 'green';
  if (status === 'failed') return 'red';
  return 'blue';
}

function runStatusText(status: string) {
  if (status === 'completed') return '完成';
  if (status === 'failed') return '失败';
  return '运行中';
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
