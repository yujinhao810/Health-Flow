import { z } from "zod";

export const diagnosisUrgencySchema = z.enum([
  "emergency",
  "urgent",
  "routine",
  "self_care",
]);
export type DiagnosisUrgency = z.infer<typeof diagnosisUrgencySchema>;

export const diagnosisSafetyLevelSchema = z.enum([
  "emergency",
  "urgent",
  "clinician_recommended",
  "supportive",
]);
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
  sex: z.enum(["female", "male", "other", "unknown"]).optional(),
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

export const diagnosisSupplementInputSchema = z.object({
  additionalInformation: z.string().trim().min(1).max(3000),
});
export type DiagnosisSupplementInput = z.infer<
  typeof diagnosisSupplementInputSchema
>;

export const diagnosisFollowUpRequestSchema = z.object({
  chiefComplaint: z.string().min(1).max(1000),
  symptomName: z.string().optional(),
  bodyPart: z.string().optional(),
  severity: z.number().min(1).max(10).optional(),
  duration: z.string().optional(),
  redFlagSigns: z.array(z.string()).default([]),
  redFlagUncertain: z.boolean().default(false),
  includeRecentHealthContext: z.boolean().default(true),
});
export type DiagnosisFollowUpRequest = z.infer<
  typeof diagnosisFollowUpRequestSchema
>;

export const diagnosisFollowUpQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  reason: z.string(),
  priority: z.enum([
    "safety",
    "symptom_detail",
    "medical_context",
    "tcm_observation",
    "lifestyle",
  ]),
  answerHint: z.string(),
  suggestedAnswers: z.array(z.string()).max(6).optional(),
});
export type DiagnosisFollowUpQuestion = z.infer<
  typeof diagnosisFollowUpQuestionSchema
>;

export const diagnosisFollowUpResultSchema = z.object({
  summary: z.string(),
  questions: z.array(diagnosisFollowUpQuestionSchema).min(1).max(3),
  missingFields: z.array(z.string()).default([]),
  source: z.enum(["agent", "fallback"]).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  warning: z.string().optional(),
  usage: z
    .object({
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
    })
    .optional(),
});
export type DiagnosisFollowUpResult = z.infer<
  typeof diagnosisFollowUpResultSchema
