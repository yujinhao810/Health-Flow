import { Injectable } from '@nestjs/common';
import { createHealthRecordSchema, healthPlanSchema, healthRecordTypeSchema } from '@health/shared';
import type { HealthRecordType } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { HealthRecordsService } from '../health-records/health-records.service';
import { LlmService } from '../llm/llm.provider';
import { RedactionService } from '../safety/redaction.service';
import { SnapshotsService } from '../snapshots/snapshots.service';
import type { HealthAgentTool, HealthAgentToolContext, HealthAgentToolResult } from './health-agent-tools.types';

const recordListInputSchema = z.object({
  type: healthRecordTypeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const planInputSchema = z.object({
  goal: z.string().max(500).optional(),
  timeframe: z.string().max(80).default('7 天'),
  focusAreas: z.array(z.string().max(80)).max(8).default([]),
  constraints: z.array(z.string().max(200)).max(10).default([]),
});

const TOOL_TITLES: Record<string, string> = {
  health_records_list: '查询健康记录',
  health_record_create: '保存健康记录',
  snapshot_latest: '读取健康快照',
  snapshot_generate_weekly: '生成周健康快照',
  health_plan_generate: '生成健康计划',
};

@Injectable()
export class HealthAgentToolsService {
  constructor(
    private readonly records: HealthRecordsService,
    private readonly snapshots: SnapshotsService,
    private readonly llm: LlmService,
    private readonly redaction: RedactionService,
  ) {}

  getTools(): HealthAgentTool[] {
    return [
      {
        name: 'health_records_list',
        title: TOOL_TITLES.health_records_list,
        description:
          '查询用户真实保存的健康记录。回答最近睡眠、运动、心情或就医记录时调用此工具；不要仅凭聊天记忆猜测。可按类型、日期范围和数量限制查询。',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['sleep', 'exercise', 'mood', 'medical'], description: '可选健康记录类型过滤。' },
            from: { type: 'string', description: '可选起始 ISO 日期时间。' },
            to: { type: 'string', description: '可选结束 ISO 日期时间。' },
            limit: { type: 'integer', minimum: 1, maximum: 100, description: '最多返回多少条，默认 20，上限 100。' },
          },
          required: [],
        },
      },
      {
        name: 'health_record_create',
        title: TOOL_TITLES.health_record_create,
        description:
          '保存一条新的健康记录。只有用户明确要求“记录、保存、添加到健康记录、帮我记下、log/save this”等写入意图时才调用。用户只是描述状态时不要调用，应先询问是否保存。',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['sleep', 'exercise', 'mood', 'medical'] },
            recordedAt: { type: 'string', description: '记录发生时间，ISO 日期时间。' },
            note: { type: 'string', description: '可选备注，最多 2000 字。' },
            payload: {
              type: 'object',
              description:
                '按 type 填写：sleep={startedAt,endedAt,quality?}; exercise={activity,durationMinutes,intensity?}; mood={score,tags}; medical={visitType,medicalMaterials?,diagnosis?(历史兼容),medication?,followUpAt?}',
            },
          },
          required: ['type', 'recordedAt', 'payload'],
        },
      },
      {
        name: 'snapshot_latest',
        title: TOOL_TITLES.snapshot_latest,
        description: '获取用户最新健康快照；如果还没有快照，后端会生成一个周快照。回答趋势、总结、计划依据时优先调用。',
        inputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
      },
      {
        name: 'snapshot_generate_weekly',
        title: TOOL_TITLES.snapshot_generate_weekly,
        description: '重新生成用户最近 7 天的健康快照。仅当用户明确要求更新/生成快照，或生成计划需要最新统计时调用。',
        inputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
      },
      {
        name: 'health_plan_generate',
        title: TOOL_TITLES.health_plan_generate,
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
      },
    ];
  }

  getTitle(name: string) {
    return TOOL_TITLES[name] ?? name;
  }

  shouldForceRecordCreate(userInput: string) {
    return hasExplicitWriteIntent(userInput);
  }

  shouldNeedToolUse(userInput: string) {
    return (
      hasExplicitWriteIntent(userInput) ||
      /健康记录|睡眠记录|心情记录|运动记录|就医记录|快照|趋势|统计|生成.*计划|制定.*计划|读取|查询/.test(userInput) ||
      /(最近|近[一二三四五六七八九十0-9]+天|这周|本周|上周|今天|昨天|过去|历史).*(睡眠|心情|情绪|运动|就医|健康)/.test(userInput) ||
      /(睡眠|心情|情绪|运动|就医|健康).*(怎么样|如何|变化|趋势|记录|统计|几|多少|多久)/.test(userInput)
    );
  }

  async tryCreateRecordFromUserText(user: AuthUser, userInput: string): Promise<(HealthAgentToolResult & { assistantText: string }) | null> {
    const parsed = parseRecordFromText(userInput);
    if (!parsed) return null;

    const record = await this.records.create(user, parsed.input);
    const assistantText = parsed.assistantText;

    return {
      content: JSON.stringify({
        ok: true,
        record: {
          id: record.id,
          type: record.type,
          recordedAt: record.recordedAt.toISOString(),
          note: record.note,
          payload: record.payload,
        },
      }),
      summary: `已保存 ${record.type} 健康记录`,
      assistantText,
    };
  }

  async execute(name: string, input: unknown, context: HealthAgentToolContext): Promise<HealthAgentToolResult> {
    try {
      switch (name) {
        case 'health_records_list':
          return this.listRecords(context.user, input);
        case 'health_record_create':
          return this.createRecord(context.user, input, context.userInput);
        case 'snapshot_latest':
          return this.latestSnapshot(context.user);
        case 'snapshot_generate_weekly':
          return this.generateWeeklySnapshot(context.user);
        case 'health_plan_generate':
          return this.generatePlan(input, context);
        default:
          return { isError: true, content: `未知工具：${name}`, summary: '未知工具' };
      }
    } catch (error) {
      const message = this.redaction.redact(error instanceof Error ? error.message : '工具执行失败');
      return {
        isError: true,
        content: JSON.stringify({
          ok: false,
          error: message,
          correctionInstruction: '请读取错误信息，修正工具名称或参数后最多重试一次；如果仍缺少必要信息，请转为向用户追问，不要编造。',
          expectedTool: name,
        }),
        summary: `${this.getTitle(name)}失败，等待 Agent 自我修正`,
      };
    }
  }

  private async listRecords(user: AuthUser, input: unknown): Promise<HealthAgentToolResult> {
    const parsed = recordListInputSchema.parse(input ?? {});
    const records = await this.records.list(user, parsed.type as HealthRecordType | undefined);
    const from = parsed.from ? new Date(parsed.from).getTime() : undefined;
    const to = parsed.to ? new Date(parsed.to).getTime() : undefined;
    const filtered = records
      .filter((record) => {
        const time = record.recordedAt.getTime();
        if (from !== undefined && time < from) return false;
        if (to !== undefined && time > to) return false;
        return true;
      })
      .slice(0, parsed.limit)
      .map((record) => ({
        id: record.id,
        type: record.type,
        recordedAt: record.recordedAt.toISOString(),
        note: record.note,
        payload: record.payload,
      }));

    return {
      content: JSON.stringify({ ok: true, records: filtered }),
      summary: `读取 ${filtered.length} 条健康记录`,
    };
  }

  private async createRecord(user: AuthUser, input: unknown, userInput: string): Promise<HealthAgentToolResult> {
    if (!hasExplicitWriteIntent(userInput)) {
      return {
        isError: true,
        content: JSON.stringify({ ok: false, error: '用户尚未明确要求保存健康记录。请先询问用户是否要保存这条记录。' }),
        summary: '未保存：缺少明确写入意图',
      };
    }

    const parsed = createHealthRecordSchema.parse(input);
    const record = await this.records.create(user, parsed);
    return {
      content: JSON.stringify({
        ok: true,
        record: {
          id: record.id,
          type: record.type,
          recordedAt: record.recordedAt.toISOString(),
          note: record.note,
          payload: record.payload,
        },
      }),
      summary: `已保存 ${record.type} 健康记录`,
    };
  }

  private async latestSnapshot(user: AuthUser): Promise<HealthAgentToolResult> {
    const snapshot = await this.snapshots.latest(user);
    return {
      content: JSON.stringify({
        ok: true,
        snapshot: formatSnapshot(snapshot),
      }),
      summary: '已读取最新健康快照',
    };
  }

  private async generateWeeklySnapshot(user: AuthUser): Promise<HealthAgentToolResult> {
    const snapshot = await this.snapshots.generateWeekly(user);
    return {
      content: JSON.stringify({
        ok: true,
        snapshot: formatSnapshot(snapshot),
      }),
      summary: '已生成最近 7 天健康快照',
    };
  }

  private async generatePlan(input: unknown, context: HealthAgentToolContext): Promise<HealthAgentToolResult> {
    const parsed = planInputSchema.parse(input ?? {});
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

function hasExplicitWriteIntent(text: string) {
  return /记录|保存|添加|记下|帮我记|存一下|log\s*this|save\s*this|add\s*this/i.test(text);
}

function parseRecordFromText(text: string) {
  return parseSleepRecordFromText(text) ?? parseExerciseRecordFromText(text) ?? parseMoodRecordFromText(text);
}

function parseSleepRecordFromText(text: string) {
  if (!hasExplicitWriteIntent(text)) return null;
  if (!/睡|睡觉|睡眠/.test(text)) return null;

  const range = text.match(/(?:(昨晚|昨天晚上|昨天|今晚|今天晚上|今天|早上|上午|中午|下午|晚上)\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:到|至|-)\s*(?:(早上|上午|中午|下午|晚上|今天|次日|第二天)\s*)?(\d{1,2})(?::(\d{2}))?/);
  const qualityMatch = text.match(/(?:质量|睡眠质量|评分|打分)\s*(\d(?:\.\d)?)/);
  if (!range || !qualityMatch) return null;

  const startHour = Number(range[2]);
  const startMinute = Number(range[3] ?? 0);
  const endHour = Number(range[5]);
  const endMinute = Number(range[6] ?? 0);
  const quality = Number(qualityMatch[1]);
  if (!isValidClock(startHour, startMinute) || !isValidClock(endHour, endMinute) || quality < 1 || quality > 5) return null;

  const now = new Date();
  const start = new Date(now);
  start.setSeconds(0, 0);
  const startDayHint = range[1] ?? '';
  if (startDayHint.includes('昨') || startDayHint.includes('昨天')) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(startHour, startMinute, 0, 0);

  const end = new Date(start);
  end.setHours(endHour, endMinute, 0, 0);
  if (end.getTime() <= start.getTime() || /早上|上午|次日|第二天/.test(range[4] ?? '')) {
    end.setDate(end.getDate() + 1);
  }

  const durationHours = Math.round(((end.getTime() - start.getTime()) / 36e5) * 10) / 10;
  if (durationHours <= 0 || durationHours > 24) return null;

  return {
    input: {
      type: 'sleep' as const,
      recordedAt: end.toISOString(),
      payload: {
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        quality,
      },
    },
    assistantText: `好的，已经帮你保存睡眠记录：${formatClock(startHour, startMinute)} 到 ${formatClock(endHour, endMinute)}，约 ${durationHours} 小时，睡眠质量 ${quality} 分。`,
  };
}

function parseExerciseRecordFromText(text: string) {
  if (!hasExplicitWriteIntent(text)) return null;
  const activity = detectActivity(text);
  if (!activity) return null;

  const durationMatch = text.match(/(\d{1,4})\s*(?:分钟|min|mins|minute|minutes|小时|个小时|h|hour|hours)/i);
  if (!durationMatch) return null;

  const rawDuration = Number(durationMatch[1]);
  const unitText = durationMatch[0];
  const durationMinutes = /小时|个小时|h|hour/i.test(unitText) ? rawDuration * 60 : rawDuration;
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) return null;

  const intensity = detectIntensity(text);
  const recordedAt = inferRecordedAt(text).toISOString();

  return {
    input: {
      type: 'exercise' as const,
      recordedAt,
      payload: {
        activity,
        durationMinutes,
        ...(intensity ? { intensity } : {}),
      },
    },
    assistantText: `好的，已经帮你保存运动记录：${activity} ${durationMinutes} 分钟${intensity ? `，${formatIntensity(intensity)}强度` : ''}。`,
  };
}

