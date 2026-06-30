import { Button, Card, Empty, List, Popconfirm, Space, Tag, Typography, message } from 'antd';
import type { HealthRecordType } from '@health/shared';
import type { HealthRecord } from '../../api/health';
import { useHealthRecords } from '../../hooks/useHealthRecords';

const typeLabels: Record<HealthRecordType, string> = {
  sleep: '睡眠',
  exercise: '运动',
  mood: '心情',
  medical: '就医',
};

const typeColors: Record<HealthRecordType, string> = {
  sleep: 'geekblue',
  exercise: 'cyan',
  mood: 'purple',
  medical: 'blue',
};

const intensityLabels: Record<string, string> = {
  low: '低强度',
  medium: '中等强度',
  high: '高强度',
};

export function RecordTimeline() {
  const { records, remove } = useHealthRecords();
  const data = records.data ?? [];

  function handleDelete(id: string) {
    remove.mutate(id, {
      onSuccess: () => message.success('健康记录已删除'),
      onError: (error) => message.error(error instanceof Error ? error.message : '删除失败，请稍后重试'),
    });
  }

  return (
    <Card title="最近记录" extra={<span className="soft-card-extra">最近 200 条</span>}>
      {data.length === 0 ? (
        <Empty description="暂无记录，先写下一条温柔的健康观察吧" />
      ) : (
        <div className="record-timeline-scroll">
          <List
            dataSource={data}
            renderItem={(record) => (
              <List.Item
                className="record-list-item"
                actions={[
                  <Popconfirm
                    key="delete"
                    title="删除这条健康记录？"
                    description="删除后最近记录和健康总览会更新，已生成的快照可能需要重新生成。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDelete(record.id)}
                  >
                    <Button type="link" danger loading={remove.isPending}>
                      删除
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Tag color={typeColors[record.type]}>{typeLabels[record.type]}</Tag>
                      <Typography.Text>{new Date(record.recordedAt).toLocaleString()}</Typography.Text>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={4}>
                      <Typography.Text>{formatRecord(record)}</Typography.Text>
                      {record.note ? <Typography.Text type="secondary">备注：{record.note}</Typography.Text> : null}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )}
    </Card>
  );
}

function formatRecord(record: HealthRecord) {
  const payload = record.payload;

  switch (record.type) {
    case 'sleep': {
      const startedAt = formatTime(payload.startedAt);
      const endedAt = formatTime(payload.endedAt);
      const quality = typeof payload.quality === 'number' ? ` · 质量 ${payload.quality}/5` : '';
      return `睡眠：${startedAt} - ${endedAt}${quality}`;
    }
    case 'exercise': {
      const activity = typeof payload.activity === 'string' ? payload.activity : '运动';
      const duration = typeof payload.durationMinutes === 'number' ? ` · ${payload.durationMinutes} 分钟` : '';
      const intensity = typeof payload.intensity === 'string' ? ` · ${intensityLabels[payload.intensity] ?? payload.intensity}` : '';
      return `运动：${activity}${duration}${intensity}`;
    }
    case 'mood': {
      const score = typeof payload.score === 'number' ? `${payload.score}/10` : '未评分';
      const tags = Array.isArray(payload.tags) && payload.tags.length > 0 ? ` · ${payload.tags.join('、')}` : '';
      return `心情：${score}${tags}`;
    }
    case 'medical': {
      const parts = [
        typeof payload.visitType === 'string' ? payload.visitType : '就医记录',
        typeof payload.diagnosis === 'string' && payload.diagnosis ? `诊断：${payload.diagnosis}` : undefined,
        typeof payload.medication === 'string' && payload.medication ? `用药：${payload.medication}` : undefined,
        typeof payload.followUpAt === 'string' ? `复诊：${new Date(payload.followUpAt).toLocaleString()}` : undefined,
      ].filter(Boolean);
      return `就医：${parts.join(' · ')}`;
    }
  }
}

function formatTime(value: unknown) {
  if (typeof value !== 'string') return '未记录';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
