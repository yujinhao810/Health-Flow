import { HealthRecordType, Prisma, PrismaClient } from '@prisma/client';
import { knowledgeDocuments } from './seed-knowledge';

const prisma = new PrismaClient();

type DemoHealthRecord = {
  id: string;
  type: HealthRecordType;
  recordedAt: Date;
  note: string;
  payload: Prisma.InputJsonValue;
};

function dateAt(daysAgo: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function buildDemoHealthRecords(): DemoHealthRecord[] {
  return [
    {
      id: '9c65d00e-b4df-4bd2-9e29-6e703ab0884c',
      type: HealthRecordType.sleep,
      recordedAt: dateAt(0, 7, 10),
      note: '示例历史数据：昨晚入睡比较顺，早晨精神尚可。',
      payload: {
        startedAt: dateAt(1, 23, 20).toISOString(),
        endedAt: dateAt(0, 7, 10).toISOString(),
        quality: 4,
      },
    },
    {
      id: '7f0b4a94-6e8e-4e5f-86f5-190750d26655',
      type: HealthRecordType.mood,
      recordedAt: dateAt(0, 9, 5),
      note: '示例历史数据：上午状态稳定，适合安排需要专注的任务。',
      payload: {
        score: 7,
        tags: ['平静', '专注'],
      },
    },
    {
      id: 'dba0f6c8-35c4-4565-a479-b313b24d1141',
      type: HealthRecordType.exercise,
      recordedAt: dateAt(1, 18, 30),
      note: '示例历史数据：晚饭后轻量运动，身体没有明显不适。',
      payload: {
        activity: '散步',
        durationMinutes: 35,
        intensity: 'low',
      },
    },
    {
      id: 'c3300637-9d18-4cf9-9f5e-7cdb81f8f891',
      type: HealthRecordType.sleep,
      recordedAt: dateAt(2, 6, 55),
      note: '示例历史数据：夜间醒过一次，但很快重新入睡。',
      payload: {
        startedAt: dateAt(3, 23, 45).toISOString(),
        endedAt: dateAt(2, 6, 55).toISOString(),
        quality: 3,
      },
    },
    {
      id: '725ea126-73a9-4114-b555-76444b064c4d',
      type: HealthRecordType.mood,
      recordedAt: dateAt(2, 20, 15),
      note: '示例历史数据：下午有些疲惫，晚上做了放松整理。',
      payload: {
        score: 6,
        tags: ['疲惫', '平静'],
      },
    },
    {
      id: 'e0bbfd32-6986-4efa-a8d4-6a326d98ab79',
      type: HealthRecordType.exercise,
      recordedAt: dateAt(3, 7, 40),
      note: '示例历史数据：短跑后拉伸，整体恢复正常。',
      payload: {
        activity: '跑步',
        durationMinutes: 25,
        intensity: 'medium',
      },
    },
    {
      id: 'ce05917b-0a6c-4ac5-a6b1-e0e237bd09a1',
      type: HealthRecordType.medical,
      recordedAt: dateAt(5, 15, 0),
      note: '示例历史数据：常规复查记录，用于展示就医时间线。',
      payload: {
        visitType: '复诊',
        diagnosis: '过敏性鼻炎随访',
        medication: '按医嘱继续观察，必要时使用既往处方药。',
        followUpAt: dateAt(-25, 10, 30).toISOString(),
      },
    },
  ];
}

async function main() {
  const user = await prisma.user.upsert({
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
  });

  for (const record of buildDemoHealthRecords()) {
    await prisma.healthRecord.upsert({
      where: { id: record.id },
      update: {
        userId: user.id,
        type: record.type,
        recordedAt: record.recordedAt,
        note: record.note,
        payload: record.payload,
      },
      create: {
        ...record,
        userId: user.id,
      },
    });
  }

  for (const document of knowledgeDocuments) {
    await prisma.knowledgeDocument.upsert({
      where: { title: document.title },
      update: {
        source: document.source,
        sourceUrl: document.sourceUrl,
        locale: 'zh-CN',
        tags: document.tags,
        metadata: document.metadata,
        status: 'published',
        chunks: {
          deleteMany: {},
          create: document.chunks.map((chunk, index) => ({ ...chunk, ordinal: index + 1 })),
        },
      },
      create: {
        title: document.title,
        source: document.source,
        sourceUrl: document.sourceUrl,
        locale: 'zh-CN',
        status: 'published',
        tags: document.tags,
        metadata: document.metadata,
        chunks: {
          create: document.chunks.map((chunk, index) => ({ ...chunk, ordinal: index + 1 })),
        },
      },
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
