import { Alert, Card, Col, Empty, List, Row, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  HeartOutlined,
  MedicineBoxOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { DiagnosisSession, GenerationStatus, IntegratedDiagnosisResult, TcmAssessment, WesternAssessment } from '@health/shared';
import { ExpertPanel } from './ExpertPanel';
import { RedFlagAlert } from './RedFlagAlert';

const CATEGORY_LABELS: Record<string, string> = {
  medical_care: '就医/评估',
  monitoring: '观察记录',
  lifestyle: '生活方式',
  tcm_regulation: '中医调养',
  avoidance: '避免事项',
};

const PRIORITY_LABELS: Record<string, string> = {
  immediate: '立即',
  soon: '尽快',
  routine: '日常',
};

const FALLBACK_KEYWORDS = ['结构化输出暂不可用', '输出暂不可用', '专家输出暂不可用'];

export function DiagnosisResult({ session }: { session?: DiagnosisSession | null }) {
  if (!session) {
    return (
      <Card className="diagnosis-empty-card">
        <Empty description="提交信息后，这里会显示中西医结合辅助分诊与调理建议" />
      </Card>
    );
  }

  const result = session.integratedOutput as IntegratedDiagnosisResult | null | undefined;
  const western = session.westernOutput as WesternAssessment | null | undefined;
  const tcm = session.tcmOutput as TcmAssessment | null | undefined;
  const generationStatus = getGenerationStatus(session);
  const westernAvailable = Boolean(western) && generationStatus.western === 'complete' && !containsFallbackText(western);
  const tcmAvailable = Boolean(tcm) && generationStatus.tcm === 'complete' && !containsFallbackText(tcm);

  return (
    <Space direction="vertical" size={16} className="diagnosis-result">
      <RedFlagAlert result={result} />

      {result ? (
        <>
          <Card className="diagnosis-summary-card" bordered={false}>
            <div className="diagnosis-summary-head">
              <div>
                <Typography.Text className="diagnosis-eyebrow">安全结论</Typography.Text>
                <Typography.Title level={3}>辅助分诊结论</Typography.Title>
              </div>
              <SafetyTag level={result.safetyLevel} />
            </div>

            {generationStatus.degraded ? (
              <Alert
                type="warning"
                showIcon
                className="diagnosis-quality-alert"
                message="部分内容生成不完整"
                description={generationStatus.warnings.length ? generationStatus.warnings.join('；') : '当前结果包含保守兜底内容，建议稍后重试或检查模型配置。'}
              />
            ) : null}

            <div className="diagnosis-conclusion-panel">
              <div className="diagnosis-conclusion-label">
                <SafetyOutlined />
                <Typography.Text>重点结论</Typography.Text>
              </div>
              <Typography.Paragraph className="diagnosis-conclusion-text">
                {cleanFallbackText(result.summary, '当前信息不足以形成完整综合判断，请结合症状变化优先保障安全。')}
              </Typography.Paragraph>
            </div>

            <Row gutter={[12, 12]} className="diagnosis-focus-row">
              <Col xs={24} md={8}>
                <FocusCard icon={<SafetyOutlined />} label="安全等级" value={safetyText(result.safetyLevel)} tone={result.safetyLevel} />
              </Col>
              <Col xs={24} md={8}>
                <FocusCard
                  icon={<MedicineBoxOutlined />}
                  label="西医重点"
                  value={westernAvailable ? cleanFallbackText(result.westernPerspective, '请结合症状变化进行线下医学评估。') : '本次西医建议生成不完整，请查看下方提示。'}
                />
              </Col>
              <Col xs={24} md={8}>
                <FocusCard
                  icon={<HeartOutlined />}
                  label="中医重点"
                  value={tcmAvailable ? cleanFallbackText(result.tcmPerspective, '以低风险日常调养为主，症状加重时优先就医。') : '本次中医建议生成不完整，请查看下方提示。'}
                />
              </Col>
            </Row>
          </Card>

          <FollowUpCard result={result} />

          <Row gutter={[14, 14]} className="diagnosis-advice-grid">
            <Col xs={24} xl={8}>
              <WesternAdviceCard assessment={western} available={westernAvailable} />
            </Col>
            <Col xs={24} xl={8}>
              <TcmAdviceCard assessment={tcm} available={tcmAvailable} />
            </Col>
            <Col xs={24} xl={8}>
              <IntegratedAdviceCard result={result} integratedStatus={generationStatus.integrated} />
            </Col>
          </Row>

          <Alert className="diagnosis-disclaimer" type="info" showIcon message="安全声明" description={result.disclaimer} />
        </>
      ) : (
        <Card>
          <Typography.Text type="secondary">本次分析尚未生成完整结果。</Typography.Text>
        </Card>
      )}

      <ExpertPanel western={western} tcm={tcm} generationStatus={generationStatus} />
    </Space>
  );
}

function FollowUpCard({ result }: { result: IntegratedDiagnosisResult }) {
  if (!result.needsFollowUp) return null;
  const questions = filterFallbackItems(result.requiredFollowUpQuestions ?? []);
  return (
    <Alert
      type="warning"
      showIcon
      className="diagnosis-followup-alert"
      message="信息不足，建议先补充后再完成会诊"
      description={
        <Space direction="vertical" size={8}>
          <Typography.Text>{result.followUpReason || '当前缺少会影响安全等级或建议方向的关键信息。'}</Typography.Text>
          {questions.length ? <List size="small" dataSource={questions} renderItem={(item) => <List.Item>{item}</List.Item>} /> : null}
        </Space>
      }
    />
  );
}

function WesternAdviceCard({ assessment, available }: { assessment?: WesternAssessment | null; available: boolean }) {
  return (
    <Card className="diagnosis-advice-card western" bordered={false}>
      <AdviceHeader icon={<MedicineBoxOutlined />} eyebrow="西医建议" title="先排查风险" />
      {!available || !assessment ? (
        <UnavailableNotice message="本次西医结构化分析未成功生成" />
      ) : (
        <Space direction="vertical" size={12} className="diagnosis-advice-body">
          <MiniAdviceList
            title="建议检查/评估"
            empty="暂无检查建议"
            items={assessment.recommendedChecks.map((item) => ({
              title: item.name,
              tag: PRIORITY_LABELS[item.timing] ?? item.timing,
              content: cleanFallbackText(item.reason, '用于确认症状性质和排除风险。'),
            }))}
          />
          <InfoList title="什么时候需要就医" items={assessment.seekCareCriteria} />
          <InfoList title="自我照护边界" items={assessment.selfCareBoundaries} />
        </Space>
      )}
    </Card>
  );
}

function TcmAdviceCard({ assessment, available }: { assessment?: TcmAssessment | null; available: boolean }) {
  return (
    <Card className="diagnosis-advice-card tcm" bordered={false}>
      <AdviceHeader icon={<HeartOutlined />} eyebrow="中医建议" title="低风险调养" />
      {!available || !assessment ? (
        <UnavailableNotice message="本次中医结构化分析未成功生成" />
      ) : (
        <Space direction="vertical" size={12} className="diagnosis-advice-body">
          <div className="diagnosis-rationale-box compact">
            <Typography.Text type="secondary">辨证说明</Typography.Text>
            <Typography.Paragraph>{cleanFallbackText(assessment.constitutionAndPatternRationale, '需要结合舌象、脉象和整体信息进一步辨证。')}</Typography.Paragraph>
          </div>
          <MiniAdviceList
            title="调养建议"
            empty="暂无调养建议"
            items={assessment.regulationSuggestions.map((item) => ({
              title: TCM_CATEGORY_LABELS[item.category] ?? item.category,
              content: `${cleanFallbackText(item.suggestion, '保持规律作息，避免过劳。')}${item.safetyNote ? `；${cleanFallbackText(item.safetyNote, '症状加重时优先线下就医。')}` : ''}`,
            }))}
          />
          <InfoList title="禁忌提醒" items={assessment.contraindications} />
          <InfoList title="建议补充舌脉信息" items={assessment.tonguePulseQuestions} />
        </Space>
      )}
    </Card>
  );
}

function IntegratedAdviceCard({ result, integratedStatus }: { result: IntegratedDiagnosisResult; integratedStatus: GenerationStatus['integrated'] }) {
  const recommendations = (result.integrativeRecommendations ?? []).filter((item) => !containsFallbackText(item));
  return (
    <Card className="diagnosis-advice-card integrated" bordered={false}>
      <AdviceHeader icon={<CheckCircleOutlined />} eyebrow="汇总建议" title="下一步怎么做" />
      {integratedStatus === 'fallback' ? (
        <Alert type="warning" showIcon className="diagnosis-quality-alert" message="汇总为保守安全建议" description="请优先关注症状变化和红旗信号，必要时线下就医。" />
      ) : null}
      <Space direction="vertical" size={12} className="diagnosis-advice-body">
        {recommendations.length ? (
          recommendations.map((item, index) => (
            <div className="diagnosis-recommendation-card" key={`${item.title}-${index}`}>
              <Space size={8} wrap>
                <Typography.Text strong>{item.title}</Typography.Text>
                <Tag color={priorityColor(item.priority)}>{PRIORITY_LABELS[item.priority] ?? item.priority}</Tag>
              </Space>
              <Typography.Paragraph>{cleanFallbackText(item.details, '请结合症状变化采取保守安全措施。')}</Typography.Paragraph>
              <Typography.Text type="secondary">{CATEGORY_LABELS[item.category] ?? item.category}</Typography.Text>
            </div>
          ))
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无汇总建议" />
        )}
        <InfoList title="需要补充的信息" items={[...(result.requiredFollowUpQuestions ?? []), ...(result.followUpQuestions ?? [])]} />
      </Space>
    </Card>
  );
}

function AdviceHeader({ icon, eyebrow, title }: { icon: ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="diagnosis-advice-header">
      <span className="diagnosis-advice-icon">{icon}</span>
      <div>
        <Typography.Text className="diagnosis-eyebrow">{eyebrow}</Typography.Text>
        <Typography.Title level={4}>{title}</Typography.Title>
      </div>
    </div>
  );
}

function UnavailableNotice({ message }: { message: string }) {
  return <Alert type="warning" showIcon message={message} description="可稍后重试，或检查模型、API Key、Base URL 等配置；当前不把降级内容当作正式建议展示。" />;
}

function FocusCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className={`diagnosis-focus-card ${tone ? `tone-${tone}` : ''}`}>
      <div className="diagnosis-focus-icon">{icon}</div>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Paragraph>{value}</Typography.Paragraph>
    </div>
  );
}