>;

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
  diagnosticHypotheses: z
    .array(
      z.object({
        name: z.string(),
        likelihood: z.enum(["low", "medium", "high"]),
        rationale: z.string(),
        supportingFindings: z.array(z.string()).default([]),
        againstFindings: z.array(z.string()).default([]),
        evidenceIds: z.array(z.string()).optional(),
        notADiagnosis: z.literal(true),
      }),
    )
    .default([]),
  recommendedChecks: z
    .array(
      z.object({
        name: z.string(),
        timing: z.enum(["immediate", "soon", "routine"]),
        reason: z.string(),
        evidenceIds: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  selfCareBoundaries: z.array(z.string()).default([]),
  seekCareCriteria: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
});
export type WesternAssessment = z.infer<typeof westernAssessmentSchema>;

export const tcmAssessmentSchema = z.object({
  urgency: diagnosisUrgencySchema,
  redFlags: z.array(redFlagFindingSchema).default([]),
  patternHypotheses: z
    .array(
      z.object({
        name: z.string(),
        likelihood: z.enum(["low", "medium", "high"]),
        rationale: z.string(),
        supportingFindings: z.array(z.string()).default([]),
        evidenceIds: z.array(z.string()).optional(),
        notADiagnosis: z.literal(true),
      }),
    )
    .default([]),
  tonguePulseQuestions: z.array(z.string()).default([]),
  constitutionAndPatternRationale: z.string(),
  regulationSuggestions: z
    .array(
      z.object({
        category: z.enum([
          "diet",
          "routine",
          "emotion",
          "movement",
          "acupressure",
          "other",
        ]),
        suggestion: z.string(),
        safetyNote: z.string().optional(),
        evidenceIds: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  contraindications: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
});
export type TcmAssessment = z.infer<typeof tcmAssessmentSchema>;

const clinicalPrioritySchema = z.enum(["immediate", "soon", "routine"]);

export const westernReviewOfTcmSchema = z.object({
  referenceable: z
    .array(
      z.object({
        point: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
  potentiallyMisleading: z
    .array(
      z.object({
        point: z.string(),
        risk: z.string(),
        saferFraming: z.string(),
      }),
    )
    .default([]),
  checksNeeded: z
    .array(
      z.object({
        issue: z.string(),
        recommendedCheck: z.string(),
        timing: clinicalPrioritySchema,
        reason: z.string(),
      }),
    )
    .default([]),
});
export type WesternReviewOfTcm = z.infer<typeof westernReviewOfTcmSchema>;

export const tcmReviewOfWesternSchema = z.object({
  needsMoreTcmInfo: z
    .array(
      z.object({
        patternOrIssue: z.string(),
        missingInfo: z.array(z.string()).default([]),
        reason: z.string(),
      }),
    )
    .default([]),
  safetyBoundaries: z
    .array(
      z.object({
        westernRedFlagOrConcern: z.string(),
        tcmAdjustment: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
  conflicts: z
    .array(
      z.object({
        topic: z.string(),
        westernView: z.string(),
        tcmView: z.string(),
        concern: z.string(),
      }),
    )
    .default([]),
});
export type TcmReviewOfWestern = z.infer<typeof tcmReviewOfWesternSchema>;

export const crossExaminationSchema = z.object({
  westernOnTcm: westernReviewOfTcmSchema.optional().nullable(),
  tcmOnWestern: tcmReviewOfWesternSchema.optional().nullable(),
});
export type CrossExamination = z.infer<typeof crossExaminationSchema>;

export const integratorDecisionSchema = z.object({
  claim: z.string(),
  source: z.enum([
    "consensus",
    "western_only",
    "tcm_only",
    "conflict",
    "safety_rule",
  ]),
  decision: z.enum([
    "adopted",
    "partially_adopted",
    "not_adopted",
    "needs_follow_up",
  ]),
  reason: z.string(),
  safetyImpact: z.string(),
  evidenceIds: z.array(z.string()).optional(),
});
export type IntegratorDecision = z.infer<typeof integratorDecisionSchema>;

export const arbitrationDecisionSchema = z.object({
  topic: z.string(),
  westernView: z.string(),
  tcmView: z.string(),
  resolution: z.enum([
    "adopt_western",
    "adopt_tcm",
    "combine",
    "reject_both",
    "ask_follow_up",
  ]),
  adoptedFrom: z.enum([
    "western",
    "tcm",
    "both",
    "neither",
    "pending_more_info",
  ]),
  reason: z.string(),
  safetyPriority: z.boolean(),
});
export type ArbitrationDecision = z.infer<typeof arbitrationDecisionSchema>;

export const integratedDiagnosisResultSchema = z.object({
  safetyLevel: diagnosisSafetyLevelSchema,
  mustSeekImmediateCare: z.boolean(),
  immediateCareReasons: z.array(z.string()).default([]),
  summary: z.string(),
  westernPerspective: z.string(),
  tcmPerspective: z.string(),
  conflictResolution: z.array(z.string()).default([]),
  decisionMatrix: z.array(integratorDecisionSchema).default([]),
  arbitrationDecisions: z.array(arbitrationDecisionSchema).default([]),
  needsFollowUp: z.boolean().default(false),
  followUpReason: z.string().default(""),
  requiredFollowUpQuestions: z.array(z.string()).default([]),
  integrativeRecommendations: z
    .array(
      z.object({
        category: z.enum([
          "medical_care",
          "monitoring",
          "lifestyle",
          "tcm_regulation",
          "avoidance",
        ]),
        title: z.string(),
        details: z.string(),
        priority: z.enum(["immediate", "soon", "routine"]),
        evidenceIds: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  followUpQuestions: z.array(z.string()).default([]),
  redFlagCoverage: z
    .array(
      z.object({
        category: z.string(),
        checked: z.boolean(),
        positive: z.boolean(),
        note: z.string(),
      }),
    )
    .default([]),
  disclaimer: z.string(),
});
export type IntegratedDiagnosisResult = z.infer<
  typeof integratedDiagnosisResultSchema
>;

export const generationStepStatusSchema = z.enum(["complete", "fallback"]);
export type GenerationStepStatus = z.infer<typeof generationStepStatusSchema>;

export const generationOverallStatusSchema = z.enum([
  "complete",
  "partial",
  "fallback",
]);
export type GenerationOverallStatus = z.infer<
  typeof generationOverallStatusSchema
>;

export const generationStatusSchema = z.object({
  overall: generationOverallStatusSchema,
  western: generationStepStatusSchema,
  tcm: generationStepStatusSchema,
  westernCross: generationStepStatusSchema.optional(),
  tcmCross: generationStepStatusSchema.optional(),
  integrated: generationStepStatusSchema,
  degraded: z.boolean(),
  warnings: z.array(z.string()).default([]),
  pipelineVersion: z.string().optional(),
  roleModels: z
    .object({
      western: z.string(),
      tcm: z.string(),
      reviewer: z.string(),
      integrator: z.string(),
    })
    .optional(),
  coordinator: z
    .object({
      strategy: z.string(),
      events: z
        .array(
          z.object({
            at: z.string(),
            type: z.string(),
            title: z.string(),
            status: z.string().optional(),
            detail: z.string().optional(),
          }),
        )
        .default([]),
      steps: z.array(
        z.object({
          name: z.string(),
          status: z.enum([
            "pending",
            "running",
            "complete",
            "fallback",
            "skipped",
          ]),
          startedAt: z.string().optional(),
          endedAt: z.string().optional(),
          note: z.string().optional(),
        }),
      ),
      arbitration: z.array(z.string()).default([]),
      crossExamination: crossExaminationSchema.optional(),
    })
    .optional(),
});
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const diagnosisSessionSchema = z.object({
  id: z.string(),
  status: z.enum([
    "pending",
    "completed",
    "degraded",
    "safety_blocked",
    "failed",
  ]),
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
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string" },
    reason: { type: "string" },
    matchedEvidence: { type: "array", items: { type: "string" } },
    urgency: {
      type: "string",
      enum: ["emergency", "urgent", "routine", "self_care"],
    },
  },
  required: ["category", "reason", "matchedEvidence", "urgency"],
} as const;

export const diagnosisFollowUpResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          reason: { type: "string" },
          priority: {
            type: "string",
            enum: [
              "safety",
              "symptom_detail",
              "medical_context",
              "tcm_observation",
              "lifestyle",
            ],
          },
          answerHint: { type: "string" },
          suggestedAnswers: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: { type: "string" },
          },
        },
        required: [
          "id",
          "question",
          "reason",
          "priority",
          "answerHint",
          "suggestedAnswers",
        ],
      },
    },
    missingFields: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "questions", "missingFields"],
} as const;

export const westernAssessmentJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    urgency: {
      type: "string",
      enum: ["emergency", "urgent", "routine", "self_care"],
    },
    redFlags: { type: "array", items: commonRedFlagJsonSchema },
    diagnosticHypotheses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          likelihood: { type: "string", enum: ["low", "medium", "high"] },
          rationale: { type: "string" },
          supportingFindings: { type: "array", items: { type: "string" } },
          againstFindings: { type: "array", items: { type: "string" } },
          evidenceIds: { type: "array", items: { type: "string" } },
          notADiagnosis: { const: true },
        },
        required: [
          "name",
          "likelihood",
          "rationale",
          "supportingFindings",
          "againstFindings",
          "notADiagnosis",
        ],
      },
    },
    recommendedChecks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          timing: { type: "string", enum: ["immediate", "soon", "routine"] },
          reason: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
        required: ["name", "timing", "reason"],
      },
    },
    selfCareBoundaries: { type: "array", items: { type: "string" } },
    seekCareCriteria: { type: "array", items: { type: "string" } },
    missingInformation: { type: "array", items: { type: "string" } },
  },
  required: [
    "urgency",
    "redFlags",
    "diagnosticHypotheses",
    "recommendedChecks",
    "selfCareBoundaries",
    "seekCareCriteria",
    "missingInformation",
  ],
} as const;

