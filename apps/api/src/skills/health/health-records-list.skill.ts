import { Injectable } from '@nestjs/common';
import { healthRecordTypeSchema } from '@health/shared';
import type { HealthRecordType } from '@prisma/client';
import { z } from 'zod';
import { HealthRecordsService } from '../../health-records/health-records.service';
import type { Skill, SkillContext } from '../skill.types';

const inputSchema = z.object({
  type: healthRecordTypeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

@Injectable()
export class HealthRecordsListSkill implements Skill {
  readonly definition = {
    name: 'health_records_list',
    title: '查询健康记录',
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
  } as const;

  constructor(private readonly records: HealthRecordsService) {}

  async execute(input: unknown, context: SkillContext) {
    const parsed = inputSchema.parse(input ?? {});
    const records = await this.records.list(context.user, parsed.type as HealthRecordType | undefined);
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
}
