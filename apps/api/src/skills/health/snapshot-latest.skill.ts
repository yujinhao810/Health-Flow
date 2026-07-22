import { Injectable } from '@nestjs/common';
import { SnapshotsService } from '../../snapshots/snapshots.service';
import type { Skill, SkillContext } from '../skill.types';
import { formatSnapshot } from './health-skill.utils';

@Injectable()
export class SnapshotLatestSkill implements Skill {
  readonly definition = {
    name: 'snapshot_latest',
    title: '读取健康快照',
    description: '获取用户最新健康快照；如果还没有快照，后端会生成一个周快照。回答趋势、总结、计划依据时优先调用。',
    inputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  } as const;

  constructor(private readonly snapshots: SnapshotsService) {}

  async execute(_input: unknown, context: SkillContext) {
    const snapshot = await this.snapshots.latest(context.user);
    return {
      content: JSON.stringify({ ok: true, snapshot: formatSnapshot(snapshot) }),
      summary: '已读取最新健康快照',
    };
  }
}
