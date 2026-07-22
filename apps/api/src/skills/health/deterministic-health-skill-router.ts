export type DeterministicHealthSkillInvocation = {
  name: 'health_records_list' | 'snapshot_latest' | 'snapshot_generate_weekly' | 'health_plan_generate';
  input: Record<string, unknown>;
};

export function routeDeterministicHealthSkill(userInput: string, now = new Date()): DeterministicHealthSkillInvocation | null {
  const text = userInput.trim();
  const asksHow = /(如何|怎么|怎样|为什么|是否应该)/.test(text);

  if (!asksHow && /(重新|更新|生成).{0,12}(健康)?快照|(健康)?快照.{0,8}(重新|更新|生成)/.test(text)) {
    return { name: 'snapshot_generate_weekly', input: {} };
  }

  if (/(读取|查看|获取|查询|看看).{0,16}(最新|最近)?(的)?(健康)?快照|(最新|最近)(的)?(健康)?快照/.test(text)) {
    return { name: 'snapshot_latest', input: {} };
  }

  if (!asksHow && isHealthPlanRequest(text)) {
    const timeframe = parseTimeframe(text);
    return {
      name: 'health_plan_generate',
      input: {
        goal: text,
        ...(timeframe ? { timeframe } : {}),
        focusAreas: parseFocusAreas(text),
        constraints: [],
      },
    };
  }

  if (isHealthRecordQuery(text)) {
    return { name: 'health_records_list', input: buildRecordQuery(text, now) };
  }

  return null;
}

export function formatDeterministicSkillResult(name: DeterministicHealthSkillInvocation['name'], content: string, isError?: boolean) {
  const payload = parseJsonObject(content);
  if (isError || payload?.ok === false) {
    return typeof payload?.error === 'string' ? `健康工具执行失败：${payload.error}` : '健康工具执行失败，请稍后重试。';
  }

  if (name === 'health_records_list') return formatRecords(payload?.records);
  if (name === 'snapshot_latest') return formatSnapshot(payload?.snapshot, '已读取最新健康快照');
  if (name === 'snapshot_generate_weekly') return formatSnapshot(payload?.snapshot, '已生成最近 7 天健康快照');
  if (name === 'health_plan_generate') return formatPlan(payload?.plan);
  return '健康工具已执行完成。';
}

function isHealthRecordQuery(text: string) {
  return (
    /(查询|查看|读取|看看|显示|找出).{0,20}(健康|睡眠|运动|心情|情绪|就医|医疗).{0,10}(记录|数据|情况)?/.test(text) ||
    /(最近|近[一二三四五六七八九十两0-9]+天|这周|本周|上周|今天|昨天|过去|历史).{0,12}(睡眠|运动|心情|情绪|就医|医疗|健康).{0,12}(记录|数据|情况|怎么样|变化|趋势)/.test(text)
  );
}

function isHealthPlanRequest(text: string) {
  return (
    /(生成|制定|创建|安排|做).{0,20}(健康|睡眠|运动|心情|情绪|压力).{0,12}计划/.test(text) ||
    /(健康|睡眠|运动|心情|情绪|压力).{0,12}计划/.test(text)
  );
}

function buildRecordQuery(text: string, now: Date) {
  const input: Record<string, unknown> = {};
  const type = parseRecordType(text);
  if (type) input.type = type;

  const range = parseDateRange(text, now);
  if (range) {
    input.from = range.from.toISOString();
    input.to = range.to.toISOString();
  }

  const limitMatch = text.match(/(?:最近|查询|查看|读取)?\s*(\d{1,3})\s*条/);
  if (limitMatch) input.limit = Math.min(100, Math.max(1, Number(limitMatch[1])));
  return input;
}

function parseRecordType(text: string) {
  if (/睡眠|睡觉/.test(text)) return 'sleep';
  if (/运动|锻炼|跑步|步行|健身/.test(text)) return 'exercise';
  if (/心情|情绪|心境/.test(text)) return 'mood';
  if (/就医|医疗|看病|复诊/.test(text)) return 'medical';
  return undefined;
}

function parseDateRange(text: string, now: Date) {
  const end = new Date(now);
  const recentDays = text.match(/(?:最近|近|过去)\s*([一二三四五六七八九十两0-9]+)\s*天/);
  if (recentDays) {
    const days = parsePositiveInteger(recentDays[1]);
    if (days) {
      const from = new Date(end);
      from.setDate(from.getDate() - days);
      return { from, to: end };
    }
  }

  if (/今天/.test(text)) return dayRange(now, 0);
  if (/昨天/.test(text)) return dayRange(now, -1);
  if (/这周|本周/.test(text)) {
    const from = startOfDay(now);
    const weekday = from.getDay() || 7;
    from.setDate(from.getDate() - weekday + 1);
    return { from, to: end };
  }
  if (/上周/.test(text)) {
    const thisWeek = startOfDay(now);
    const weekday = thisWeek.getDay() || 7;
    thisWeek.setDate(thisWeek.getDate() - weekday + 1);
    const from = new Date(thisWeek);
    from.setDate(from.getDate() - 7);
    return { from, to: new Date(thisWeek.getTime() - 1) };
  }
  return undefined;
}

