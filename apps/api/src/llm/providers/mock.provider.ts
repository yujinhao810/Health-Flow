import { Injectable } from '@nestjs/common';
import { LlmEmbeddingRequest, LlmProvider, LlmStreamRequest, LlmStreamEvent, LlmStructuredRequest } from '../llm.types';

@Injectable()
export class MockProvider implements LlmProvider {
  name = 'mock' as const;
  capabilities = { supportsToolUse: false, supportsEmbeddings: true };

  async validate() {
    return { valid: true, message: 'Mock provider 可用' };
  }

  async *streamChat(_request: LlmStreamRequest): AsyncIterable<LlmStreamEvent> {
    const chunks = ['我理解你的感受。', '从近期记录看，', '我们可以先关注睡眠和压力变化，', '并尝试一个很小的调整。'];
    let fullText = '';

    for (const text of chunks) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      fullText += text;
      yield { type: 'delta', text };
    }

    yield { type: 'usage', inputTokens: 0, outputTokens: fullText.length };
    yield { type: 'done', fullText };
  }

  async generateStructured<T = unknown>(request: LlmStructuredRequest) {
    const parsed = buildMockStructured(request.schemaName) as T;
    return { parsed, rawText: JSON.stringify(parsed), usage: { inputTokens: 0, outputTokens: JSON.stringify(parsed).length } };
  }

  async embedTexts(request: LlmEmbeddingRequest) {
    return {
      vectors: request.texts.map((text) => localEmbedding(text)),
      model: 'mock-local-hash-embedding',
    };
  }
}

