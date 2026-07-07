import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

loadEnv();

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const DEMO_PREFIX = '综合测试数据';
const DAYS_TO_COVER = 180;
const today = startOfLocalDay(new Date());
let seed = 2499409073;

const moodTags = ['平稳', '开心', '感恩', '疲惫', '压力大', '焦虑', '低落', '烦躁', '专注', '放松', '有动力', '恢复中'];
const activities = ['散步', '跑步', '骑行', '游泳', '瑜伽', '力量训练', '拉伸', '羽毛球', '椭圆机', '核心训练'];
const medicalTemplates = [
  {
    visitType: '体检',
    diagnosis: '常规体检指标整体稳定',
    medication: '继续保持规律作息，关注睡眠、运动和饮水。',
  },
  {
    visitType: '复查',
    diagnosis: '过敏性鼻炎随访，近期症状较轻',
    medication: '遵医嘱按需用药，避免自行加量或停药。',
  },
  {
    visitType: '门诊',
    diagnosis: '颈肩酸胀与久坐相关',
    medication: '建议减少久坐，热敷拉伸，必要时线下复诊。',
  },
  {
    visitType: '咨询',
    diagnosis: '睡眠节律调整咨询',
    medication: '固定起床时间，下午减少咖啡因，睡前降低屏幕刺激。',
  },
  {
    visitType: '复查',
    diagnosis: '胃部不适复查，暂无明显加重信号',
    medication: '清淡饮食，规律进餐，如出现剧烈疼痛及时就医。',
  },
  {
    visitType: '体检',
    diagnosis: '血压和心率记录稳定',
    medication: '继续记录家庭血压，运动循序渐进。',
  },
];

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

