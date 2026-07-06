import { useMemo, useState, type ReactNode } from 'react';
import { FilePdfOutlined, FireOutlined, MedicineBoxOutlined, MoonOutlined, PictureOutlined, RightOutlined, SmileOutlined } from '@ant-design/icons';
import { Button, Card, Col, Empty, Image, List, Modal, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { AgentRun } from '../api/agentRuns';
import { withAuthToken } from '../api/client';
import type { HealthInsight, HealthRecord } from '../api/health';
import { CompactTrendChart } from '../components/charts/CompactTrendChart';
import { GradientText } from '../components/effects/GradientText';
import { TrendDetailModal } from '../components/charts/TrendDetailModal';
import { TimeWellnessCard } from '../components/dashboard/TimeWellnessCard';
import { SnapshotCard } from '../components/snapshots/SnapshotCard';
import { useAgentRuns } from '../hooks/useAgentRuns';
import { useHealthInsights } from '../hooks/useHealthInsights';
import { useHealthRecords } from '../hooks/useHealthRecords';
import type { ChartKind } from '../lib/chart-data';
import { aggregateTrendData } from '../lib/chart-data';
import {
  formatFileSize,
  getMedicalDiagnosis,
  getMedicalFollowUpAt,
  getMedicalMaterials,
  getMedicalMedication,
  getMedicalVisitType,
  isImageMaterial,
  isPdfMaterial,
  type MedicalMaterial,
} from '../lib/medical-materials';

type MedicalRecordItem = {
  record: HealthRecord;
  visitType: string;
  diagnosis?: string;
  medication?: string;
  followUpAt?: string;
  materials: MedicalMaterial[];
};

export function DashboardPage() {
  const { records } = useHealthRecords();
  const [selectedChart, setSelectedChart] = useState<ChartKind | null>(null);
  const [medicalOpen, setMedicalOpen] = useState(false);
  const data = records.data ?? [];
  const weeklyTrends = useMemo(
    () => ({
      mood: aggregateTrendData(data, 'mood', 'week'),
      sleep: aggregateTrendData(data, 'sleep', 'week'),
      exercise: aggregateTrendData(data, 'exercise', 'week'),
    }),
    [data],
  );
  const medicalRecords = useMemo(() => getMedicalRecordItems(data), [data]);
  const mood = getTodayMood(data);
  const sleep = getSleepTrend(data);
  const exercise = getExerciseFrequency(data);
  const medical = getMedicalSummary(medicalRecords);

  return (
    <>
      <div className="page-intro">
        <Typography.Title className="page-gradient-title" level={2}>
          <GradientText pauseOnHover>健康总览</GradientText>
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          Agent 会持续读取你的长期健康基线、近期变化和对话执行轨迹，把值得关注的信号放在这里。
        </Typography.Paragraph>
      </div>
      <Row gutter={[18, 18]}>
        <Col span={24}>
          <TimeWellnessCard />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card className="metric-card">
            <Statistic title={<MetricTitle icon={<SmileOutlined />} text="今日心情" tone="mood" />} value={mood.latestScore !== undefined ? `${mood.latestScore} / 10` : '待记录'} />
            <div className="dashboard-metric-detail">
              {mood.latestScore !== undefined ? `今日平均 ${mood.averageScore ?? '-'} 分` : '今天还没有心情记录'}
            </div>
            <Space wrap size={[4, 4]}>
              {mood.tags.map((tag) => <Tag key={tag} color="purple">{tag}</Tag>)}
            </Space>
            <CompactTrendChart type="mood" data={weeklyTrends.mood} onExpand={setSelectedChart} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card className="metric-card">
            <Statistic title={<MetricTitle icon={<MoonOutlined />} text="睡眠趋势" tone="sleep" />} value={sleep.averageHours ?? '暂无数据'} suffix={sleep.averageHours !== undefined ? '小时' : undefined} />
            <div className="dashboard-metric-detail">
              {sleep.latestHours !== undefined ? `最近一次 ${sleep.latestHours} 小时${sleep.diffText ? ` · ${sleep.diffText}` : ''}` : '近 7 天暂无睡眠记录'}
            </div>
            <CompactTrendChart type="sleep" data={weeklyTrends.sleep} onExpand={setSelectedChart} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card className="metric-card">
            <Statistic title={<MetricTitle icon={<FireOutlined />} text="运动频率" tone="exercise" />} value={exercise.count ? `${exercise.activeDays} / 7 天` : '暂无运动'} />
            <div className="dashboard-metric-detail">
              {exercise.count ? `共 ${exercise.totalMinutes} 分钟 · ${exercise.count} 条记录` : '近 7 天还没有运动记录'}
            </div>
            <CompactTrendChart type="exercise" data={weeklyTrends.exercise} onExpand={setSelectedChart} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card className="metric-card dashboard-medical-card">
            <Statistic
              title={<MetricTitle icon={<MedicineBoxOutlined />} text="就医" tone="medical" />}
              value={medical.recordCount ? `${medical.recordCount} 条记录` : '暂无记录'}
            />
            <div className="dashboard-metric-detail">
              {medical.latest ? `最近一次 ${medical.latest.visitType} · ${formatTime(medical.latest.record.recordedAt)} · ${medical.latest.materials.length} 份资料` : '还没有保存就医记录'}
            </div>
            <div className="dashboard-medical-summary">
              <span>
                <strong>{medical.recordCount}</strong>
                条就医记录
              </span>
              <span>
                <strong>{medical.materialCount}</strong>
                份上传资料
              </span>
            </div>
            <Button className="dashboard-medical-action" type="primary" icon={<RightOutlined />} onClick={() => setMedicalOpen(true)} block>
              查看就医资料
            </Button>
          </Card>
        </Col>
        <Col xs={24} xl={14}><HealthInsightsPanel /></Col>
        <Col xs={24} xl={10}><AgentRunsPanel /></Col>
        <Col span={24}>{records.isLoading ? <Spin /> : <SnapshotCard />}</Col>
      </Row>
      <TrendDetailModal open={selectedChart !== null} type={selectedChart} records={data} onClose={() => setSelectedChart(null)} />
      <MedicalRecordsModal open={medicalOpen} records={medicalRecords} onClose={() => setMedicalOpen(false)} />
    </>
  );
}

function MetricTitle({ icon, text, tone }: { icon: ReactNode; text: string; tone: 'mood' | 'sleep' | 'exercise' | 'medical' }) {
  return (
    <span className={`dashboard-metric-title dashboard-metric-title-${tone}`}>
      <span className="dashboard-metric-title-icon">{icon}</span>
      <span>{text}</span>
    </span>
  );
}

function MedicalRecordsModal({ open, records, onClose }: { open: boolean; records: MedicalRecordItem[]; onClose: () => void }) {
  const materialCount = records.reduce((sum, item) => sum + item.materials.length, 0);

  return (
    <Modal
      className="medical-records-modal"
      footer={null}
      open={open}
      title={
        <div className="medical-records-titlebar">
          <div className="medical-records-title-main">
            <span className="medical-records-title-icon">
              <MedicineBoxOutlined />
            </span>
            <span>就医资料</span>
          </div>
          {records.length ? <Tag color="blue">{records.length} 条记录</Tag> : null}
        </div>
      }
      width={920}
      onCancel={onClose}
    >
      {records.length ? (
        <Space direction="vertical" size={14} className="medical-records-content">
          <div className="medical-records-overview">
            <span>
              <strong>{records.length}</strong>
              条就医记录
            </span>
            <span>
              <strong>{materialCount}</strong>
              份上传资料
            </span>
          </div>
          <List
            className="medical-records-list"
            dataSource={records}
            renderItem={(item) => (
              <List.Item className="medical-record-detail">
                <div className="medical-record-detail-head">
                  <Space wrap size={8}>
                    <Tag color="blue">{item.visitType}</Tag>
                    <Typography.Text strong>{new Date(item.record.recordedAt).toLocaleString()}</Typography.Text>
                  </Space>
                  <Typography.Text type="secondary">{item.materials.length} 份资料</Typography.Text>
                </div>
                <div className="medical-record-detail-body">
                  {item.diagnosis ? <InfoLine label="历史诊断" value={item.diagnosis} /> : null}
                  {item.medication ? <InfoLine label="用药记录" value={item.medication} /> : null}
                  {item.followUpAt ? <InfoLine label="复诊时间" value={new Date(item.followUpAt).toLocaleString()} /> : null}
                  {item.record.note ? <InfoLine label="备注" value={item.record.note} /> : null}
                </div>
                {item.materials.length ? (
                  <MedicalMaterialGrid materials={item.materials} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这条就医记录暂未上传资料" />
                )}
              </List.Item>
            )}
          />
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space direction="vertical" size={8}>
              <Typography.Text>暂无就医记录</Typography.Text>
              <Link to="/records" onClick={onClose}>
                去健康记录中新增
              </Link>
            </Space>
          }
        />
      )}
    </Modal>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="medical-info-line">
      <span>{label}</span>
      <Typography.Text>{value}</Typography.Text>
    </div>
  );
}