function localEmbedding(text: string, dimensions = 384) {
  const vector = Array.from({ length: dimensions }, () => 0);
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const tokens = Array.from(new Set([...normalized.matchAll(/[\p{L}\p{N}]{2,}|[\u4e00-\u9fff]/gu)].map((match) => match[0])));

  for (const token of tokens.length ? tokens : [normalized.slice(0, 120)]) {
    const index = Math.abs(hash(token)) % dimensions;
    vector[index] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result;
}

function buildMockStructured(schemaName: string) {
  if (schemaName === 'western_review_of_tcm') {
    return {
      referenceable: [
        { point: '规律作息和轻柔放松可作为低风险参考', reason: '这类建议通常不会替代医学评估，也有助于观察症状变化。' },
      ],
      potentiallyMisleading: [
        {
          point: '仅凭证候倾向就判断无需就医',
          risk: '可能忽略急性加重、发热、胸痛、呼吸困难等需要医学评估的情况。',
          saferFraming: '中医调养只能作为辅助，出现红旗或持续加重时优先线下就医。',
        },
      ],
      checksNeeded: [
        { issue: '症状持续或加重', recommendedCheck: '线下医生评估并记录体温、心率等基础体征', timing: 'routine', reason: '用于确认是否存在需要进一步检查的风险。' },
      ],
    };
  }

  if (schemaName === 'tcm_review_of_western') {
    return {
      needsMoreTcmInfo: [
        { patternOrIssue: '气血与寒热倾向', missingInfo: ['舌色舌苔', '寒热偏好', '汗出和口渴', '二便情况'], reason: '缺少这些信息时不宜做明确证候判断。' },
      ],
      safetyBoundaries: [
        { westernRedFlagOrConcern: '症状持续或出现红旗', tcmAdjustment: '调养建议保持低风险，不替代就医和检查。', reason: '安全优先于辨证调养。' },
      ],
      conflicts: [
        { topic: '观察调养与线下评估优先级', westernView: '症状持续或加重时应线下评估。', tcmView: '可做低风险起居调养。', concern: '调养不能被理解为可以推迟就医。' },
      ],
    };
  }

  if (schemaName.includes('western')) {
    return {
      urgency: 'routine',
      redFlags: [],
      diagnosticHypotheses: [
        {
          name: '睡眠不足或压力相关的不适可能',
          likelihood: 'medium',
          rationale: '根据当前信息，症状与作息、压力和近期活动变化可能相关，但不能据此确诊。',
          supportingFindings: ['用户提供了疲劳或不适描述'],
          againstFindings: ['暂无明确急性红旗信息'],
          notADiagnosis: true,
        },
      ],
      recommendedChecks: [{ name: '记录体温、心率和症状变化', timing: 'routine', reason: '帮助判断是否需要线下评估' }],
      selfCareBoundaries: ['若症状加重或出现红旗表现，应停止自行观察并及时就医。'],
      seekCareCriteria: ['症状持续不缓解、明显加重或影响日常功能时，建议线下就医。'],
      missingInformation: ['症状持续了多久？是否伴随发热、胸痛、呼吸困难或神经系统异常？'],
    };
  }

  if (schemaName.includes('tcm')) {
    return {
      urgency: 'routine',
      redFlags: [],
      patternHypotheses: [
        {
          name: '气机不畅或气血不足倾向',
          likelihood: 'low',
          rationale: '仅基于有限信息作辅助辨证假设，需要结合舌象、脉象和线下辨证确认。',
          supportingFindings: ['用户有不适或疲劳相关描述'],
          notADiagnosis: true,
        },
      ],
      tonguePulseQuestions: ['舌质偏淡、偏红还是正常？舌苔厚薄、颜色如何？脉象是否由中医师触诊过？'],
      constitutionAndPatternRationale: '当前资料不足以形成明确证候，只能作为低风险调养方向参考。',
      regulationSuggestions: [{ category: 'routine', suggestion: '保持规律作息，避免过度劳累。', safetyNote: '如有急性或加重症状，应优先就医。' }],
      contraindications: ['不要自行使用中药方剂替代医生诊疗。'],
      missingInformation: ['寒热、汗出、口渴、食欲、二便和情绪变化如何？'],
    };
  }

  return {
    safetyLevel: 'supportive',
    mustSeekImmediateCare: false,
    immediateCareReasons: [],
    summary: '当前信息未显示明确急症红旗，可先做健康记录和低风险调理；这不是正式诊断。',
    westernPerspective: '西医视角建议观察症状变化，必要时线下评估。',
    tcmPerspective: '中医视角可从作息、饮食、情志方面温和调养，并补充舌象脉象信息。',
    conflictResolution: ['若出现急症表现，以线下急诊和医学检查优先。'],
    decisionMatrix: [
      {
        claim: '记录症状变化并关注红旗',
        source: 'consensus',
        decision: 'adopted',
        reason: '两侧都认可先收集连续信息并保持安全边界。',
        safetyImpact: '有助于发现需要线下评估的变化。',
      },
      {
        claim: '用中医调养替代检查或就医',
        source: 'safety_rule',
        decision: 'not_adopted',
        reason: '调养只能辅助，不应替代医学评估。',
        safetyImpact: '避免延误风险。',
      },
      {
        claim: '补充舌象脉象和病程信息',
        source: 'consensus',
        decision: 'needs_follow_up',
        reason: '信息更完整后，会诊判断更稳妥。',
        safetyImpact: '减少过度推断。',
      },
    ],
    arbitrationDecisions: [
      {
        topic: '低风险调养与就医边界',
        westernView: '持续或加重时优先线下评估。',
        tcmView: '可进行低风险起居调养。',
        resolution: 'combine',
        adoptedFrom: 'both',
        reason: '保留低风险调养，同时明确红旗和持续加重时就医优先。',
        safetyPriority: true,
      },
    ],
    needsFollowUp: true,
    followUpReason: 'Mock 模式下信息较少，建议补充关键病程和舌脉观察后再细化会诊。',
    requiredFollowUpQuestions: ['症状持续多久、严重程度多少？', '是否有发热、胸痛、呼吸困难或神经系统异常？', '舌色舌苔、寒热、汗出、口渴和二便情况如何？'],
    integrativeRecommendations: [
      { category: 'monitoring', title: '记录变化', details: '记录体温、心率、睡眠和症状变化。', priority: 'routine' },
      { category: 'lifestyle', title: '规律休息', details: '保证睡眠，避免过劳和刺激性饮食。', priority: 'routine' },
    ],
    followUpQuestions: ['症状持续多久？是否有发热、胸痛、呼吸困难、黑便或神经系统异常？'],
    redFlagCoverage: [{ category: '基础红旗', checked: true, positive: false, note: 'Mock 模式未发现红旗。' }],
    disclaimer: '本建议仅用于健康辅助分诊与调理参考，不能替代医生诊断、治疗或急救服务。',
  };
}
