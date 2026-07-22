import { Injectable } from '@nestjs/common';
import { healthPlanSchema } from '@health/shared';
import { z } from 'zod';
import { HealthRecordsService } from '../../health-records/health-records.service';
import { LlmService } from '../../llm/llm.provider';
import { SnapshotsService } from '../../snapshots/snapshots.service';
import type { Skill, SkillContext } from '../skill.types';
import { formatSnapshot } from './health-skill.utils';

const inputSchema = z.object({
  goal: z.string().max(500).optional(),
  timeframe: z.string().max(80).default('7 天'),
  focusAreas: z.array(z.string().max(80)).max(8).default([]),
  constraints: z.array(z.string().max(200)).max(10).default([]),
});

@Injectable()
export class HealthPlanGenerateSkill implements Skill {
  readonly definition = {
    name: 'health_plan_generate',
    title: '生成健康计划',
    description: '基于真实健康记录和最新快照生成一个非诊断、低风险、可执行的健康计划。用户要求制定计划、改善睡眠/运动/压力/心情时调用。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        goal: { type: 'string', description: '用户希望达成的健康目标。' },
        timeframe: { type: 'string', description: '计划周期，例如 7 天、14 天、30 天。' },
        focusAreas: { type: 'array', items: { type: 'string' }, description: '关注方向，如 sleep、exercise、mood、stress。' },
        constraints: { type: 'array', items: { type: 'string' }, description: '用户限制或偏好。' },
      },
      required: [],
    },
  } as const;

  constructor(
    private readonly records: HealthRecordsService,
    private readonly snapshots: SnapshotsService,
    private readonly llm: LlmService,
  ) {}

  async execute(input: unknown, context: SkillContext) {
    const parsed = inputSchema.parse(input ?? {});
    const [snapshot, recentRecords] = await Promise.all([this.snapshots.latest(context.user), this.records.list(context.user)]);
    const payload = {
      request: parsed,
      latestSnapshot: formatSnapshot(snapshot),
      recentRecords: recentRecords.slice(0, 30).map((record) => ({
        type: record.type,
        recordedAt: record.recordedAt.toISOString(),
        note: record.note,
        payload: record.payload,
      })),
    };

    const result = await this.llm.generateStructured({
      config: context.config,
      system: HEALTH_PLAN_SYSTEM,
      schemaName: 'health_plan',
      schema: HEALTH_PLAN_JSON_SCHEMA,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
      signal: context.signal,
    });
    const plan = healthPlanSchema.parse(result.parsed);

    return {
      content: JSON.stringify({ ok: true, plan }),
      summary: `已生成${plan.timeframe}健康计划`,
      plan: { title: plan.title, timeframe: plan.timeframe },
    };
  }
}

const HEALTH_PLAN_SYSTEM = `
你是个人健康助手的计划生成器。请基于输入中的真实健康记录和健康快照，生成非诊断性的中文健康计划。
要求：
- 不做医学诊断，不替代医生或心理咨询师。
- 计划必须低风险、可执行、低压力。
- 如果出现严重症状、自伤风险、胸痛、呼吸困难、意识异常等红旗，应建议立即联系当地急救或线下医疗机构。
- 不给出处方药剂量、中药方剂或危险训练强度。
- 只返回符合 schema 的 JSON 对象。
`;

const HEALTH_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    timeframe: { type: 'string' },
    summary: { type: 'string' },
    focusAreas: { type: 'array', items: { type: 'string' } },
    dailyActions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          details: { type: 'string' },
          cadence: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        },
        required: ['title', 'details', 'cadence', 'difficulty'],
      },
    },
    weeklyGoals: { type: 'array', items: { type: 'string' } },
    monitoring: { type: 'array', items: { type: 'string' } },
    redFlags: { type: 'array', items: { type: 'string' } },
    disclaimer: { type: 'string' },
  },
  required: ['title', 'timeframe', 'summary', 'focusAreas', 'dailyActions', 'weeklyGoals', 'monitoring', 'redFlags', 'disclaimer'],
};