export const tcmAssessmentJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    urgency: {
      type: "string",
      enum: ["emergency", "urgent", "routine", "self_care"],
    },
    redFlags: { type: "array", items: commonRedFlagJsonSchema },
    patternHypotheses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          likelihood: { type: "string", enum: ["low", "medium", "high"] },
          rationale: { type: "string" },
          supportingFindings: { type: "array", items: { type: "string" } },
          evidenceIds: { type: "array", items: { type: "string" } },
          notADiagnosis: { const: true },
        },
        required: [
          "name",
          "likelihood",
          "rationale",
          "supportingFindings",
          "notADiagnosis",
        ],
      },
    },
    tonguePulseQuestions: { type: "array", items: { type: "string" } },
    constitutionAndPatternRationale: { type: "string" },
    regulationSuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: [
              "diet",
              "routine",
              "emotion",
              "movement",
              "acupressure",
              "other",
            ],
          },
          suggestion: { type: "string" },
          safetyNote: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
        required: ["category", "suggestion"],
      },
    },
    contraindications: { type: "array", items: { type: "string" } },
    missingInformation: { type: "array", items: { type: "string" } },
  },
  required: [
    "urgency",
    "redFlags",
    "patternHypotheses",
    "tonguePulseQuestions",
    "constitutionAndPatternRationale",
    "regulationSuggestions",
    "contraindications",
    "missingInformation",
  ],
} as const;

