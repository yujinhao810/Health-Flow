import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Space, Spin, Tag, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { DiagnosisResult } from '../components/diagnosis/DiagnosisResult';
import { useDiagnosisDetail } from '../hooks/useDiagnosis';

export function DiagnosisDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const detail = useDiagnosisDetail(id);

  function renderContent() {
    if (!id) {
      return (
        <Card>
          <Empty description="辅助分诊记录不存在" />
        </Card>
      );
    }

    if (detail.isLoading) {
      return (
        <Card>
          <div style={{ padding: '36px 0', textAlign: 'center' }}>
            <Spin tip="正在加载辅助分诊结果..." />
          </div>
        </Card>
      );
    }

    if (detail.isError) {
      return (
        <Alert
          type="error"
          showIcon
          message="加载辅助分诊记录失败"
          description={detail.error instanceof Error ? detail.error.message : '请稍后重试，或返回辅助分诊页面重新查看历史记录。'}
          action={<Button onClick={() => navigate('/diagnosis')}>返回辅助分诊</Button>}
        />
      );
    }

    if (!detail.data) {
      return (
        <Card>
          <Empty description="辅助分诊记录不存在" />
        </Card>
      );
    }

    return <DiagnosisResult session={detail.data} />;
  }

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <div className="page-intro">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/diagnosis')} style={{ marginBottom: 12 }}>
          返回辅助分诊
        </Button>
        <Typography.Title level={2}>辅助分诊汇总建议</Typography.Title>
        <Space size={8} wrap>
          {detail.data?.createdAt ? <Typography.Text type="secondary">生成时间：{new Date(detail.data.createdAt).toLocaleString()}</Typography.Text> : null}
          {detail.data?.safetyLevel ? <Tag color="blue">{detail.data.safetyLevel}</Tag> : null}
          {detail.data?.generationStatus?.degraded ? <Tag color="orange">部分生成</Tag> : null}
        </Space>
      </div>
      {renderContent()}
    </Space>
  );
}
