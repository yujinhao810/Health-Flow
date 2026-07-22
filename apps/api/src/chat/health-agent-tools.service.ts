import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import type { LlmConfig } from '../llm/llm.types';
import { formatDeterministicSkillResult, routeDeterministicHealthSkill } from '../skills/health/deterministic-health-skill-router';
import { hasExplicitWriteIntent, parseRecordFromText } from '../skills/health/health-record-intent';
import { SkillRunnerService } from '../skills/skill-runner.service';
import { SkillRegistry } from '../skills/skill.registry';
import type { HealthAgentTool, HealthAgentToolContext, HealthAgentToolResult } from './health-agent-tools.types';

@Injectable()
export class HealthAgentToolsService {
  constructor(
    private readonly registry: SkillRegistry,
    private readonly runner: SkillRunnerService,
  ) {}

  getTools(): HealthAgentTool[] {
    return this.registry.listDefinitions();
  }

  getTitle(name: string) {
    return this.registry.getTitle(name);
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

  async tryCreateRecordFromUserText(
    user: AuthUser,
    userInput: string,
    config: LlmConfig,
    signal?: AbortSignal,
  ): Promise<(HealthAgentToolResult & { assistantText: string }) | null> {
    const parsed = parseRecordFromText(userInput);
    if (!parsed) return null;

    const skill = this.registry.get('health_record_create');
    if (!skill) throw new Error('Skill Registry 缺少 health_record_create');

    const result = await skill.execute(parsed.input, { user, userInput, config, signal });
    return { ...result, assistantText: parsed.assistantText };
  }

  async tryExecuteDeterministicSkill(user: AuthUser, userInput: string, config: LlmConfig, signal?: AbortSignal) {
    const invocation = routeDeterministicHealthSkill(userInput);
    if (!invocation) return null;

    const result = await this.runner.execute(invocation.name, invocation.input, { user, userInput, config, signal });
    return {
      ...invocation,
      title: this.registry.getTitle(invocation.name),
      result,
      assistantText: formatDeterministicSkillResult(invocation.name, result.content, result.isError),
    };
  }

  execute(name: string, input: unknown, context: HealthAgentToolContext): Promise<HealthAgentToolResult> {
    return this.runner.execute(name, input, context);
  }
}
