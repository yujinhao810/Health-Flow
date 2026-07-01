import { Alert, Card, Col, Empty, List, Row, Space, Tag, Typography } from 'antd';
import { ExperimentOutlined, HeartOutlined, MedicineBoxOutlined, QuestionCircleOutlined, SafetyOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { GenerationStatus, TcmAssessment, TcmReviewOfWestern, WesternAssessment, WesternReviewOfTcm } from '@health/shared';

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
  const cross = status.coordinator?.crossExamination;
  const westernReview = cross?.westernOnTcm ?? null;
  const tcmReview = cross?.tcmOnWestern ?? null;
  const westernAvailable = Boolean(western) && status.western === 'complete' && !containsFallbackText(western);
  const tcmAvailable = Boolean(tcm) && status.tcm === 'complete' && !containsFallbackText(tcm);
  const westernCrossAvailable = Boolean(westernReview) && status.westernCross === 'complete' && !containsFallbackText(westernReview);
  const tcmCrossAvailable = Boolean(tcmReview) && status.tcmCross === 'complete' && !containsFallbackText(tcmReview);

  return (
    <Row gutter={[16, 16]} className="diagnosis-expert-grid">
      <Col xs={24} xl={12}>
        <Card className="diagnosis-expert-card western" bordered={false}>
          <ExpertHeader icon={<MedicineBoxOutlined />} title="西医 Agent" subtitle="初评 + 阅读中医结果" urgency={westernAvailable ? western?.urgency : undefined} />
          {westernAvailable && western ? <WesternPanel assessment={western} /> : <UnavailablePanel message="本次西医结构化初评未成功生成" />}
          {westernCrossAvailable && westernReview ? <WesternReviewPanel review={westernReview} /> : <CrossUnavailable title="西医交叉质询" status={status.westernCross} />}
        </Card>
      </Col>
      <Col xs={24} xl={12}>
        <Card className="diagnosis-expert-card tcm" bordered={false}>
          <ExpertHeader icon={<HeartOutlined />} title="中医 Agent" subtitle="初评 + 阅读西医结果" urgency={tcmAvailable ? tcm?.urgency : undefined} />
          {tcmAvailable && tcm ? <TcmPanel assessment={tcm} /> : <UnavailablePanel message="本次中医结构化初评未成功生成" />}
          {tcmCrossAvailable && tcmReview ? <TcmReviewPanel review={tcmReview} /> : <CrossUnavailable title="中医交叉质询" status={status.tcmCross} />}
        </Card>
      </Col>
    </Row>
  );
}

