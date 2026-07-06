import { HistoryOutlined, UpOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, List, Popconfirm, Row, Space, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DiagnosisInput, DiagnosisSafetyLevel } from '@health/shared';
import { GradientText } from '../components/effects/GradientText';
import { DiagnosisForm } from '../components/diagnosis/DiagnosisForm';
import { useDiagnosis } from '../hooks/useDiagnosis';

const safetyLabels: Record<DiagnosisSafetyLevel, string> = {
  emergency: '立即就医',
  urgent: '尽快就医',
  clinician_recommended: '建议咨询医生',
  supportive: '支持观察',
};

const safetyColors: Record<DiagnosisSafetyLevel, string> = {
  emergency: 'red',
  urgent: 'orange',
  clinician_recommended: 'blue',
  supportive: 'green',
};

export function DiagnosisPage() {
  const navigate = useNavigate();
  const [showHistory, setShowHistory] = useState(false);
  const { history, create, followUp, remove } = useDiagnosis({ historyEnabled: showHistory });
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
      <div className="page-intro diagnosis-page-intro">
        <Typography.Title className="page-gradient-title" level={2}>
          <GradientText pauseOnHover>中西医结合辅助分诊</GradientText>
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          先用一句话描述不适，系统会整理关键信息并提示少量补充问题，再由西医与中医 Agent 初评、质询和仲裁。
        </Typography.Paragraph>
      </div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 18 }}
        message="安全优先"
        description="如出现胸痛、呼吸困难、口角歪斜/单侧无力、意识障碍、大量出血、严重过敏、孕期急症或自伤风险，请不要等待 AI 建议，立即联系急救服务或线下就医。"
      />
      {showHistory ? (
        <Row gutter={[18, 18]}>
          <Col xs={24} xl={12}>
            <DiagnosisForm
              loading={create.isPending}
              followUpLoading={followUp.isPending}
              onGenerateFollowUp={(input) => followUp.mutateAsync(input)}
              onSubmit={handleSubmit}
            />
          </Col>
          <Col xs={24} xl={12}>
            <Card
              title="历史记录"
              extra={
                <Space size={8}>
                  <span className="soft-card-extra">辅助分诊记录</span>
                  <Button size="small" icon={<UpOutlined />} onClick={() => setShowHistory(false)}>
                    收起
                  </Button>
                </Space>
              }
            >
              {history.isLoading ? (
                <List loading />
              ) : (history.data ?? []).length === 0 ? (
                <Empty description="暂无辅助分诊记录" />
              ) : (
                <div className="record-timeline-scroll">
                  <List
                    dataSource={history.data ?? []}
                    renderItem={(item) => (
                      <List.Item
                        className="record-list-item"
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
                          title={
                            <Space wrap>
                              <Tag color={item.safetyLevel ? safetyColors[item.safetyLevel] : 'default'}>
                                {item.safetyLevel ? safetyLabels[item.safetyLevel] : item.status}
                              </Tag>
                              <Typography.Text>{new Date(item.createdAt).toLocaleString()}</Typography.Text>
                              {item.generationStatus?.degraded ? <Tag color="gold">部分生成</Tag> : null}
                            </Space>
                          }
                          description={
                            <Space direction="vertical" size={4}>
                              <Typography.Text>{item.integratedOutput?.summary || item.input.chiefComplaint}</Typography.Text>
                              {item.input.chiefComplaint && item.integratedOutput?.summary ? (
                                <Typography.Text type="secondary">主诉：{item.input.chiefComplaint}</Typography.Text>
                              ) : null}
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </div>
              )}
            </Card>
          </Col>
        </Row>
      ) : (
        <div className="diagnosis-collapsed-layout">
          <Button type="primary" icon={<HistoryOutlined />} onClick={() => setShowHistory(true)}>
            查看历史记录
          </Button>
          <Row gutter={[18, 18]} justify="center">
            <Col xs={24} lg={18} xl={14}>
              <DiagnosisForm
                loading={create.isPending}
                followUpLoading={followUp.isPending}
                onGenerateFollowUp={(input) => followUp.mutateAsync(input)}
                onSubmit={handleSubmit}
              />
            </Col>
          </Row>
        </div>
      )}
    </>
  );
}
