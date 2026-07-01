import { useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, InputNumber, Radio, Row, Select, Slider, Space, Steps, Switch, Typography } from 'antd';
import { LeftOutlined, RightOutlined, SendOutlined } from '@ant-design/icons';
import { diagnosisInputSchema, type DiagnosisInput } from '@health/shared';

type Props = {
  loading?: boolean;
  onSubmit: (input: DiagnosisInput) => void;
};

const FORM_STEPS = [
  { title: '症状', fields: ['chiefComplaint', 'symptomName'] },
  { title: '体征', fields: [] },
  { title: '背景', fields: [] },
  { title: '补充', fields: [] },
] as const;

const bodyPartOptions = ['头部', '眼睛', '咽喉', '胸口', '腹部', '胃部', '腰背', '四肢', '皮肤'];
const qualityOptions = ['疼痛', '胀痛', '刺痛', '麻木', '乏力', '头晕', '咳嗽', '发热', '恶心', '睡眠差'];
const symptomOptions = ['发热', '咳嗽', '胸闷', '呼吸困难', '恶心', '呕吐', '头晕', '出汗', '腹泻', '皮疹'];
const triggerOptions = ['运动后', '进食后', '熬夜后', '受凉后', '情绪波动后', '久坐后', '接触过敏原后'];
const relieverOptions = ['休息后', '热敷后', '喝水后', '进食后', '排便后', '服药后'];
const tongueColorOptions = ['淡', '红', '暗红', '紫暗', '偏白', '不清楚'];
const tongueCoatingOptions = ['薄白', '白腻', '黄腻', '少苔', '无苔', '不清楚'];

