import { ArrowLeftOutlined, BranchesOutlined, DatabaseOutlined, SearchOutlined, ToolOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Collapse, Descriptions, Empty, Row, Space, Spin, Tag, Timeline, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AgentRun, AgentRunStep } from '../api/agentRuns';
import { useAgentRun } from '../hooks/useAgentRuns';

type StepGroup = {
  key: string;
  title: string;
  description: string;
  icon: ReactNode;
  steps: AgentRunStep[];
  emptyText: string;
};

export function AgentRunDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const detail = useAgentRun(id);

  if (!id) {
    return (
      <Card>
        <Empty description="Agent 运行记录不存在" />
      </Card>
    );
  }

  if (detail.isLoading) {
    return (
      <Card>
        <div className="agent-run-loading">
          <Spin tip="正在加载 Agent 运行详情..." />
        </div>
      </Card>
    );
  }

  if (detail.isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="加载 Agent 运行详情失败"
        description={detail.error instanceof Error ? detail.error.message : '请稍后重试，或回到健康总览重新查看。'}
        action={<Button onClick={() => navigate('/')}>返回总览</Button>}
      />
    );
  }

  if (!detail.data) {
    return (
      <Card>
        <Empty description="Agent 运行记录不存在" />
      </Card>
    );
  }

  const run = detail.data;
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const groups = buildStepGroups(run, steps);
  const durationMs = run.completedAt ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime() : undefined;

  return (
    <Space direction="vertical" size={18} className="agent-run-detail-page">
      <div className="page-intro agent-run-page-intro">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ marginBottom: 12 }}>
          返回总览
        </Button>
        <Typography.Title level={2}>Agent 运行详情</Typography.Title>
        <Space size={8} wrap>
          <Tag color={runKindColor(run.kind)}>{runKindText(run.kind)}</Tag>
          <Tag color={runStatusColor(run.status)}>{runStatusText(run.status)}</Tag>
          {run.provider ? <Tag color="blue">{run.provider}</Tag> : null}
          {run.model ? <Tag color="purple">{run.model}</Tag> : null}
        </Space>
      </div>

      <Card className="agent-run-summary-card">
        <Descriptions column={{ xs: 1, sm: 2, xl: 4 }} size="small">
          <Descriptions.Item label="开始时间">{new Date(run.startedAt).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="完成时间">{run.completedAt ? new Date(run.completedAt).toLocaleString() : '仍在运行'}</Descriptions.Item>
          <Descriptions.Item label="耗时">{formatDuration(durationMs)}</Descriptions.Item>
          <Descriptions.Item label="步骤数">{steps.length}</Descriptions.Item>
          <Descriptions.Item label="输入 Token">{run.inputTokens ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="输出 Token">{run.outputTokens ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="关联对象">{renderRunTarget(run)}</Descriptions.Item>
          <Descriptions.Item label="运行 ID">
            <Typography.Text copyable className="agent-run-id">
              {run.id}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
        {run.error ? <Alert className="agent-run-error" type="error" showIcon message="运行失败" description={run.error} /> : null}
      </Card>

      <Row gutter={[18, 18]}>
        {groups.map((group) => (
          <Col key={group.key} xs={24} xl={12}>
            <Card className={`agent-run-explain-card agent-run-explain-card-${group.key}`} title={<SectionTitle icon={group.icon} title={group.title} />} extra={<span className="soft-card-extra">{group.description}</span>}>
              {group.steps.length ? (
                <Space direction="vertical" size={12} className="agent-run-step-list">
                  {group.steps.map((step, index) => (
                    <RunStepCard key={`${step.type}-${step.at}-${index}`} step={step} />
                  ))}
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={group.emptyText} />
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="完整执行时间线" className="agent-run-timeline-card">
        {steps.length ? (
          <Timeline
            items={steps.map((step) => ({
              color: stepStatusColor(step.status),
              children: (
                <div className="agent-run-timeline-item">
                  <Space size={8} wrap>
                    <Typography.Text strong>{stepTitle(step)}</Typography.Text>
                    <Tag color={stepStatusColor(step.status)}>{stepStatusText(step.status)}</Tag>
                    <Typography.Text type="secondary">{formatDateTime(step.at)}</Typography.Text>
                  </Space>
                  <Typography.Text type="secondary" className="agent-run-step-summary">
                    {summarizeStep(step)}
                  </Typography.Text>
                </div>
              ),
            }))}
          />
        ) : (
          <Empty description="暂无执行步骤" />
        )}
      </Card>

      <Card title="原始运行数据" className="agent-run-raw-card">
        <Collapse
          ghost
          items={[
            { key: 'input', label: '用户输入 / 请求', children: <JsonBlock value={run.input} /> },
            { key: 'memory', label: '记忆快照', children: <JsonBlock value={run.memorySnapshot} /> },
            { key: 'steps', label: '全部步骤 JSON', children: <JsonBlock value={steps} /> },
          ]}
        />
      </Card>
    </Space>
  );
}

function buildStepGroups(run: AgentRun, steps: AgentRunStep[]): StepGroup[] {
  const memorySteps = steps.filter((step) => /memory|context/i.test(step.type));
  const retrievalSteps = steps.filter((step) => /retrieval|rag|knowledge/i.test(step.type));
  const toolSteps = steps.filter((step) => /tool/i.test(step.type));
  const finalStep: AgentRunStep = {
    at: run.completedAt ?? run.startedAt,
    type: 'final_response',
    title: '最终输出',
    status: run.status,
    data: {
      summary: buildFinalSummary(run),
      provider: run.provider,
      model: run.model,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
    },
  };
  const formationSteps = steps.filter(
    (step) =>
      !memorySteps.includes(step) &&
      !retrievalSteps.includes(step) &&
      !toolSteps.includes(step) &&
      /agent|triage|western|tcm|cross|integrator|arbitration|safety|override|generation|done/i.test(step.type),
  );

  return [
    {
      key: 'memory',
      title: '使用的健康记忆',
      description: run.memorySnapshot ? '个人画像与近期上下文' : '按步骤记录',
      icon: <DatabaseOutlined />,
      steps: memorySteps,
      emptyText: run.memorySnapshot ? '本次有记忆快照，但没有单独的记忆加载步骤。' : '本次运行没有使用长期健康记忆。',
    },
    {
      key: 'retrieval',
      title: '参考资料检索',
      description: '知识库与命中文档',
      icon: <SearchOutlined />,
      steps: retrievalSteps,
      emptyText: '本次没有检索知识库资料，或当前未开启资料检索。',
    },
    {
      key: 'tools',
      title: '工具执行结果',
      description: '读取、保存、生成计划',
      icon: <ToolOutlined />,
      steps: toolSteps,
      emptyText: '本次没有调用健康记录、快照或计划生成工具。',
    },
    {
      key: 'formation',
      title: '建议形成过程',
      description: '安全校验与 Agent 协作',
      icon: <BranchesOutlined />,
      steps: [...formationSteps, finalStep],
      emptyText: '本次没有额外的建议形成步骤记录。',
    },
  ];
}

function buildFinalSummary(run: AgentRun) {
  const modelText = [run.provider, run.model].filter(Boolean).join(' / ') || '当前模型';
  if (run.kind === 'integrative_diagnosis') {
    return `最终建议由红旗门控、多 Agent 初评/交叉质询、决策者仲裁和后端安全裁决共同形成，并由 ${modelText} 完成结构化生成。`;
  }
  if (run.kind === 'chat_safety_override') {
    return '用户输入触发危机安全策略，系统绕过普通生成流程，直接返回安全优先的支持与求助建议。';
  }
  return `最终回复基于加载的长期记忆、可用知识检索结果、健康工具返回结果和 ${modelText} 的流式生成共同形成。`;
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <Space size={8}>
      <span className="agent-run-section-icon">{icon}</span>
      <span>{title}</span>
    </Space>
  );
}

function RunStepCard({ step }: { step: AgentRunStep }) {
  const facts = stepFacts(step);
  return (
    <div className="agent-run-step-card">
      <div className="agent-run-step-head">
        <Space size={8} wrap>
          <Typography.Text strong>{stepTitle(step)}</Typography.Text>
          <Tag color={stepStatusColor(step.status)}>{stepStatusText(step.status)}</Tag>
        </Space>
        <Typography.Text type="secondary">{formatDateTime(step.at)}</Typography.Text>
      </div>
      <Typography.Text className="agent-run-step-summary">{summarizeStep(step)}</Typography.Text>
      {facts.length ? (
        <div className="agent-run-step-facts">
          {facts.map((fact, index) => (
            <span key={`${fact.label}-${index}`} className="agent-run-step-fact">
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </span>
          ))}
        </div>
      ) : null}
      <Collapse
        ghost
        size="small"
        className="agent-run-json-collapse"
        items={[{ key: 'data', label: '查看技术原始数据', children: <JsonBlock value={step.data} /> }]}
      />
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null) return <Typography.Text type="secondary">无数据</Typography.Text>;
  return <pre className="agent-run-json">{safeStringify(value)}</pre>;
}

function summarizeStep(step: AgentRunStep) {
  const data = asRecord(step.data);
  const type = stepType(step);
  if (!data) return stepTitle(step);

  if (type === 'memory_loaded') {
    return describeMemory(data);
  }

  if (type === 'retrieval_done') {
    const citations = Array.isArray(data.citations) ? data.citations : [];
    const titles = citations.map(citationTitle).filter(Boolean).slice(0, 3);
    return citations.length ? `知识库命中 ${citations.length} 条参考资料：${titles.join('、')}` : '知识库没有命中可用资料，Agent 会更多依赖记忆、工具结果和通用安全规则。';
  }

  if (type === 'retrieval_started') {
    return `系统先用用户问题检索知识库，查询内容是：${stringValue(data.query) || '未记录查询词'}`;
  }

  if (type === 'tool_call') {
    const toolName = stringValue(data.name) || stringValue(step.title) || 'unknown';
    return `Agent 决定调用“${toolTitle(toolName)}”，用于${toolPurpose(toolName)}。${describeToolInput(toolName, data.input)}`;
  }

  if (type === 'tool_result') {
    const toolName = stringValue(data.name) || stringValue(step.title) || 'unknown';
    const failed = data.ok === false || data.isError === true || step.status === 'failed';
    return `${failed ? '工具执行失败' : '工具执行完成'}：${describeToolResult(toolName, data)}`;
  }

  if (type === 'red_flag_triage') {
    const findings = Array.isArray(data.findings) ? data.findings.length : 0;
    return findings ? `安全门控发现 ${findings} 个需要优先关注的风险线索。` : '安全门控未发现必须立即就医的急症红旗。';
  }

  if (type === 'safety_override') {
    return '安全策略接管本次运行，优先给出线下求助、急救或安全支持建议。';
  }

  if (/western_initial/.test(type)) {
    return describeStructuredAgent('西医 Agent', data);
  }

  if (/tcm_initial/.test(type)) {
    return describeStructuredAgent('中医 Agent', data);
  }

  if (/western_cross/.test(type)) {
    return describeStructuredAgent('西医 Agent 交叉质询', data);
  }

  if (/tcm_cross/.test(type)) {
    return describeStructuredAgent('中医 Agent 交叉质询', data);
  }

  if (/integrator/.test(type)) {
    return describeStructuredAgent('决策者 Agent', data);
  }

  if (data.summary) return stringValue(data.summary);
  if (data.warning) return stringValue(data.warning);
  if (data.reason) return stringValue(data.reason);
  if (data.safetyLevel) return `安全等级：${stringValue(data.safetyLevel)}`;

  const output = asRecord(data.output);
  if (output?.summary) return stringValue(output.summary);
  if (output?.urgency) return `紧急程度：${stringValue(output.urgency)}`;

  return '该步骤已完成，详细技术字段可在下方展开查看。';
}

function citationTitle(value: unknown) {
  const citation = asRecord(value);
  if (!citation) return '';
  return stringValue(citation.title) || stringValue(citation.source) || stringValue(citation.documentTitle) || stringValue(citation.key);
}

function stepFacts(step: AgentRunStep) {
  const data = asRecord(step.data);
  const type = stepType(step);
  const facts: Array<{ label: string; value: string }> = [];
  if (!data) return facts;

  if (type === 'memory_loaded') {
    const windows = asRecord(data.windows);
    const last30 = asRecord(windows?.last30Days);
    const relevantRecords = Array.isArray(data.relevantRecords) ? data.relevantRecords : [];
    addFact(facts, '近 30 天平均睡眠', formatNumber(last30?.sleepAverageHours, '小时'));
    addFact(facts, '近 30 天平均心情', formatScore(last30?.moodAverage, 10));
    addFact(facts, '近 30 天运动', formatExercise(last30));
    addFact(facts, '相关历史记录', relevantRecords.length ? `${relevantRecords.length} 条` : '暂无强匹配');
    return facts;
  }

  if (type === 'retrieval_done') {
    const citations = Array.isArray(data.citations) ? data.citations : [];
    addFact(facts, '命中资料', `${citations.length} 条`);
    return facts;
  }

  if (type === 'tool_call') {
    const toolName = stringValue(data.name) || stringValue(step.title);
    addFact(facts, '工具', toolTitle(toolName));
    addFact(facts, '用途', toolPurpose(toolName));
    return facts;
  }

  if (type === 'tool_result') {
    const parsed = parseJsonRecord(data.content);
    addFact(facts, '结果', data.ok === false || data.isError === true || step.status === 'failed' ? '失败' : '成功');
    if (Array.isArray(parsed?.records)) addFact(facts, '读取记录', `${parsed.records.length} 条`);
    if (asRecord(parsed?.record)?.type) addFact(facts, '保存类型', recordTypeText(stringValue(asRecord(parsed?.record)?.type)));
    if (asRecord(parsed?.snapshot)?.summary) addFact(facts, '快照摘要', stringValue(asRecord(parsed?.snapshot)?.summary));
    if (asRecord(parsed?.plan)?.title) addFact(facts, '计划', stringValue(asRecord(parsed?.plan)?.title));
    return facts;
  }

  if (type === 'red_flag_triage') {
    addFact(facts, '是否建议立即就医', data.mustSeekImmediateCare ? '是' : '否');
    const findings = Array.isArray(data.findings) ? data.findings.length : 0;
    addFact(facts, '风险线索', `${findings} 个`);
    return facts;
  }

  if (data.safetyLevel) addFact(facts, '安全等级', stringValue(data.safetyLevel));
  const output = asRecord(data.output);
  if (output?.safetyLevel) addFact(facts, '安全等级', stringValue(output.safetyLevel));
  if (output?.urgency) addFact(facts, '紧急程度', stringValue(output.urgency));
  if (output?.primaryHypothesis) addFact(facts, '主要判断', stringValue(output.primaryHypothesis));
  return facts;
}

function describeMemory(data: Record<string, unknown>) {
  const windows = asRecord(data.windows);
  const last30 = asRecord(windows?.last30Days);
  const relevantRecords = Array.isArray(data.relevantRecords) ? data.relevantRecords : [];
  const parts = [
    formatNumber(last30?.sleepAverageHours, '小时') ? `近 30 天平均睡眠 ${formatNumber(last30?.sleepAverageHours, '小时')}` : undefined,
    formatScore(last30?.moodAverage, 10) ? `平均心情 ${formatScore(last30?.moodAverage, 10)}` : undefined,
    formatExercise(last30) ? `运动 ${formatExercise(last30)}` : undefined,
    relevantRecords.length ? `并找到 ${relevantRecords.length} 条与本次问题相关的历史记录` : '未找到与本次问题强相关的历史记录',
  ].filter(Boolean);
  return parts.length ? `系统读取了你的长期健康画像：${parts.join('；')}。` : '系统读取了长期健康画像，但可用记录较少，结论会更保守。';
}

function describeStructuredAgent(agentName: string, data: Record<string, unknown>) {
  if (data.warning) return `${agentName} 使用保守兜底结果：${stringValue(data.warning)}`;
  const output = asRecord(data.output);
  if (!output) return `${agentName} 已完成这一轮分析。`;
  if (output.summary) return `${agentName} 给出的摘要：${stringValue(output.summary)}`;
  if (output.primaryHypothesis) return `${agentName} 的主要判断：${stringValue(output.primaryHypothesis)}`;
  if (output.pattern) return `${agentName} 的辨证倾向：${stringValue(output.pattern)}`;
  if (output.safetyLevel) return `${agentName} 完成综合仲裁，最终安全等级为 ${stringValue(output.safetyLevel)}。`;
  return `${agentName} 已完成结构化分析，关键结论见下方技术原始数据。`;
}

function describeToolInput(toolName: string, input: unknown) {
  const data = asRecord(input);
  if (!data) return '本次没有额外参数。';
  if (toolName === 'health_record_create') {
    return `准备保存一条${recordTypeText(stringValue(data.type))}记录。`;
  }
  if (toolName === 'health_records_list') {
    return `查询范围：${recordTypeText(stringValue(data.type)) || '全部健康记录'}，最多 ${typeof data.limit === 'number' ? data.limit : 20} 条。`;
  }
  if (toolName === 'health_plan_generate') {
    const focusAreas = Array.isArray(data.focusAreas) ? data.focusAreas.map(String).join('、') : '';
    return `计划周期：${stringValue(data.timeframe) || '7 天'}${focusAreas ? `，重点关注 ${focusAreas}` : ''}。`;
  }
  return '本次工具参数已记录，必要时可展开查看。';
}

function describeToolResult(toolName: string, data: Record<string, unknown>) {
  if (data.summary) return stringValue(data.summary);
  const parsed = parseJsonRecord(data.content);
  if (parsed?.error) return stringValue(parsed.error);
  if (Array.isArray(parsed?.records)) return `读取到 ${parsed.records.length} 条健康记录。`;
  const record = asRecord(parsed?.record);
  if (record) return `已保存一条${recordTypeText(stringValue(record.type))}记录。`;
  const snapshot = asRecord(parsed?.snapshot);
  if (snapshot?.summary) return `健康快照摘要：${stringValue(snapshot.summary)}`;
  const plan = asRecord(parsed?.plan);
  if (plan?.title) return `生成计划：${stringValue(plan.title)}。`;
  return '工具返回了结果，Agent 会把它作为最终建议的依据。';
}

function renderRunTarget(run: AgentRun) {
  if (run.diagnosisSessionId) {
    return (
      <Space size={6} wrap>
        <Typography.Text>辅助分诊</Typography.Text>
        {run.diagnosisSession?.safetyLevel ? <Tag color="blue">{run.diagnosisSession.safetyLevel}</Tag> : null}
      </Space>
    );
  }
  if (run.conversationId) return run.conversation?.title || run.conversation?.summary || '健康对话';
  return '-';
}

function runKindText(kind: string) {
  if (kind === 'chat') return '健康对话';
  if (kind === 'chat_safety_override') return '安全覆盖';
  if (kind === 'integrative_diagnosis') return '辅助分诊';
  return kind;
}

function runKindColor(kind: string) {
  if (kind === 'integrative_diagnosis') return 'purple';
  if (kind === 'chat_safety_override') return 'red';
  return 'blue';
}

function runStatusColor(status?: string) {
  if (status === 'completed') return 'green';
  if (status === 'failed') return 'red';
  return 'blue';
}

function runStatusText(status: string) {
  if (status === 'completed') return '完成';
  if (status === 'failed') return '失败';
  return '运行中';
}

function stepStatusColor(status?: string) {
  if (status === 'complete' || status === 'completed') return 'green';
  if (status === 'failed' || status === 'fallback') return 'red';
  if (status === 'running') return 'blue';
  if (status === 'skipped') return 'gray';
  return 'purple';
}

function stepStatusText(status?: string) {
  if (status === 'complete' || status === 'completed') return '完成';
  if (status === 'failed') return '失败';
  if (status === 'fallback') return '保守兜底';
  if (status === 'running') return '运行中';
  if (status === 'skipped') return '已跳过';
  if (status === 'blocked') return '已阻断';
  return '已记录';
}

function stepTitle(step: AgentRunStep) {
  return stringValue(step.title) || stepTypeText(stepType(step));
}

function stepType(step: AgentRunStep) {
  return stringValue(step.type) || 'unknown_step';
}

function stepTypeText(type: unknown) {
  const value = stringValue(type) || 'unknown_step';
  const names: Record<string, string> = {
    memory_loaded: '加载健康记忆',
    retrieval_started: '开始检索资料',
    retrieval_done: '完成资料检索',
    tool_call: '准备调用工具',
    tool_result: '工具返回结果',
    red_flag_triage: '红旗安全门控',
    safety_override: '安全策略覆盖',
    western_initial_started: '西医 Agent 启动',
    tcm_initial_started: '中医 Agent 启动',
    western_initial: '西医 Agent 初评',
    tcm_initial: '中医 Agent 初评',
    western_cross_started: '西医交叉质询启动',
    tcm_cross_started: '中医交叉质询启动',
    western_cross: '西医交叉质询',
    tcm_cross: '中医交叉质询',
    integrator_started: '决策者 Agent 启动',
    integrator: '决策者 Agent 仲裁',
    safety_arbitration: '最终安全裁决',
    final_response: '最终回复形成',
  };
  return names[value] ?? value.replace(/_/g, ' ');
}

function formatDuration(value?: number) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return '-';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} 秒`;
}

function formatDateTime(value?: string) {
  if (!value) return '时间未记录';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未记录' : date.toLocaleString();
}

function safeStringify(value: unknown) {
  try {
    const text = JSON.stringify(value, null, 2);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
}

function compactJson(value: unknown) {
  const text = safeStringify(value).replace(/\s+/g, ' ');
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function addFact(facts: Array<{ label: string; value: string }>, label: string, value?: string) {
  if (value) facts.push({ label, value });
}

function formatNumber(value: unknown, unit: string) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${unit}` : '';
}

function formatScore(value: unknown, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}/${max}` : '';
}

function formatExercise(value: Record<string, unknown> | null) {
  if (!value) return '';
  const activeDays = typeof value.exerciseActiveDays === 'number' ? value.exerciseActiveDays : undefined;
  const totalMinutes = typeof value.exerciseTotalMinutes === 'number' ? value.exerciseTotalMinutes : undefined;
  if (activeDays === undefined && totalMinutes === undefined) return '';
  return `${activeDays ?? 0} 天活跃、${totalMinutes ?? 0} 分钟`;
}

function parseJsonRecord(value: unknown) {
  if (typeof value !== 'string') return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function toolTitle(name: string) {
  const titles: Record<string, string> = {
    health_records_list: '查询健康记录',
    health_record_create: '保存健康记录',
    snapshot_latest: '读取最新健康快照',
    snapshot_generate_weekly: '生成周健康快照',
    health_plan_generate: '生成健康计划',
  };
  return titles[name] ?? (name || '未知工具');
}

function toolPurpose(name: string) {
  const purposes: Record<string, string> = {
    health_records_list: '查看真实保存过的睡眠、运动、心情或就医记录',
    health_record_create: '把用户明确要求保存的信息写入健康记录',
    snapshot_latest: '读取最近的健康趋势与建议快照',
    snapshot_generate_weekly: '重新整理最近 7 天健康趋势',
    health_plan_generate: '基于真实记录生成低风险、可执行的健康计划',
  };
  return purposes[name] ?? '补充回答所需的真实数据';
}

function recordTypeText(type: string) {
  const names: Record<string, string> = {
    sleep: '睡眠',
    exercise: '运动',
    mood: '心情',
    medical: '就医',
  };
  return names[type] ?? type;
}
