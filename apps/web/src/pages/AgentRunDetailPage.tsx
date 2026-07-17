import {
  ApartmentOutlined,
  ArrowDownOutlined,
  ArrowLeftOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  MedicineBoxOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ToolOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { GenerationStatus } from "@health/shared";
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Row,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from "antd";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { AgentRun, AgentRunStep } from "../api/agentRuns";
import { useAgentRun } from "../hooks/useAgentRuns";

type StepGroup = {
  key: string;
  title: string;
  description: string;
  icon: ReactNode;
  steps: AgentRunStep[];
  emptyText: string;
};

type DiagnosisCoordinator = NonNullable<GenerationStatus["coordinator"]>;
type CoordinatorStep = DiagnosisCoordinator["steps"][number];
type CoordinatorEvent = DiagnosisCoordinator["events"][number];

type ExecutionTimelineItem = {
  at: string;
  title: string;
  status?: string;
  summary: string;
  parallelLabel?: string;
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
        description={
          detail.error instanceof Error
            ? detail.error.message
            : "请稍后重试，或回到健康总览重新查看。"
        }
        action={<Button onClick={() => navigate("/")}>返回总览</Button>}
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
  const generationStatus = run.diagnosisSession?.generationStatus;
  const coordinator = generationStatus?.coordinator;
  const timelineItems = buildExecutionTimeline(run, steps, coordinator);
  const durationMs = run.completedAt
    ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
    : undefined;

  return (
    <Space direction="vertical" size={18} className="agent-run-detail-page">
      <div className="page-intro agent-run-page-intro">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/")}
          style={{ marginBottom: 12 }}
        >
          返回总览
        </Button>
        <Typography.Title level={2}>Agent 运行详情</Typography.Title>
        <Space size={8} wrap>
          <Tag color={runKindColor(run.kind)}>{runKindText(run.kind)}</Tag>
          <Tag color={runStatusColor(run.status)}>
            {runStatusText(run.status)}
          </Tag>
          {run.provider ? <Tag color="blue">{run.provider}</Tag> : null}
          {run.model ? <Tag color="purple">{run.model}</Tag> : null}
          {generationStatus?.pipelineVersion?.includes("langgraph") ? (
            <Tag icon={<BranchesOutlined />} color="cyan">
              LangGraph 会诊图
            </Tag>
          ) : null}
        </Space>
      </div>

      <Card className="agent-run-summary-card">
        <Descriptions column={{ xs: 1, sm: 2, xl: 4 }} size="small">
          <Descriptions.Item label="开始时间">
            {new Date(run.startedAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="完成时间">
            {run.completedAt
              ? new Date(run.completedAt).toLocaleString()
              : "仍在运行"}
          </Descriptions.Item>
          <Descriptions.Item label="耗时">
            {formatDuration(durationMs)}
          </Descriptions.Item>
          <Descriptions.Item label="步骤数">{steps.length}</Descriptions.Item>
          <Descriptions.Item label="输入 Token">
            {run.inputTokens ?? "-"}
          </Descriptions.Item>
          <Descriptions.Item label="输出 Token">
            {run.outputTokens ?? "-"}
          </Descriptions.Item>
          <Descriptions.Item label="关联对象">
            {renderRunTarget(run)}
          </Descriptions.Item>
          <Descriptions.Item label="运行 ID">
            <Typography.Text copyable className="agent-run-id">
              {run.id}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
        {run.error ? (
          <Alert
            className="agent-run-error"
            type="error"
            showIcon
            message="运行失败"
            description={run.error}
          />
        ) : null}
      </Card>

      <Row gutter={[18, 18]}>
        {groups.map((group) => (
          <Col
            key={group.key}
            xs={24}
            xl={group.key === "formation" && coordinator ? 24 : 12}
          >
            <Card
              className={`agent-run-explain-card agent-run-explain-card-${group.key}`}
              title={<SectionTitle icon={group.icon} title={group.title} />}
              extra={
                <span className="soft-card-extra">
                  {group.key === "formation" && coordinator
                    ? "并行会诊与安全汇合"
                    : group.description}
                </span>
              }
            >
              {group.key === "formation" && coordinator && generationStatus ? (
                <DiagnosisFormationFlow
                  generationStatus={generationStatus}
                  coordinator={coordinator}
                />
              ) : group.steps.length ? (
                <Space
                  direction="vertical"
                  size={12}
                  className="agent-run-step-list"
                >
                  {group.steps.map((step, index) => (
                    <RunStepCard
                      key={`${step.type}-${step.at}-${index}`}
                      step={step}
                    />
                  ))}
                </Space>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={group.emptyText}
                />
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="完整执行时间线" className="agent-run-timeline-card">
        {timelineItems.length ? (
          <Timeline
            items={timelineItems.map((item, index) => ({
              color: stepStatusColor(item.status),
              children: (
                <div className="agent-run-timeline-item">
                  <Space size={8} wrap>
                    <Typography.Text strong>{item.title}</Typography.Text>
                    <Tag color={stepStatusColor(item.status)}>
                      {stepStatusText(item.status)}
                    </Tag>
                    {item.parallelLabel ? (
                      <Tag
                        icon={<BranchesOutlined />}
                        color="cyan"
                        className="agent-run-parallel-tag"
                      >
                        {item.parallelLabel}
                      </Tag>
                    ) : null}
                    <Typography.Text type="secondary">
                      {formatDateTime(item.at)}
                    </Typography.Text>
                  </Space>
                  <Typography.Text
                    type="secondary"
                    className="agent-run-step-summary"
                  >
                    {item.summary}
                  </Typography.Text>
                </div>
              ),
              key: `${item.at}-${item.title}-${index}`,
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
            {
              key: "input",
              label: "用户输入 / 请求",
              children: <JsonBlock value={run.input} />,
            },
            {
              key: "memory",
              label: "记忆快照",
              children: <JsonBlock value={run.memorySnapshot} />,
            },
            {
              key: "steps",
              label: "全部步骤 JSON",
              children: <JsonBlock value={steps} />,
            },
          ]}
        />
      </Card>
    </Space>
  );
}

function buildStepGroups(run: AgentRun, steps: AgentRunStep[]): StepGroup[] {
  const memorySteps = steps.filter((step) => /memory|context/i.test(step.type));
  const retrievalSteps = steps.filter((step) =>
    /retrieval|rag|knowledge/i.test(step.type),
  );
  const toolSteps = steps.filter((step) => /tool/i.test(step.type));
  const finalStep: AgentRunStep = {
    at: run.completedAt ?? run.startedAt,
    type: "final_response",
    title: "最终输出",
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
      /agent|triage|western|tcm|cross|integrator|arbitration|safety|override|generation|done/i.test(
        step.type,
      ),
  );

  return [
    {
      key: "memory",
      title: "使用的健康记忆",
      description: run.memorySnapshot ? "个人画像与近期上下文" : "按步骤记录",
      icon: <DatabaseOutlined />,
      steps: memorySteps,
      emptyText: run.memorySnapshot
        ? "本次有记忆快照，但没有单独的记忆加载步骤。"
        : "本次运行没有使用长期健康记忆。",
    },
    {
      key: "retrieval",
      title: "参考资料检索",
      description: "知识库与命中文档",
      icon: <SearchOutlined />,
      steps: retrievalSteps,
      emptyText: "本次没有检索知识库资料，或当前未开启资料检索。",
    },
    {
      key: "tools",
      title: "工具执行结果",
      description: "读取、保存、生成计划",
      icon: <ToolOutlined />,
      steps: toolSteps,
      emptyText: "本次没有调用健康记录、快照或计划生成工具。",
    },
    {
      key: "formation",
      title: "建议形成过程",
      description: "安全校验与 Agent 协作",
      icon: <BranchesOutlined />,
      steps: [...formationSteps, finalStep],
      emptyText: "本次没有额外的建议形成步骤记录。",
    },
  ];
}

function buildFinalSummary(run: AgentRun) {
  const modelText =
    [run.provider, run.model].filter(Boolean).join(" / ") || "当前模型";
  if (run.kind === "integrative_diagnosis") {
    return `最终建议由红旗门控、多 Agent 初评/交叉质询、决策者仲裁和后端安全裁决共同形成，并由 ${modelText} 完成结构化生成。`;
  }
  if (run.kind === "chat_safety_override") {
    return "用户输入触发危机安全策略，系统绕过普通生成流程，直接返回安全优先的支持与求助建议。";
  }
  return `最终回复基于加载的长期记忆、可用知识检索结果、健康工具返回结果和 ${modelText} 的流式生成共同形成。`;
}

function buildExecutionTimeline(
  run: AgentRun,
  steps: AgentRunStep[],
  coordinator?: DiagnosisCoordinator,
): ExecutionTimelineItem[] {
  if (!coordinator?.events.length) {
    return steps.map((step) => ({
      at: step.at,
      title: stepTitle(step),
      status: step.status,
      summary: summarizeStep(step),
    }));
  }

  const events = [...coordinator.events]
    .sort((left, right) => safeTimestamp(left.at) - safeTimestamp(right.at))
    .map((event) => ({
      at: event.at,
      title: coordinatorEventTitle(event),
      status: event.type.endsWith("_started") ? "started" : event.status,
      summary: event.detail || coordinatorEventSummary(event),
      parallelLabel: coordinatorParallelLabel(event.type),
    }));

  if (run.completedAt) {
    events.push({
      at: run.completedAt,
      title: "会诊结果已保存",
      status: run.status,
      summary: buildFinalSummary(run),
      parallelLabel: undefined,
    });
  }
  return events;
}

function coordinatorEventTitle(event: CoordinatorEvent) {
  const titles: Record<string, string> = {
    red_flag_triage: "红旗安全门控完成",
    memory_loaded: "健康上下文加载完成",
    western_initial_started: "西医 Agent 初评启动",
    tcm_initial_started: "中医 Agent 初评启动",
    western_initial_completed: "西医 Agent 初评完成",
    tcm_initial_completed: "中医 Agent 初评完成",
    western_cross_started: "西医交叉质询启动",
    tcm_cross_started: "中医交叉质询启动",
    western_cross_completed: "西医交叉质询完成",
    tcm_cross_completed: "中医交叉质询完成",
    cross_examination_skipped: "交叉质询转入保守路径",
    integrator_started: "决策者 Agent 仲裁启动",
    integrator_completed: "决策者 Agent 仲裁完成",
    safety_arbitration_completed: "后端安全裁决完成",
    safety_override: "急症安全覆盖完成",
  };
  return titles[event.type] ?? event.title;
}

function coordinatorEventSummary(event: CoordinatorEvent) {
  if (event.type.endsWith("_started"))
    return "该分支已开始执行，等待与另一并行分支汇合。";
  if (event.title !== coordinatorEventTitle(event)) return event.title;
  return "该会诊节点已完成。";
}

function coordinatorParallelLabel(type: string) {
  if (/^(western|tcm)_initial_/.test(type)) return "初评并行";
  if (/^(western|tcm)_cross_/.test(type)) return "交叉质询并行";
  return undefined;
}

function safeTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function workflowStepDefaultNote(name?: string) {
  const notes: Record<string, string> = {
    red_flag_triage: "先检查是否存在需要立即就医的危险信号。",
    western_initial: "基于循证医学形成初步分诊判断。",
    tcm_initial: "基于辨证信息形成低风险调养方向。",
    western_cross: "审查中医建议是否可能掩盖急症或延误就医。",
    tcm_cross: "审查西医判断是否缺少必要的辨证信息。",
    integrator: "综合初评与交叉质询，逐项完成采纳和冲突仲裁。",
    safety_arbitration: "最终结果再次经过确定性安全规则校验。",
    safety_override: "安全门控接管本次会诊。",
    final_response: "结构化会诊建议已经形成。",
  };
  return notes[name ?? ""] ?? "等待该节点更新运行状态。";
}

function formatCoordinatorDuration(step?: CoordinatorStep) {
  if (!step) return "等待运行记录";
  if (step.status === "skipped") return "本阶段已跳过";
  if (step.startedAt && step.endedAt) {
    return formatDuration(
      new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime(),
    );
  }
  if (step.endedAt) return `完成于 ${formatDateTime(step.endedAt)}`;
  if (step.startedAt) return `开始于 ${formatDateTime(step.startedAt)}`;
  return step.status === "complete" ? "节点已完成" : "未记录耗时";
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <Space size={8}>
      <span className="agent-run-section-icon">{icon}</span>
      <span>{title}</span>
    </Space>
  );
}

function DiagnosisFormationFlow({
  generationStatus,
  coordinator,
}: {
  generationStatus: GenerationStatus;
  coordinator: DiagnosisCoordinator;
}) {
  const steps = new Map(coordinator.steps.map((step) => [step.name, step]));
  const initialWestern = steps.get("western_initial");
  const initialTcm = steps.get("tcm_initial");
  const emergencyBypass =
    initialWestern?.status === "skipped" && initialTcm?.status === "skipped";
  const roleModels = generationStatus.roleModels;

  return (
    <div className="diagnosis-workflow">
      <div className="diagnosis-workflow-meta">
        <span>
          <ApartmentOutlined />
          {coordinator.strategy}
        </span>
        {generationStatus.pipelineVersion ? (
          <Tag>{generationStatus.pipelineVersion}</Tag>
        ) : null}
      </div>

      <WorkflowNode
        step={steps.get("red_flag_triage")}
        title="红旗安全门控"
        icon={<SafetyCertificateOutlined />}
        tone="safety"
      />

      <WorkflowConnector />

      {emergencyBypass ? (
        <>
          <div className="diagnosis-workflow-bypass">
            <WarningOutlined />
            <div>
              <Typography.Text strong>急症安全路径接管</Typography.Text>
              <Typography.Text type="secondary">
                命中急症红旗后，多 Agent
                初评与交叉质询被跳过，直接形成安全优先建议。
              </Typography.Text>
            </div>
            <Tag color="red">已阻断普通会诊</Tag>
          </div>
          <WorkflowConnector />
        </>
      ) : (
        <>
          <ParallelWorkflowStage
            title="并行初评"
            description="两个专家读取同一份健康上下文，独立形成判断"
          >
            <WorkflowNode
              step={initialWestern}
              title="西医 Agent 初评"
              icon={<MedicineBoxOutlined />}
              tone="western"
              model={roleModels?.western}
              compact
            />
            <WorkflowNode
              step={initialTcm}
              title="中医 Agent 初评"
              icon={<MedicineBoxOutlined />}
              tone="tcm"
              model={roleModels?.tcm}
              compact
            />
          </ParallelWorkflowStage>

          <WorkflowConnector label="初评汇合" />

          <ParallelWorkflowStage
            title="并行交叉质询"
            description="双方同时审查对方结论的证据与安全边界"
          >
            <WorkflowNode
              step={steps.get("western_cross")}
              title="西医审查中医结果"
              icon={<BranchesOutlined />}
              tone="western"
              model={roleModels?.reviewer}
              compact
            />
            <WorkflowNode
              step={steps.get("tcm_cross")}
              title="中医审查西医结果"
              icon={<BranchesOutlined />}
              tone="tcm"
              model={roleModels?.reviewer}
              compact
            />
          </ParallelWorkflowStage>

          <WorkflowConnector label="质询汇合" />

          <WorkflowNode
            step={steps.get("integrator")}
            title="决策者 Agent 仲裁"
            icon={<ApartmentOutlined />}
            tone="integrator"
            model={roleModels?.integrator}
          />

          <WorkflowConnector />
        </>
      )}

      <WorkflowNode
        step={
          steps.get("safety_arbitration") ?? {
            name: "safety_override",
            status: "complete",
            note: "红旗安全门控直接形成急症安全建议。",
          }
        }
        title={emergencyBypass ? "急症安全覆盖" : "后端最终安全裁决"}
        icon={<SafetyCertificateOutlined />}
        tone="safety"
      />

      <WorkflowConnector />

      <WorkflowNode
        step={{
          name: "final_response",
          status: generationStatus.degraded ? "fallback" : "complete",
          note: generationStatus.degraded
            ? `部分节点使用保守兜底。${generationStatus.warnings[0] ?? ""}`
            : "全部会诊阶段完成，结构化建议已保存。",
        }}
        title="会诊建议形成"
        icon={<CheckCircleOutlined />}
        tone="final"
      />
    </div>
  );
}

function ParallelWorkflowStage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="diagnosis-workflow-parallel">
      <div className="diagnosis-workflow-parallel-head">
        <span className="diagnosis-workflow-parallel-icon">
          <BranchesOutlined />
        </span>
        <div>
          <Typography.Text strong>{title}</Typography.Text>
          <Typography.Text type="secondary">{description}</Typography.Text>
        </div>
        <Tag color="cyan">同时执行</Tag>
      </div>
      <div className="diagnosis-workflow-lanes">{children}</div>
    </section>
  );
}

function WorkflowNode({
  step,
  title,
  icon,
  tone,
  model,
  compact = false,
}: {
  step?: CoordinatorStep;
  title: string;
  icon: ReactNode;
  tone: "western" | "tcm" | "integrator" | "safety" | "final";
  model?: string;
  compact?: boolean;
}) {
  const status = step?.status ?? "pending";
  return (
    <div
      className={`diagnosis-workflow-node diagnosis-workflow-node-${tone}${compact ? " diagnosis-workflow-node-compact" : ""}`}
    >
      <div className="diagnosis-workflow-node-head">
        <span className="diagnosis-workflow-node-icon">{icon}</span>
        <div className="diagnosis-workflow-node-title">
          <Typography.Text strong>{title}</Typography.Text>
          {model ? (
            <Typography.Text type="secondary">{model}</Typography.Text>
          ) : null}
        </div>
        <Tag color={stepStatusColor(status)}>{stepStatusText(status)}</Tag>
      </div>
      <Typography.Text
        type="secondary"
        className="diagnosis-workflow-node-note"
      >
        {step?.note || workflowStepDefaultNote(step?.name)}
      </Typography.Text>
      <div className="diagnosis-workflow-node-time">
        <ClockCircleOutlined />
        <span>{formatCoordinatorDuration(step)}</span>
      </div>
    </div>
  );
}

function WorkflowConnector({ label }: { label?: string }) {
  return (
    <div className="diagnosis-workflow-connector" aria-hidden="true">
      <span />
      {label ? <em>{label}</em> : <ArrowDownOutlined />}
    </div>
  );
}

function RunStepCard({ step }: { step: AgentRunStep }) {
  const facts = stepFacts(step);
  return (
    <div className="agent-run-step-card">
      <div className="agent-run-step-head">
        <Space size={8} wrap>
          <Typography.Text strong>{stepTitle(step)}</Typography.Text>
          <Tag color={stepStatusColor(step.status)}>
            {stepStatusText(step.status)}
          </Tag>
        </Space>
        <Typography.Text type="secondary">
          {formatDateTime(step.at)}
        </Typography.Text>
      </div>
      <Typography.Text className="agent-run-step-summary">
        {summarizeStep(step)}
      </Typography.Text>
      {facts.length ? (
        <div className="agent-run-step-facts">
          {facts.map((fact, index) => (
            <span
              key={`${fact.label}-${index}`}
              className="agent-run-step-fact"
            >
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
        items={[
          {
            key: "data",
            label: "查看技术原始数据",
            children: <JsonBlock value={step.data} />,
          },
        ]}
      />
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null)
    return <Typography.Text type="secondary">无数据</Typography.Text>;
  return <pre className="agent-run-json">{safeStringify(value)}</pre>;
}

function summarizeStep(step: AgentRunStep) {
  const data = asRecord(step.data);
  const type = stepType(step);
  if (!data) return stepTitle(step);

  if (type === "memory_loaded") {
    return describeMemory(data);
  }

  if (type === "retrieval_done") {
    const citations = Array.isArray(data.citations) ? data.citations : [];
    const titles = citations.map(citationTitle).filter(Boolean).slice(0, 3);
    const trace = asRecord(data.retrievalTrace);
    const rerank = asRecord(trace?.rerank);
    const candidateCount = numericValue(rerank?.candidateCount);
    const model = stringValue(rerank?.model) || "gte-rerank-v2";
    const rankingSummary = rerank?.applied
      ? `RRF 融合出 ${candidateCount ?? 0} 个候选后，由 ${model} 完成语义重排`
      : rerank
        ? `Rerank 未应用，已使用 RRF 排序${stringValue(rerank.fallbackReason) ? `（${stringValue(rerank.fallbackReason)}）` : ""}`
        : "使用知识库检索结果排序";
    return citations.length
      ? `${rankingSummary}，最终命中 ${citations.length} 条参考资料：${titles.join("、")}`
      : `${rankingSummary}，但没有命中可用资料。Agent 会更多依赖记忆、工具结果和通用安全规则。`;
  }

  if (type === "retrieval_started") {
    return `系统先用用户问题检索知识库，查询内容是：${stringValue(data.query) || "未记录查询词"}`;
  }

  if (type === "tool_call") {
    const toolName =
      stringValue(data.name) || stringValue(step.title) || "unknown";
    return `Agent 决定调用“${toolTitle(toolName)}”，用于${toolPurpose(toolName)}。${describeToolInput(toolName, data.input)}`;
  }

  if (type === "tool_result") {
    const toolName =
      stringValue(data.name) || stringValue(step.title) || "unknown";
    const failed =
      data.ok === false || data.isError === true || step.status === "failed";
    return `${failed ? "工具执行失败" : "工具执行完成"}：${describeToolResult(toolName, data)}`;
  }

  if (type === "red_flag_triage") {
    const findings = Array.isArray(data.findings) ? data.findings.length : 0;
    return findings
      ? `安全门控发现 ${findings} 个需要优先关注的风险线索。`
      : "安全门控未发现必须立即就医的急症红旗。";
  }

  if (type === "safety_override") {
    return "安全策略接管本次运行，优先给出线下求助、急救或安全支持建议。";
  }

  if (/western_initial/.test(type)) {
    return describeStructuredAgent("西医 Agent", data);
  }

  if (/tcm_initial/.test(type)) {
    return describeStructuredAgent("中医 Agent", data);
  }

  if (/western_cross/.test(type)) {
    return describeStructuredAgent("西医 Agent 交叉质询", data);
  }

  if (/tcm_cross/.test(type)) {
    return describeStructuredAgent("中医 Agent 交叉质询", data);
  }

  if (/integrator/.test(type)) {
    return describeStructuredAgent("决策者 Agent", data);
  }

  if (data.summary) return stringValue(data.summary);
  if (data.warning) return stringValue(data.warning);
  if (data.reason) return stringValue(data.reason);
  if (data.safetyLevel) return `安全等级：${stringValue(data.safetyLevel)}`;

  const output = asRecord(data.output);
  if (output?.summary) return stringValue(output.summary);
  if (output?.urgency) return `紧急程度：${stringValue(output.urgency)}`;

  return "该步骤已完成，详细技术字段可在下方展开查看。";
}

function citationTitle(value: unknown) {
  const citation = asRecord(value);
  if (!citation) return "";
  return (
    stringValue(citation.title) ||
    stringValue(citation.source) ||
    stringValue(citation.documentTitle) ||
    stringValue(citation.key)
  );
}

function stepFacts(step: AgentRunStep) {
  const data = asRecord(step.data);
  const type = stepType(step);
  const facts: Array<{ label: string; value: string }> = [];
  if (!data) return facts;

  if (type === "memory_loaded") {
    const windows = asRecord(data.windows);
    const last30 = asRecord(windows?.last30Days);
    const relevantRecords = Array.isArray(data.relevantRecords)
      ? data.relevantRecords
      : [];
    addFact(
      facts,
      "近 30 天平均睡眠",
      formatNumber(last30?.sleepAverageHours, "小时"),
    );
    addFact(facts, "近 30 天平均心情", formatScore(last30?.moodAverage, 10));
    addFact(facts, "近 30 天运动", formatExercise(last30));
    addFact(
      facts,
      "相关历史记录",
      relevantRecords.length ? `${relevantRecords.length} 条` : "暂无强匹配",
    );
    return facts;
  }

  if (type === "retrieval_done") {
    const citations = Array.isArray(data.citations) ? data.citations : [];
    const trace = asRecord(data.retrievalTrace);
    const rerank = asRecord(trace?.rerank);
    addFact(facts, "命中资料", `${citations.length} 条`);
    if (trace) {
      const publicCount = numericValue(trace.publicCandidateCount) ?? 0;
      const userCount = numericValue(trace.userCandidateCount) ?? 0;
      addFact(
        facts,
        "混合召回",
        `公共知识 ${publicCount} 条 / 个人文档 ${userCount} 条`,
      );
      const lexicalCount = numericValue(trace.publicLexicalCandidateCount);
      const semanticCount = numericValue(trace.publicSemanticCandidateCount);
      if (lexicalCount !== undefined || semanticCount !== undefined) {
        addFact(
          facts,
          "公共召回",
          `词法 ${lexicalCount ?? 0} 条 / 语义 ${semanticCount ?? 0} 条`,
        );
      }
      addFact(
        facts,
        "RRF 候选",
        `${numericValue(trace.fusedCandidateCount) ?? 0} 条`,
      );
    }
    if (rerank) {
      addFact(facts, "Rerank 模型", stringValue(rerank.model));
      addFact(
        facts,
        "Rerank 状态",
        rerank.applied === true ? "已应用" : "RRF 降级",
      );
      const durationMs = numericValue(rerank.durationMs);
      if (rerank.attempted === true && durationMs !== undefined) {
        addFact(facts, "Rerank 耗时", formatDuration(durationMs));
      }
      const topScore = numericValue(rerank.topScore);
      if (rerank.applied === true && topScore !== undefined) {
        addFact(facts, "最高相关度", topScore.toFixed(4));
      }
      if (rerank.applied !== true) {
        addFact(facts, "降级原因", stringValue(rerank.fallbackReason));
      }
    }
    return facts;
  }

  if (type === "tool_call") {
    const toolName = stringValue(data.name) || stringValue(step.title);
    addFact(facts, "工具", toolTitle(toolName));
    addFact(facts, "用途", toolPurpose(toolName));
    return facts;
  }

  if (type === "tool_result") {
    const parsed = parseJsonRecord(data.content);
    addFact(
      facts,
      "结果",
      data.ok === false || data.isError === true || step.status === "failed"
        ? "失败"
        : "成功",
    );
    if (Array.isArray(parsed?.records))
      addFact(facts, "读取记录", `${parsed.records.length} 条`);
    if (asRecord(parsed?.record)?.type)
      addFact(
        facts,
        "保存类型",
        recordTypeText(stringValue(asRecord(parsed?.record)?.type)),
      );
    if (asRecord(parsed?.snapshot)?.summary)
      addFact(
        facts,
        "快照摘要",
        stringValue(asRecord(parsed?.snapshot)?.summary),
      );
    if (asRecord(parsed?.plan)?.title)
      addFact(facts, "计划", stringValue(asRecord(parsed?.plan)?.title));
    return facts;
  }

  if (type === "red_flag_triage") {
    addFact(
      facts,
      "是否建议立即就医",
      data.mustSeekImmediateCare ? "是" : "否",
    );
    const findings = Array.isArray(data.findings) ? data.findings.length : 0;
    addFact(facts, "风险线索", `${findings} 个`);
    return facts;
  }

  if (data.safetyLevel)
    addFact(facts, "安全等级", stringValue(data.safetyLevel));
  const output = asRecord(data.output);
  if (output?.safetyLevel)
    addFact(facts, "安全等级", stringValue(output.safetyLevel));
  if (output?.urgency) addFact(facts, "紧急程度", stringValue(output.urgency));
  if (output?.primaryHypothesis)
    addFact(facts, "主要判断", stringValue(output.primaryHypothesis));
  return facts;
}

function describeMemory(data: Record<string, unknown>) {
  const windows = asRecord(data.windows);
  const last30 = asRecord(windows?.last30Days);
  const relevantRecords = Array.isArray(data.relevantRecords)
    ? data.relevantRecords
    : [];
  const parts = [
    formatNumber(last30?.sleepAverageHours, "小时")
      ? `近 30 天平均睡眠 ${formatNumber(last30?.sleepAverageHours, "小时")}`
      : undefined,
    formatScore(last30?.moodAverage, 10)
      ? `平均心情 ${formatScore(last30?.moodAverage, 10)}`
      : undefined,
    formatExercise(last30) ? `运动 ${formatExercise(last30)}` : undefined,
    relevantRecords.length
      ? `并找到 ${relevantRecords.length} 条与本次问题相关的历史记录`
      : "未找到与本次问题强相关的历史记录",
  ].filter(Boolean);
  return parts.length
    ? `系统读取了你的长期健康画像：${parts.join("；")}。`
    : "系统读取了长期健康画像，但可用记录较少，结论会更保守。";
}

function describeStructuredAgent(
  agentName: string,
  data: Record<string, unknown>,
) {
  if (data.warning)
    return `${agentName} 使用保守兜底结果：${stringValue(data.warning)}`;
  const output = asRecord(data.output);
  if (!output) return `${agentName} 已完成这一轮分析。`;
  if (output.summary)
    return `${agentName} 给出的摘要：${stringValue(output.summary)}`;
  if (output.primaryHypothesis)
    return `${agentName} 的主要判断：${stringValue(output.primaryHypothesis)}`;
  if (output.pattern)
    return `${agentName} 的辨证倾向：${stringValue(output.pattern)}`;
  if (output.safetyLevel)
    return `${agentName} 完成综合仲裁，最终安全等级为 ${stringValue(output.safetyLevel)}。`;
  return `${agentName} 已完成结构化分析，关键结论见下方技术原始数据。`;
}

function describeToolInput(toolName: string, input: unknown) {
  const data = asRecord(input);
  if (!data) return "本次没有额外参数。";
  if (toolName === "health_record_create") {
    return `准备保存一条${recordTypeText(stringValue(data.type))}记录。`;
  }
  if (toolName === "health_records_list") {
    return `查询范围：${recordTypeText(stringValue(data.type)) || "全部健康记录"}，最多 ${typeof data.limit === "number" ? data.limit : 20} 条。`;
  }
  if (toolName === "health_plan_generate") {
    const focusAreas = Array.isArray(data.focusAreas)
      ? data.focusAreas.map(String).join("、")
      : "";
    return `计划周期：${stringValue(data.timeframe) || "7 天"}${focusAreas ? `，重点关注 ${focusAreas}` : ""}。`;
  }
  return "本次工具参数已记录，必要时可展开查看。";
}

function describeToolResult(toolName: string, data: Record<string, unknown>) {
  if (data.summary) return stringValue(data.summary);
  const parsed = parseJsonRecord(data.content);
  if (parsed?.error) return stringValue(parsed.error);
  if (Array.isArray(parsed?.records))
    return `读取到 ${parsed.records.length} 条健康记录。`;
  const record = asRecord(parsed?.record);
  if (record)
    return `已保存一条${recordTypeText(stringValue(record.type))}记录。`;
  const snapshot = asRecord(parsed?.snapshot);
  if (snapshot?.summary)
    return `健康快照摘要：${stringValue(snapshot.summary)}`;
  const plan = asRecord(parsed?.plan);
  if (plan?.title) return `生成计划：${stringValue(plan.title)}。`;
  return "工具返回了结果，Agent 会把它作为最终建议的依据。";
}

function renderRunTarget(run: AgentRun) {
  if (run.diagnosisSessionId) {
    return (
      <Space size={6} wrap>
        <Typography.Text>辅助分诊</Typography.Text>
        {run.diagnosisSession?.safetyLevel ? (
          <Tag color="blue">{run.diagnosisSession.safetyLevel}</Tag>
        ) : null}
      </Space>
    );
  }
  if (run.conversationId)
    return run.conversation?.title || run.conversation?.summary || "健康对话";
  return "-";
}

function runKindText(kind: string) {
  if (kind === "chat") return "健康对话";
  if (kind === "chat_safety_override") return "安全覆盖";
  if (kind === "integrative_diagnosis") return "辅助分诊";
  return kind;
}

function runKindColor(kind: string) {
  if (kind === "integrative_diagnosis") return "purple";
  if (kind === "chat_safety_override") return "red";
  return "blue";
}

function runStatusColor(status?: string) {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  return "blue";
}

function runStatusText(status: string) {
  if (status === "completed") return "完成";
  if (status === "failed") return "失败";
  return "运行中";
}

function stepStatusColor(status?: string) {
  if (status === "complete" || status === "completed") return "green";
  if (status === "failed" || status === "fallback") return "red";
  if (status === "running" || status === "started") return "blue";
  if (status === "skipped") return "gray";
  return "purple";
}

function stepStatusText(status?: string) {
  if (status === "complete" || status === "completed") return "完成";
  if (status === "failed") return "失败";
  if (status === "fallback") return "保守兜底";
  if (status === "running") return "运行中";
  if (status === "started") return "已启动";
  if (status === "pending") return "等待中";
  if (status === "skipped") return "已跳过";
  if (status === "blocked") return "已阻断";
  return "已记录";
}

function stepTitle(step: AgentRunStep) {
  return stringValue(step.title) || stepTypeText(stepType(step));
}

function stepType(step: AgentRunStep) {
  return stringValue(step.type) || "unknown_step";
}

function stepTypeText(type: unknown) {
  const value = stringValue(type) || "unknown_step";
  const names: Record<string, string> = {
    memory_loaded: "加载健康记忆",
    retrieval_started: "开始检索资料",
    retrieval_done: "完成资料检索",
    tool_call: "准备调用工具",
    tool_result: "工具返回结果",
    red_flag_triage: "红旗安全门控",
    safety_override: "安全策略覆盖",
    western_initial_started: "西医 Agent 启动",
    tcm_initial_started: "中医 Agent 启动",
    western_initial: "西医 Agent 初评",
    tcm_initial: "中医 Agent 初评",
    western_cross_started: "西医交叉质询启动",
    tcm_cross_started: "中医交叉质询启动",
    western_cross: "西医交叉质询",
    tcm_cross: "中医交叉质询",
    integrator_started: "决策者 Agent 启动",
    integrator: "决策者 Agent 仲裁",
    safety_arbitration: "最终安全裁决",
    final_response: "最终回复形成",
  };
  return names[value] ?? value.replace(/_/g, " ");
}

function formatDuration(value?: number) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "-";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} 秒`;
}

function formatDateTime(value?: string) {
  if (!value) return "时间未记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未记录" : date.toLocaleString();
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
  const text = safeStringify(value).replace(/\s+/g, " ");
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function addFact(
  facts: Array<{ label: string; value: string }>,
  label: string,
  value?: string,
) {
  if (value) facts.push({ label, value });
}

function formatNumber(value: unknown, unit: string) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value}${unit}`
    : "";
}

function formatScore(value: unknown, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value}/${max}`
    : "";
}

function formatExercise(value: Record<string, unknown> | null) {
  if (!value) return "";
  const activeDays =
    typeof value.exerciseActiveDays === "number"
      ? value.exerciseActiveDays
      : undefined;
  const totalMinutes =
    typeof value.exerciseTotalMinutes === "number"
      ? value.exerciseTotalMinutes
      : undefined;
  if (activeDays === undefined && totalMinutes === undefined) return "";
  return `${activeDays ?? 0} 天活跃、${totalMinutes ?? 0} 分钟`;
}

function parseJsonRecord(value: unknown) {
  if (typeof value !== "string") return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function toolTitle(name: string) {
  const titles: Record<string, string> = {
    health_records_list: "查询健康记录",
    health_record_create: "保存健康记录",
    snapshot_latest: "读取最新健康快照",
    snapshot_generate_weekly: "生成周健康快照",
    health_plan_generate: "生成健康计划",
  };
  return titles[name] ?? (name || "未知工具");
}

function toolPurpose(name: string) {
  const purposes: Record<string, string> = {
    health_records_list: "查看真实保存过的睡眠、运动、心情或就医记录",
    health_record_create: "把用户明确要求保存的信息写入健康记录",
    snapshot_latest: "读取最近的健康趋势与建议快照",
    snapshot_generate_weekly: "重新整理最近 7 天健康趋势",
    health_plan_generate: "基于真实记录生成低风险、可执行的健康计划",
  };
  return purposes[name] ?? "补充回答所需的真实数据";
}

function recordTypeText(type: string) {
  const names: Record<string, string> = {
    sleep: "睡眠",
    exercise: "运动",
    mood: "心情",
    medical: "就医",
  };
  return names[type] ?? type;
}
