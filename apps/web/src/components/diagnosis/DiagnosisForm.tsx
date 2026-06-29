import { Alert, Button, Card, Form, Input, InputNumber, Space, Switch, Typography } from 'antd';
import { diagnosisInputSchema, type DiagnosisInput } from '@health/shared';

type Props = {
  loading?: boolean;
  onSubmit: (input: DiagnosisInput) => void;
};

export function DiagnosisForm({ loading, onSubmit }: Props) {
  const [form] = Form.useForm();

  function handleFinish(values: Record<string, unknown>) {
    const input: DiagnosisInput = {
      chiefComplaint: String(values.chiefComplaint ?? ''),
      symptoms: [
        {
          name: String(values.symptomName ?? values.chiefComplaint ?? ''),
          bodyPart: valueToString(values.bodyPart),
          quality: valueToString(values.quality),
          severity: valueToNumber(values.severity),
          duration: valueToString(values.duration),
          triggers: splitList(values.triggers),
          relievers: splitList(values.relievers),
          associatedSymptoms: splitList(values.associatedSymptoms),
        },
      ],
      vitals: {
        heartRate: valueToNumber(values.heartRate),
        temperatureCelsius: valueToNumber(values.temperatureCelsius),
        systolicBloodPressure: valueToNumber(values.systolicBloodPressure),
        diastolicBloodPressure: valueToNumber(values.diastolicBloodPressure),
        oxygenSaturation: valueToNumber(values.oxygenSaturation),
        respiratoryRate: valueToNumber(values.respiratoryRate),
      },
      lifestyleSignals: {
        sleepHours: valueToNumber(values.sleepHours),
        sleepQuality: valueToNumber(values.sleepQuality),
        exerciseMinutes: valueToNumber(values.exerciseMinutes),
        activeEnergyKcal: valueToNumber(values.activeEnergyKcal),
        moodScore: valueToNumber(values.moodScore),
      },
      medicalContext: {
        age: valueToNumber(values.age),
        sex: (values.sex as DiagnosisInput['medicalContext']['sex']) || 'unknown',
        isPregnant: Boolean(values.isPregnant),
        chronicConditions: splitList(values.chronicConditions),
        medications: splitList(values.medications),
        allergies: splitList(values.allergies),
        recentDiagnoses: splitList(values.recentDiagnoses),
      },
      tcmObservations: {
        tongueColor: valueToString(values.tongueColor),
        tongueCoating: valueToString(values.tongueCoating),
        pulse: valueToString(values.pulse),
        coldHeatPreference: valueToString(values.coldHeatPreference),
        sweating: valueToString(values.sweating),
        thirst: valueToString(values.thirst),
        appetite: valueToString(values.appetite),
        stool: valueToString(values.stool),
        urination: valueToString(values.urination),
        emotion: valueToString(values.emotion),
      },
      freeText: valueToString(values.freeText),
      includeRecentHealthContext: values.includeRecentHealthContext !== false,
    };

    const parsed = diagnosisInputSchema.safeParse(input);
    if (!parsed.success) {
      form.setFields([{ name: 'chiefComplaint', errors: ['请至少填写主诉和一个症状。'] }]);
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <Card title="辅助分诊信息">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="这不是正式诊断"
          description="如果有胸痛、呼吸困难、口角歪斜/单侧无力、意识障碍、大量出血、严重过敏或自伤风险，请立即联系急救服务或线下就医。"
        />
        <Form form={form} layout="vertical" onFinish={handleFinish} initialValues={{ includeRecentHealthContext: true, sex: 'unknown' }}>
          <Typography.Title level={5}>主诉与症状</Typography.Title>
          <Form.Item name="chiefComplaint" label="主诉" rules={[{ required: true, message: '请填写主要不适' }]}>
            <Input.TextArea rows={2} placeholder="例如：近三天胸闷、睡眠差，活动后更明显" />
          </Form.Item>
          <Form.Item name="symptomName" label="主要症状" rules={[{ required: true, message: '请填写主要症状' }]}><Input /></Form.Item>
          <Form.Item name="bodyPart" label="部位"><Input placeholder="如头部、胸口、胃部" /></Form.Item>
          <Form.Item name="quality" label="性质"><Input placeholder="如刺痛、胀痛、乏力、咳嗽" /></Form.Item>
          <Form.Item name="duration" label="持续时间"><Input placeholder="如 3 小时、2 天、反复 1 个月" /></Form.Item>
          <Form.Item name="severity" label="严重程度（1-10）"><InputNumber min={1} max={10} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="associatedSymptoms" label="伴随症状（逗号分隔）"><Input placeholder="如发热、恶心、出汗、呼吸困难" /></Form.Item>
          <Form.Item name="triggers" label="诱因（逗号分隔）"><Input /></Form.Item>
          <Form.Item name="relievers" label="缓解因素（逗号分隔）"><Input /></Form.Item>

          <Typography.Title level={5}>体征与近期状态</Typography.Title>
          <Form.Item name="heartRate" label="心率（次/分）"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="temperatureCelsius" label="体温（℃）"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="systolicBloodPressure" label="收缩压"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="diastolicBloodPressure" label="舒张压"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="oxygenSaturation" label="血氧（%）"><InputNumber min={1} max={100} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="respiratoryRate" label="呼吸频率（次/分）"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="sleepHours" label="睡眠时长（小时）"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="exerciseMinutes" label="运动时长（分钟）"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="moodScore" label="心情评分（1-10）"><InputNumber min={1} max={10} style={{ width: '100%' }} /></Form.Item>

          <Typography.Title level={5}>医学背景</Typography.Title>
          <Form.Item name="age" label="年龄"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="isPregnant" label="是否妊娠" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="chronicConditions" label="既往病史（逗号分隔）"><Input /></Form.Item>
          <Form.Item name="medications" label="正在用药（逗号分隔）"><Input /></Form.Item>
          <Form.Item name="allergies" label="过敏史（逗号分隔）"><Input /></Form.Item>

          <Typography.Title level={5}>中医观察（可选）</Typography.Title>
          <Form.Item name="tongueColor" label="舌色"><Input placeholder="如淡、红、暗" /></Form.Item>
          <Form.Item name="tongueCoating" label="舌苔"><Input placeholder="如薄白、黄腻、少苔" /></Form.Item>
          <Form.Item name="pulse" label="脉象（如由中医师触诊过）"><Input /></Form.Item>
          <Form.Item name="coldHeatPreference" label="寒热感受"><Input /></Form.Item>
          <Form.Item name="stool" label="大便情况"><Input /></Form.Item>
          <Form.Item name="urination" label="小便情况"><Input /></Form.Item>
          <Form.Item name="freeText" label="补充说明"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="includeRecentHealthContext" label="合并近期健康记录" valuePropName="checked"><Switch /></Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>生成辅助分诊建议</Button>
        </Form>
      </Space>
    </Card>
  );
}

function splitList(value: unknown) {
  return String(value ?? '')
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function valueToString(value: unknown) {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function valueToNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
