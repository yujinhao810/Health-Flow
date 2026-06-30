import { z } from 'zod';

export const diagnosisUrgencySchema = z.enum(['emergency', 'urgent', 'routine', 'self_care']);
export type DiagnosisUrgency = z.infer<typeof diagnosisUrgencySchema>;

export const diagnosisSafetyLevelSchema = z.enum(['emergency', 'urgent', 'clinician_recommended', 'supportive']);
export type DiagnosisSafetyLevel = z.infer<typeof diagnosisSafetyLevelSchema>;

export const symptomSchema = z.object({
  name: z.string().min(1),
  bodyPart: z.string().optional(),
  quality: z.string().optional(),
  severity: z.number().min(1).max(10).optional(),
  duration: z.string().optional(),
  triggers: z.array(z.string()).default([]),
  relievers: z.array(z.string()).default([]),
  associatedSymptoms: z.array(z.string()).default([]),
});

export const vitalsSchema = z.object({
  heartRate: z.number().positive().optional(),
  temperatureCelsius: z.number().optional(),
  systolicBloodPressure: z.number().positive().optional(),
  diastolicBloodPressure: z.number().positive().optional(),
  oxygenSaturation: z.number().positive().optional(),
  respiratoryRate: z.number().positive().optional(),
});

export const lifestyleSignalsSchema = z.object({
  sleepHours: z.number().nonnegative().optional(),
  sleepQuality: z.number().min(1).max(5).optional(),
  exerciseMinutes: z.number().nonnegative().optional(),
  activeEnergyKcal: z.number().nonnegative().optional(),
  moodScore: z.number().min(1).max(10).optional(),
});

export const medicalContextSchema = z.object({
  age: z.number().int().positive().optional(),
  sex: z.enum(['female', 'male', 'other', 'unknown']).optional(),
  isPregnant: z.boolean().optional(),
  chronicConditions: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  recentDiagnoses: z.array(z.string()).default([]),
});

export const tcmObservationsSchema = z.object({
  tongueColor: z.string().optional(),
  tongueCoating: z.string().optional(),
  pulse: z.string().optional(),
  coldHeatPreference: z.string().optional(),
  sweating: z.string().optional(),
  thirst: z.string().optional(),
  appetite: z.string().optional(),
  stool: z.string().optional(),
  urination: z.string().optional(),
  emotion: z.string().optional(),
});

export const diagnosisInputSchema = z.object({
  chiefComplaint: z.string().min(1).max(1000),
  symptoms: z.array(symptomSchema).min(1),
  vitals: vitalsSchema.default({}),
  lifestyleSignals: lifestyleSignalsSchema.default({}),
  medicalContext: medicalContextSchema.default({
    chronicConditions: [],
    medications: [],
    allergies: [],
    recentDiagnoses: [],
  }),
  tcmObservations: tcmObservationsSchema.default({}),
  freeText: z.string().max(3000).optional(),
  includeRecentHealthContext: z.boolean().default(true),
});
export type DiagnosisInput = z.infer<typeof diagnosisInputSchema>;

export const redFlagFindingSchema = z.object({
  category: z.string(),
  reason: z.string(),
  matchedEvidence: z.array(z.string()).default([]),
  urgency: diagnosisUrgencySchema,
});
export type RedFlagFinding = z.infer<typeof redFlagFindingSchema>;

export const westernAssessmentSchema = z.object({
  urgency: diagnosisUrgencySchema,
  redFlags: z.array(redFlagFindingSchema).default([]),
  diagnosticHypotheses: z.array(
    z.object({
      name: z.string(),
      likelihood: z.enum(['low', 'medium', 'high']),
      rationale: z.string(),
      supportingFindings: z.array(z.string()).default([]),
      againstFindings: z.array(z.string()).default([]),
      notADiagnosis: z.literal(true),
    }),
  ).default([]),
  recommendedChecks: z.array(
    z.object({
      name: z.string(),
      timing: z.enum(['immediate', 'soon', 'routine']),
      reason: z.string(),
    }),
  ).default([]),
  selfCareBoundaries: z.array(z.string()).default([]),
  seekCareCriteria: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
});
export type WesternAssessment = z.infer<typeof westernAssessmentSchema>;

