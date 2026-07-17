import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type {
  CrossExamination,
  DiagnosisInput,
  GenerationStatus,
  IntegratedDiagnosisResult,
  TcmAssessment,
  TcmReviewOfWestern,
  WesternAssessment,
  WesternReviewOfTcm,
} from "@health/shared";
import type { LlmConfig } from "../llm/llm.types";
import type { RedFlagTriageResult } from "./red-flag-triage.service";

export type StructuredGenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type StructuredGeneration<T> = {
  value: T | null;
  status: "complete" | "fallback";
  warning?: string;
  usage?: StructuredGenerationUsage;
};

export type CoordinatorTrace = NonNullable<GenerationStatus["coordinator"]>;
export type CoordinatorEvent = CoordinatorTrace["events"][number];

export type DiagnosisRoleConfigs = {
  western: LlmConfig;
  tcm: LlmConfig;
  reviewer: LlmConfig;
  integrator: LlmConfig;
};

const DiagnosisGraphAnnotation = Annotation.Root({
  diagnosisInput: Annotation<DiagnosisInput>(),
  contextSnapshot: Annotation<unknown>(),
  redFlagResult: Annotation<RedFlagTriageResult>(),
  agentRunId: Annotation<string>(),
  roleConfigs: Annotation<DiagnosisRoleConfigs>(),
  roleModels: Annotation<NonNullable<GenerationStatus["roleModels"]>>(),
  coordinatorEvents: Annotation<CoordinatorEvent[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  westernGeneration: Annotation<
    StructuredGeneration<WesternAssessment> | undefined
  >(),
  tcmGeneration: Annotation<StructuredGeneration<TcmAssessment> | undefined>(),
  westernCrossGeneration: Annotation<
    StructuredGeneration<WesternReviewOfTcm> | undefined
  >(),
  tcmCrossGeneration: Annotation<
    StructuredGeneration<TcmReviewOfWestern> | undefined
  >(),
  integratedGeneration: Annotation<
    StructuredGeneration<IntegratedDiagnosisResult> | undefined
  >(),
  crossExamination: Annotation<CrossExamination | undefined>(),
  westernStartedAt: Annotation<Date | undefined>(),
  westernEndedAt: Annotation<Date | undefined>(),
  tcmStartedAt: Annotation<Date | undefined>(),
  tcmEndedAt: Annotation<Date | undefined>(),
  westernCrossStartedAt: Annotation<Date | undefined>(),
  westernCrossEndedAt: Annotation<Date | undefined>(),
  tcmCrossStartedAt: Annotation<Date | undefined>(),
  tcmCrossEndedAt: Annotation<Date | undefined>(),
  integratorStartedAt: Annotation<Date | undefined>(),
  integratorEndedAt: Annotation<Date | undefined>(),
  finalOutput: Annotation<IntegratedDiagnosisResult | undefined>(),
  generationStatus: Annotation<GenerationStatus | undefined>(),
});

export type DiagnosisGraphState = typeof DiagnosisGraphAnnotation.State;
export type DiagnosisGraphUpdate = typeof DiagnosisGraphAnnotation.Update;

type DiagnosisGraphNode = (
  state: DiagnosisGraphState,
) => DiagnosisGraphUpdate | Promise<DiagnosisGraphUpdate>;

export type DiagnosisGraphNodes = {
  gate: DiagnosisGraphNode;
  emergency: DiagnosisGraphNode;
  initialDispatch: DiagnosisGraphNode;
  westernInitial: DiagnosisGraphNode;
  tcmInitial: DiagnosisGraphNode;
  initialJoin: DiagnosisGraphNode;
  crossDispatch: DiagnosisGraphNode;
  westernCross: DiagnosisGraphNode;
  tcmCross: DiagnosisGraphNode;
  crossJoin: DiagnosisGraphNode;
  integrator: DiagnosisGraphNode;
  safety: DiagnosisGraphNode;
};

export function routeDiagnosisAfterGate(state: DiagnosisGraphState) {
  return state.redFlagResult.mustSeekImmediateCare ? "emergency" : "normal";
}

export function createIntegrativeDiagnosisGraph(nodes: DiagnosisGraphNodes) {
  return new StateGraph(DiagnosisGraphAnnotation)
    .addNode("gate", nodes.gate)
    .addNode("emergency", nodes.emergency)
    .addNode("initial_dispatch", nodes.initialDispatch)
    .addNode("western_initial", nodes.westernInitial)
    .addNode("tcm_initial", nodes.tcmInitial)
    .addNode("initial_join", nodes.initialJoin)
    .addNode("cross_dispatch", nodes.crossDispatch)
    .addNode("western_cross", nodes.westernCross)
    .addNode("tcm_cross", nodes.tcmCross)
    .addNode("cross_join", nodes.crossJoin)
    .addNode("integrator", nodes.integrator)
    .addNode("safety", nodes.safety)
    .addEdge(START, "gate")
    .addConditionalEdges("gate", routeDiagnosisAfterGate, {
      emergency: "emergency",
      normal: "initial_dispatch",
    })
    .addEdge("emergency", END)
    .addEdge("initial_dispatch", "western_initial")
    .addEdge("initial_dispatch", "tcm_initial")
    .addEdge(["western_initial", "tcm_initial"], "initial_join")
    .addEdge("initial_join", "cross_dispatch")
    .addEdge("cross_dispatch", "western_cross")
    .addEdge("cross_dispatch", "tcm_cross")
    .addEdge(["western_cross", "tcm_cross"], "cross_join")
    .addEdge("cross_join", "integrator")
    .addEdge("integrator", "safety")
    .addEdge("safety", END)
    .compile();
}