function parseMoodRecordFromText(text: string) {
  if (!hasExplicitWriteIntent(text)) return null;
  if (!/心情|情绪|心境|mood/i.test(text)) return null;

  const scoreMatch = text.match(/(?:心情|情绪|心境|mood)?\s*(?:评分|分数|打分|score)?\s*(\d{1,2})(?:\s*分)?/i);
  if (!scoreMatch) return null;
  const score = Number(scoreMatch[1]);
  if (!Number.isInteger(score) || score < 1 || score > 10) return null;

  const tags = extractMoodTags(text);
  const recordedAt = inferRecordedAt(text).toISOString();

  return {
    input: {
      type: 'mood' as const,
      recordedAt,
      payload: { score, tags },
    },
    assistantText: `好的，已经帮你保存心情记录：${score} 分${tags.length ? `，标签：${tags.join('、')}` : ''}。`,
  };
}

function detectActivity(text: string) {
  const activities = [
    '跑步',
    '慢跑',
    '快走',
    '走路',
    '散步',
    '骑车',
    '骑行',
    '游泳',
    '瑜伽',
    '力量训练',
    '健身',
    '跳绳',
    '爬山',
    '羽毛球',
    '篮球',
    '足球',
    '网球',
  ];
  return activities.find((activity) => text.includes(activity));
}

