import { Injectable } from '@nestjs/common';
import type { DiagnosisInput, DiagnosisSafetyLevel, RedFlagFinding } from '@health/shared';
import { CrisisPolicyService } from '../safety/crisis-policy.service';

export type RedFlagTriageResult = {
  safetyLevel: DiagnosisSafetyLevel;
  mustSeekImmediateCare: boolean;
  findings: RedFlagFinding[];
};

@Injectable()
export class RedFlagTriageService {
  constructor(private readonly crisis: CrisisPolicyService) {}

  evaluate(input: DiagnosisInput): RedFlagTriageResult {
    const text = collectText(input);
    const findings: RedFlagFinding[] = [];

    if (this.crisis.detect(text)) addFinding(findings, '自伤或伤人风险', '出现自伤、自杀或伤害他人的风险表达。', [text]);
    if (hasAny(text, ['胸痛', '胸闷', '心前区', '左臂放射', '大汗', '濒死感'])) {
      addFinding(findings, '胸痛/心血管急症风险', '胸痛、胸闷或伴随大汗、放射痛等表现需要排查急性心血管事件。', matched(text, ['胸痛', '胸闷', '左臂放射', '大汗']));
    }
    if (hasAny(text, ['呼吸困难', '喘不上气', '气促', '口唇发紫', '发绀'])) {
      addFinding(findings, '呼吸困难/低氧风险', '呼吸困难、发绀或明显气促可能需要紧急评估。', matched(text, ['呼吸困难', '喘不上气', '气促', '口唇发紫', '发绀']));
    }
    if (hasAny(text, ['口角歪斜', '单侧无力', '半身麻木', '言语不清', '说话不清', '突发视物', '突发剧烈头痛'])) {
      addFinding(findings, '卒中征象', '突发单侧无力、言语不清、面瘫或视物异常需要立即排查卒中。', matched(text, ['口角歪斜', '单侧无力', '言语不清', '突发视物', '突发剧烈头痛']));
    }
    if (hasAny(text, ['昏迷', '意识不清', '抽搐', '癫痫发作', '叫不醒', '严重嗜睡'])) {
      addFinding(findings, '意识障碍/抽搐', '意识障碍、抽搐或无法唤醒属于急症风险。', matched(text, ['昏迷', '意识不清', '抽搐', '叫不醒']));
    }
    if (hasAny(text, ['颈强直', '脖子僵硬', '高热不退', '意识改变'])) {
      addFinding(findings, '高热伴危险表现', '高热伴颈强直、意识改变等需要紧急排查严重感染或神经系统问题。', matched(text, ['颈强直', '高热不退', '意识改变']));
    }
    if (hasAny(text, ['呕血', '便血', '黑便', '剧烈腹痛', '反跳痛', '腹部板硬'])) {
      addFinding(findings, '严重腹痛或消化道出血', '剧烈腹痛或呕血、黑便、便血可能需要急诊评估。', matched(text, ['呕血', '便血', '黑便', '剧烈腹痛', '反跳痛']));
    }
    if (hasAny(text, ['大量出血', '止不住血', '骨折', '严重外伤', '车祸', '坠落'])) {
      addFinding(findings, '严重外伤或出血', '大量出血、疑似骨折或严重外伤需要紧急处理。', matched(text, ['大量出血', '止不住血', '骨折', '严重外伤']));
    }
    if (input.medicalContext?.isPregnant && hasAny(text, ['阴道出血', '剧烈腹痛', '胎动减少', '严重头痛', '水肿', '血压高'])) {
      addFinding(findings, '妊娠相关急症风险', '妊娠期间出血、剧烈腹痛、胎动减少或严重头痛/高血压需要立即就医。', matched(text, ['阴道出血', '剧烈腹痛', '胎动减少', '严重头痛', '水肿', '血压高']));
    }
    if (hasAny(text, ['喉头紧', '喘鸣', '嘴唇肿', '舌头肿', '面部肿', '全身风团', '过敏性休克'])) {
      addFinding(findings, '严重过敏反应', '喉头紧、喘鸣、面唇舌肿胀或全身风团伴呼吸症状可能是严重过敏。', matched(text, ['喉头紧', '喘鸣', '嘴唇肿', '舌头肿', '全身风团']));
    }
    if (hasAny(text, ['持续呕吐', '持续腹泻', '尿少', '脱水', '极度乏力'])) {
      addFinding(findings, '脱水或电解质紊乱风险', '持续呕吐、腹泻、尿少或极度乏力可能需要医疗评估。', matched(text, ['持续呕吐', '持续腹泻', '尿少', '脱水']));
    }

    const vitals = input.vitals ?? {};
    if (typeof vitals.oxygenSaturation === 'number' && vitals.oxygenSaturation < 92) {
      addFinding(findings, '血氧偏低', `血氧饱和度 ${vitals.oxygenSaturation}% 低于安全阈值。`, [`SpO2 ${vitals.oxygenSaturation}%`]);
    }
    if (typeof vitals.systolicBloodPressure === 'number' && typeof vitals.diastolicBloodPressure === 'number') {
      if (vitals.systolicBloodPressure >= 180 || vitals.diastolicBloodPressure >= 120) {
        addFinding(findings, '血压危象风险', `血压 ${vitals.systolicBloodPressure}/${vitals.diastolicBloodPressure} mmHg 达到危险阈值。`, [`BP ${vitals.systolicBloodPressure}/${vitals.diastolicBloodPressure}`]);
      }
    }
    if (typeof vitals.heartRate === 'number' && (vitals.heartRate > 120 || vitals.heartRate < 50)) {
      addFinding(findings, '心率明显异常', `心率 ${vitals.heartRate} 次/分明显异常，若伴随不适需及时评估。`, [`HR ${vitals.heartRate}`]);
    }
    if (typeof vitals.temperatureCelsius === 'number' && vitals.temperatureCelsius >= 40) {
      addFinding(findings, '高热', `体温 ${vitals.temperatureCelsius}℃ 达到高热危险阈值。`, [`T ${vitals.temperatureCelsius}℃`]);
    }
    if (typeof vitals.respiratoryRate === 'number' && (vitals.respiratoryRate > 30 || vitals.respiratoryRate < 8)) {
      addFinding(findings, '呼吸频率明显异常', `呼吸频率 ${vitals.respiratoryRate} 次/分明显异常。`, [`RR ${vitals.respiratoryRate}`]);
    }

    return {
      safetyLevel: findings.length ? 'emergency' : 'supportive',
      mustSeekImmediateCare: findings.length > 0,
      findings,
    };
  }
}

