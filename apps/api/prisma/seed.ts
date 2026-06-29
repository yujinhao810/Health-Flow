import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const knowledgeDocuments = [
  {
    title: '危机与紧急情况处理原则',
    tags: ['危机', '自伤', '紧急', '安全'],
    chunks: [
      {
        title: '出现即时危险时的优先行动',
        keywords: ['自杀', '自伤', '伤害自己', '活不下去', '紧急服务'],
        content:
          '如果一个人正处于可能伤害自己或他人的即时危险中，优先目标是确保现场安全：远离可用于伤害的工具或环境，尽快联系身边可信任的人陪伴，并联系当地紧急服务或线下医疗机构。线上助手不能替代急救、精神科急诊或危机干预服务。',
      },
    ],
  },
  {
    title: '心理对话助手边界',
    tags: ['心理', '边界', '非诊断'],
    chunks: [
      {
        title: '非诊断支持原则',
        keywords: ['心理咨询', '诊断', '医生', '治疗'],
        content:
          '心理对话助手可以提供情绪支持、问题梳理、低风险自助练习和就医沟通准备，但不能做医学或心理疾病诊断，不能替代医生、心理咨询师或精神科专业评估。涉及持续痛苦、功能受损、用药或诊断时，应建议用户寻求合格专业人士帮助。',
      },
    ],
  },
  {
    title: '焦虑和惊恐时的稳定技巧',
    tags: ['焦虑', '惊恐', '稳定技巧', '呼吸'],
    chunks: [
      {
        title: '短时稳定练习',
        keywords: ['焦虑', '惊恐', '呼吸', '正念', '稳定'],
        content:
          '焦虑或惊恐上来时，可以先降低任务难度：把双脚放在地面，观察并说出5个看到的物品、4个触碰到的感觉、3个听到的声音；尝试缓慢呼气比吸气更长的呼吸节奏；提醒自己“这是强烈不适，但会逐渐下降”。如果伴随胸痛、晕厥、严重呼吸困难等急症信号，应优先线下就医。',
      },
    ],
  },
  {
    title: '睡眠卫生基础',
    tags: ['睡眠', '失眠', '作息'],
    chunks: [
      {
        title: '低压力睡眠建议',
        keywords: ['睡不着', '失眠', '熬夜', '睡眠卫生'],
        content:
          '睡眠问题可先从低压力调整开始：固定起床时间，睡前减少强光和高刺激内容，下午晚些时候避免大量咖啡因；如果躺下很久仍清醒，可短暂离床做安静放松活动，困意回来再上床。不要把一次睡不好解读成失败；若失眠持续数周、明显影响工作学习或伴随强烈情绪困扰，建议咨询医生或专业人士。',
      },
    ],
  },
  {
    title: '运动与身体不适安全提醒',
    tags: ['运动', '安全', '身体不适'],
    chunks: [
      {
        title: '运动时的保守原则',
        keywords: ['运动', '心悸', '胸痛', '头晕', '受伤'],
        content:
          '运动建议应以循序渐进和安全为先。出现胸痛、明显气短、晕厥、持续心悸、急性损伤或不明原因剧烈疼痛时，不应硬撑训练，应停止活动并根据严重程度寻求线下医疗帮助。普通疲劳时可以降低强度、缩短时长，优先恢复睡眠和补水。',
      },
    ],
  },
  {
    title: '用药与诊断免责声明',
    tags: ['用药', '诊断', '医生'],
    chunks: [
      {
        title: '用药问题的安全边界',
        keywords: ['药', '用药', '剂量', '副作用', '诊断'],
        content:
          '涉及药物开始、停止、加量、减量、联合用药或副作用判断时，线上助手只能建议记录症状和问题，并与开药医生或药师沟通，不能替代专业处方建议。若出现严重过敏、呼吸困难、意识异常等情况，应立即寻求急救或线下医疗服务。',
      },
    ],
  },
  {
    title: '何时寻求专业帮助',
    tags: ['就医', '专业帮助', '心理'],
    chunks: [
      {
        title: '建议线下支持的情况',
        keywords: ['求助', '咨询', '医生', '持续', '影响生活'],
        content:
          '当情绪困扰持续存在、明显影响睡眠工作学习、人际关系或自我照顾，或反复出现绝望、自责、失控感时，建议把寻求专业帮助视为保护自己的行动。可以先联系可信任的人陪同，整理最近症状、持续时间、诱因、既往病史和用药信息，再预约心理咨询、精神科或全科医生。',
      },
    ],
  },
];

async function main() {
  await prisma.user.upsert({
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

  for (const document of knowledgeDocuments) {
    await prisma.knowledgeDocument.upsert({
      where: { title: document.title },
      update: {
        tags: document.tags,
        status: 'published',
        chunks: {
          deleteMany: {},
          create: document.chunks.map((chunk, index) => ({ ...chunk, ordinal: index + 1 })),
        },
      },
      create: {
        title: document.title,
        source: '内置健康安全知识库',
        locale: 'zh-CN',
        status: 'published',
        tags: document.tags,
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