function detectIntensity(text: string): 'low' | 'medium' | 'high' | undefined {
  if (/低强度|轻松|轻微|低/.test(text)) return 'low';
  if (/中等强度|中强度|适中|中等|中/.test(text)) return 'medium';
  if (/高强度|剧烈|很累|高/.test(text)) return 'high';
  return undefined;
}

function formatIntensity(intensity: 'low' | 'medium' | 'high') {
  return { low: '低', medium: '中等', high: '高' }[intensity];
}

function extractMoodTags(text: string) {
  const tagMatch = text.match(/(?:标签|感受|关键词)\s*(?:是|为|:|：)?\s*([^。,.，；;]+)/);
  if (!tagMatch) return [];
  return tagMatch[1]
    .split(/[、,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function inferRecordedAt(text: string) {
  const date = new Date();
  if (/昨天|昨晚/.test(text)) date.setDate(date.getDate() - 1);
  return date;
}

function isValidClock(hour: number, minute: number) {
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function formatClock(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatSnapshot(snapshot: Awaited<ReturnType<SnapshotsService['latest']>>) {
  return {
    id: snapshot.id,
    period: snapshot.period,
    startedAt: snapshot.startedAt.toISOString(),
    endedAt: snapshot.endedAt.toISOString(),
    summary: snapshot.summary,
    signals: snapshot.signals,
    recommendations: snapshot.recommendations,
  };
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
