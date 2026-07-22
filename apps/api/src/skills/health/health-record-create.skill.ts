import { Injectable } from '@nestjs/common';
import { createHealthRecordSchema } from '@health/shared';
import { HealthRecordsService } from '../../health-records/health-records.service';
import type { Skill, SkillContext } from '../skill.types';
import { hasExplicitWriteIntent } from './health-record-intent';

@Injectable()
export class HealthRecordCreateSkill implements Skill {
  readonly definition = {
    name: 'health_record_create',
    title: '保存健康记录',
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
  } as const;

  constructor(private readonly records: HealthRecordsService) {}

  async execute(input: unknown, context: SkillContext) {
    if (!hasExplicitWriteIntent(context.userInput)) {
      return {
        isError: true,
        content: JSON.stringify({ ok: false, error: '用户尚未明确要求保存健康记录。请先询问用户是否要保存这条记录。' }),
        summary: '未保存：缺少明确写入意图',
      };
    }

    const parsed = createHealthRecordSchema.parse(input);
    const record = await this.records.create(context.user, parsed);
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
}
