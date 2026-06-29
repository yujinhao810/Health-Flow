import { Alert, Card, Col, Empty, List, Row, Space, Tag, Typography } from 'antd';
import { ExperimentOutlined, HeartOutlined, MedicineBoxOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { GenerationStatus, TcmAssessment, WesternAssessment } from '@health/shared';

const URGENCY_LABELS: Record<string, string> = {
  emergency: '立即就医',
  urgent: '尽快就医',
  routine: '常规评估',
  self_care: '可先自我照护',
};

const LIKELIHOOD_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

const FALLBACK_KEYWORDS = ['结构化输出暂不可用', '输出暂不可用', '专家输出暂不可用'];

const COMPLETE_STATUS: GenerationStatus = {
  overall: 'complete',
  western: 'complete',
  tcm: 'complete',
  integrated: 'complete',
  degraded: false,
  warnings: [],
};

type Props = {
  western?: WesternAssessment | null;
  tcm?: TcmAssessment | null;
  generationStatus?: GenerationStatus | null;
};

export function ExpertPanel({ western, tcm, generationStatus = COMPLETE_STATUS }: Props) {
  const status = generationStatus ?? COMPLETE_STATUS;
  const westernAvailable = Boolean(western) && status.western === 'complete' && !containsFallbackText(western);
  const tcmAvailable = Boolean(tcm) && status.tcm === 'complete' && !containsFallbackText(tcm);

  return (
    <Row gutter={[16, 16]} className="diagnosis-expert-grid">
      <Col xs={24} xl={12}>
        <Card className="diagnosis-expert-card western" bordered={false}>
          <ExpertHeader icon={<MedicineBoxOutlined />} title="西医分析详情" urgency={westernAvailable ? western?.urgency : undefined} />
          {westernAvailable && western ? <WesternPanel assessment={western} /> : <UnavailablePanel message="本次西医结构化分析未成功生成" />}
        </Card>
      </Col>
      <Col xs={24} xl={12}>
        <Card className="diagnosis-expert-card tcm" bordered={false}>
          <ExpertHeader icon={<HeartOutlined />} title="中医辨证详情" urgency={tcmAvailable ? tcm?.urgency : undefined} />
          {tcmAvailable && tcm ? <TcmPanel assessment={tcm} /> : <UnavailablePanel message="本次中医结构化分析未成功生成" />}
        </Card>
      </Col>
    </Row>
  );
}

function ExpertHeader({ icon, title, urgency }: { icon: ReactNode; title: string; urgency?: string }) {
  return (
    <div className="diagnosis-expert-header">
      <Space>
        <span className="diagnosis-expert-icon">{icon}</span>
        <Typography.Title level={4}>{title}</Typography.Title>
      </Space>
      {urgency ? <UrgencyTag value={urgency} /> : null}
    </div>
  );
}

function UnavailablePanel({ message }: { message: string }) {
  return (
    <div className="diagnosis-expert-body">
      <Alert type="warning" showIcon message={message} description="可稍后重试，或检查模型、API Key、Base URL 等配置。降级内容不会作为正式分析展示。" />
    </div>
  );
}

function WesternPanel({ assessment }: { assessment: WesternAssessment }) {
  return (
    <Space direction="vertical" size={14} className="diagnosis-expert-body">
      <MiniSection
        icon={<ExperimentOutlined />}
        title="可能性假设（非诊断）"
        empty="暂无假设"
        items={assessment.diagnosticHypotheses.map((item) => ({
          title: item.name,
          tag: LIKELIHOOD_LABELS[item.likelihood] ?? item.likelihood,
          content: item.rationale,
          footer: item.supportingFindings.length ? `依据：${item.supportingFindings.join('、')}` : undefined,
        }))}
      />
      <MiniSection
        icon={<QuestionCircleOutlined />}
        title="建议检查/评估"
        empty="暂无检查建议"
        items={assessment.recommendedChecks.map((item) => ({
          title: item.name,
          tag: URGENCY_LABELS[item.timing] ?? item.timing,
          content: item.reason,
        }))}
      />
      <PlainList title="什么时候需要就医" items={assessment.seekCareCriteria} />
    </Space>
  );
}

function TcmPanel({ assessment }: { assessment: TcmAssessment }) {
  return (
    <Space direction="vertical" size={14} className="diagnosis-expert-body">
      <div className="diagnosis-rationale-box">
        <Typography.Text type="secondary">辨证说明</Typography.Text>
        <Typography.Paragraph>{assessment.constitutionAndPatternRationale}</Typography.Paragraph>
      </div>
      <MiniSection
        icon={<HeartOutlined />}
        title="证候倾向（非诊断）"
        empty="暂无证候假设"
        items={assessment.patternHypotheses.map((item) => ({
          title: item.name,
          tag: LIKELIHOOD_LABELS[item.likelihood] ?? item.likelihood,
          content: item.rationale,
          footer: item.supportingFindings.length ? `依据：${item.supportingFindings.join('、')}` : undefined,
        }))}
      />
      <MiniSection
        icon={<QuestionCircleOutlined />}
        title="舌脉/整体信息补充"
        empty="暂无补充问题"
        items={assessment.tonguePulseQuestions.map((item) => ({ title: item, content: '' }))}
      />
      <PlainList title="调养提醒" items={assessment.regulationSuggestions.map((item) => `${item.suggestion}${item.safetyNote ? `（${item.safetyNote}）` : ''}`)} />
    </Space>
  );
}

function MiniSection({
  icon,
  title,
  empty,
  items,
}: {
  icon: ReactNode;
  title: string;
  empty: string;
  items: Array<{ title: string; tag?: string; content: string; footer?: string }>;
}) {
  const visibleItems = items.filter((item) => !containsFallbackText(item));
  return (
    <section className="diagnosis-mini-section">
      <div className="diagnosis-mini-title">
        {icon}
        <Typography.Title level={5}>{title}</Typography.Title>
      </div>
      {visibleItems.length ? (
        <Space direction="vertical" size={10} className="diagnosis-mini-list">
          {visibleItems.map((item, index) => (
            <div className="diagnosis-mini-item" key={`${item.title}-${index}`}>
              <Space size={8} wrap>
                <Typography.Text strong>{item.title}</Typography.Text>
                {item.tag ? <Tag>{item.tag}</Tag> : null}
              </Space>
              {item.content ? <Typography.Paragraph>{item.content}</Typography.Paragraph> : null}
              {item.footer ? <Typography.Text type="secondary">{item.footer}</Typography.Text> : null}
            </div>
          ))}
        </Space>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />
      )}
    </section>
  );
}

function PlainList({ title, items }: { title: string; items: string[] }) {
  const visibleItems = items.filter((item) => !containsFallbackText(item));
  if (!visibleItems.length) return null;
  return (
    <section className="diagnosis-mini-section compact">
      <Typography.Title level={5}>{title}</Typography.Title>
      <List size="small" dataSource={visibleItems} renderItem={(item) => <List.Item>{item}</List.Item>} />
    </section>
  );
}

function UrgencyTag({ value }: { value: string }) {
  const color = value === 'emergency' ? 'red' : value === 'urgent' ? 'orange' : value === 'routine' ? 'blue' : 'green';
  return <Tag color={color}>{URGENCY_LABELS[value] ?? value}</Tag>;
}

function containsFallbackText(value: unknown) {
  return FALLBACK_KEYWORDS.some((keyword) => JSON.stringify(value ?? '').includes(keyword));
}