const clinicalPriorityJsonSchema = {
  type: "string",
  enum: ["immediate", "soon", "routine"],
} as const;

export const westernReviewOfTcmJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    referenceable: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          point: { type: "string" },
          reason: { type: "string" },
        },
        required: ["point", "reason"],
      },
    },
    potentiallyMisleading: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          point: { type: "string" },
          risk: { type: "string" },
          saferFraming: { type: "string" },
        },
        required: ["point", "risk", "saferFraming"],
      },
    },
    checksNeeded: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          issue: { type: "string" },
          recommendedCheck: { type: "string" },
          timing: clinicalPriorityJsonSchema,
          reason: { type: "string" },
        },
        required: ["issue", "recommendedCheck", "timing", "reason"],
      },
    },
  },
  required: ["referenceable", "potentiallyMisleading", "checksNeeded"],
} as const;

export const tcmReviewOfWesternJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    needsMoreTcmInfo: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          patternOrIssue: { type: "string" },
          missingInfo: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
        },
        required: ["patternOrIssue", "missingInfo", "reason"],
      },
    },
    safetyBoundaries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          westernRedFlagOrConcern: { type: "string" },
          tcmAdjustment: { type: "string" },
          reason: { type: "string" },
        },
        required: ["westernRedFlagOrConcern", "tcmAdjustment", "reason"],
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string" },
          westernView: { type: "string" },
          tcmView: { type: "string" },
          concern: { type: "string" },
        },
        required: ["topic", "westernView", "tcmView", "concern"],
      },
    },
  },
  required: ["needsMoreTcmInfo", "safetyBoundaries", "conflicts"],
} as const;

export const integratedDiagnosisResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    safetyLevel: {
      type: "string",
      enum: ["emergency", "urgent", "clinician_recommended", "supportive"],
    },
    mustSeekImmediateCare: { type: "boolean" },
    immediateCareReasons: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    westernPerspective: { type: "string" },
    tcmPerspective: { type: "string" },
    conflictResolution: { type: "array", items: { type: "string" } },
    decisionMatrix: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          source: {
            type: "string",
            enum: [
              "consensus",
              "western_only",
              "tcm_only",
              "conflict",
              "safety_rule",
            ],
          },
          decision: {
            type: "string",
            enum: [
              "adopted",
              "partially_adopted",
              "not_adopted",
              "needs_follow_up",
            ],
          },
          reason: { type: "string" },
          safetyImpact: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
        required: ["claim", "source", "decision", "reason", "safetyImpact"],
      },
    },
    arbitrationDecisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string" },
          westernView: { type: "string" },
          tcmView: { type: "string" },
          resolution: {
            type: "string",
            enum: [
              "adopt_western",
              "adopt_tcm",
              "combine",
              "reject_both",
              "ask_follow_up",
            ],
          },
          adoptedFrom: {
            type: "string",
            enum: ["western", "tcm", "both", "neither", "pending_more_info"],
          },
          reason: { type: "string" },
          safetyPriority: { type: "boolean" },
        },
        required: [
          "topic",
          "westernView",
          "tcmView",
          "resolution",
          "adoptedFrom",
          "reason",
          "safetyPriority",
        ],
      },
    },
    needsFollowUp: { type: "boolean" },
    followUpReason: { type: "string" },
    requiredFollowUpQuestions: { type: "array", items: { type: "string" } },
    integrativeRecommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: [
              "medical_care",
              "monitoring",
              "lifestyle",
              "tcm_regulation",
              "avoidance",
            ],
          },
          title: { type: "string" },
          details: { type: "string" },
          priority: { type: "string", enum: ["immediate", "soon", "routine"] },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
        required: ["category", "title", "details", "priority"],
      },
    },
    followUpQuestions: { type: "array", items: { type: "string" } },
    redFlagCoverage: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string" },
          checked: { type: "boolean" },
          positive: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["category", "checked", "positive", "note"],
      },
    },
    disclaimer: { type: "string" },
  },
  required: [
    "safetyLevel",
    "mustSeekImmediateCare",
    "immediateCareReasons",
    "summary",
    "westernPerspective",
    "tcmPerspective",
    "conflictResolution",
    "decisionMatrix",
    "arbitrationDecisions",
    "needsFollowUp",
    "followUpReason",
    "requiredFollowUpQuestions",
    "integrativeRecommendations",
    "followUpQuestions",
    "redFlagCoverage",
    "disclaimer",
  ],
} as const;
