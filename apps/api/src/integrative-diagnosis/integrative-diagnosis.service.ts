import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diagnosisFollowUpRequestSchema,
  diagnosisFollowUpResultJsonSchema,
  diagnosisFollowUpResultSchema,
  diagnosisInputSchema,
  integratedDiagnosisResultJsonSchema,
  integratedDiagnosisResultSchema,
  tcmAssessmentJsonSchema,
  tcmAssessmentSchema,
  tcmReviewOfWesternJsonSchema,
  tcmReviewOfWesternSchema,
  westernAssessmentJsonSchema,
  westernAssessmentSchema,
  westernReviewOfTcmJsonSchema,
  westernReviewOfTcmSchema,
  type CrossExamination,
  type DiagnosisInput,
  type DiagnosisFollowUpQuestion,
  type DiagnosisFollowUpRequest,
  type DiagnosisFollowUpResult,
  type DiagnosisSafetyLevel,
  type GenerationStatus,
  type IntegratedDiagnosisResult,
  type TcmAssessment,
  type TcmReviewOfWestern,
  type WesternAssessment,
  type WesternReviewOfTcm,
} from '@health/shared';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { AgentRunService } from '../agent-runs/agent-run.service';
import { LlmService } from '../llm/llm.provider';
import { PrismaService } from '../prisma/prisma.service';
import { DiagnosisContextService } from './diagnosis-context.service';
import { INTEGRATOR_SYSTEM } from './prompts/integrator.system';
import { TCM_SYSTEM } from './prompts/tcm.system';
import { WESTERN_MEDICINE_SYSTEM } from './prompts/western.system';
import { RedFlagTriageResult, RedFlagTriageService } from './red-flag-triage.service';

const DISCLAIMER = '本建议仅用于健康辅助分诊与调理参考，不能替代医生诊断、治疗或急救服务。若症状严重、进展迅速或你感到不安全，请立即联系当地急救服务或线下医疗机构。';

const WESTERN_CROSS_EXAMINATION_SYSTEM = [
  '你是西医会诊 Agent。你已经完成西医初评，现在需要阅读中医 Agent 的初评，并用循证医学和安全边界进行交叉质询。',
  '只评价中医输出中哪些可以作为低风险参考、哪些可能误导或延误就医、哪些必须通过线下医学检查或医生评估确认。',
  '不要给出新的确诊，不要输出具体处方剂量，不要建议用户自行停药或换药。',
  '如中医调养建议与红旗信号、急性症状、孕产、儿童、老人、慢病或正在用药场景冲突，必须指出风险并给出更安全表述。',
  '只输出符合 schema 的 JSON，不要输出 Markdown、解释性前后缀或代码块。',
].join('\n');

const TCM_CROSS_EXAMINATION_SYSTEM = [
  '你是中医会诊 Agent。你已经完成中医初评，现在需要阅读西医 Agent 的初评，并从辨证信息充分性和调养安全边界进行交叉质询。',
  '指出哪些证候判断还需要补充舌象、脉象、寒热、汗出、口渴、食欲、二便、情志等信息。',
  '指出哪些中医调养建议必须避开西医红旗、急症风险、用药风险或线下检查优先级。',
  '如中医证候倾向与西医判断存在冲突，必须明确冲突点，并提醒以安全优先和线下医学评估优先。',
  '只输出符合 schema 的 JSON，不要输出 Markdown、解释性前后缀或代码块。',
].join('\n');

const FOLLOW_UP_SYSTEM = [
  '你是 HealthFlow 的预问诊追问 Agent。你的任务不是诊断，也不是给治疗建议，而是在正式中西医结合辅助分诊前，生成最值得用户补充的 3-5 个问题。',
  '你会阅读用户第一步填写的一句话描述、严重程度、持续时间、红旗快速筛查，以及可用的近期健康上下文。',
  '问题必须服务于安全边界、病程细节、伴随症状、基础医学背景或中医观察信息。',
  '不要重复询问用户已经明确提供的信息；不要一次问多个无关问题；不要要求用户自行检查危险操作。',
  '如果存在胸痛、呼吸困难、意识异常、卒中征象、大量出血、严重过敏、自伤风险等红旗线索，优先生成确认是否正在发生、是否已联系急救或是否有人陪同的安全问题。',
  '最多输出 5 个问题。每个问题必须简短、口语化，用户不确定也可以回答“不清楚”。',
  '只输出符合 schema 的 JSON，不要输出 Markdown、解释性前后缀或代码块。',
].join('\n');

type StructuredGeneration<T> = {
  value: T | null;
  status: 'complete' | 'fallback';
  warning?: string;
  usage?: StructuredGenerationUsage;
};

type StructuredGenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

type CoordinatorTrace = NonNullable<GenerationStatus['coordinator']>;
type CoordinatorEvent = CoordinatorTrace['events'][number];

