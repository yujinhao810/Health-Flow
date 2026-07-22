import { Injectable } from '@nestjs/common';
import { SnapshotsService } from '../../snapshots/snapshots.service';
import type { Skill, SkillContext } from '../skill.types';
import { formatSnapshot } from './health-skill.utils';

@Injectable()
export class SnapshotGenerateWeeklySkill implements Skill {
  readonly definition = {
    name: 'snapshot_generate_weekly',
    title: '生成周健康快照',
    description: '重新生成用户最近 7 天的健康快照。仅当用户明确要求更新/生成快照，或生成计划需要最新统计时调用。',
    inputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  } as const;

  constructor(private readonly snapshots: SnapshotsService) {}

  async execute(_input: unknown, context: SkillContext) {
    const snapshot = await this.snapshots.generateWeekly(context.user);
    return {
      content: JSON.stringify({ ok: true, snapshot: formatSnapshot(snapshot) }),
      summary: '已生成最近 7 天健康快照',
    };
  }
}