function collectText(input: DiagnosisInput) {
  return [
    input.chiefComplaint,
    input.freeText,
    ...input.symptoms.flatMap((symptom) => [
      symptom.name,
      symptom.bodyPart,
      symptom.quality,
      symptom.duration,
      ...symptom.triggers,
      ...symptom.relievers,
      ...symptom.associatedSymptoms,
    ]),
    ...(input.medicalContext.chronicConditions ?? []),
    ...(input.medicalContext.medications ?? []),
    ...(input.medicalContext.allergies ?? []),
    ...(input.medicalContext.recentDiagnoses ?? []),
    ...Object.values(input.tcmObservations ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasAny(text: string, keywords: string[]) {
  return matched(text, keywords).length > 0;
}

function matched(text: string, keywords: string[]) {
  return keywords.filter((keyword) => hasAffirmedKeyword(text, keyword.toLowerCase()));
}

function hasAffirmedKeyword(text: string, keyword: string) {
  let index = text.indexOf(keyword);
  while (index >= 0) {
    if (!isNegatedNear(text, index)) return true;
    index = text.indexOf(keyword, index + keyword.length);
  }
  return false;
}

function isNegatedNear(text: string, keywordIndex: number) {
  const before = text.slice(Math.max(0, keywordIndex - 12), keywordIndex);
  const compactBefore = before.replace(/\s+/g, '');
  return /(?:无|没有|沒?有|否认|未见|未出现|未伴|不伴|不伴有|并无|並無|并未|不是|并非|未诉|未提及|无明显|没有明显)$/.test(compactBefore);
}

function addFinding(findings: RedFlagFinding[], category: string, reason: string, matchedEvidence: string[]) {
  findings.push({ category, reason, matchedEvidence, urgency: 'emergency' });
}