@Injectable()
export class IntegrativeDiagnosisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: DiagnosisContextService,
    private readonly triage: RedFlagTriageService,
    private readonly llm: LlmService,
    private readonly agentRuns: AgentRunService,
  ) {}

  async generateFollowUp(user: AuthUser, input: unknown): Promise<DiagnosisFollowUpResult> {
    const parsed = diagnosisFollowUpRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: '预问诊输入格式不正确', issues: parsed.error.flatten() });
    }

    const request = parsed.data;
    let provider: string | undefined;
    let model: string | undefined;

    try {
      const draftInput = buildFollowUpDraftInput(request);
      const { config, contextSnapshot } = await this.context.build(user, draftInput);
      provider = config.provider;
      model = config.model;

      const result = await this.llm.generateStructured<unknown>({
        config,
        system: FOLLOW_UP_SYSTEM,
        schemaName: 'diagnosis_follow_up_questions',
        schema: diagnosisFollowUpResultJsonSchema,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              firstStep: request,
              contextSnapshot,
            }),
          },
        ],
      });
      const normalized = normalizeFollowUpResult(result.parsed, request);
      return diagnosisFollowUpResultSchema.parse({
        ...normalized,
        source: 'agent',
        provider,
        model,
        usage: result.usage,
      });
    } catch (error) {
      console.warn('[integrative-diagnosis] follow-up question generation failed', error instanceof Error ? error.message : error);
      return diagnosisFollowUpResultSchema.parse({
        ...buildFallbackFollowUp(request),
        source: 'fallback',
        provider,
        model,
      });
    }
  }

  async create(user: AuthUser, input: unknown) {
    const parsed = diagnosisInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: '辅助分诊输入格式不正确', issues: parsed.error.flatten() });
    }

    const diagnosisInput = parsed.data;
    const { config, contextSnapshot } = await this.context.build(user, diagnosisInput);
    const redFlagResult = this.triage.evaluate(diagnosisInput);

    const session = await this.prisma.diagnosisSession.create({
      data: {
        userId: user.id,
        status: 'pending',
        input: diagnosisInput as Prisma.InputJsonValue,
        contextSnapshot: contextSnapshot as Prisma.InputJsonValue,
        redFlagResult: redFlagResult as Prisma.InputJsonValue,
        provider: config.provider,
        model: config.model,
      },
    });

    const agentRun = await this.agentRuns.start({
      user,
      kind: 'integrative_diagnosis',
      diagnosisSessionId: session.id,
      requestInput: diagnosisInput,
      memorySnapshot: contextSnapshot,
      provider: config.provider,
      model: config.model,
    });
    const coordinatorEvents: CoordinatorEvent[] = [];
    addCoordinatorEvent(
      coordinatorEvents,
      'red_flag_triage',
      '红旗门控完成',
      redFlagResult.mustSeekImmediateCare ? 'blocked' : 'complete',
      redFlagResult.findings.length ? `发现 ${redFlagResult.findings.length} 个红旗线索` : '未发现急症红旗',
    );
    await this.agentRuns.addStep(agentRun.id, { type: 'red_flag_triage', title: '红旗安全门控', status: redFlagResult.mustSeekImmediateCare ? 'failed' : 'complete', data: redFlagResult });
    addCoordinatorEvent(coordinatorEvents, 'memory_loaded', '健康上下文加载完成', 'complete', diagnosisInput.includeRecentHealthContext ? '已读取近期健康上下文' : '本次未合并近期健康上下文');
    await this.agentRuns.addStep(agentRun.id, { type: 'memory_loaded', title: '加载长期健康记忆', status: 'complete', data: contextSnapshot });

    try {
      if (redFlagResult.mustSeekImmediateCare) {
        const integratedOutput = buildEmergencyResult(redFlagResult);
        addCoordinatorEvent(coordinatorEvents, 'safety_override', '急症安全覆盖完成', 'complete', '安全门控已阻断多 Agent 会诊');
        const generationStatus = buildGenerationStatus('complete', 'complete', 'complete', [], {
          strategy: '红旗门控 -> 急症安全覆盖',
          events: coordinatorEvents,
          steps: [
            buildCoordinatorStep('red_flag_triage', 'complete', '命中急症红旗，跳过多 Agent 生成。'),
            buildCoordinatorStep('western_initial', 'skipped', '安全门控已阻断。'),
            buildCoordinatorStep('tcm_initial', 'skipped', '安全门控已阻断。'),
            buildCoordinatorStep('western_cross', 'skipped', '急症安全覆盖下不进入交叉质询。'),
            buildCoordinatorStep('tcm_cross', 'skipped', '急症安全覆盖下不进入交叉质询。'),
            buildCoordinatorStep('integrator', 'skipped', '直接输出急症安全建议。'),
          ],
          arbitration: ['红旗安全优先级高于任何调理或解释型建议。'],
          crossExamination: { westernOnTcm: null, tcmOnWestern: null },
        });
        const updated = await this.prisma.diagnosisSession.update({
          where: { id: session.id },
          data: {
            status: 'safety_blocked',
            safetyLevel: 'emergency',
            integratedOutput: integratedOutput as Prisma.InputJsonValue,
            generationStatus: generationStatus as Prisma.InputJsonValue,
          },
        });
        await this.agentRuns.addStep(agentRun.id, { type: 'safety_override', title: '急症安全覆盖', status: 'complete', data: integratedOutput });
        await this.agentRuns.complete(agentRun.id);
        return toDiagnosisSession(updated);
      }

      const basePayload = { input: diagnosisInput, contextSnapshot, redFlagResult };
      const westernStartedAt = new Date();
      const tcmStartedAt = new Date();
      addCoordinatorEvent(coordinatorEvents, 'western_initial_started', '西医 Agent 初评启动', 'running');
      addCoordinatorEvent(coordinatorEvents, 'tcm_initial_started', '中医 Agent 初评启动', 'running');
      await this.agentRuns.addStep(agentRun.id, { type: 'western_initial_started', title: '西医 Agent 初评启动', status: 'running' });
      await this.agentRuns.addStep(agentRun.id, { type: 'tcm_initial_started', title: '中医 Agent 初评启动', status: 'running' });
      const [westernRun, tcmRun] = await Promise.all([
        this.runWestern(config, basePayload).then((generation) => {
          const endedAt = new Date();
          addCoordinatorEvent(coordinatorEvents, 'western_initial_completed', `西医 Agent 完成：${summarizeWestern(generation)}`, generation.status, undefined, endedAt);
          return { generation, endedAt };
        }),
        this.runTcm(config, basePayload).then((generation) => {
          const endedAt = new Date();
          addCoordinatorEvent(coordinatorEvents, 'tcm_initial_completed', `中医 Agent 完成：${summarizeTcm(generation)}`, generation.status, undefined, endedAt);
          return { generation, endedAt };
        }),
      ]);
      const westernGeneration = westernRun.generation;
      const tcmGeneration = tcmRun.generation;
      await this.agentRuns.addStep(agentRun.id, { type: 'western_initial', title: '西医 Agent 初评', status: westernGeneration.status, data: generationStepData(westernGeneration) });
      await this.agentRuns.addStep(agentRun.id, { type: 'tcm_initial', title: '中医 Agent 初评', status: tcmGeneration.status, data: generationStepData(tcmGeneration) });

      let westernCrossGeneration: StructuredGeneration<WesternReviewOfTcm>;
      let tcmCrossGeneration: StructuredGeneration<TcmReviewOfWestern>;
      let westernCrossStartedAt: Date | undefined;
      let tcmCrossStartedAt: Date | undefined;
      let westernCrossEndedAt: Date | undefined;
      let tcmCrossEndedAt: Date | undefined;

      if (westernGeneration.value && tcmGeneration.value) {
        const crossPayload = {
          ...basePayload,
          westernOutput: westernGeneration.value,
          tcmOutput: tcmGeneration.value,
        };
        westernCrossStartedAt = new Date();
        tcmCrossStartedAt = new Date();
        addCoordinatorEvent(coordinatorEvents, 'western_cross_started', '西医 Agent 阅读中医结果', 'running');
        addCoordinatorEvent(coordinatorEvents, 'tcm_cross_started', '中医 Agent 阅读西医结果', 'running');
        await this.agentRuns.addStep(agentRun.id, { type: 'western_cross_started', title: '西医 Agent 交叉质询启动', status: 'running' });
        await this.agentRuns.addStep(agentRun.id, { type: 'tcm_cross_started', title: '中医 Agent 交叉质询启动', status: 'running' });
        const [westernCrossRun, tcmCrossRun] = await Promise.all([
          this.runWesternCross(config, crossPayload).then((generation) => {
            const endedAt = new Date();
            addCoordinatorEvent(coordinatorEvents, 'western_cross_completed', `西医交叉质询完成：${summarizeWesternCross(generation)}`, generation.status, undefined, endedAt);
            return { generation, endedAt };
          }),
          this.runTcmCross(config, crossPayload).then((generation) => {
            const endedAt = new Date();
            addCoordinatorEvent(coordinatorEvents, 'tcm_cross_completed', `中医交叉质询完成：${summarizeTcmCross(generation)}`, generation.status, undefined, endedAt);
            return { generation, endedAt };
          }),
        ]);
        westernCrossGeneration = westernCrossRun.generation;
        tcmCrossGeneration = tcmCrossRun.generation;
        westernCrossEndedAt = westernCrossRun.endedAt;
        tcmCrossEndedAt = tcmCrossRun.endedAt;
      } else {
        westernCrossGeneration = { value: buildEmptyWesternReview(), status: 'fallback', warning: '初评不完整，西医交叉质询未生成。' };
        tcmCrossGeneration = { value: buildEmptyTcmReview(), status: 'fallback', warning: '初评不完整，中医交叉质询未生成。' };
        addCoordinatorEvent(coordinatorEvents, 'cross_examination_skipped', '交叉质询未完整执行', 'fallback', '至少一侧初评不可用，改用保守仲裁');
      }

      await this.agentRuns.addStep(agentRun.id, { type: 'western_cross', title: '西医 Agent 质询中医结果', status: westernCrossGeneration.status, data: generationStepData(westernCrossGeneration) });
      await this.agentRuns.addStep(agentRun.id, { type: 'tcm_cross', title: '中医 Agent 质询西医结果', status: tcmCrossGeneration.status, data: generationStepData(tcmCrossGeneration) });

      const crossExamination: CrossExamination = {
        westernOnTcm: westernCrossGeneration.value,
        tcmOnWestern: tcmCrossGeneration.value,
      };
      const partialGenerationStatus = buildGenerationStatus(westernGeneration.status, tcmGeneration.status, 'complete', [
        westernGeneration.warning,
        tcmGeneration.warning,
        westernCrossGeneration.warning,
        tcmCrossGeneration.warning,
      ], undefined, westernCrossGeneration.status, tcmCrossGeneration.status);

      const integratorStartedAt = new Date();
      addCoordinatorEvent(coordinatorEvents, 'integrator_started', '决策者 Agent 启动', 'running');
      await this.agentRuns.addStep(agentRun.id, { type: 'integrator_started', title: '决策者 Agent 仲裁启动', status: 'running' });
      const integratedGeneration = await this.runIntegrator(config, {
        ...basePayload,
        generationStatus: partialGenerationStatus,
        westernOutput: westernGeneration.value,
        tcmOutput: tcmGeneration.value,
        crossExamination,
      });
      const integratorEndedAt = new Date();
      addCoordinatorEvent(coordinatorEvents, 'integrator_completed', `决策者 Agent 完成：安全等级 ${integratedGeneration.value?.safetyLevel ?? 'unknown'}`, integratedGeneration.status);
      await this.agentRuns.addStep(agentRun.id, { type: 'integrator', title: '决策者 Agent 仲裁结果', status: integratedGeneration.status, data: generationStepData(integratedGeneration) });
      const finalOutput = enforceFinalSafety(integratedGeneration.value ?? buildConservativeIntegrated(), redFlagResult);
      addCoordinatorEvent(coordinatorEvents, 'safety_arbitration_completed', '后端安全裁决完成', 'complete', `最终安全等级 ${finalOutput.safetyLevel}`);
      await this.agentRuns.addStep(agentRun.id, { type: 'safety_arbitration', title: '最终安全裁决', status: 'complete', data: { safetyLevel: finalOutput.safetyLevel } });
      const coordinator = buildCoordinatorTrace({
        events: coordinatorEvents,
        includeRecentHealthContext: diagnosisInput.includeRecentHealthContext,
        contextSnapshot,
        redFlagResult,
        westernGeneration,
        tcmGeneration,
        westernCrossGeneration,
        tcmCrossGeneration,
        integratedGeneration,
        crossExamination,
        westernStartedAt,
        tcmStartedAt,
        westernEndedAt: westernRun.endedAt,
        tcmEndedAt: tcmRun.endedAt,
        westernCrossStartedAt,
        tcmCrossStartedAt,
        westernCrossEndedAt,
        tcmCrossEndedAt,
        integratorStartedAt,
        integratorEndedAt,
      });
      const generationStatus = buildGenerationStatus(westernGeneration.status, tcmGeneration.status, integratedGeneration.status, [
        westernGeneration.warning,
        tcmGeneration.warning,
        westernCrossGeneration.warning,
        tcmCrossGeneration.warning,
        integratedGeneration.warning,
      ], coordinator, westernCrossGeneration.status, tcmCrossGeneration.status);

      const updated = await this.prisma.diagnosisSession.update({
        where: { id: session.id },
        data: {
          status: 'completed',
          safetyLevel: finalOutput.safetyLevel,
          westernOutput: westernGeneration.value === null ? Prisma.JsonNull : (westernGeneration.value as Prisma.InputJsonValue),
          tcmOutput: tcmGeneration.value === null ? Prisma.JsonNull : (tcmGeneration.value as Prisma.InputJsonValue),
          integratedOutput: finalOutput as Prisma.InputJsonValue,
          generationStatus: generationStatus as Prisma.InputJsonValue,
        },
      });
      const usage = sumUsage([westernGeneration, tcmGeneration, westernCrossGeneration, tcmCrossGeneration, integratedGeneration]);
      await this.agentRuns.complete(agentRun.id, usage);
      return toDiagnosisSession(updated);
    } catch (error) {
      await this.agentRuns.fail(agentRun.id, error);
      await this.prisma.diagnosisSession.update({ where: { id: session.id }, data: { status: 'failed' } });
      throw error;
    }
  }

  async list(user: AuthUser) {
    const sessions = await this.prisma.diagnosisSession.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return sessions.map(toDiagnosisSession);
  }

  async get(user: AuthUser, id: string) {
    const session = await this.prisma.diagnosisSession.findFirst({ where: { id, userId: user.id } });
    if (!session) throw new NotFoundException('Diagnosis session not found');
    return toDiagnosisSession(session);
  }

  async remove(user: AuthUser, id: string) {
    const result = await this.prisma.diagnosisSession.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) throw new NotFoundException('Diagnosis session not found');
    return { id, deleted: true };
  }

  private async runWestern(config: Parameters<LlmService['generateStructured']>[0]['config'], payload: unknown): Promise<StructuredGeneration<WesternAssessment>> {
    return this.generateAndValidate(
      config,
      WESTERN_MEDICINE_SYSTEM,
      'western_assessment',
      westernAssessmentJsonSchema,
      westernAssessmentSchema,
      payload,
      buildEmptyWestern(),
      '西医结构化分析未成功生成，可稍后重试或检查模型配置。',
    );
  }

  private async runTcm(config: Parameters<LlmService['generateStructured']>[0]['config'], payload: unknown): Promise<StructuredGeneration<TcmAssessment>> {
    return this.generateAndValidate(
      config,
      TCM_SYSTEM,
      'tcm_assessment',
      tcmAssessmentJsonSchema,
      tcmAssessmentSchema,
      payload,
      buildEmptyTcm(),
      '中医结构化分析未成功生成，可稍后重试或检查模型配置。',
    );
  }

  private async runWesternCross(config: Parameters<LlmService['generateStructured']>[0]['config'], payload: unknown): Promise<StructuredGeneration<WesternReviewOfTcm>> {
    return this.generateAndValidate(
      config,
      WESTERN_CROSS_EXAMINATION_SYSTEM,
      'western_review_of_tcm',
      westernReviewOfTcmJsonSchema,
      westernReviewOfTcmSchema,
      payload,
      buildEmptyWesternReview(),
      '西医交叉质询未成功生成，当前按保守安全边界处理。',
      { fallbackValue: buildEmptyWesternReview() },
    );
  }

  private async runTcmCross(config: Parameters<LlmService['generateStructured']>[0]['config'], payload: unknown): Promise<StructuredGeneration<TcmReviewOfWestern>> {
    return this.generateAndValidate(
      config,
      TCM_CROSS_EXAMINATION_SYSTEM,
      'tcm_review_of_western',
      tcmReviewOfWesternJsonSchema,
      tcmReviewOfWesternSchema,
      payload,
      buildEmptyTcmReview(),
      '中医交叉质询未成功生成，当前按保守安全边界处理。',
      { fallbackValue: buildEmptyTcmReview() },
    );
  }

  private async runIntegrator(config: Parameters<LlmService['generateStructured']>[0]['config'], payload: unknown): Promise<StructuredGeneration<IntegratedDiagnosisResult>> {
    return this.generateAndValidate(
      config,
      INTEGRATOR_SYSTEM,
      'integrated_diagnosis_result',
      integratedDiagnosisResultJsonSchema,
      integratedDiagnosisResultSchema,
      payload,
      buildConservativeIntegrated(),
      '汇总建议未完整生成，当前显示保守安全建议。',
      { fallbackValue: buildConservativeIntegrated() },
    );
  }

  private async generateAndValidate<T>(
    config: Parameters<LlmService['generateStructured']>[0]['config'],
    system: string,
    schemaName: string,
    schema: unknown,
    validator: { parse: (value: unknown) => T },
    payload: unknown,
    fallback: T,
    warning: string,
    options?: { fallbackValue?: T },
  ): Promise<StructuredGeneration<T>> {
    try {
      const result = await this.llm.generateStructured({
        config,
        system,
        schemaName,
        schema,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      });
      return { value: validator.parse(normalizeStructuredOutput(schemaName, result.parsed, fallback)), status: 'complete', usage: result.usage };
    } catch (error) {
      console.warn(`[integrative-diagnosis] ${schemaName} structured generation failed`, error instanceof Error ? error.message : error);
      return { value: options?.fallbackValue ?? null, status: 'fallback', warning };
    }
  }
}

