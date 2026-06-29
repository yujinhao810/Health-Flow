import { Injectable } from '@nestjs/common';

@Injectable()
export class CrisisPolicyService {
  detect(message: string) {
    const text = message.toLowerCase();
    const keywords = ['自杀', '自残', '伤害自己', '不想活', '结束生命', 'kill myself', 'suicide'];
    return keywords.some((keyword) => text.includes(keyword));
  }

  buildResponse() {
    return '如果你现在有伤害自己或他人的危险，请立即联系当地紧急服务，或尽快联系你信任的人和专业帮助。';
  }
}
