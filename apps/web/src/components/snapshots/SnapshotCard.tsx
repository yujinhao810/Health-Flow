import { Button, Card, Col, Empty, List, Progress, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';
import type { HealthSnapshotSignals } from '@health/shared';
import { useSnapshots } from '../../hooks/useSnapshots';

const emptySignals: HealthSnapshotSignals = {
  recordCount: 0,
  sleep: { count: 0, dailyHours: [] },
  mood: { count: 0, dailyScores: [], topTags: [] },
  exercise: {
    count: 0,
    totalMinutes: 0,
    activeDays: 0,
    frequencyPerWeek: 0,
    dailyMinutes: [],
    byActivity: [],
    byIntensity: {},
  },
};

export function SnapshotCard() {
  const { latest, generate } = useSnapshots();
  if (latest.isLoading) return <Spin />;
  const snapshot = latest.data;
  const signals = normalizeSignals(snapshot?.signals);

  return (
    <Card
      title="最新健康快照"
      extra={<Button onClick={() => generate.mutate()} loading={generate.isPending}>重新生成</Button>}
    >
      {!snapshot ? (
        <Empty description="暂无快照，点击重新生成后查看健康洞察" />
      ) : (
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <div className="snapshot-overview">
            <Space direction="vertical" size={6}>
              <Typography.Text type="secondary">
                {formatDate(snapshot.startedAt)} - {formatDate(snapshot.endedAt)} · 共 {signals.recordCount} 条记录
              </Typography.Text>
              <Typography.Paragraph style={{ margin: 0 }}>{snapshot.summary}</Typography.Paragraph>
            </Space>
          </div>

          <Row gutter={[16, 16]} className="snapshot-grid">
            <Col xs={24} lg={8}>
              <section className="snapshot-section">
                <div className="snapshot-section-header">
                  <Typography.Title level={5}>心情趋势</Typography.Title>
                  <Tag color="purple">{signals.mood.count} 条</Tag>
                </div>
                {signals.mood.count === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无心情记录" />
                ) : (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Progress
                      percent={Math.round(((signals.mood.averageScore ?? 0) / 10) * 100)}
                      format={() => `${signals.mood.averageScore ?? '-'} / 10`}
                      strokeColor={{ '0%': '#a78bfa', '100%': '#6d5dfc' }}
                    />
                    <MiniBars
                      data={signals.mood.dailyScores.map((item) => ({ date: item.date, value: item.score }))}
                      max={10}
                      suffix="分"
                    />
                    <Space wrap>
                      {signals.mood.topTags.map((item) => <Tag key={item.tag} color="purple">{item.tag} × {item.count}</Tag>)}
                    </Space>
                  </Space>
                )}
              </section>
            </Col>

            <Col xs={24} lg={8}>
              <section className="snapshot-section">
                <div className="snapshot-section-header">
                  <Typography.Title level={5}>睡眠概览</Typography.Title>
                  <Tag color="geekblue">{signals.sleep.count} 条</Tag>
                </div>
                {signals.sleep.count === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无睡眠记录" />
                ) : (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Statistic title="平均时长" value={signals.sleep.averageDurationHours ?? 0} suffix="小时" precision={1} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="平均质量" value={signals.sleep.averageQuality ?? 0} suffix="/5" precision={1} />
                      </Col>
                    </Row>
                    <MiniBars
                      data={signals.sleep.dailyHours.map((item) => ({ date: item.date, value: item.hours }))}
                      max={Math.max(8, ...signals.sleep.dailyHours.map((item) => item.hours))}
                      suffix="h"
                    />
                  </Space>
                )}
              </section>
            </Col>

            <Col xs={24} lg={8}>
              <section className="snapshot-section">
                <div className="snapshot-section-header">
                  <Typography.Title level={5}>运动频率</Typography.Title>
                  <Tag color="cyan">{signals.exercise.count} 条</Tag>
                </div>
                {signals.exercise.count === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无运动记录" />
                ) : (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Statistic title="运动天数" value={signals.exercise.activeDays} suffix="/7 天" />
                      </Col>
                      <Col span={12}>
                        <Statistic title="总时长" value={signals.exercise.totalMinutes} suffix="分钟" />
                      </Col>
                    </Row>
                    <Progress
                      percent={Math.round(signals.exercise.frequencyPerWeek * 100)}
                      strokeColor={{ '0%': '#38bdf8', '100%': '#6d5dfc' }}
                    />
                    <MiniBars
                      data={signals.exercise.dailyMinutes.map((item) => ({ date: item.date, value: item.minutes }))}
                      max={Math.max(30, ...signals.exercise.dailyMinutes.map((item) => item.minutes))}
                      suffix="m"
                    />
                    <Space wrap>
                      {signals.exercise.byActivity.slice(0, 4).map((item) => (
                        <Tag key={item.activity} color="blue">{item.activity} · {item.minutes} 分钟</Tag>
                      ))}
                    </Space>
                  </Space>
                )}
              </section>
            </Col>
          </Row>

          <div className="snapshot-section snapshot-recommendations">
            <Typography.Title level={5}>温和建议</Typography.Title>
            <List
              size="small"
              dataSource={snapshot.recommendations ?? []}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </div>
        </Space>
      )}
    </Card>
  );
}

function MiniBars({ data, max, suffix }: { data: Array<{ date: string; value: number }>; max: number; suffix: string }) {
  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />;
  const safeMax = Math.max(max, 1);
  return (
    <div className="mini-bars">
      {data.map((item) => (
        <div className="mini-bar-item" key={item.date} title={`${item.date}: ${item.value}${suffix}`}>
          <div className="mini-bar-track">
            <div className="mini-bar" style={{ height: `${Math.max((item.value / safeMax) * 100, 8)}%` }} />
          </div>
          <span className="mini-bar-label">{item.date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function normalizeSignals(signals: unknown): HealthSnapshotSignals {
  if (!signals || typeof signals !== 'object') return emptySignals;
  const value = signals as Partial<HealthSnapshotSignals> & Record<string, unknown>;

  return {
    recordCount: getNumber(value.recordCount) ?? 0,
    sleep: {
      count: getNumber(value.sleep?.count) ?? getNumber(value.sleepCount) ?? 0,
      averageDurationHours: getNumber(value.sleep?.averageDurationHours),
      averageQuality: getNumber(value.sleep?.averageQuality),
      dailyHours: Array.isArray(value.sleep?.dailyHours) ? value.sleep.dailyHours : [],
    },
    mood: {
      count: getNumber(value.mood?.count) ?? 0,
      averageScore: getNumber(value.mood?.averageScore) ?? getNumber(value.moodAverage),
      latestScore: getNumber(value.mood?.latestScore),
      dailyScores: Array.isArray(value.mood?.dailyScores) ? value.mood.dailyScores : [],
      topTags: Array.isArray(value.mood?.topTags) ? value.mood.topTags : [],
    },
    exercise: {
      count: getNumber(value.exercise?.count) ?? getNumber(value.exerciseCount) ?? 0,
      totalMinutes: getNumber(value.exercise?.totalMinutes) ?? 0,
      activeDays: getNumber(value.exercise?.activeDays) ?? 0,
      frequencyPerWeek: getNumber(value.exercise?.frequencyPerWeek) ?? 0,
      dailyMinutes: Array.isArray(value.exercise?.dailyMinutes) ? value.exercise.dailyMinutes : [],
      byActivity: Array.isArray(value.exercise?.byActivity) ? value.exercise.byActivity : [],
      byIntensity: value.exercise?.byIntensity ?? {},
    },
  };
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