function MiniAdviceList({ title, empty, items }: { title: string; empty: string; items: Array<{ title: string; tag?: string; content: string }> }) {
  const visibleItems = items.filter((item) => !containsFallbackText(item));
  return (
    <section className="diagnosis-section compact">
      <Typography.Title level={5}>{title}</Typography.Title>
      {visibleItems.length ? (
        <Space direction="vertical" size={8} className="diagnosis-mini-list">
          {visibleItems.map((item, index) => (
            <div className="diagnosis-mini-item" key={`${item.title}-${index}`}>
              <Space size={8} wrap>
                <Typography.Text strong>{item.title}</Typography.Text>
                {item.tag ? <Tag>{item.tag}</Tag> : null}
              </Space>
              <Typography.Paragraph>{item.content}</Typography.Paragraph>
            </div>
          ))}
        </Space>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />
      )}
    </section>
  );
}

function InfoList({ title, items }: { title: string; items?: string[] }) {
  const visibleItems = filterFallbackItems(items ?? []);
  if (!visibleItems.length) return null;
  return (
    <div className="diagnosis-info-list">
      <Typography.Title level={5}>{title}</Typography.Title>
      <List size="small" dataSource={visibleItems} renderItem={(item) => <List.Item>{item}</List.Item>} />
    </div>
  );
}

