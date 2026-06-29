import { z } from 'zod';

export const healthRecordTypeSchema = z.enum(['sleep', 'exercise', 'mood', 'medical']);
export type HealthRecordType = z.infer<typeof healthRecordTypeSchema>;

export const sleepPayloadSchema = z.object({
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  quality: z.number().min(1).max(5).optional(),
});

export const exercisePayloadSchema = z.object({
  activity: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  intensity: z.enum(['low', 'medium', 'high']).optional(),
});

export const moodPayloadSchema = z.object({
  score: z.number().min(1).max(10),
  tags: z.array(z.string()).default([]),
});

export const medicalPayloadSchema = z.object({
  visitType: z.string().min(1),
  diagnosis: z.string().optional(),
  medication: z.string().optional(),
  followUpAt: z.string().datetime().optional(),
});

const baseHealthRecordSchema = z.object({
  recordedAt: z.string().datetime(),
  note: z.string().max(2000).optional(),
});

export const createHealthRecordSchema = z.discriminatedUnion('type', [
  baseHealthRecordSchema.extend({
    type: z.literal('sleep'),
    payload: sleepPayloadSchema,
  }),
  baseHealthRecordSchema.extend({
    type: z.literal('exercise'),
    payload: exercisePayloadSchema,
  }),
  baseHealthRecordSchema.extend({
    type: z.literal('mood'),
    payload: moodPayloadSchema,
  }),
  baseHealthRecordSchema.extend({
    type: z.literal('medical'),
    payload: medicalPayloadSchema,
  }),
]);

export type CreateHealthRecordInput = z.infer<typeof createHealthRecordSchema>;

export const healthPlanActionSchema = z.object({
  title: z.string().min(1),
  details: z.string().min(1),
  cadence: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('easy'),
});

export const healthPlanSchema = z.object({
  title: z.string().min(1),
  timeframe: z.string().min(1),
  summary: z.string().min(1),
  focusAreas: z.array(z.string()).default([]),
  dailyActions: z.array(healthPlanActionSchema).default([]),
  weeklyGoals: z.array(z.string()).default([]),
  monitoring: z.array(z.string()).default([]),
  redFlags: z.array(z.string()).default([]),
  disclaimer: z.string().min(1),
});

export type HealthPlan = z.infer<typeof healthPlanSchema>;

export type HealthSnapshotSignals = {
  recordCount: number;
  sleep: {
    count: number;
    averageDurationHours?: number;
    averageQuality?: number;
    dailyHours: Array<{ date: string; hours: number; quality?: number }>;
  };
  mood: {
    count: number;
    averageScore?: number;
    latestScore?: number;
    dailyScores: Array<{ date: string; score: number }>;
    topTags: Array<{ tag: string; count: number }>;
  };
  exercise: {
    count: number;
    totalMinutes: number;
    activeDays: number;
    frequencyPerWeek: number;
    dailyMinutes: Array<{ date: string; minutes: number }>;
    byActivity: Array<{ activity: string; count: number; minutes: number }>;
    byIntensity: Partial<Record<'low' | 'medium' | 'high', number>>;
  };
};

export type HealthSnapshot = {
  id: string;
  period: 'daily' | 'weekly' | 'monthly';
  startedAt: string;
  endedAt: string;
  summary: string;
  signals: HealthSnapshotSignals;
  recommendations: string[];
};