function buildFollowUpDraftInput(input: DiagnosisFollowUpRequest): DiagnosisInput {
  const redFlagText = input.redFlagSigns.length ? `红旗快速筛查勾选：${input.redFlagSigns.join('、')}` : undefined;
  return {
    chiefComplaint: input.chiefComplaint,
    symptoms: [
      {
        name: input.symptomName?.trim() || inferSymptomName(input.chiefComplaint),
        bodyPart: input.bodyPart,
        severity: input.severity,
        duration: input.duration,
        triggers: [],
        relievers: [],
        associatedSymptoms: input.redFlagSigns,
      },
    ],
    vitals: {},
    lifestyleSignals: {},
    medicalContext: {
      sex: 'unknown',
      chronicConditions: [],
      medications: [],
      allergies: [],
      recentDiagnoses: [],
    },
    tcmObservations: {},
    freeText: redFlagText,
    includeRecentHealthContext: input.includeRecentHealthContext,
  };
}

function normalizeFollowUpResult(parsed: unknown, request: DiagnosisFollowUpRequest): Omit<DiagnosisFollowUpResult, 'source' | 'provider' | 'model' | 'usage'> {
  if (!parsed || typeof parsed !== 'object') return buildFallbackFollowUp(request);
  const value = parsed as Record<string, unknown>;
  const fallback = buildFallbackFollowUp(request);
  const questions = asArray(value.questions, [])
    .map((item, index) => normalizeFollowUpQuestion(item, index, fallback.questions[index]))
    .filter((item): item is DiagnosisFollowUpQuestion => Boolean(item?.question.trim()))
    .slice(0, 5);

  return {
    summary: readString(value, 'summary', fallback.summary),
    questions: questions.length ? questions : fallback.questions,
    missingFields: readStringArray(value, 'missingFields', fallback.missingFields).slice(0, 8),
  };
}