function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function pick(items) {
  return items[Math.floor(random() * items.length)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
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

function minutesAfter(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildRecords(userId) {
  const records = [];

  for (let daysAgo = DAYS_TO_COVER - 1; daysAgo >= 0; daysAgo -= 1) {
    const date = atLocalDay(daysAgo, 12);
    const weekday = date.getDay();
    const seasonal = Math.sin(daysAgo / 17) * 0.65;
    const workStress = weekday === 1 || weekday === 2 ? 0.65 : weekday === 5 ? -0.15 : 0;
    const recovery = weekday === 0 || weekday === 6 ? 0.45 : 0;
    const dateKey = toDateKey(date);

    const sleepHours = round(clamp(7.35 + recovery + seasonal * 0.32 - workStress * 0.32 + (random() - 0.5) * 1.25, 5.4, 9.3));
    const wakeHour = pick([6, 6, 7, 7, 8]);
    const wakeMinute = pick([0, 10, 20, 30, 45]);
    const sleepEnd = atLocalDay(daysAgo, wakeHour, wakeMinute);
    const sleepStart = minutesBefore(sleepEnd, Math.round(sleepHours * 60));
    const sleepQuality = clamp(Math.round(3.45 + (sleepHours - 7) * 0.58 + recovery * 0.3 - workStress * 0.34 + (random() - 0.5)), 1, 5);
    const awakenings = sleepQuality >= 4 ? pick([0, 0, 1]) : pick([1, 1, 2, 3]);

    records.push({
      userId,
      type: 'sleep',
      recordedAt: sleepEnd,
      note: `${DEMO_PREFIX} · ${dateKey} 睡眠 ${sleepHours} 小时，夜醒 ${awakenings} 次，醒来状态${sleepQuality >= 4 ? '较好' : sleepQuality <= 2 ? '偏累' : '一般'}。`,
      payload: {
        startedAt: sleepStart.toISOString(),
        endedAt: sleepEnd.toISOString(),
        quality: sleepQuality,
      },
    });

    const moodScore = clamp(Math.round(7 + seasonal - workStress + recovery * 0.5 + (sleepHours - 7) * 0.45 + (random() - 0.5) * 1.8), 1, 10);
    const tags = new Set();
    tags.add(moodScore >= 8 ? pick(['开心', '感恩', '有动力', '放松']) : moodScore <= 5 ? pick(['疲惫', '压力大', '焦虑', '低落']) : pick(['平稳', '专注', '恢复中']));
    if (sleepQuality <= 2) tags.add('疲惫');
    if (workStress > 0.4) tags.add('压力大');
    if (random() > 0.55) tags.add(pick(moodTags));

    records.push({
      userId,
      type: 'mood',
      recordedAt: atLocalDay(daysAgo, daysAgo === 0 ? 9 : pick([9, 13, 20, 22]), pick([0, 10, 20, 30, 45])),
      note: `${DEMO_PREFIX} · ${dateKey} 心情 ${moodScore}/10，主要感受：${[...tags].slice(0, 3).join('、')}。`,
      payload: {
        score: moodScore,
        tags: [...tags].slice(0, 4),
      },
    });

    const plannedExercise = [1, 2, 4, 6].includes(weekday) || (weekday === 0 && random() > 0.45) || random() > 0.76;
    if (plannedExercise) {
      const activity = pick(activities);
      const intensity = activity === '散步' || activity === '拉伸' || activity === '瑜伽' ? 'low' : random() > 0.72 ? 'high' : 'medium';
      const durationBase = intensity === 'low' ? 32 : intensity === 'medium' ? 46 : 62;
      const durationMinutes = clamp(Math.round(durationBase + recovery * 8 + (random() - 0.5) * 28), 15, 105);
      const exerciseHour = daysAgo === 0 ? pick([7, 8]) : pick([7, 18, 19, 20]);

      records.push({
        userId,
        type: 'exercise',
        recordedAt: atLocalDay(daysAgo, exerciseHour, pick([0, 10, 20, 30, 45])),
        note: `${DEMO_PREFIX} · ${dateKey} ${activity} ${durationMinutes} 分钟，强度${intensityLabel(intensity)}。`,
        payload: {
          activity,
          durationMinutes,
          intensity,
        },
      });
    }

    if (daysAgo % 14 === 0) {
      const template = medicalTemplates[(daysAgo / 14) % medicalTemplates.length];
      const followUpAt = daysAgo % 42 === 0 ? minutesAfter(atLocalDay(Math.max(daysAgo - 28, 0), 10, 0), 30) : undefined;

      records.push({
        userId,
        type: 'medical',
        recordedAt: atLocalDay(daysAgo, pick([9, 10, 14, 16]), pick([0, 20, 40])),
        note: `${DEMO_PREFIX} · ${dateKey} ${template.visitType}记录：${template.diagnosis}。`,
        payload: {
          visitType: template.visitType,
          diagnosis: template.diagnosis,
          medication: template.medication,
          followUpAt: followUpAt?.toISOString(),
          medicalMaterials: [],
        },
      });
    }
  }

  return records;
}

function intensityLabel(intensity) {
  if (intensity === 'low') return '低';
  if (intensity === 'high') return '高';
  return '中等';
}

async function ensureDemoUser() {
  return prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      displayName: 'Demo User',
      llmConfigs: {
        create: {
          provider: 'mock',
          model: 'mock-health-assistant',
          enabled: true,
          ragEnabled: true,
          ragTopK: 5,
        },
      },
    },
    select: { id: true, email: true, displayName: true },
  });
}

async function main() {
  let users = await prisma.user.findMany({
    where: {
      email: { not: { startsWith: 'codex-test-' } },
      disabledAt: null,
    },
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!users.length) {
    users = [await ensureDemoUser()];
  }

  const summary = [];
  for (const user of users) {
    const deleted = await prisma.healthRecord.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { note: { startsWith: DEMO_PREFIX } },
          { note: { startsWith: '示例数据' } },
          { note: { startsWith: '示例历史数据' } },
          { note: { startsWith: '绀轰緥鏁版嵁' } },
          { note: { startsWith: '绀轰緥鍘嗗彶鏁版嵁' } },
        ],
      },
    });
    const records = buildRecords(user.id);
    const created = await prisma.healthRecord.createMany({ data: records });
    const counts = await prisma.healthRecord.groupBy({
      by: ['type'],
      where: { userId: user.id },
      _count: { _all: true },
    });
    const total = await prisma.healthRecord.count({ where: { userId: user.id } });

    summary.push({
      email: user.email,
      displayName: user.displayName,
      deleted: deleted.count,
      created: created.count,
      total,
      latestDate: toDateKey(today),
      byType: Object.fromEntries(counts.map((item) => [item.type, item._count._all])),
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
