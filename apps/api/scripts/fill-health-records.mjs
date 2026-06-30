import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const today = new Date('2026-06-30T12:00:00+08:00');
let seed = 2499409073;

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

function atLocalDay(daysAgo, hour, minute = 0) {
  const date = new Date(today.getTime() - daysAgo * DAY);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function buildRecords(userId, targetCount = 200) {
  const records = [];
  const moodTags = ['平静', '开心', '感恩', '疲惫', '压力大', '焦虑', '低落', '烦躁', '专注', '放松'];
  const activities = ['散步', '跑步', '骑行', '游泳', '瑜伽', '力量训练', '拉伸', '羽毛球'];
  const diagnoses = ['体检指标稳定', '轻微鼻炎', '咽喉不适', '肩颈劳损', '胃部不适', '皮肤过敏', '眼疲劳', '复查正常'];
  const medications = ['遵医嘱观察，保持休息', '按需用药，注意复诊', '补充水分，清淡饮食', '热敷拉伸，减少久坐', '无需特殊用药，持续记录'];

  for (let daysAgo = 0; records.length < targetCount; daysAgo += 1) {
    const weekday = atLocalDay(daysAgo, 12).getDay();
    const seasonal = Math.sin(daysAgo / 18) * 0.8;
    const stress = weekday === 1 || weekday === 2 ? 0.6 : weekday === 5 ? -0.2 : 0;

    const sleepStart = atLocalDay(daysAgo + 1, pick([22, 23, 0]), pick([0, 15, 30, 45]));
    const sleepHours = clamp(7.1 + seasonal * 0.3 - stress * 0.25 + (random() - 0.5) * 1.4, 5.5, 9.2);
    const sleepEnd = addHours(sleepStart, sleepHours);
    const quality = clamp(Math.round(3.5 + (sleepHours - 7) * 0.55 - stress * 0.3 + (random() - 0.5)), 1, 5);
    records.push({
      userId,
      type: 'sleep',
      recordedAt: sleepEnd,
      note: `示例数据 · 睡眠 ${sleepHours.toFixed(1)} 小时，醒来状态${quality >= 4 ? '不错' : quality <= 2 ? '偏累' : '一般'}`,
      payload: { startedAt: sleepStart.toISOString(), endedAt: sleepEnd.toISOString(), quality },
    });
    if (records.length >= targetCount) break;

    const score = clamp(Math.round(7 + seasonal - stress + (sleepHours - 7) * 0.45 + (random() - 0.5) * 2), 1, 10);
    const tags = new Set();
    tags.add(score >= 8 ? pick(['开心', '感恩', '有动力', '放松']) : score <= 5 ? pick(['疲惫', '压力大', '焦虑', '低落']) : pick(['平静', '专注', '放松']));
    if (random() > 0.55) tags.add(pick(moodTags));
    records.push({
      userId,
      type: 'mood',
      recordedAt: atLocalDay(daysAgo, pick([9, 13, 20, 22]), pick([0, 15, 30, 45])),
      note: `示例数据 · 今日心情 ${score}/10，记录主要感受`,
      payload: { score, tags: [...tags].slice(0, 3) },
    });
    if (records.length >= targetCount) break;

    if (random() < (weekday === 0 || weekday === 6 ? 0.75 : 0.55)) {
      const activity = pick(activities);
      const intensity = activity === '散步' || activity === '拉伸' ? 'low' : random() > 0.72 ? 'high' : 'medium';
      const durationBase = intensity === 'low' ? 28 : intensity === 'medium' ? 45 : 62;
      const durationMinutes = clamp(Math.round(durationBase + (random() - 0.5) * 30), 12, 100);
      records.push({
        userId,
        type: 'exercise',
        recordedAt: atLocalDay(daysAgo, pick([7, 18, 19, 20]), pick([0, 10, 20, 30, 45])),
        note: `示例数据 · ${activity} ${durationMinutes} 分钟`,
        payload: { activity, durationMinutes, intensity },
      });
      if (records.length >= targetCount) break;
    }

    if (daysAgo % 18 === 0) {
      const diagnosis = pick(diagnoses);
      records.push({
        userId,
        type: 'medical',
        recordedAt: atLocalDay(daysAgo, pick([9, 10, 14, 16]), pick([0, 20, 40])),
        note: `示例数据 · ${diagnosis}，已记录医生建议`,
        payload: {
          visitType: pick(['门诊', '复诊', '体检', '咨询']),
          diagnosis,
          medication: pick(medications),
          followUpAt: daysAgo % 54 === 0 ? atLocalDay(Math.max(daysAgo - 14, 0), 10).toISOString() : undefined,
        },
      });
    }
  }

  return records.slice(0, targetCount);
}

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { not: { startsWith: 'codex-test-' } } },
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  });

  const summary = [];
  for (const user of users) {
    const deleted = await prisma.healthRecord.deleteMany({
      where: { userId: user.id, note: { startsWith: '示例数据' } },
    });
    const records = buildRecords(user.id, 200);
    const created = await prisma.healthRecord.createMany({ data: records });
    const total = await prisma.healthRecord.count({ where: { userId: user.id } });
    summary.push({ email: user.email, displayName: user.displayName, deleted: deleted.count, created: created.count, total });
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