function normalizeFollowUpQuestion(item: unknown, index: number, fallback?: DiagnosisFollowUpQuestion): DiagnosisFollowUpQuestion | null {
  if (!item || typeof item !== 'object') return fallback ?? null;
  const fallbackPriority: DiagnosisFollowUpQuestion['priority'] = fallback?.priority ?? 'symptom_detail';
  const id = readString(item, 'id', fallback?.id ?? `q${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || `q${index + 1}`;
  return {
    id,
    question: readString(item, 'question', fallback?.question ?? ''),
    reason: readString(item, 'reason', fallback?.reason ?? '用于补充分诊所需的关键信息。'),
    priority: readEnum(
      item,
      'priority',
      ['safety', 'symptom_detail', 'medical_context', 'tcm_observation', 'lifestyle'] as const,
      fallbackPriority,
    ),
    answerHint: readString(item, 'answerHint', fallback?.answerHint ?? '不清楚可以写“不确定”。'),
  };
}

function buildFallbackFollowUp(input: DiagnosisFollowUpRequest): Omit<DiagnosisFollowUpResult, 'source' | 'provider' | 'model' | 'usage'> {
  const questions: DiagnosisFollowUpQuestion[] = [];

  if (input.redFlagSigns.length) {
    questions.push({
      id: 'safety_status',
      question: `你勾选的「${input.redFlagSigns.slice(0, 2).join('、')}」现在是否仍在发生？是否已经联系急救或有人陪同？`,
      reason: '红旗线索需要先确认安全状态，避免延误急症处理。',
      priority: 'safety',
      answerHint: '例如：仍在发生/已经缓解；是否已联系急救；身边是否有人。',
    });
  }

  if (!input.duration?.trim()) {
    questions.push({
      id: 'duration',
      question: '症状从什么时候开始，持续多久了？',
      reason: '病程长短会影响急性风险和就医优先级。',
      priority: 'symptom_detail',
      answerHint: '例如：3 小时、2 天、反复 1 个月。',
    });
  }

  if (input.severity === undefined) {
    questions.push({
      id: 'severity',
      question: '如果用 1-10 分表示严重程度，现在大约是多少分？',
      reason: '严重程度有助于判断是否需要尽快线下评估。',
      priority: 'symptom_detail',
      answerHint: '1 分很轻，10 分最严重。',
    });
  }

  questions.push(
    {
      id: 'associated_symptoms',
      question: '有没有发热、呕吐、胸闷、呼吸困难、出汗、皮疹或其他伴随症状？',
      reason: '伴随症状能帮助 Agent 排查红旗和判断方向。',
      priority: 'safety',
      answerHint: '没有也可以写“没有明显伴随症状”。',
    },
    {
      id: 'medical_context',
      question: '是否有慢病、正在用药、过敏史，或近期检查/诊断结果？',
      reason: '基础病、用药和过敏史会影响安全边界。',
      priority: 'medical_context',
      answerHint: '例如：高血压、糖尿病、阿司匹林、青霉素过敏。',
    },
    {
      id: 'tcm_observation',
      question: '如果方便，请补充舌象、寒热、出汗、口渴、食欲和大小便情况。',
      reason: '这些信息能帮助中医 Agent 减少过度推断。',
      priority: 'tcm_observation',
      answerHint: '不清楚可以跳过或写“不清楚”。',
    },
  );

  return {
    summary: 'Agent 追问暂不可用时，系统按安全优先原则生成了兜底补充问题。',
    questions: questions.slice(0, 5),
    missingFields: questions.slice(0, 5).map((question) => question.id),
  };
}

function inferSymptomName(text: string) {
  const normalized = text.trim();
  if (!normalized) return '未明确不适';
  const keyword = ['头痛', '胃痛', '腹痛', '胸闷', '胸痛', '咳嗽', '发热', '头晕', '乏力', '失眠'].find((item) => normalized.includes(item));
  return keyword ?? normalized.slice(0, 24);
}

function normalizeStructuredOutput<T>(schemaName: string, parsed: unknown, fallback: T): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const value = parsed as Record<string, unknown>;

  if (schemaName === 'western_assessment') {
    const base = fallback as WesternAssessment;
    return {
      ...base,
      ...value,
      redFlags: asArray(value.redFlags, base.redFlags),
      diagnosticHypotheses: asArray(value.diagnosticHypotheses, base.diagnosticHypotheses).map((item) => ({
        name: readString(item, 'name', '需线下评估的可能性'),
        likelihood: readEnum(item, 'likelihood', ['low', 'medium', 'high'] as const, 'low'),
        rationale: readString(item, 'rationale', '当前信息不足以形成明确假设。'),
        supportingFindings: readStringArray(item, 'supportingFindings'),
        againstFindings: readStringArray(item, 'againstFindings'),
        notADiagnosis: true,
      })),
      recommendedChecks: asArray(value.recommendedChecks, base.recommendedChecks).map((item) => ({
        name: readString(item, 'name', '线下医生评估'),
        timing: readEnum(item, 'timing', ['immediate', 'soon', 'routine'] as const, 'routine'),
        reason: readString(item, 'reason', '用于确认症状性质和排除风险。'),
      })),
      selfCareBoundaries: readStringArray(value, 'selfCareBoundaries', base.selfCareBoundaries),
      seekCareCriteria: readStringArray(value, 'seekCareCriteria', base.seekCareCriteria),
      missingInformation: readStringArray(value, 'missingInformation', base.missingInformation),
    };
  }

  if (schemaName === 'tcm_assessment') {
    const base = fallback as TcmAssessment;
    return {
      ...base,
      ...value,
      redFlags: asArray(value.redFlags, base.redFlags),
      patternHypotheses: asArray(value.patternHypotheses, base.patternHypotheses).map((item) => ({
        name: readString(item, 'name', '待辨证的体质/证候倾向'),
        likelihood: readEnum(item, 'likelihood', ['low', 'medium', 'high'] as const, 'low'),
        rationale: readString(item, 'rationale', '需要结合舌象、脉象和整体信息进一步辨证。'),
        supportingFindings: readStringArray(item, 'supportingFindings'),
        notADiagnosis: true,
      })),
      tonguePulseQuestions: readStringArray(value, 'tonguePulseQuestions', base.tonguePulseQuestions),
      constitutionAndPatternRationale: readString(value, 'constitutionAndPatternRationale', base.constitutionAndPatternRationale),
      regulationSuggestions: asArray(value.regulationSuggestions, base.regulationSuggestions).map((item) => ({
        category: readEnum(item, 'category', ['diet', 'routine', 'emotion', 'movement', 'acupressure', 'other'] as const, 'routine'),
        suggestion: readString(item, 'suggestion', '保持规律作息，避免过劳。'),
        safetyNote: readString(item, 'safetyNote', '症状加重时优先线下就医。'),
      })),
      contraindications: readStringArray(value, 'contraindications', base.contraindications),
      missingInformation: readStringArray(value, 'missingInformation', base.missingInformation),
    };
  }

  if (schemaName === 'western_review_of_tcm') {
    const base = fallback as WesternReviewOfTcm;
    return {
      ...base,
      ...value,
      referenceable: asArray(value.referenceable, base.referenceable).map((item) => ({
        point: readString(item, 'point', '可作为低风险参考的中医观察'),
        reason: readString(item, 'reason', '仅能作为辅助理解，不替代医学评估。'),
      })),
      potentiallyMisleading: asArray(value.potentiallyMisleading, base.potentiallyMisleading).map((item) => ({
        point: readString(item, 'point', '可能需要更谨慎表述的调养建议'),
        risk: readString(item, 'risk', '可能延误对症状变化或红旗信号的处理。'),
        saferFraming: readString(item, 'saferFraming', '仅作为低风险日常照护，症状加重时优先就医。'),
      })),
      checksNeeded: asArray(value.checksNeeded, base.checksNeeded).map((item) => ({
        issue: readString(item, 'issue', '需要医学确认的问题'),
        recommendedCheck: readString(item, 'recommendedCheck', '线下医生评估'),
        timing: readEnum(item, 'timing', ['immediate', 'soon', 'routine'] as const, 'routine'),
        reason: readString(item, 'reason', '用于排除风险并确认症状性质。'),
      })),
    };
  }

  if (schemaName === 'tcm_review_of_western') {
    const base = fallback as TcmReviewOfWestern;
    return {
      ...base,
      ...value,
      needsMoreTcmInfo: asArray(value.needsMoreTcmInfo, base.needsMoreTcmInfo).map((item) => ({
        patternOrIssue: readString(item, 'patternOrIssue', '待补充辨证信息'),
        missingInfo: readStringArray(item, 'missingInfo'),
        reason: readString(item, 'reason', '中医辨证需要更多整体信息支持。'),
      })),
      safetyBoundaries: asArray(value.safetyBoundaries, base.safetyBoundaries).map((item) => ({
        westernRedFlagOrConcern: readString(item, 'westernRedFlagOrConcern', '西医安全边界'),
        tcmAdjustment: readString(item, 'tcmAdjustment', '调养建议需保持低风险，不能替代就医或检查。'),
        reason: readString(item, 'reason', '安全优先于调养。'),
      })),
      conflicts: asArray(value.conflicts, base.conflicts).map((item) => ({
        topic: readString(item, 'topic', '中西医判断差异'),
        westernView: readString(item, 'westernView', '西医侧重风险排查。'),
        tcmView: readString(item, 'tcmView', '中医侧重证候倾向。'),
        concern: readString(item, 'concern', '冲突处需要由决策者按安全优先原则仲裁。'),
      })),
    };
  }

  if (schemaName === 'integrated_diagnosis_result') {
    const base = fallback as IntegratedDiagnosisResult;
    return {
      ...base,
      ...value,
      safetyLevel: readEnum(value, 'safetyLevel', ['emergency', 'urgent', 'clinician_recommended', 'supportive'] as const, base.safetyLevel),
      mustSeekImmediateCare: typeof value.mustSeekImmediateCare === 'boolean' ? value.mustSeekImmediateCare : base.mustSeekImmediateCare,
      immediateCareReasons: readStringArray(value, 'immediateCareReasons', base.immediateCareReasons),
      summary: readString(value, 'summary', base.summary),
      westernPerspective: readString(value, 'westernPerspective', base.westernPerspective),
      tcmPerspective: readString(value, 'tcmPerspective', base.tcmPerspective),
      conflictResolution: readStringArray(value, 'conflictResolution', base.conflictResolution),
      decisionMatrix: asArray(value.decisionMatrix, base.decisionMatrix).map((item) => ({
        claim: readString(item, 'claim', '待裁决建议'),
        source: readEnum(item, 'source', ['consensus', 'western_only', 'tcm_only', 'conflict', 'safety_rule'] as const, 'safety_rule'),
        decision: readEnum(item, 'decision', ['adopted', 'partially_adopted', 'not_adopted', 'needs_follow_up'] as const, 'needs_follow_up'),
        reason: readString(item, 'reason', '当前信息不足，需按安全优先原则处理。'),
        safetyImpact: readString(item, 'safetyImpact', '不确定时提高线下评估优先级。'),
      })),
      arbitrationDecisions: asArray(value.arbitrationDecisions, base.arbitrationDecisions).map((item) => ({
        topic: readString(item, 'topic', '冲突仲裁'),
        westernView: readString(item, 'westernView', '西医侧重风险排查。'),
        tcmView: readString(item, 'tcmView', '中医侧重证候调养。'),
        resolution: readEnum(item, 'resolution', ['adopt_western', 'adopt_tcm', 'combine', 'reject_both', 'ask_follow_up'] as const, 'ask_follow_up'),
        adoptedFrom: readEnum(item, 'adoptedFrom', ['western', 'tcm', 'both', 'neither', 'pending_more_info'] as const, 'pending_more_info'),
        reason: readString(item, 'reason', '信息不足时先追问，存在安全风险时以医学评估优先。'),
        safetyPriority: readBoolean(item, 'safetyPriority', true),
      })),
      needsFollowUp: readBoolean(value, 'needsFollowUp', base.needsFollowUp),
      followUpReason: readString(value, 'followUpReason', base.followUpReason),
      requiredFollowUpQuestions: readStringArray(value, 'requiredFollowUpQuestions', base.requiredFollowUpQuestions),
      integrativeRecommendations: asArray(value.integrativeRecommendations, base.integrativeRecommendations).map((item) => ({
        category: readEnum(item, 'category', ['medical_care', 'monitoring', 'lifestyle', 'tcm_regulation', 'avoidance'] as const, 'monitoring'),
        title: readString(item, 'title', '观察症状变化'),
        details: readString(item, 'details', '记录症状变化，若持续或加重请线下就医。'),
        priority: readEnum(item, 'priority', ['immediate', 'soon', 'routine'] as const, 'routine'),
      })),
      followUpQuestions: readStringArray(value, 'followUpQuestions', base.followUpQuestions),
      redFlagCoverage: asArray(value.redFlagCoverage, base.redFlagCoverage).map((item) => ({
        category: readString(item, 'category', '基础安全筛查'),
        checked: readBoolean(item, 'checked', true),
        positive: readBoolean(item, 'positive', false),
        note: readString(item, 'note', '未提示明确红旗。'),
      })),
      disclaimer: readString(value, 'disclaimer', base.disclaimer),
    };
  }

  return parsed;
}

function asArray(value: unknown, fallback: unknown[] = []) {
  return Array.isArray(value) ? value : fallback;
}

function readString(source: unknown, key: string, fallback = '') {
  if (!source || typeof source !== 'object') return fallback;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readStringArray(source: unknown, key: string, fallback: string[] = []) {
  if (!source || typeof source !== 'object') return fallback;
  const value = (source as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : fallback;
}

function readBoolean(source: unknown, key: string, fallback: boolean) {
  if (!source || typeof source !== 'object') return fallback;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : fallback;
}

function readEnum<const T extends readonly string[]>(source: unknown, key: string, values: T, fallback: T[number]): T[number] {
  if (!source || typeof source !== 'object') return fallback;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && values.includes(value) ? (value as T[number]) : fallback;
}

function buildEmptyWesternReview(): WesternReviewOfTcm {
  return {
    referenceable: [],
    potentiallyMisleading: [],
    checksNeeded: [],
  };
}

function buildEmptyTcmReview(): TcmReviewOfWestern {
  return {
    needsMoreTcmInfo: [],
    safetyBoundaries: [],
    conflicts: [],
  };
}

function buildEmergencyResult(redFlagResult: RedFlagTriageResult): IntegratedDiagnosisResult {
  const reasons = redFlagResult.findings.map((finding) => `${finding.category}：${finding.reason}`);
  return {
    safetyLevel: 'emergency',
    mustSeekImmediateCare: true,
    immediateCareReasons: reasons,
    summary: `你提供的信息包含需要立即就医/急救评估的红旗信号：${reasons.join('；')}。请立即联系当地急救服务或尽快前往急诊。`,
    westernPerspective: '西医视角：当前优先级是排查可能危及生命或需要紧急处理的情况，不建议在家观察替代就医。',
    tcmPerspective: '中医视角：急症风险下不应先行居家调理，应先完成急诊或线下医生评估。',
    conflictResolution: ['已按最高安全优先级处理：急症排查优先于任何调理建议。'],
    decisionMatrix: [
      {
        claim: '立即联系急救或前往急诊',
        source: 'safety_rule',
        decision: 'adopted',
        reason: '已命中急症红旗，安全门控优先级高于所有解释和调养建议。',
        safetyImpact: '避免因居家观察或调养而延误急症处理。',
      },
      {
        claim: '先进行中医调理或观察数日',
        source: 'tcm_only',
        decision: 'not_adopted',
        reason: '急症风险下不能用调理替代急诊评估。',
        safetyImpact: '降低延误就医风险。',
      },
    ],
    arbitrationDecisions: [
      {
        topic: '急症红旗与调养建议的优先级',
        westernView: '先排除危及生命或需紧急处理的情况。',
        tcmView: '急症风险下不先行居家调理。',
        resolution: 'adopt_western',
        adoptedFrom: 'western',
        reason: '安全优先，急症排查优先于任何调养建议。',
        safetyPriority: true,
      },
    ],
    needsFollowUp: false,
    followUpReason: '',
    requiredFollowUpQuestions: [],
    integrativeRecommendations: [
      { category: 'medical_care', title: '立即就医', details: '请立即联系当地急救服务或前往急诊，并携带近期用药、过敏史和症状记录。', priority: 'immediate' },
      { category: 'avoidance', title: '不要延误', details: '不要用休息、食疗、中药或观察几天来替代急诊评估。', priority: 'immediate' },
    ],
    followUpQuestions: ['是否已经联系急救或身边可信任的人陪同就医？'],
    redFlagCoverage: redFlagResult.findings.map((finding) => ({ category: finding.category, checked: true, positive: true, note: finding.reason })),
    disclaimer: DISCLAIMER,
  };
}

function enforceFinalSafety(result: IntegratedDiagnosisResult, redFlagResult: RedFlagTriageResult): IntegratedDiagnosisResult {
  if (!redFlagResult.mustSeekImmediateCare) return result;
  const emergency = buildEmergencyResult(redFlagResult);
  return {
    ...result,
    safetyLevel: 'emergency',
    mustSeekImmediateCare: true,
    immediateCareReasons: emergency.immediateCareReasons,
    summary: emergency.summary,
    integrativeRecommendations: emergency.integrativeRecommendations,
    redFlagCoverage: emergency.redFlagCoverage,
    disclaimer: result.disclaimer || DISCLAIMER,
  };
}

function buildGenerationStatus(
  western: GenerationStatus['western'],
  tcm: GenerationStatus['tcm'],
  integrated: GenerationStatus['integrated'],
  warnings: Array<string | undefined> = [],
  coordinator?: CoordinatorTrace,
  westernCross?: GenerationStatus['westernCross'],
  tcmCross?: GenerationStatus['tcmCross'],
): GenerationStatus {
  const cleanWarnings = warnings.filter((item): item is string => Boolean(item?.trim()));
  const degraded = western === 'fallback' || tcm === 'fallback' || integrated === 'fallback' || westernCross === 'fallback' || tcmCross === 'fallback';
  const overall: GenerationStatus['overall'] = integrated === 'fallback' ? 'fallback' : degraded ? 'partial' : 'complete';
  return { overall, western, tcm, westernCross, tcmCross, integrated, degraded, warnings: cleanWarnings, coordinator };
}

function buildCoordinatorTrace(input: {
  events: CoordinatorEvent[];
  includeRecentHealthContext: boolean | undefined;
  contextSnapshot: unknown;
  redFlagResult: RedFlagTriageResult;
  westernGeneration: StructuredGeneration<WesternAssessment>;
  tcmGeneration: StructuredGeneration<TcmAssessment>;
  westernCrossGeneration: StructuredGeneration<WesternReviewOfTcm>;
  tcmCrossGeneration: StructuredGeneration<TcmReviewOfWestern>;
  integratedGeneration: StructuredGeneration<IntegratedDiagnosisResult>;
  crossExamination: CrossExamination;
  westernStartedAt: Date;
  tcmStartedAt: Date;
  westernEndedAt: Date;
  tcmEndedAt: Date;
  westernCrossStartedAt?: Date;
  tcmCrossStartedAt?: Date;
  westernCrossEndedAt?: Date;
  tcmCrossEndedAt?: Date;
  integratorStartedAt: Date;
  integratorEndedAt: Date;
}): CoordinatorTrace {
  const hasMemory = Boolean(
    input.contextSnapshot &&
      typeof input.contextSnapshot === 'object' &&
      (input.contextSnapshot as Record<string, unknown>).longTermMemory,
  );

  return {
    strategy: '红旗门控 -> 西医/中医初评 -> 双向交叉质询 -> 决策者采纳仲裁 -> 后端安全裁决',
    events: input.events,
    steps: [
      buildCoordinatorStep('red_flag_triage', 'complete', input.redFlagResult.findings.length ? `发现 ${input.redFlagResult.findings.length} 个红旗线索。` : '未发现需要立即急救的红旗线索。'),
      buildCoordinatorStep(
        'long_term_memory_context',
        input.includeRecentHealthContext ? 'complete' : 'skipped',
        input.includeRecentHealthContext ? (hasMemory ? '已注入长期健康基线和相关历史记录。' : '已尝试注入长期记忆，但历史记录不足。') : '用户未选择包含近期健康上下文。',
      ),
      buildCoordinatorStep('western_initial', input.westernGeneration.status, agentStatusNote('西医 Agent 初评', input.westernGeneration), input.westernStartedAt, input.westernEndedAt),
      buildCoordinatorStep('tcm_initial', input.tcmGeneration.status, agentStatusNote('中医 Agent 初评', input.tcmGeneration), input.tcmStartedAt, input.tcmEndedAt),
      buildCoordinatorStep('western_cross', input.westernCrossGeneration.status, agentStatusNote('西医 Agent 交叉质询', input.westernCrossGeneration), input.westernCrossStartedAt, input.westernCrossEndedAt),
      buildCoordinatorStep('tcm_cross', input.tcmCrossGeneration.status, agentStatusNote('中医 Agent 交叉质询', input.tcmCrossGeneration), input.tcmCrossStartedAt, input.tcmCrossEndedAt),
      buildCoordinatorStep('integrator', input.integratedGeneration.status, agentStatusNote('决策者 Agent', input.integratedGeneration), input.integratorStartedAt, input.integratorEndedAt),
      buildCoordinatorStep('safety_arbitration', 'complete', '最终输出再次经过红旗安全约束和保守建议裁决。'),
    ],
    arbitration: [
      '西医 Agent 先判断红旗、可能方向和检查边界；中医 Agent 先判断证候倾向和低风险调养边界。',
      '交叉质询阶段要求西医审查中医建议是否可能误导，中医审查西医结论是否缺少辨证信息。',
      '决策者逐项输出采纳/不采纳/原因；冲突时按安全优先、证据优先、保守建议优先处理。',
      '如果关键信息不足，决策者可以要求先追问，再重新进入会诊。',
    ],
    crossExamination: input.crossExamination,
  };
}

function addCoordinatorEvent(events: CoordinatorEvent[], type: string, title: string, status?: string, detail?: string, at = new Date()) {
  events.push({
    at: at.toISOString(),
    type,
    title,
    status,
    detail,
  });
}

function buildCoordinatorStep(
  name: string,
  status: CoordinatorTrace['steps'][number]['status'],
  note?: string,
  startedAt?: Date,
  endedAt?: Date,
): CoordinatorTrace['steps'][number] {
  return {
    name,
    status,
    startedAt: startedAt?.toISOString(),
    endedAt: endedAt?.toISOString(),
    note,
  };
}

function generationStepData<T>(generation: StructuredGeneration<T>) {
  return generation.usage
    ? { warning: generation.warning, output: generation.value, usage: generation.usage }
    : { warning: generation.warning, output: generation.value };
}

function sumUsage(generations: Array<StructuredGeneration<unknown>>): StructuredGenerationUsage | undefined {
  const hasInput = generations.some((generation) => generation.usage?.inputTokens !== undefined);
  const hasOutput = generations.some((generation) => generation.usage?.outputTokens !== undefined);
  if (!hasInput && !hasOutput) return undefined;

  const usage: StructuredGenerationUsage = {};
  if (hasInput) {
    usage.inputTokens = generations.reduce((sum, generation) => sum + (generation.usage?.inputTokens ?? 0), 0);
  }
  if (hasOutput) {
    usage.outputTokens = generations.reduce((sum, generation) => sum + (generation.usage?.outputTokens ?? 0), 0);
  }
  return usage;
}

function agentStatusNote(name: string, generation: StructuredGeneration<unknown>) {
  return generation.status === 'complete' ? `${name} 已完成结构化输出。` : generation.warning ?? `${name} 使用保守 fallback。`;
}

function summarizeWestern(generation: StructuredGeneration<WesternAssessment>) {
  if (generation.status === 'fallback' || !generation.value) return '使用保守兜底';
  return `识别 ${generation.value.diagnosticHypotheses.length} 个可能方向`;
}

function summarizeTcm(generation: StructuredGeneration<TcmAssessment>) {
  if (generation.status === 'fallback' || !generation.value) return '使用保守兜底';
  return `提出 ${generation.value.patternHypotheses.length} 个证候倾向`;
}

function summarizeWesternCross(generation: StructuredGeneration<WesternReviewOfTcm>) {
  if (generation.status === 'fallback' || !generation.value) return '使用保守边界';
  return `${generation.value.referenceable.length} 条可参考，${generation.value.potentiallyMisleading.length} 条需谨慎`;
}

function summarizeTcmCross(generation: StructuredGeneration<TcmReviewOfWestern>) {
  if (generation.status === 'fallback' || !generation.value) return '使用保守边界';
  return `${generation.value.needsMoreTcmInfo.length} 条需补充，${generation.value.conflicts.length} 个冲突点`;
}

function buildEmptyWestern(): WesternAssessment {
  return {
    urgency: 'routine',
    redFlags: [],
    diagnosticHypotheses: [],
    recommendedChecks: [],
    selfCareBoundaries: [],
    seekCareCriteria: [],
    missingInformation: [],
  };
}

function buildEmptyTcm(): TcmAssessment {
  return {
    urgency: 'routine',
    redFlags: [],
    patternHypotheses: [],
    tonguePulseQuestions: [],
    constitutionAndPatternRationale: '需要结合舌象、脉象和整体信息进一步辨证。',
    regulationSuggestions: [],
    contraindications: [],
    missingInformation: [],
  };
}

function buildConservativeIntegrated(): IntegratedDiagnosisResult {
  return {
    safetyLevel: 'clinician_recommended',
    mustSeekImmediateCare: false,
    immediateCareReasons: [],
    summary: '当前信息不足以形成完整综合判断。请优先观察症状变化和红旗信号；如不适持续、加重或影响日常功能，建议线下咨询医生。',
    westernPerspective: '如症状持续、加重、伴随发热/胸痛/呼吸困难/神经功能异常等风险表现，应优先进行线下医学评估。',
    tcmPerspective: '在急性、加重或原因不明的情况下，不建议自行用药或强刺激调理；可先保持规律作息、清淡饮食和充足休息。',
    conflictResolution: ['安全优先：一旦出现红旗表现或症状进展，应先线下就医，再考虑日常调养。'],
    decisionMatrix: [
      {
        claim: '记录症状变化并关注红旗信号',
        source: 'consensus',
        decision: 'adopted',
        reason: '西医与中医视角都需要更多连续信息来降低误判风险。',
        safetyImpact: '有助于及时发现症状加重并为线下医生提供依据。',
      },
      {
        claim: '自行使用药物、中药方剂或强刺激手法处理',
        source: 'safety_rule',
        decision: 'not_adopted',
        reason: '当前信息不足，且自行处理可能掩盖或延误需要评估的问题。',
        safetyImpact: '减少用药和延误就医风险。',
      },
      {
        claim: '补充关键症状、体征和舌脉信息后再完成会诊',
        source: 'consensus',
        decision: 'needs_follow_up',
        reason: '信息不足时先追问比直接给出确定性建议更安全。',
        safetyImpact: '降低过度推断和错误调养风险。',
      },
    ],
    arbitrationDecisions: [
      {
        topic: '信息不足时是否直接给最终建议',
        westernView: '缺少病程、严重度和伴随症状时，应先排除红旗并建议必要时线下评估。',
        tcmView: '缺少舌象、脉象、寒热、二便等信息时，不宜做明确证候判断。',
        resolution: 'ask_follow_up',
        adoptedFrom: 'pending_more_info',
        reason: '两侧都提示信息不足，决策者选择先追问并保留低风险建议。',
        safetyPriority: true,
      },
    ],
    needsFollowUp: true,
    followUpReason: '当前信息不足以完成可靠会诊，需要补充关键病程、严重程度、伴随症状和中医观察信息。',
    requiredFollowUpQuestions: [
      '症状从什么时候开始，持续多久，严重程度 1-10 分是多少？',
      '是否伴随发热、胸痛、呼吸困难、单侧无力、意识异常、严重腹痛、出血或自伤风险？',
      '舌色、舌苔、寒热偏好、汗出、口渴、食欲、大小便和情绪变化如何？',
    ],
    integrativeRecommendations: [
      { category: 'monitoring', title: '记录症状变化', details: '记录开始时间、严重程度、诱发/缓解因素、体温、心率、血压、血氧等信息，便于后续医生判断。', priority: 'routine' },
      { category: 'medical_care', title: '必要时线下评估', details: '若不适持续不缓解、明显加重或影响日常活动，请尽快咨询线下医生。', priority: 'soon' },
      { category: 'avoidance', title: '避免自行强处理', details: '不要自行叠加药物、中药方剂或强刺激手法来替代专业诊疗。', priority: 'routine' },
    ],
    followUpQuestions: ['症状持续了多久？严重程度 1-10 分是多少？是否伴随发热、胸痛、呼吸困难、单侧无力或意识异常？'],
    redFlagCoverage: [],
    disclaimer: DISCLAIMER,
  };
}

function toDiagnosisSession(session: {
  id: string;
  status: string;
  safetyLevel: DiagnosisSafetyLevel | null;
  input: unknown;
  contextSnapshot: unknown;
  redFlagResult: unknown;
  westernOutput: unknown;
  tcmOutput: unknown;
  integratedOutput: unknown;
  generationStatus: unknown;
  provider: string | null;
  model: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