export const tcmAssessmentSchema = z.object({
  urgency: diagnosisUrgencySchema,
  redFlags: z.array(redFlagFindingSchema).default([]),
  patternHypotheses: z.array(
    z.object({
      name: z.string(),
      likelihood: z.enum(['low', 'medium', 'high']),
      rationale: z.string(),
      supportingFindings: z.array(z.string()).default([]),
      notADiagnosis: z.literal(true),
    }),
  ).default([]),
  tonguePulseQuestions: z.array(z.string()).default([]),
  constitutionAndPatternRationale: z.string(),
  regulationSuggestions: z.array(
    z.object({
      category: z.enum(['diet', 'routine', 'emotion', 'movement', 'acupressure', 'other']),
      suggestion: z.string(),
      safetyNote: z.string().optional(),
    }),
  ).default([]),
  contraindications: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
});
export type TcmAssessment = z.infer<typeof tcmAssessmentSchema>;

export const integratedDiagnosisResultSchema = z.object({
  safetyLevel: diagnosisSafetyLevelSchema,
  mustSeekImmediateCare: z.boolean(),
  immediateCareReasons: z.array(z.string()).default([]),
  summary: z.string(),
  westernPerspective: z.string(),
  tcmPerspective: z.string(),
  conflictResolution: z.array(z.string()).default([]),
  integrativeRecommendations: z.array(
    z.object({
      category: z.enum(['medical_care', 'monitoring', 'lifestyle', 'tcm_regulation', 'avoidance']),
      title: z.string(),
      details: z.string(),
      priority: z.enum(['immediate', 'soon', 'routine']),
    }),
  ).default([]),
  followUpQuestions: z.array(z.string()).default([]),
  redFlagCoverage: z.array(
    z.object({
      category: z.string(),
      checked: z.boolean(),
      positive: z.boolean(),
      note: z.string(),
    }),
  ).default([]),
  disclaimer: z.string(),
});
export type IntegratedDiagnosisResult = z.infer<typeof integratedDiagnosisResultSchema>;

export const generationStepStatusSchema = z.enum(['complete', 'fallback']);
export type GenerationStepStatus = z.infer<typeof generationStepStatusSchema>;

export const generationOverallStatusSchema = z.enum(['complete', 'partial', 'fallback']);
export type GenerationOverallStatus = z.infer<typeof generationOverallStatusSchema>;

export const generationStatusSchema = z.object({
  overall: generationOverallStatusSchema,
  western: generationStepStatusSchema,
  tcm: generationStepStatusSchema,
  integrated: generationStepStatusSchema,
  degraded: z.boolean(),
  warnings: z.array(z.string()).default([]),
  coordinator: z
    .object({
      strategy: z.string(),
      steps: z.array(
        z.object({
          name: z.string(),
          status: z.enum(['pending', 'running', 'complete', 'fallback', 'skipped']),
          startedAt: z.string().optional(),
          endedAt: z.string().optional(),
          note: z.string().optional(),
        }),
      ),
      arbitration: z.array(z.string()).default([]),
    })
    .optional(),
});
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const diagnosisSessionSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'completed', 'safety_blocked', 'failed']),
  safetyLevel: diagnosisSafetyLevelSchema.optional().nullable(),
  input: diagnosisInputSchema,
  contextSnapshot: z.unknown().optional().nullable(),
  redFlagResult: z.unknown().optional().nullable(),
  westernOutput: westernAssessmentSchema.optional().nullable(),
  tcmOutput: tcmAssessmentSchema.optional().nullable(),
  integratedOutput: integratedDiagnosisResultSchema.optional().nullable(),
  generationStatus: generationStatusSchema.optional().nullable(),
  provider: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DiagnosisSession = z.infer<typeof diagnosisSessionSchema>;

