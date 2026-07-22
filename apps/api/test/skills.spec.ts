import assert from 'node:assert/strict';
import test from 'node:test';
import { RedactionService } from '../src/safety/redaction.service';
import { AgentRuntimeService } from '../src/chat/agent-runtime.service';
import type { HealthAgentToolsService } from '../src/chat/health-agent-tools.service';
import type { LlmService } from '../src/llm/llm.provider';
import { formatDeterministicSkillResult, routeDeterministicHealthSkill } from '../src/skills/health/deterministic-health-skill-router';
import { SkillRunnerService } from '../src/skills/skill-runner.service';
import { SkillRegistry } from '../src/skills/skill.registry';
import type { Skill, SkillContext } from '../src/skills/skill.types';

const expectedSkills = [
  ['health_records_list', '查询健康记录'],
  ['health_record_create', '保存健康记录'],
  ['snapshot_latest', '读取健康快照'],
  ['snapshot_generate_weekly', '生成周健康快照'],
  ['health_plan_generate', '生成健康计划'],
] as const;

test('Skill Registry keeps the five health tool definitions and their order stable', () => {
  const registry = new SkillRegistry(expectedSkills.map(([name, title]) => fakeSkill(name, title)));

  assert.deepEqual(
    registry.listDefinitions().map(({ name, title }) => [name, title]),
    expectedSkills,
  );
  assert.equal(registry.getTitle('missing_skill'), 'missing_skill');
});

test('Skill Registry rejects duplicate names', () => {
  assert.throws(() => new SkillRegistry([fakeSkill('duplicate', '一'), fakeSkill('duplicate', '二')]), /重复/);
});

test('Skill Runner preserves success, unknown-tool and redacted-error results', async () => {
  const success = fakeSkill('success', '成功 Skill', async () => ({ content: '{"ok":true}', summary: '完成' }));
  const failure = fakeSkill('failure', '失败 Skill', async () => {
    throw new Error('upstream rejected sk-secret-value');
  });
  const runner = new SkillRunnerService(new SkillRegistry([success, failure]), new RedactionService());
  const context = {} as SkillContext;

  assert.deepEqual(await runner.execute('success', {}, context), { content: '{"ok":true}', summary: '完成' });
  assert.deepEqual(await runner.execute('missing', {}, context), {
    isError: true,
    content: '未知工具：missing',
    summary: '未知工具',
  });

  const failed = await runner.execute('failure', {}, context);
  assert.equal(failed.isError, true);
  assert.equal(failed.summary, '失败 Skill失败，等待 Agent 自我修正');
  assert.match(failed.content, /\[REDACTED_KEY\]/);
  assert.doesNotMatch(failed.content, /sk-secret-value/);
});

test('deterministic health routing covers snapshots, record queries and plans', () => {
  const now = new Date('2026-07-20T08:00:00.000Z');

  assert.deepEqual(routeDeterministicHealthSkill('读取我最新的健康快照', now), {
    name: 'snapshot_latest',
    input: {},
  });
  assert.deepEqual(routeDeterministicHealthSkill('重新生成最近的健康快照', now), {
    name: 'snapshot_generate_weekly',
    input: {},
  });
  assert.deepEqual(routeDeterministicHealthSkill('查询我最近7天的睡眠记录', now), {
    name: 'health_records_list',
    input: {
      type: 'sleep',
      from: '2026-07-13T08:00:00.000Z',
      to: '2026-07-20T08:00:00.000Z',
    },
  });
  assert.deepEqual(routeDeterministicHealthSkill('根据我的健康记录制定一个7天睡眠改善计划', now), {
    name: 'health_plan_generate',
    input: {
      goal: '根据我的健康记录制定一个7天睡眠改善计划',
      timeframe: '7 天',
      focusAreas: ['sleep'],
      constraints: [],
    },
  });
  assert.equal(routeDeterministicHealthSkill('今天感觉天气不错', now), null);
  assert.equal(routeDeterministicHealthSkill('怎么生成健康快照？', now), null);
});

test('deterministic snapshot output is formatted as a readable answer', () => {
  const text = formatDeterministicSkillResult(
    'snapshot_latest',
    JSON.stringify({
      ok: true,
      snapshot: {
        summary: '近 3 条健康记录中，平均睡眠 7.5 小时。',
        recommendations: ['继续保持规律记录。'],
      },
    }),
  );

  assert.match(text, /已读取最新健康快照/);
  assert.match(text, /平均睡眠 7\.5 小时/);
  assert.match(text, /继续保持规律记录/);
});

test('Agent Runtime executes a deterministic Skill without invoking model tool calling', async () => {
  let modelCalled = false;
  const llm = {
    supportsToolUse: () => {
      modelCalled = true;
      return true;
    },
  } as unknown as LlmService;
  const tools = {
    tryCreateRecordFromUserText: async () => null,
    tryExecuteDeterministicSkill: async () => ({
      name: 'snapshot_latest' as const,
      title: '读取健康快照',
      input: {},
      result: { content: '{"ok":true}', summary: '已读取最新健康快照' },
      assistantText: '已读取最新健康快照。',
    }),
  } as unknown as HealthAgentToolsService;
  const runtime = new AgentRuntimeService(llm, tools);
  const events = [];

  for await (const event of runtime.run({
    user: { id: 'user-1', email: 'test@example.com', role: 'user' },
    config: { provider: 'qwen', model: 'model-without-tools' },
    system: '',
    messages: [{ role: 'user', content: '读取我最新的健康快照' }],
    userInput: '读取我最新的健康快照',
  })) {
    events.push(event);
  }

  assert.equal(modelCalled, false);
  assert.deepEqual(
    events.map((event) => event.type),
    ['tool_call', 'agent_step', 'tool_result', 'assistant_delta', 'done'],
  );
});

function fakeSkill(name: string, title: string, execute: Skill['execute'] = async () => ({ content: '{}' })): Skill {
  return {
    definition: {
      name,
      title,
      description: `${title}描述`,
      inputSchema: { type: 'object' },
    },
    execute,
  };
}