export function DiagnosisForm({ loading, onSubmit }: Props) {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const isLastStep = currentStep === FORM_STEPS.length - 1;

  async function handleNext() {
    try {
      const fields = FORM_STEPS[currentStep].fields;
      if (fields.length) await form.validateFields([...fields]);
      setCurrentStep((step) => Math.min(step + 1, FORM_STEPS.length - 1));
    } catch (error) {
      const firstField = getFirstErrorField(error);
      if (firstField) form.scrollToField(firstField, { block: 'center' });
    }
  }

  function handleFinish(_values: Record<string, unknown>) {
    if (!isLastStep) {
      void handleNext();
      return;
    }

    const values = form.getFieldsValue(true) as Record<string, unknown>;

    const input: DiagnosisInput = {
      chiefComplaint: String(values.chiefComplaint ?? ''),
      symptoms: [
        {
          name: valueToString(values.symptomName ?? values.chiefComplaint) ?? '',
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
      const missingSymptomBasics = !valueToString(values.chiefComplaint) || !valueToString(values.symptomName ?? values.chiefComplaint);
      form.setFields([{ name: missingSymptomBasics ? 'chiefComplaint' : 'freeText', errors: ['请检查填写内容后再生成建议。'] }]);
      setCurrentStep(missingSymptomBasics ? 0 : FORM_STEPS.length - 1);
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <Card title="辅助分诊信息" className="diagnosis-form-card">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="这不是正式诊断"
          description="如果有胸痛、呼吸困难、口角歪斜/单侧无力、意识障碍、大量出血、严重过敏或自伤风险，请立即联系急救服务或线下就医。"
        />
        <Steps current={currentStep} items={FORM_STEPS.map((step) => ({ title: step.title }))} responsive className="diagnosis-form-steps" />

        <Form form={form} layout="vertical" onFinish={handleFinish} initialValues={{ includeRecentHealthContext: true, sex: 'unknown' }}>
          {currentStep === 0 ? <SymptomStep /> : null}
          {currentStep === 1 ? <VitalsStep /> : null}
          {currentStep === 2 ? <BackgroundStep /> : null}
          {currentStep === 3 ? <SupplementStep /> : null}
        </Form>

        <div className="diagnosis-form-footer">
          <Button htmlType="button" icon={<LeftOutlined />} disabled={currentStep === 0 || loading} onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}>
            上一步
          </Button>
          <Typography.Text type="secondary">
            {currentStep + 1} / {FORM_STEPS.length}
          </Typography.Text>
          {isLastStep ? (
            <Button htmlType="button" type="primary" loading={loading} icon={<SendOutlined />} onClick={() => form.submit()}>
              生成建议
            </Button>
          ) : (
            <Button htmlType="button" type="primary" onClick={handleNext} disabled={loading} icon={<RightOutlined />}>
              下一步
            </Button>
          )}
        </div>
      </Space>
    </Card>
  );
}

function SymptomStep() {
  return (
    <section className="diagnosis-form-step-panel">
      <Typography.Title level={5}>现在最困扰你的不适</Typography.Title>
      <Form.Item name="chiefComplaint" label="一句话说明情况" rules={[{ required: true, message: '请填写主要不适' }]}>
        <Input.TextArea rows={3} placeholder="例如：近三天胸闷、睡眠差，活动后更明显" />
      </Form.Item>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="symptomName" label="主要症状" rules={[{ required: true, message: '请选择或填写主要症状' }]}>
            <Select mode="tags" maxTagCount="responsive" options={qualityOptions.map(toSelectOption)} placeholder="如胸闷、头痛、咳嗽" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="bodyPart" label="不适部位">
            <Select allowClear showSearch options={bodyPartOptions.map(toSelectOption)} placeholder="不清楚可以留空" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="quality" label="感觉更像哪一种">
            <Select mode="tags" maxTagCount="responsive" options={qualityOptions.map(toSelectOption)} placeholder="可选择，也可自己输入" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="duration" label="持续多久了">
            <Input placeholder="如 3 小时、2 天、反复 1 个月" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="severity" label="严重程度">
        <Slider min={1} max={10} marks={{ 1: '轻', 5: '中', 10: '重' }} />
      </Form.Item>
      <Form.Item name="associatedSymptoms" label="伴随症状">
        <Select mode="tags" maxTagCount="responsive" options={symptomOptions.map(toSelectOption)} placeholder="如发热、恶心、出汗、呼吸困难" />
      </Form.Item>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="triggers" label="什么情况下更明显">
            <Select mode="tags" maxTagCount="responsive" options={triggerOptions.map(toSelectOption)} placeholder="如运动后、熬夜后" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="relievers" label="什么能缓解">
            <Select mode="tags" maxTagCount="responsive" options={relieverOptions.map(toSelectOption)} placeholder="如休息后、热敷后" />
          </Form.Item>
        </Col>
      </Row>
    </section>
  );
}

function VitalsStep() {
  return (
    <section className="diagnosis-form-step-panel">
      <Typography.Title level={5}>体征与近期状态</Typography.Title>
      <Alert type="info" showIcon className="diagnosis-form-hint" message="没有测量数据可以留空" />
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="temperatureCelsius" label="体温（℃）">
            <InputNumber step={0.1} precision={1} placeholder="如 36.8" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="heartRate" label="心率（次/分）">
            <InputNumber min={1} placeholder="如 76" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="systolicBloodPressure" label="收缩压">
            <InputNumber min={1} placeholder="如 120" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="diastolicBloodPressure" label="舒张压">
            <InputNumber min={1} placeholder="如 80" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="oxygenSaturation" label="血氧（%）">
            <InputNumber min={1} max={100} placeholder="如 98" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="respiratoryRate" label="呼吸频率（次/分）">
            <InputNumber min={1} placeholder="如 16" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="sleepHours" label="昨晚睡了多久（小时）">
            <InputNumber min={0} step={0.5} placeholder="如 7.5" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="sleepQuality" label="睡眠质量">
            <Radio.Group className="diagnosis-option-group" optionType="button" buttonStyle="solid" options={[{ label: '差', value: 1 }, { label: '一般', value: 3 }, { label: '好', value: 5 }]} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="exerciseMinutes" label="近 24 小时运动（分钟）">
            <InputNumber min={0} placeholder="如 30" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="activeEnergyKcal" label="活动消耗（千卡）">
            <InputNumber min={0} placeholder="可从手表/健康 App 获取" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="moodScore" label="今天心情状态">
        <Slider min={1} max={10} marks={{ 1: '差', 5: '一般', 10: '好' }} />
      </Form.Item>
    </section>
  );
}

function BackgroundStep() {
  return (
    <section className="diagnosis-form-step-panel">
      <Typography.Title level={5}>医学背景</Typography.Title>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="age" label="年龄">
            <InputNumber min={1} placeholder="如 36" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="sex" label="生理性别">
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio.Button value="unknown">不确定</Radio.Button>
              <Radio.Button value="female">女</Radio.Button>
              <Radio.Button value="male">男</Radio.Button>
              <Radio.Button value="other">其他</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="isPregnant" label="是否妊娠" valuePropName="checked">
        <Switch checkedChildren="是" unCheckedChildren="否" />
      </Form.Item>
      <Form.Item name="chronicConditions" label="既往病史">
        <Select mode="tags" maxTagCount="responsive" placeholder="如高血压、糖尿病；没有可留空" />
      </Form.Item>
      <Form.Item name="medications" label="正在用药">
        <Select mode="tags" maxTagCount="responsive" placeholder="如降压药、止痛药；没有可留空" />
      </Form.Item>
      <Form.Item name="allergies" label="过敏史">
        <Select mode="tags" maxTagCount="responsive" placeholder="如青霉素、海鲜；没有可留空" />
      </Form.Item>
      <Form.Item name="recentDiagnoses" label="近期诊断或检查结果">
        <Select mode="tags" maxTagCount="responsive" placeholder="如上周体检提示贫血；没有可留空" />
      </Form.Item>
    </section>
  );
}

function SupplementStep() {
  return (
    <section className="diagnosis-form-step-panel">
      <Typography.Title level={5}>中医观察与补充</Typography.Title>
      <Alert type="info" showIcon className="diagnosis-form-hint" message="舌象、脉象不清楚时可以跳过" />
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="tongueColor" label="舌色">
            <Select allowClear options={tongueColorOptions.map(toSelectOption)} placeholder="不清楚可留空" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="tongueCoating" label="舌苔">
            <Select allowClear options={tongueCoatingOptions.map(toSelectOption)} placeholder="不清楚可留空" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="pulse" label="脉象">
        <Input placeholder="如由中医师触诊过可填写；不清楚可留空" />
      </Form.Item>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="coldHeatPreference" label="寒热感受">
            <Radio.Group className="diagnosis-option-group" optionType="button" buttonStyle="solid" options={['怕冷', '怕热', '忽冷忽热', '不明显']} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="sweating" label="出汗情况">
            <Radio.Group className="diagnosis-option-group" optionType="button" buttonStyle="solid" options={['少汗', '易出汗', '夜间出汗', '不明显']} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="thirst" label="口渴情况">
            <Radio.Group className="diagnosis-option-group" optionType="button" buttonStyle="solid" options={['不渴', '口渴', '喜冷饮', '喜热饮']} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="appetite" label="食欲">
            <Radio.Group className="diagnosis-option-group" optionType="button" buttonStyle="solid" options={['偏差', '正常', '偏旺', '不明显']} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="stool" label="大便情况">
            <Radio.Group className="diagnosis-option-group" optionType="button" buttonStyle="solid" options={['正常', '偏干', '偏稀', '不规律']} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="urination" label="小便情况">
            <Radio.Group className="diagnosis-option-group" optionType="button" buttonStyle="solid" options={['正常', '偏黄', '频繁', '偏少']} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="emotion" label="近期情绪">
        <Radio.Group className="diagnosis-option-group" optionType="button" buttonStyle="solid" options={['平稳', '焦虑', '烦躁', '低落', '压力大']} />
      </Form.Item>
      <Form.Item name="freeText" label="还有什么想补充">
        <Input.TextArea rows={3} placeholder="例如近期检查、用药变化、症状变化规律等" />
      </Form.Item>
      <Form.Item name="includeRecentHealthContext" label="合并近期健康记录" valuePropName="checked">
        <Switch checkedChildren="合并" unCheckedChildren="不合并" />
      </Form.Item>
    </section>
  );
}

function toSelectOption(value: string) {
  return { label: value, value };
}

function getFirstErrorField(error: unknown) {
  if (!error || typeof error !== 'object' || !('errorFields' in error)) return null;
  const errorFields = (error as { errorFields?: Array<{ name?: string[] }> }).errorFields;
  return errorFields?.[0]?.name ?? null;
}

function splitList(value: unknown) {
  const items = Array.isArray(value) ? value : String(value ?? '').split(/[，,]/);
  return items
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function valueToString(value: unknown) {
  if (Array.isArray(value)) {
    const text = splitList(value).join('、');
    return text || undefined;
  }
  const text = String(value ?? '').trim();
  return text || undefined;
}

function valueToNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