export const commonRedFlagJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string' },
    reason: { type: 'string' },
    matchedEvidence: { type: 'array', items: { type: 'string' } },
    urgency: { type: 'string', enum: ['emergency', 'urgent', 'routine', 'self_care'] },
  },
  required: ['category', 'reason', 'matchedEvidence', 'urgency'],
} as const;

export const westernAssessmentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    urgency: { type: 'string', enum: ['emergency', 'urgent', 'routine', 'self_care'] },
    redFlags: { type: 'array', items: commonRedFlagJsonSchema },
    diagnosticHypotheses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          likelihood: { type: 'string', enum: ['low', 'medium', 'high'] },
          rationale: { type: 'string' },
          supportingFindings: { type: 'array', items: { type: 'string' } },
          againstFindings: { type: 'array', items: { type: 'string' } },
          notADiagnosis: { const: true },
        },
        required: ['name', 'likelihood', 'rationale', 'supportingFindings', 'againstFindings', 'notADiagnosis'],
      },
    },
    recommendedChecks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          timing: { type: 'string', enum: ['immediate', 'soon', 'routine'] },
          reason: { type: 'string' },
        },
        required: ['name', 'timing', 'reason'],
      },
    },
    selfCareBoundaries: { type: 'array', items: { type: 'string' } },
    seekCareCriteria: { type: 'array', items: { type: 'string' } },
    missingInformation: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'urgency',
    'redFlags',
    'diagnosticHypotheses',
    'recommendedChecks',
    'selfCareBoundaries',
    'seekCareCriteria',
    'missingInformation',
  ],
} as const;

export const tcmAssessmentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    urgency: { type: 'string', enum: ['emergency', 'urgent', 'routine', 'self_care'] },
    redFlags: { type: 'array', items: commonRedFlagJsonSchema },
    patternHypotheses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          likelihood: { type: 'string', enum: ['low', 'medium', 'high'] },
          rationale: { type: 'string' },
          supportingFindings: { type: 'array', items: { type: 'string' } },
          notADiagnosis: { const: true },
        },
        required: ['name', 'likelihood', 'rationale', 'supportingFindings', 'notADiagnosis'],
      },
    },
    tonguePulseQuestions: { type: 'array', items: { type: 'string' } },
    constitutionAndPatternRationale: { type: 'string' },
    regulationSuggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: ['diet', 'routine', 'emotion', 'movement', 'acupressure', 'other'] },
          suggestion: { type: 'string' },
          safetyNote: { type: 'string' },
        },
        required: ['category', 'suggestion'],
      },
    },
    contraindications: { type: 'array', items: { type: 'string' } },
    missingInformation: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'urgency',
    'redFlags',
    'patternHypotheses',
    'tonguePulseQuestions',
    'constitutionAndPatternRationale',
    'regulationSuggestions',
    'contraindications',
    'missingInformation',
  ],
} as const;

export const integratedDiagnosisResultJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    safetyLevel: { type: 'string', enum: ['emergency', 'urgent', 'clinician_recommended', 'supportive'] },
    mustSeekImmediateCare: { type: 'boolean' },
    immediateCareReasons: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    westernPerspective: { type: 'string' },
    tcmPerspective: { type: 'string' },
    conflictResolution: { type: 'array', items: { type: 'string' } },
    integrativeRecommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: ['medical_care', 'monitoring', 'lifestyle', 'tcm_regulation', 'avoidance'] },
          title: { type: 'string' },
          details: { type: 'string' },
          priority: { type: 'string', enum: ['immediate', 'soon', 'routine'] },
        },
        required: ['category', 'title', 'details', 'priority'],
      },
    },
    followUpQuestions: { type: 'array', items: { type: 'string' } },
    redFlagCoverage: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string' },
          checked: { type: 'boolean' },
          positive: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['category', 'checked', 'positive', 'note'],
      },
    },
    disclaimer: { type: 'string' },
  },
  required: [
    'safetyLevel',
    'mustSeekImmediateCare',
    'immediateCareReasons',
    'summary',
    'westernPerspective',
    'tcmPerspective',
    'conflictResolution',
    'integrativeRecommendations',
    'followUpQuestions',
    'redFlagCoverage',
    'disclaimer',
  ],
} as const;
