export function hasExplicitWriteIntent(text: string) {
  return /记录|保存|添加|记下|帮我记|存一下|log\s*this|save\s*this|add\s*this/i.test(text);
}

export function parseRecordFromText(text: string) {
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
  const activities = ['跑步', '慢跑', '快走', '走路', '散步', '骑车', '骑行', '游泳', '瑜伽', '力量训练', '健身', '跳绳', '爬山', '羽毛球', '篮球', '足球', '网球'];
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
