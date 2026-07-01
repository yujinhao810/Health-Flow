import { Alert, Button, Col, List, Popconfirm, Row, Space, Typography, message } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DiagnosisInput } from '@health/shared';
import { DiagnosisForm } from '../components/diagnosis/DiagnosisForm';
import { useDiagnosis } from '../hooks/useDiagnosis';

export function DiagnosisPage() {
  const navigate = useNavigate();
  const { history, create, remove } = useDiagnosis();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleSubmit(input: DiagnosisInput) {
    try {
      const session = await create.mutateAsync(input);
      if (session.integratedOutput?.mustSeekImmediateCare) {
        message.warning('已识别到需要立即就医的风险信号，请优先处理安全问题。');
      } else if (session.integratedOutput?.needsFollowUp) {
        message.warning('会诊已完成初步仲裁，但需要补充关键信息后再细化建议。');
      } else if (session.generationStatus?.degraded) {
        message.warning('辅助分诊建议已生成，但部分内容不完整，请查看页面提示。');
      } else {
        message.success('会诊式辅助分诊建议已生成');
      }
      navigate(`/diagnosis/${session.id}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成辅助分诊建议失败');
    }
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    remove.mutate(id, {
      onSuccess: () => message.success('辅助分诊记录已删除'),
      onError: (error) => message.error(error instanceof Error ? error.message : '删除失败，请稍后重试'),
      onSettled: () => setDeletingId(null),
    });
  }

  return (
    <>
      <div className="page-intro">
        <Typography.Title level={2}>中西医结合辅助分诊</Typography.Title>
        <Typography.Paragraph type="secondary">
          先由西医与中医 Agent 初评，再相互质询，最后由决策者 Agent 按安全优先原则仲裁。信息不足时会先提示需要补充的问题。
        </Typography.Paragraph>
      </div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 18 }}
        message="安全优先"
        description="如出现胸痛、呼吸困难、口角歪斜/单侧无力、意识障碍、大量出血、严重过敏、孕期急症或自伤风险，请不要等待 AI 建议，立即联系急救服务或线下就医。"
      />
      <Row gutter={[18, 18]}>
        <Col xs={24} xl={12}>
          <DiagnosisForm loading={create.isPending} onSubmit={handleSubmit} />
        </Col>
        <Col xs={24} xl={12}>
          <List
            bordered
            loading={history.isLoading}
            header="历史记录"
            dataSource={history.data ?? []}
            locale={{ emptyText: '暂无辅助分诊记录' }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key="view" type="link" onClick={() => navigate(`/diagnosis/${item.id}`)}>
                    查看
                  </Button>,
                  <Popconfirm
                    key="delete"
                    title="删除这条辅助分诊记录？"
                    description="删除后该汇总建议将无法恢复。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDelete(item.id)}
                  >
                    <Button type="link" danger loading={deletingId === item.id}>
                      删除
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={item.integratedOutput?.summary || item.input.chiefComplaint}
                  description={
                    <Space size={8} wrap>
                      <Typography.Text type="secondary">{new Date(item.createdAt).toLocaleString()}</Typography.Text>
                      <Typography.Text type="secondary">{item.safetyLevel ?? item.status}</Typography.Text>
                      {item.generationStatus?.degraded ? <Typography.Text type="warning">部分生成</Typography.Text> : null}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Col>
      </Row>
    </>
  );
}
