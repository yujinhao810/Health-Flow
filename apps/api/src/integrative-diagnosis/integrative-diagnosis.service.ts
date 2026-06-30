import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  diagnosisInputSchema,
  integratedDiagnosisResultJsonSchema,
  integratedDiagnosisResultSchema,
  tcmAssessmentJsonSchema,
  tcmAssessmentSchema,
  westernAssessmentJsonSchema,
  westernAssessmentSchema,
  type DiagnosisInput,
  type DiagnosisSafetyLevel,
  type GenerationStatus,
  type IntegratedDiagnosisResult,
  type TcmAssessment,
  type WesternAssessment,
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

type StructuredGeneration<T> = {
  value: T | null;
  status: 'complete' | 'fallback';
  warning?: string;
};

type CoordinatorTrace = NonNullable<GenerationStatus['coordinator']>;

@Injectable()
export class IntegrativeDiagnosisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: DiagnosisContextService,
    private readonly triage: RedFlagTriageService,
    private readonly llm: LlmService,
    private readonly agentRuns: AgentRunService,
  ) {}

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
    await this.agentRuns.addStep(agentRun.id, { type: 'red_flag_triage', title: '红旗安全门控', status: redFlagResult.mustSeekImmediateCare ? 'failed' : 'complete', data: redFlagResult });
    await this.agentRuns.addStep(agentRun.id, { type: 'memory_loaded', title: '加载长期健康记忆', status: 'complete', data: contextSnapshot });

    try {
      if (redFlagResult.mustSeekImmediateCare) {
        const integratedOutput = buildEmergencyResult(redFlagResult);
        const generationStatus = buildGenerationStatus('complete', 'complete', 'complete', [], {
          strategy: 'red-flag gate -> emergency safety override',
          steps: [
            buildCoordinatorStep('red_flag_triage', 'complete', '命中急症红旗，跳过多 Agent 生成。'),
            buildCoordinatorStep('western_agent', 'skipped', '安全门控已阻断。'),
            buildCoordinatorStep('tcm_agent', 'skipped', '安全门控已阻断。'),
            buildCoordinatorStep('integrator', 'skipped', '直接输出急症安全建议。'),
          ],
          arbitration: ['红旗安全优先级高于任何调理或解释型建议。'],
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
      await this.agentRuns.addStep(agentRun.id, { type: 'parallel_agents_started', title: '并行启动西医/中医 Agent', status: 'running' });
      const [westernGeneration, tcmGeneration] = await Promise.all([
        this.runWestern(config, basePayload),
        this.runTcm(config, basePayload),
      ]);
      await this.agentRuns.addStep(agentRun.id, { type: 'western_agent', title: '西医 Agent', status: westernGeneration.status, data: { warning: westernGeneration.warning, output: westernGeneration.value } });
      await this.agentRuns.addStep(agentRun.id, { type: 'tcm_agent', title: '中医 Agent', status: tcmGeneration.status, data: { warning: tcmGeneration.warning, output: tcmGeneration.value } });
      const parallelEndedAt = new Date();
      const partialGenerationStatus = buildGenerationStatus(westernGeneration.status, tcmGeneration.status, 'complete', [
        westernGeneration.warning,
        tcmGeneration.warning,
      ]);

      const integratorStartedAt = new Date();
      await this.agentRuns.addStep(agentRun.id, { type: 'integrator_started', title: 'Integrator 仲裁', status: 'running' });
      const integratedGeneration = await this.runIntegrator(config, {
        ...basePayload,
        generationStatus: partialGenerationStatus,
        westernOutput: westernGeneration.value,
        tcmOutput: tcmGeneration.value,
      });
      const integratorEndedAt = new Date();
      await this.agentRuns.addStep(agentRun.id, { type: 'integrator', title: 'Integrator 仲裁结果', status: integratedGeneration.status, data: { warning: integratedGeneration.warning, output: integratedGeneration.value } });
      const coordinator = buildCoordinatorTrace({
        includeRecentHealthContext: diagnosisInput.includeRecentHealthContext,
        contextSnapshot,
        redFlagResult,
        westernGeneration,
        tcmGeneration,
        integratedGeneration,
        westernStartedAt,
        parallelEndedAt,
        integratorStartedAt,
        integratorEndedAt,
      });
      const generationStatus = buildGenerationStatus(westernGeneration.status, tcmGeneration.status, integratedGeneration.status, [
        westernGeneration.warning,
        tcmGeneration.warning,
        integratedGeneration.warning,
      ], coordinator);
      const finalOutput = enforceFinalSafety(integratedGeneration.value ?? buildConservativeIntegrated(), redFlagResult);

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
      await this.agentRuns.addStep(agentRun.id, { type: 'safety_arbitration', title: '最终安全裁决', status: 'complete', data: { safetyLevel: finalOutput.safetyLevel } });
      await this.agentRuns.complete(agentRun.id);
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
      return { value: validator.parse(normalizeStructuredOutput(schemaName, result.parsed, fallback)), status: 'complete' };
    } catch (error) {
      console.warn(`[integrative-diagnosis] ${schemaName} structured generation failed`, error instanceof Error ? error.message : error);
      return { value: options?.fallbackValue ?? null, status: 'fallback', warning };
    }
  }
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

function readEnum<const T extends readonly string[]>(source: unknown, key: string, values: T, fallback: T[number]) {
  if (!source || typeof source !== 'object') return fallback;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && values.includes(value) ? value : fallback;
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
): GenerationStatus {
  const cleanWarnings = warnings.filter((item): item is string => Boolean(item?.trim()));
  const degraded = western === 'fallback' || tcm === 'fallback' || integrated === 'fallback';
  const overall: GenerationStatus['overall'] = integrated === 'fallback' ? 'fallback' : degraded ? 'partial' : 'complete';
  return { overall, western, tcm, integrated, degraded, warnings: cleanWarnings, coordinator };
}

function buildCoordinatorTrace(input: {
  includeRecentHealthContext: boolean | undefined;
  contextSnapshot: unknown;
  redFlagResult: RedFlagTriageResult;
  westernGeneration: StructuredGeneration<WesternAssessment>;
  tcmGeneration: StructuredGeneration<TcmAssessment>;
  integratedGeneration: StructuredGeneration<IntegratedDiagnosisResult>;
  westernStartedAt: Date;
  parallelEndedAt: Date;
  integratorStartedAt: Date;
  integratorEndedAt: Date;
}): CoordinatorTrace {
  const hasMemory = Boolean(
    input.contextSnapshot &&
      typeof input.contextSnapshot === 'object' &&
      (input.contextSnapshot as Record<string, unknown>).longTermMemory,
  );

  return {
    strategy: 'red-flag gate -> parallel western/tcm agents -> integrator arbitration -> final safety enforcement',
    steps: [
      buildCoordinatorStep('red_flag_triage', 'complete', input.redFlagResult.findings.length ? `发现 ${input.redFlagResult.findings.length} 个红旗线索。` : '未发现需要立即急救的红旗线索。'),
      buildCoordinatorStep(
        'long_term_memory_context',
        input.includeRecentHealthContext ? 'complete' : 'skipped',
        input.includeRecentHealthContext ? (hasMemory ? '已注入长期健康基线和相关历史记录。' : '已尝试注入长期记忆，但历史记录不足。') : '用户未选择包含近期健康上下文。',
      ),
      buildCoordinatorStep('western_agent', input.westernGeneration.status, agentStatusNote('西医 Agent', input.westernGeneration), input.westernStartedAt, input.parallelEndedAt),
      buildCoordinatorStep('tcm_agent', input.tcmGeneration.status, agentStatusNote('中医 Agent', input.tcmGeneration), input.westernStartedAt, input.parallelEndedAt),
      buildCoordinatorStep('integrator', input.integratedGeneration.status, agentStatusNote('Integrator', input.integratedGeneration), input.integratorStartedAt, input.integratorEndedAt),
      buildCoordinatorStep('safety_arbitration', 'complete', '最终输出再次经过红旗安全约束和保守建议裁决。'),
    ],
    arbitration: [
      '西医 Agent 负责红旗、可能方向、检查边界；中医 Agent 负责体质/证候倾向和低风险调养边界。',
      'Integrator 汇总两侧输出，冲突时按安全优先、证据优先、保守建议优先处理。',
      '任何红旗或不确定性都会提升线下就医/复查建议优先级。',
    ],
  };
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

function agentStatusNote(name: string, generation: StructuredGeneration<unknown>) {
  return generation.status === 'complete' ? `${name} 已完成结构化输出。` : generation.warning ?? `${name} 使用保守 fallback。`;
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

