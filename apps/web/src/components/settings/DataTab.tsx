import { Button, Popconfirm, Space, Spin, Tag, Typography, message } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { exportHealthData } from '../../api/data-export';
import { listConversations } from '../../api/chat';
import { listDiagnoses } from '../../api/diagnosis';
import { useHealthRecords } from '../../hooks/useHealthRecords';
import { downloadBlob, formatErrorMessage } from './settings-utils';

export function DataTab() {
  const { records } = useHealthRecords();
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: listConversations });
  const diagnoses = useQuery({ queryKey: ['diagnoses'], queryFn: listDiagnoses });
  const healthRecords = records.data ?? [];

  const exportMutation = useMutation({
    mutationFn: exportHealthData,
    onSuccess: (blob, format) => {
      downloadBlob(blob, `healthflow-export-${new Date().toISOString().slice(0, 10)}.${format}`);
      message.success(`${format.toUpperCase()} 文件已开始下载`);
    },
    onError: (error) => message.error(`导出失败：${formatErrorMessage(error)}`),
  });

  const stats = [
    { label: '睡眠记录', value: healthRecords.filter((record) => record.type === 'sleep').length },
    { label: '运动记录', value: healthRecords.filter((record) => record.type === 'exercise').length },
    { label: '心情记录', value: healthRecords.filter((record) => record.type === 'mood').length },
    { label: '就医记录', value: healthRecords.filter((record) => record.type === 'medical').length },
    { label: '对话会话', value: conversations.data?.length ?? 0 },
    { label: '诊断记录', value: diagnoses.data?.length ?? 0 },
  ];

  const loading = records.isLoading || conversations.isLoading || diagnoses.isLoading;

  return (
    <div className="settings-tab-panel">
      <Typography.Title level={4}>数据概览</Typography.Title>
      {loading ? (
        <Spin />
      ) : (
        <div className="settings-data-stats">
          {stats.map((item) => (
            <div className="settings-data-stat-card" key={item.label}>
              <div className="stat-number">{item.value}</div>
              <div className="stat-label">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      <section className="settings-section-card">
        <div className="settings-section-title">数据导出</div>
        <Typography.Paragraph type="secondary">
          导出的文件包含你的全部健康记录，可以交给医生或用于个人备份。
        </Typography.Paragraph>
        <Space wrap>
          <Button onClick={() => exportMutation.mutate('json')} loading={exportMutation.isPending && exportMutation.variables === 'json'}>
            导出 JSON
          </Button>
          <Button onClick={() => exportMutation.mutate('csv')} loading={exportMutation.isPending && exportMutation.variables === 'csv'}>
            导出 CSV
          </Button>
        </Space>
      </section>

      <section className="settings-section-card">
        <div className="settings-section-title">数据导入</div>
        <Space align="center" wrap>
          <Button disabled>导入 JSON</Button>
          <Tag color="blue">即将上线</Tag>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          后续将支持从导出的 JSON 文件恢复数据。
        </Typography.Paragraph>
      </section>

      <div className="settings-danger-zone">
        <Typography.Title level={5}>数据清理</Typography.Title>
        <Typography.Paragraph type="secondary">
          批量清理接口会在后续版本开放。当前可在对应页面逐条删除记录，或通过删除账号清除所有个人数据。
        </Typography.Paragraph>
        <Space wrap>
          <Popconfirm title="清除健康记录" description="批量清理功能即将上线。" okText="知道了" showCancel={false} onConfirm={() => message.info('批量清理健康记录即将上线')}>
            <Button danger disabled={false}>
              清除所有健康记录
            </Button>
          </Popconfirm>
          <Popconfirm title="清除对话记录" description="批量清理功能即将上线。" okText="知道了" showCancel={false} onConfirm={() => message.info('批量清理对话记录即将上线')}>
            <Button danger disabled={false}>
              清除所有对话记录
            </Button>
          </Popconfirm>
        </Space>
      </div>
    </div>
  );
}