function SafetyTag({ level }: { level: string }) {
  return (
    <Tag className="diagnosis-safety-tag" color={safetyColor(level)}>
      {safetyText(level)}
    </Tag>
  );
}

function getGenerationStatus(session: DiagnosisSession): GenerationStatus {
  if (session.generationStatus) return session.generationStatus;

  const western = containsFallbackText(session.westernOutput) ? 'fallback' : 'complete';
  const tcm = containsFallbackText(session.tcmOutput) ? 'fallback' : 'complete';
  const integrated = containsFallbackText(session.integratedOutput) ? 'fallback' : 'complete';
  const degraded = western === 'fallback' || tcm === 'fallback' || integrated === 'fallback';
  const overall = integrated === 'fallback' ? 'fallback' : degraded ? 'partial' : 'complete';
  const warnings = degraded ? ['历史结果包含降级内容，已隐藏不可用文案。'] : [];
  return { western, tcm, integrated, overall, degraded, warnings };
}

function safetyColor(level: string) {
  if (level === 'emergency') return 'red';
  if (level === 'urgent') return 'orange';
  if (level === 'clinician_recommended') return 'blue';
  return 'green';
}

function safetyText(level: string) {
  if (level === 'emergency') return '立即就医';
  if (level === 'urgent') return '尽快就医';
  if (level === 'clinician_recommended') return '建议咨询医生';
  return '支持性建议';
}

function priorityColor(priority: string) {
  if (priority === 'immediate') return 'red';
  if (priority === 'soon') return 'orange';
  return 'blue';
}

const TCM_CATEGORY_LABELS: Record<string, string> = {
  diet: '饮食',
  routine: '作息',
  emotion: '情志',
  movement: '运动',
  acupressure: '穴位按揉',
  other: '其他',
};

function filterFallbackItems(items: string[]) {
  return items.filter((item) => !containsFallbackText(item));
}

function cleanFallbackText(value: string, replacement: string) {
  return containsFallbackText(value) ? replacement : value;
}

function containsFallbackText(value: unknown) {
  return FALLBACK_KEYWORDS.some((keyword) => JSON.stringify(value ?? '').includes(keyword));
}
