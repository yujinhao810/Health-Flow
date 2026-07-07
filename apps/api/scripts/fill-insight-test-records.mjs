import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

loadEnv();

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const TARGET_EMAIL = process.env.HEALTHFLOW_FILL_USER_EMAIL ?? process.argv[2];
const TEST_PREFIX = 'HF_INSIGHT_TEST';
const DAYS_TO_COVER = 90;
const today = startOfLocalDay(new Date());
const exerciseDaysCurrent = new Set([6, 17, 28]);
const exerciseDaysPrevious = new Set([32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58]);
const exerciseDaysBaseline = new Set([63, 66, 69, 72, 75, 78, 81, 84, 87]);
const medicalDaysCurrent = new Set([1, 8, 15, 22, 29]);
const medicalDaysPrevious = new Set([45]);
const medicalDaysBaseline = new Set([72]);

function loadEnv() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '..', '..', '.env'),
    resolve(scriptDir, '..', '..', '..', '.env'),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;

    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
    return;
  }
}

function startOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function atLocalDay(daysAgo, hour, minute = 0) {
  const date = new Date(today.getTime() - daysAgo * DAY);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function minutesBefore(date, minutes) {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function notFuture(date) {
  const now = new Date();
  return date.getTime() <= now.getTime() ? date : new Date(now.getTime() - 5 * 60 * 1000);
}

function scenarioForDay(daysAgo) {
  if (daysAgo <= 29) {
    return {
      label: 'recent-decline',
      sleepHours: daysAgo % 3 === 0 ? 5.4 : 5.8,
      sleepQuality: daysAgo % 4 === 0 ? 1 : 2,
      moodScore: daysAgo % 2 === 0 ? 4 : 5,
      moodTags: ['疲惫', '压力大', daysAgo % 2 === 0 ? '焦虑' : '低落'],
    };
  }

  if (daysAgo >= 31 && daysAgo <= 59) {
    return {
      label: 'previous-stable',
      sleepHours: daysAgo % 2 === 0 ? 8.2 : 8.5,
      sleepQuality: daysAgo % 3 === 0 ? 4 : 5,
      moodScore: daysAgo % 2 === 0 ? 8 : 9,
      moodTags: ['平稳', '有动力', daysAgo % 2 === 0 ? '专注' : '放松'],
    };
  }

  return {
    label: 'baseline',
    sleepHours: daysAgo % 2 === 0 ? 7.4 : 7.7,
    sleepQuality: 4,
    moodScore: 7,
    moodTags: ['平稳', '恢复中'],
  };
}

function buildRecords(userId) {
  const records = [];

  for (let daysAgo = DAYS_TO_COVER - 1; daysAgo >= 0; daysAgo -= 1) {
    if (daysAgo === 30 || daysAgo === 60) continue;

    const scenario = scenarioForDay(daysAgo);
    const dateKey = toDateKey(atLocalDay(daysAgo, 12));
    const sleepEnd = notFuture(atLocalDay(daysAgo, 6, daysAgo % 2 === 0 ? 30 : 50));
    const sleepStart = minutesBefore(sleepEnd, Math.round(scenario.sleepHours * 60));

    records.push({
      userId,
      type: 'sleep',
      recordedAt: sleepEnd,
      note: `${TEST_PREFIX} · ${dateKey} · ${scenario.label} · 睡眠 ${scenario.sleepHours} 小时，质量 ${scenario.sleepQuality}/5。`,
      payload: {
        startedAt: sleepStart.toISOString(),
        endedAt: sleepEnd.toISOString(),
        quality: scenario.sleepQuality,
      },
    });

    records.push({
      userId,
      type: 'mood',
      recordedAt: notFuture(atLocalDay(daysAgo, 9, daysAgo % 2 === 0 ? 15 : 45)),
      note: `${TEST_PREFIX} · ${dateKey} · ${scenario.label} · 心情 ${scenario.moodScore}/10，标签：${scenario.moodTags.join('、')}。`,
      payload: {
        score: scenario.moodScore,
        tags: scenario.moodTags,
      },
    });

    if (exerciseDaysCurrent.has(daysAgo) || exerciseDaysPrevious.has(daysAgo) || exerciseDaysBaseline.has(daysAgo)) {
      const isCurrent = exerciseDaysCurrent.has(daysAgo);
      const activity = isCurrent ? '拉伸' : daysAgo % 4 === 0 ? '跑步' : '力量训练';
      const intensity = isCurrent ? 'low' : 'medium';
      const durationMinutes = isCurrent ? 16 + (daysAgo % 3) * 2 : 45 + (daysAgo % 4) * 5;

      records.push({
        userId,
        type: 'exercise',
        recordedAt: notFuture(atLocalDay(daysAgo, isCurrent ? 7 : 18, daysAgo % 2 === 0 ? 10 : 35)),
        note: `${TEST_PREFIX} · ${dateKey} · ${scenario.label} · ${activity} ${durationMinutes} 分钟。`,
        payload: {
          activity,
          durationMinutes,
          intensity,
        },
      });
    }

    if (medicalDaysCurrent.has(daysAgo) || medicalDaysPrevious.has(daysAgo) || medicalDaysBaseline.has(daysAgo)) {
      const isCurrent = medicalDaysCurrent.has(daysAgo);

      records.push({
        userId,
        type: 'medical',
        recordedAt: notFuture(atLocalDay(daysAgo, 10, daysAgo % 2 === 0 ? 20 : 40)),
        note: `${TEST_PREFIX} · ${dateKey} · ${scenario.label} · ${isCurrent ? '近期不适复诊/咨询增多' : '常规复查'}。`,
        payload: {
          visitType: isCurrent ? (daysAgo % 2 === 0 ? '门诊' : '咨询') : '复查',
          diagnosis: isCurrent ? '近期疲劳、睡眠不足与压力相关，建议继续观察并必要时复诊' : '常规复查，状态稳定',
          medication: isCurrent ? '遵医嘱处理，不自行调整药物；如症状加重及时线下就医。' : '继续保持原计划。',
          followUpAt: undefined,
          medicalMaterials: [],
        },
      });
    }
  }

  return records;
}

async function main() {
  if (!TARGET_EMAIL) {
    throw new Error('Please provide target email: HEALTHFLOW_FILL_USER_EMAIL=<email> node scripts/fill-insight-test-records.mjs');
  }

  const user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, email: true, displayName: true },
  });
  if (!user) throw new Error(`User not found: ${TARGET_EMAIL}`);

  const from180 = new Date(Date.now() - 180 * DAY);
  const deletedInsights = await prisma.healthInsight.deleteMany({ where: { userId: user.id } });
  const deletedRecords = await prisma.healthRecord.deleteMany({
    where: {
      userId: user.id,
      recordedAt: { gte: from180 },
    },
  });
  const records = buildRecords(user.id);
  const created = await prisma.healthRecord.createMany({ data: records });
  const byType = await prisma.healthRecord.groupBy({
    by: ['type'],
    where: { userId: user.id },
    _count: { _all: true },
  });

  console.log(
    JSON.stringify(
      {
        user,
        deletedRecords: deletedRecords.count,
        deletedInsights: deletedInsights.count,
        created: created.count,
        byType: Object.fromEntries(byType.map((item) => [item.type, item._count._all])),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
