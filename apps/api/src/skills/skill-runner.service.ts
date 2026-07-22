import { Injectable } from '@nestjs/common';
import { RedactionService } from '../safety/redaction.service';
import { SkillRegistry } from './skill.registry';
import type { SkillContext, SkillResult } from './skill.types';

@Injectable()
export class SkillRunnerService {
  constructor(
    private readonly registry: SkillRegistry,
    private readonly redaction: RedactionService,
  ) {}

  async execute(name: string, input: unknown, context: SkillContext): Promise<SkillResult> {
    const skill = this.registry.get(name);
    if (!skill) {
      return { isError: true, content: `未知工具：${name}`, summary: '未知工具' };
    }

    try {
      return await skill.execute(input, context);
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
        summary: `${skill.definition.title}失败，等待 Agent 自我修正`,
      };
    }
  }
}