function MedicalMaterialGrid({ materials }: { materials: MedicalMaterial[] }) {
  return (
    <div className="medical-material-grid">
      {materials.map((material) => {
        const contentUrl = material.contentUrl ? withAuthToken(material.contentUrl) : undefined;
        return (
          <div className="medical-material-card" key={material.id}>
            <div className={`medical-material-preview ${isPdfMaterial(material) ? 'pdf' : 'image'}`}>
              {contentUrl && isImageMaterial(material) ? (
                <Image alt={material.originalName} height={56} src={contentUrl} width={56} preview={{ mask: '预览' }} />
              ) : isPdfMaterial(material) ? (
                <FilePdfOutlined />
              ) : (
                <PictureOutlined />
              )}
            </div>
            <div className="medical-material-copy">
              <Typography.Text strong ellipsis={{ tooltip: material.originalName }}>
                {material.originalName}
              </Typography.Text>
              <Typography.Text type="secondary">{formatFileSize(material.sizeBytes)}</Typography.Text>
            </div>
            {contentUrl ? (
              <a className="medical-material-open" href={contentUrl} rel="noreferrer" target="_blank">
                打开
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function HealthInsightsPanel() {
  const { insights, refresh, markRead, dismiss } = useHealthInsights();
  const items = insights.data ?? [];

  return (
    <Card
      className="agent-insights-card dashboard-equal-card"
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
    <Card className="agent-runs-card dashboard-equal-card" title="最近 Agent 运行">
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
      <Link className="agent-run-link" to={`/agent-runs/${run.id}`}>
        查看运行详情
      </Link>
    </div>
  );
}

function getMedicalRecordItems(records: HealthRecord[]): MedicalRecordItem[] {
  return records
    .filter((record) => record.type === 'medical')
    .map((record) => ({
      record,
      visitType: getMedicalVisitType(record.payload),
      diagnosis: getMedicalDiagnosis(record.payload),
      medication: getMedicalMedication(record.payload),
      followUpAt: getMedicalFollowUpAt(record.payload),
      materials: getMedicalMaterials(record.payload),
    }))
    .sort((a, b) => new Date(b.record.recordedAt).getTime() - new Date(a.record.recordedAt).getTime());
}

function getMedicalSummary(records: MedicalRecordItem[]) {
  const materials = records.flatMap((record) => record.materials);
  return {
    recordCount: records.length,
    materialCount: materials.length,
    pdfCount: materials.filter(isPdfMaterial).length,
    imageCount: materials.filter(isImageMaterial).length,
    latest: records[0],
  };
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