function dayRange(now: Date, dayOffset: number) {
  const from = startOfDay(now);
  from.setDate(from.getDate() + dayOffset);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  to.setMilliseconds(to.getMilliseconds() - 1);
  return { from, to };
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseTimeframe(text: string) {
  const match = text.match(/([一二三四五六七八九十两0-9]+)\s*(天|周|个月|月)/);
  if (!match) return undefined;
  const amount = parsePositiveInteger(match[1]);
  return amount ? `${amount} ${match[2]}`.replace(' 月', ' 个月') : undefined;
}

function parseFocusAreas(text: string) {
  const areas: string[] = [];
  if (/睡眠|睡觉/.test(text)) areas.push('sleep');
  if (/运动|锻炼|健身/.test(text)) areas.push('exercise');
  if (/心情|情绪|心境/.test(text)) areas.push('mood');
  if (/压力|焦虑|紧张/.test(text)) areas.push('stress');
  return areas;
}

function parsePositiveInteger(value: string) {
  if (/^\d+$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : undefined;
  }
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === '十') return 10;
  if (value.startsWith('十')) return 10 + (digits[value[1]] ?? 0);
  if (value.endsWith('十')) return (digits[value[0]] ?? 0) * 10;
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    return (digits[tens] ?? 0) * 10 + (digits[ones] ?? 0);
  }
  return digits[value];
}

function parseJsonObject(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function formatRecords(value: unknown) {
  if (!Array.isArray(value) || !value.length) return '没有查询到符合条件的健康记录。';
  const lines = value.map((record, index) => `${index + 1}. ${formatRecord(record)}`);
  return `已查询到 ${value.length} 条健康记录：\n\n${lines.join('\n')}`;
}

function formatRecord(value: unknown) {
  const record = asObject(value);
  const payload = asObject(record?.payload);
  const date = typeof record?.recordedAt === 'string' ? formatDateTime(record.recordedAt) : '时间未知';
  if (record?.type === 'sleep') {
    const hours = durationHours(payload?.startedAt, payload?.endedAt);
    const quality = typeof payload?.quality === 'number' ? `，质量 ${payload.quality} 分` : '';
    return `${date} 睡眠${hours ? ` ${hours} 小时` : ''}${quality}`;
  }
  if (record?.type === 'exercise') {
    return `${date} ${String(payload?.activity ?? '运动')} ${String(payload?.durationMinutes ?? '-')} 分钟${formatIntensity(payload?.intensity)}`;
  }
  if (record?.type === 'mood') {
    const tags = Array.isArray(payload?.tags) && payload.tags.length ? `，标签：${payload.tags.join('、')}` : '';
    return `${date} 心情 ${String(payload?.score ?? '-')} 分${tags}`;
  }
  if (record?.type === 'medical') return `${date} 就医记录：${String(payload?.visitType ?? record?.note ?? '未填写详情')}`;
  return `${date} 健康记录`;
}

function formatSnapshot(value: unknown, heading: string) {
  const snapshot = asObject(value);
  if (!snapshot) return `${heading}。`;
  const summary = typeof snapshot.summary === 'string' ? snapshot.summary : '';
  const recommendations = Array.isArray(snapshot.recommendations)
    ? snapshot.recommendations.filter((item): item is string => typeof item === 'string')
    : [];
  return [heading, summary, recommendations.length ? `建议：\n${recommendations.map((item) => `- ${item}`).join('\n')}` : '']
    .filter(Boolean)
    .join('\n\n');
}

function formatPlan(value: unknown) {
  const plan = asObject(value);
  if (!plan) return '健康计划已生成。';
  const actions = Array.isArray(plan.dailyActions) ? plan.dailyActions.map(asObject).filter(Boolean) : [];
  const actionLines = actions.map((action) => `- ${String(action?.title ?? '行动')}：${String(action?.details ?? '')}（${String(action?.cadence ?? '')}）`);
  return [
    `### ${String(plan.title ?? '健康计划')}`,
    typeof plan.summary === 'string' ? plan.summary : '',
    actionLines.length ? `每日行动：\n${actionLines.join('\n')}` : '',
    typeof plan.disclaimer === 'string' ? plan.disclaimer : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function durationHours(startedAt: unknown, endedAt: unknown) {
  if (typeof startedAt !== 'string' || typeof endedAt !== 'string') return undefined;
  const hours = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 36e5;
  return Number.isFinite(hours) && hours > 0 ? Number(hours.toFixed(1)) : undefined;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatIntensity(value: unknown) {
  if (value === 'low') return '，低强度';
  if (value === 'medium') return '，中等强度';
  if (value === 'high') return '，高强度';
  return '';
}
