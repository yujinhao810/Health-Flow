import { Alert, Button, Card, Collapse, Empty, List, Space, Steps, Tabs, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  HeartOutlined,
  MedicineBoxOutlined,
  PlusCircleOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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
  const canShowExpertPanel = Boolean(western || tcm);

  return (
    <Space direction="vertical" size={16} className="diagnosis-result">
      <RedFlagAlert result={result} />

      {result ? (
        <>
          <div className="diagnosis-decision-layout">
            <Card className="diagnosis-summary-card" bordered={false}>
              <div className="diagnosis-summary-head">
                <div>
                  <Typography.Text className="diagnosis-eyebrow">安全结论</Typography.Text>
                  <Typography.Title level={3}>先看这一步</Typography.Title>
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

              <FollowUpHint result={result} onSupplement={() => navigate('/diagnosis')} />
            </Card>

            <IntegratedAdviceCard result={result} integratedStatus={generationStatus.integrated} />
          </div>

          <Tabs
            className="diagnosis-detail-tabs"
            items={[
              {
                key: 'western',
                label: '西医详情',
                children: <WesternAdviceCard assessment={western} available={westernAvailable} />,
              },
              {
                key: 'tcm',
                label: '中医详情',
                children: <TcmAdviceCard assessment={tcm} available={tcmAvailable} />,
              },
              {
                key: 'integrated',
                label: '汇总详情',
                children: <IntegratedDetailCard result={result} />,
              },
            ]}
          />

          <ExpertProcessCollapse western={western} tcm={tcm} generationStatus={generationStatus} visible={canShowExpertPanel} />

          <ActionChecklist result={result} western={westernAvailable ? western : null} />

          <div className="diagnosis-disclaimer-text">
            <Typography.Text>{result.disclaimer}</Typography.Text>
          </div>
        </>
      ) : (
        <Card>
          <Typography.Text type="secondary">本次分析尚未生成完整结果。</Typography.Text>
        </Card>
      )}
    </Space>
  );
}

function ExpertProcessCollapse({
  western,
  tcm,
  generationStatus,
  visible,
}: {
  western?: WesternAssessment | null;
  tcm?: TcmAssessment | null;
  generationStatus: GenerationStatus;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <Collapse
      className="diagnosis-expert-collapse"
      ghost
      items={[
        {
          key: 'expert',
          label: '专家会诊细节（供参考）',
          children: (
            <Space direction="vertical" size={14} className="diagnosis-expert-collapse-body">
              <Typography.Text type="secondary">以下内容展示 AI 的分析推理过程，核心建议已在上方呈现。</Typography.Text>
              <ExpertPanel western={western} tcm={tcm} generationStatus={generationStatus} />
            </Space>
          ),
        },
      ]}
    />
  );
}

function FollowUpHint({ result, onSupplement }: { result: IntegratedDiagnosisResult; onSupplement: () => void }) {
  if (!result.needsFollowUp) return null;
  const questions = getFollowUpQuestions(result).slice(0, 3);
  const hint = questions.length ? questions.join('、') : result.followUpReason || '更多症状细节';
  return (
    <div className="diagnosis-followup-hint">
      <Typography.Text type="secondary">补充以下信息可以获得更精准的建议：{hint}</Typography.Text>
      <Button size="small" icon={<PlusCircleOutlined />} onClick={onSupplement}>
        补充信息
      </Button>
    </div>
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
  const immediateItems = recommendations.filter((item) => item.priority === 'immediate');
  const soonItems = recommendations.filter((item) => item.priority === 'soon');
  const routineItems = recommendations.filter((item) => item.priority === 'routine');
  const urgentCount = immediateItems.length + soonItems.length;
  return (
    <Card className="diagnosis-advice-card integrated" bordered={false}>
      <AdviceHeader icon={<CheckCircleOutlined />} eyebrow="汇总建议" title="下一步怎么做" />
      {integratedStatus === 'fallback' ? (
        <Alert type="warning" showIcon className="diagnosis-quality-alert" message="汇总为保守安全建议" description="请优先关注症状变化和红旗信号，必要时线下就医。" />
      ) : null}
      <Space direction="vertical" size={12} className="diagnosis-advice-body">
        {recommendations.length ? (
          <>
            <div className="diagnosis-integrated-summary">
              <Typography.Text strong>
                你有 {urgentCount} 项需要尽快关注，{routineItems.length} 项日常建议
              </Typography.Text>
              <Typography.Text type="secondary">先处理高优先级事项，日常建议可按状态慢慢执行。</Typography.Text>
            </div>
            {urgentCount ? (
              <>
                {immediateItems.length ? <RecommendationGroup title="立即处理" items={immediateItems} /> : null}
                {soonItems.length ? <RecommendationGroup title="尽快关注" items={soonItems} /> : null}
              </>
            ) : (
              <div className="diagnosis-low-urgency-note">
                <Typography.Text type="secondary">暂无需要立即处理的事项，可先按日常建议观察和调整。</Typography.Text>
              </div>
            )}
            {routineItems.length ? (
              <Collapse
                className="diagnosis-routine-collapse"
                ghost
                items={[
                  {
                    key: 'routine',
                    label: `展开 ${routineItems.length} 项日常建议`,
                    children: <RecommendationGroup items={routineItems} />,
                  },
                ]}
              />
            ) : null}
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无汇总建议" />
        )}
      </Space>
    </Card>
  );
}

function RecommendationGroup({ title, items, empty }: { title?: string; items: IntegratedDiagnosisResult['integrativeRecommendations']; empty?: string }) {
  const visibleItems = items.filter((item) => !containsFallbackText(item));
  if (!visibleItems.length) {
    return empty ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} /> : null;
  }
  return (
    <section className="diagnosis-priority-group">
      {title ? <Typography.Title level={5}>{title}</Typography.Title> : null}
      <Space direction="vertical" size={10} className="diagnosis-mini-list">
        {visibleItems.map((item, index) => (
          <RecommendationItem item={item} key={`${item.title}-${index}`} />
        ))}
      </Space>
    </section>
  );
}