function ExpertHeader({ icon, title, subtitle, urgency }: { icon: ReactNode; title: string; subtitle: string; urgency?: string }) {
  return (
    <div className="diagnosis-expert-header">
      <Space>
        <span className="diagnosis-expert-icon">{icon}</span>
        <div>
          <Typography.Title level={4}>{title}</Typography.Title>
          <Typography.Text type="secondary">{subtitle}</Typography.Text>
        </div>
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

function CrossUnavailable({ title, status }: { title: string; status?: string }) {
  if (status !== 'fallback') return null;
  return (
    <section className="diagnosis-mini-section compact">
      <Typography.Title level={5}>{title}</Typography.Title>
      <Alert type="warning" showIcon message="交叉质询未完整生成" description="本次会诊已按保守安全边界继续仲裁。" />
    </section>
  );
}

function WesternPanel({ assessment }: { assessment: WesternAssessment }) {
  return (
    <Space direction="vertical" size={14} className="diagnosis-expert-body">
      <MiniSection
        icon={<ExperimentOutlined />}
        title="西医初评：可能性假设（非诊断）"
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
        title="西医初评：建议检查/评估"
        empty="暂无检查建议"
        items={assessment.recommendedChecks.map((item) => ({
          title: item.name,
          tag: URGENCY_LABELS[item.timing] ?? item.timing,
          content: item.reason,
        }))}
      />
      <PlainList title="西医初评：就医边界" items={assessment.seekCareCriteria} />
    </Space>
  );
}

function TcmPanel({ assessment }: { assessment: TcmAssessment }) {
  return (
    <Space direction="vertical" size={14} className="diagnosis-expert-body">
      <div className="diagnosis-rationale-box">
        <Typography.Text type="secondary">中医初评：辨证说明</Typography.Text>
        <Typography.Paragraph>{assessment.constitutionAndPatternRationale}</Typography.Paragraph>
      </div>
      <MiniSection
        icon={<HeartOutlined />}
        title="中医初评：证候倾向（非诊断）"
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
        title="中医初评：舌脉/整体信息补充"
        empty="暂无补充问题"
        items={assessment.tonguePulseQuestions.map((item) => ({ title: item, content: '' }))}
      />
      <PlainList title="中医初评：调养提醒" items={assessment.regulationSuggestions.map((item) => `${item.suggestion}${item.safetyNote ? `；${item.safetyNote}` : ''}`)} />
    </Space>
  );
}

function WesternReviewPanel({ review }: { review: WesternReviewOfTcm }) {
  return (
    <section className="diagnosis-cross-section">
      <div className="diagnosis-mini-title">
        <SafetyOutlined />
        <Typography.Title level={5}>西医阅读中医结果后的质询</Typography.Title>
      </div>
      <CrossList
        title="哪些可参考"
        empty="暂无可参考项"
        items={review.referenceable.map((item) => ({
          title: item.point,
          content: item.reason,
        }))}
      />
      <CrossList
        title="哪些可能误导"
        empty="暂无误导风险"
        items={review.potentiallyMisleading.map((item) => ({
          title: item.point,
          content: item.risk,
          footer: `更安全表述：${item.saferFraming}`,
          tone: 'warning',
        }))}
      />
      <CrossList
        title="哪些需要医学检查确认"
        empty="暂无检查确认项"
        items={review.checksNeeded.map((item) => ({
          title: item.issue,
          tag: item.timing,
          content: `${item.recommendedCheck}：${item.reason}`,
        }))}
      />
    </section>
  );
}

function TcmReviewPanel({ review }: { review: TcmReviewOfWestern }) {
  return (
    <section className="diagnosis-cross-section">
      <div className="diagnosis-mini-title">
        <SafetyOutlined />
        <Typography.Title level={5}>中医阅读西医结果后的质询</Typography.Title>
      </div>
      <CrossList
        title="哪些证候判断需要补充信息"
        empty="暂无需补充项"
        items={review.needsMoreTcmInfo.map((item) => ({
          title: item.patternOrIssue,
          content: item.reason,
          footer: item.missingInfo.length ? `需补充：${item.missingInfo.join('、')}` : undefined,
        }))}
      />
      <CrossList
        title="哪些调养建议需要避开西医红旗"
        empty="暂无安全边界"
        items={review.safetyBoundaries.map((item) => ({
          title: item.westernRedFlagOrConcern,
          content: item.tcmAdjustment,
          footer: item.reason,
          tone: 'warning',
        }))}
      />
      <CrossList
        title="哪些地方与西医判断冲突"
        empty="暂无冲突点"
        items={review.conflicts.map((item) => ({
          title: item.topic,
          content: item.concern,
          footer: `西医：${item.westernView}；中医：${item.tcmView}`,
        }))}
      />
    </section>
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

function CrossList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ title: string; tag?: string; content: string; footer?: string; tone?: 'warning' }>;
}) {
  const visibleItems = items.filter((item) => !containsFallbackText(item));
  return (
    <section className="diagnosis-mini-section compact">
      <Typography.Title level={5}>{title}</Typography.Title>
      {visibleItems.length ? (
        <Space direction="vertical" size={8} className="diagnosis-mini-list">
          {visibleItems.map((item, index) => (
            <div className={`diagnosis-mini-item ${item.tone === 'warning' ? 'tone-warning' : ''}`} key={`${item.title}-${index}`}>
              <Space size={8} wrap>
                <Typography.Text strong>{item.title}</Typography.Text>
                {item.tag ? <Tag>{item.tag}</Tag> : null}
              </Space>
              <Typography.Paragraph>{item.content}</Typography.Paragraph>
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
