import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diagnosisFollowUpRequestSchema,
  diagnosisFollowUpResultSchema,
  type DiagnosisInput,
  type IntegratedDiagnosisResult,
  type WesternAssessment,
} from '@health/shared';
import { CrisisPolicyService } from '../src/safety/crisis-policy.service';
import { enforceFinalSafety, mergeSupplementText } from '../src/integrative-diagnosis/integrative-diagnosis.service';
import { RedFlagTriageService, hasAffirmedKeyword } from '../src/integrative-diagnosis/red-flag-triage.service';

function input(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    chiefComplaint: '轻微不适',
    symptoms: [{ name: '乏力', triggers: [], relievers: [], associatedSymptoms: [] }],
    vitals: {},
    lifestyleSignals: {},
    medicalContext: { chronicConditions: [], medications: [], allergies: [], recentDiagnoses: [] },
    tcmObservations: {},
    includeRecentHealthContext: false,
    ...overrides,
  };
}

const supportive: IntegratedDiagnosisResult = {
  safetyLevel: 'supportive',
  mustSeekImmediateCare: false,
  immediateCareReasons: [],
  summary: '可继续观察。',
  westernPerspective: '暂无明确红旗。',
  tcmPerspective: '仅作低风险观察。',
  conflictResolution: [],
  decisionMatrix: [],
  arbitrationDecisions: [],
  needsFollowUp: false,
  followUpReason: '',
  requiredFollowUpQuestions: [],
  integrativeRecommendations: [],
  followUpQuestions: [],
  redFlagCoverage: [],
  disclaimer: '模型生成的免责声明',
};

test('negated, resolved historical and other-person symptoms are not current red flags', () => {
  assert.equal(hasAffirmedKeyword('目前没有胸痛', '胸痛'), false);
  assert.equal(hasAffirmedKeyword('目前没有胸痛或呼吸困难', '呼吸困难'), false);
  assert.equal(hasAffirmedKeyword('没有胸痛、胸闷和呼吸困难', '呼吸困难'), false);
  assert.equal(hasAffirmedKeyword('没有胸痛但有呼吸困难', '呼吸困难'), true);
  assert.equal(hasAffirmedKeyword('以前有过胸痛，现在已经好了', '胸痛'), false);
  assert.equal(hasAffirmedKeyword('父亲胸痛，我只是来咨询', '胸痛'), false);
  assert.equal(hasAffirmedKeyword('我现在胸痛并且出冷汗', '胸痛'), true);
});

test('triage distinguishes urgent abnormal pulse from emergency chest pain', () => {
  const triage = new RedFlagTriageService(new CrisisPolicyService());
  const urgent = triage.evaluate(input({ vitals: { heartRate: 130 } }));
  assert.equal(urgent.safetyLevel, 'urgent');
  assert.equal(urgent.mustSeekImmediateCare, false);

  const emergency = triage.evaluate(input({ chiefComplaint: '我现在胸痛并且大汗' }));
  assert.equal(emergency.safetyLevel, 'emergency');
  assert.equal(emergency.mustSeekImmediateCare, true);
});

test('red-flag questions are not mistaken for symptoms when the user denies them', () => {
  const triage = new RedFlagTriageService(new CrisisPolicyService());
  const result = triage.evaluate(
    input({
      freeText: '预问诊 Agent 追问与用户回答：\n问：有没有胸痛、呼吸困难或大量出血？\n答：都没有，只是有点累',
    }),
  );
  assert.equal(result.mustSeekImmediateCare, false);
  assert.equal(result.findings.length, 0);
});

test('an emergency reported by an expert always upgrades the final result', () => {
  const western: WesternAssessment = {
    urgency: 'emergency',
    redFlags: [{ category: '胸痛', reason: '需要排查急性心血管事件', matchedEvidence: ['胸痛'], urgency: 'emergency' }],
    diagnosticHypotheses: [],
    recommendedChecks: [],
    selfCareBoundaries: [],
    seekCareCriteria: [],
    missingInformation: [],
  };
  const result = enforceFinalSafety(supportive, { safetyLevel: 'supportive', mustSeekImmediateCare: false, findings: [] }, western, null);
  assert.equal(result.safetyLevel, 'emergency');
  assert.equal(result.mustSeekImmediateCare, true);
  assert.match(result.summary, /立即/);
});

test('supplement keeps the original context and caps stored free text', () => {
  const merged = mergeSupplementText('原始信息', { additionalInformation: '疼痛持续加重' });
  assert.match(merged, /原始信息/);
  assert.match(merged, /疼痛持续加重/);
  assert.ok(mergeSupplementText('a'.repeat(2999), { additionalInformation: '新信息' }).length <= 3000);
});

test('follow-up questions stay short and support quick answers', () => {
  const request = diagnosisFollowUpRequestSchema.parse({
    chiefComplaint: '胃部不适',
    redFlagSigns: [],
  });
  assert.equal(request.redFlagUncertain, false);

  const question = {
    id: 'duration',
    question: '持续多久了？',
    reason: '用于判断病程。',
    priority: 'symptom_detail' as const,
    answerHint: '选择或输入时间。',
    suggestedAnswers: ['今天开始', '1-3 天', '不清楚'],
  };
  const valid = diagnosisFollowUpResultSchema.safeParse({
    summary: '补充少量关键信息。',
    questions: [question],
    missingFields: ['duration'],
  });
  assert.equal(valid.success, true);

  const tooMany = diagnosisFollowUpResultSchema.safeParse({
    summary: '问题过多。',
    questions: [question, question, question, question],
    missingFields: [],
  });
  assert.equal(tooMany.success, false);
});