function RecommendationItem({ item }: { item: IntegratedDiagnosisResult['integrativeRecommendations'][number] }) {
  return (
    <div className={`diagnosis-recommendation-card priority-${item.priority}`}>
      <Space size={8} wrap>
        <Typography.Text strong>{item.title}</Typography.Text>
        <Tag color={priorityColor(item.priority)}>{PRIORITY_LABELS[item.priority] ?? item.priority}</Tag>
      </Space>
      <Typography.Paragraph>{cleanFallbackText(item.details, '请结合症状变化采取保守安全措施。')}</Typography.Paragraph>
      <Typography.Text type="secondary">{CATEGORY_LABELS[item.category] ?? item.category}</Typography.Text>
    </div>
  );
}

function IntegratedDetailCard({ result }: { result: IntegratedDiagnosisResult }) {
  return (
    <Card className="diagnosis-advice-card integrated" bordered={false}>
      <AdviceHeader icon={<CheckCircleOutlined />} eyebrow="汇总详情" title="依据与补充信息" />
      <Space direction="vertical" size={12} className="diagnosis-advice-body">
        <InfoList title="需要补充的信息" items={getFollowUpQuestions(result)} />
        <InfoList title="分歧处理" items={result.conflictResolution} />
        <MiniAdviceList
          title="红旗信号覆盖"
          empty="暂无红旗信号记录"
          items={(result.redFlagCoverage ?? []).map((item) => ({
            title: item.category,
            tag: item.positive ? '需关注' : item.checked ? '已排查' : '待确认',
            content: item.note,
          }))}
        />
      </Space>
    </Card>
  );
}

function ActionChecklist({ result, western }: { result: IntegratedDiagnosisResult; western?: WesternAssessment | null }) {
  const recommendations = (result.integrativeRecommendations ?? []).filter((item) => !containsFallbackText(item));
  const immediate = recommendations.find((item) => item.priority === 'immediate');
  const soon = recommendations.find((item) => item.priority === 'soon');
  const routine = recommendations.find((item) => item.priority === 'routine');
  const seekCare = filterFallbackItems(western?.seekCareCriteria ?? []);
  const emergencyReasons = filterFallbackItems(result.immediateCareReasons ?? []);
  const redFlags = filterFallbackItems((result.redFlagCoverage ?? []).filter((item) => item.positive).map((item) => item.note));
  const emergencyText =
    emergencyReasons[0] ||
    redFlags[0] ||
    seekCare[0] ||
    (result.mustSeekImmediateCare || result.safetyLevel === 'emergency' || result.safetyLevel === 'urgent'
      ? '症状明显加重、出现红旗信号或无法自行判断时，立即线下就医。'
      : '出现明显加重、持续不缓解或新的危险症状时，及时线下就医。');

  const items = [
    {
      title: '今天',
      description: summarizeAction(immediate, '观察症状变化，记录体温、心率、疼痛/不适程度和诱因。'),
    },
    {
      title: '本周',
      description: summarizeAction(soon, '如果不适持续或反复，预约相应科室做进一步评估。'),
    },
    {
      title: '日常',
      description: summarizeAction(routine, '保持规律作息，避免过劳，按身体反应逐步调整生活方式。'),
    },
    {
      title: '紧急情况',
      description: emergencyText,
    },
  ].filter((item) => Boolean(item.description));

  return (
    <Card className="diagnosis-action-card" bordered={false}>
      <div className="diagnosis-section-title">
        <CheckCircleOutlined />
        <Typography.Title level={4}>行动清单</Typography.Title>
      </div>
      <Steps
        direction="vertical"
        size="small"
        className="diagnosis-action-steps"
        items={items.map((item) => ({
          title: item.title,
          description: item.description,
        }))}
      />
    </Card>
  );
}

function summarizeAction(item: IntegratedDiagnosisResult['integrativeRecommendations'][number] | undefined, fallback: string) {
  if (!item) return fallback;
  const details = cleanFallbackText(item.details, fallback);
  return `${item.title}：${details}`;
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

function getFollowUpQuestions(result: IntegratedDiagnosisResult) {
  return filterFallbackItems([...(result.requiredFollowUpQuestions ?? []), ...(result.followUpQuestions ?? [])]).filter((item, index, array) => array.indexOf(item) === index);
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
