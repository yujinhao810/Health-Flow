import { useState } from 'react';
import { Alert, Button, Card, Checkbox, Col, Collapse, Form, Input, InputNumber, Radio, Row, Select, Slider, Space, Steps, Switch, Tag, Typography, message } from 'antd';
import { LeftOutlined, RightOutlined, SafetyCertificateOutlined, SendOutlined } from '@ant-design/icons';
import { diagnosisInputSchema, type DiagnosisFollowUpQuestion, type DiagnosisFollowUpRequest, type DiagnosisFollowUpResult, type DiagnosisInput } from '@health/shared';

type Props = {
  loading?: boolean;
  followUpLoading?: boolean;
  onGenerateFollowUp: (input: DiagnosisFollowUpRequest) => Promise<DiagnosisFollowUpResult>;
  onSubmit: (input: DiagnosisInput) => void;
};

type FormValues = Record<string, unknown>;

const FORM_STEPS = [
  { title: '描述不适', fields: ['chiefComplaint'] },
  { title: '补充确认', fields: [] },
] as const;

const INITIAL_VALUES: FormValues = {
  includeRecentHealthContext: true,
  redFlagSigns: [],
  sex: 'unknown',
};

const bodyPartOptions = ['头部', '眼睛', '咽喉', '胸口', '腹部', '胃部', '腰背', '四肢', '皮肤'];
const qualityOptions = ['疼痛', '胀痛', '刺痛', '麻木', '乏力', '头晕', '咳嗽', '发热', '恶心', '睡眠差'];
const symptomOptions = ['发热', '咳嗽', '胸闷', '呼吸困难', '恶心', '呕吐', '头晕', '出汗', '腹泻', '皮疹'];
const triggerOptions = ['运动后', '进食后', '熬夜后', '受凉后', '情绪波动后', '久坐后', '接触过敏原后'];
const relieverOptions = ['休息后', '热敷后', '喝水后', '进食后', '排便后', '服药后'];
const tongueColorOptions = ['淡', '红', '暗红', '紫暗', '偏白', '不清楚'];
const tongueCoatingOptions = ['薄白', '白腻', '黄腻', '少苔', '无苔', '不清楚'];
const redFlagOptions = [
  '胸痛或明显胸闷',
  '呼吸困难或喘不上气',
  '口角歪斜、单侧无力或言语不清',
  '意识不清、抽搐或叫不醒',
  '剧烈腹痛、呕血、便血或大量出血',
  '喉头紧、嘴唇肿、舌头肿或全身风团',
  '自伤或伤害他人风险',
];

export function DiagnosisForm({ loading, followUpLoading, onGenerateFollowUp, onSubmit }: Props) {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [draftValues, setDraftValues] = useState<FormValues>(INITIAL_VALUES);
  const [agentFollowUp, setAgentFollowUp] = useState<DiagnosisFollowUpResult | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const isLastStep = currentStep === FORM_STEPS.length - 1;

  async function handleNext() {
    try {
      const fields = FORM_STEPS[currentStep].fields;
      if (fields.length) await form.validateFields([...fields]);
      if (currentStep === 0) {
        const values = form.getFieldsValue(true) as FormValues;
        try {
          setFollowUpError(null);
          const result = await onGenerateFollowUp(buildFollowUpRequest(values));
          setAgentFollowUp(result);
        } catch (error) {
          const fallback = buildClientFallbackFollowUp(values);
          setAgentFollowUp(fallback);
          setFollowUpError(error instanceof Error ? error.message : 'Agent 追问生成失败');
          message.warning('Agent 追问生成失败，已使用安全兜底问题。');
        }
      }
      setCurrentStep((step) => Math.min(step + 1, FORM_STEPS.length - 1));
    } catch (error) {
      const firstField = getFirstErrorField(error);
      if (firstField) form.scrollToField(firstField, { block: 'center' });
    }
  }

  function handleFinish() {
    if (!isLastStep) {
      void handleNext();
      return;
    }

    const values = form.getFieldsValue(true) as FormValues;
    const redFlagSigns = splitList(values.redFlagSigns);
    const associatedSymptoms = uniqueList([...splitList(values.associatedSymptoms), ...redFlagSigns]);
    const symptomName = valueToString(values.symptomName) ?? inferSymptomName(values.chiefComplaint);
    const followUpText = formatFollowUpAnswers(agentFollowUp?.questions, values.followUpAnswers);
    const freeText = joinText([
      followUpText,
      valueToString(values.freeText),
      redFlagSigns.length ? `用户在紧急风险筛查中勾选：${redFlagSigns.join('、')}` : undefined,
    ]);

    const input: DiagnosisInput = {
      chiefComplaint: String(values.chiefComplaint ?? '').trim(),
      symptoms: [
        {
          name: symptomName,
          bodyPart: valueToString(values.bodyPart),
          quality: valueToString(values.quality),
          severity: valueToNumber(values.severity),
          duration: valueToString(values.duration),
          triggers: splitList(values.triggers),
          relievers: splitList(values.relievers),
          associatedSymptoms,
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
      freeText,
      includeRecentHealthContext: values.includeRecentHealthContext !== false,
    };

    const parsed = diagnosisInputSchema.safeParse(input);
    if (!parsed.success) {
      const missingChiefComplaint = !valueToString(values.chiefComplaint);
      form.setFields([{ name: missingChiefComplaint ? 'chiefComplaint' : 'freeText', errors: ['请检查填写内容后再生成建议。'] }]);
      setCurrentStep(missingChiefComplaint ? 0 : FORM_STEPS.length - 1);
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <Card title="两步式辅助分诊" className="diagnosis-form-card">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="这不是正式诊断"
          description="先用自己的话描述不适，再补充少量关键问题。若出现明确急症风险，请立即联系急救服务或线下就医。"
        />
        <Steps current={currentStep} items={FORM_STEPS.map((step) => ({ title: step.title }))} responsive className="diagnosis-form-steps" />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
          initialValues={INITIAL_VALUES}
          onValuesChange={(_, allValues) => setDraftValues(allValues)}
        >
          {currentStep === 0 ? <QuickDescribeStep values={draftValues} /> : null}
          {currentStep === 1 ? <FollowUpStep followUp={agentFollowUp} error={followUpError} /> : null}
        </Form>

        <div className="diagnosis-form-footer">
          <Button htmlType="button" icon={<LeftOutlined />} disabled={currentStep === 0 || loading || followUpLoading} onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}>
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
            <Button htmlType="button" type="primary" onClick={handleNext} loading={followUpLoading} disabled={loading} icon={<RightOutlined />}>
              Agent 生成补充问题
            </Button>
          )}
        </div>
      </Space>
    </Card>
  );
}

function QuickDescribeStep({ values }: { values: FormValues }) {
  return (
    <section className="diagnosis-form-step-panel">
      <div className="diagnosis-step-heading">
        <span className="diagnosis-step-eyebrow">第 1 步</span>
        <Typography.Title level={5}>先描述现在最困扰你的不适</Typography.Title>
        <Typography.Paragraph type="secondary">不用一开始填完整病史，尽量写清楚哪里不舒服、多久了、严重程度和伴随表现。</Typography.Paragraph>
      </div>

      <Form.Item name="chiefComplaint" label="一句话描述" rules={[{ required: true, message: '请先描述主要不适' }]}>
        <Input.TextArea rows={5} showCount maxLength={1000} placeholder="例如：昨晚开始胃痛，今天饭后更明显，疼痛大约 6 分，没有发热和呕吐。" />
      </Form.Item>

      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="symptomName" label="主要不适标签">
            <Select mode="tags" maxTagCount="responsive" options={qualityOptions.map(toSelectOption)} placeholder="可选，如头痛、咳嗽、胃痛" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="duration" label="持续多久了">
            <Input placeholder="如 3 小时、2 天、反复 1 个月" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="bodyPart" label="不适部位">
            <Select allowClear showSearch options={bodyPartOptions.map(toSelectOption)} placeholder="不清楚可以留空" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="severity" label="严重程度">
            <Slider min={1} max={10} marks={{ 1: '轻', 5: '中', 10: '重' }} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="redFlagSigns" label="有没有以下紧急风险？">
        <Checkbox.Group className="diagnosis-red-flag-grid" options={redFlagOptions.map((value) => ({ label: value, value }))} />
      </Form.Item>

      <Form.Item name="includeRecentHealthContext" label="合并近期健康记录" valuePropName="checked">
        <Switch checkedChildren="合并" unCheckedChildren="不合并" />
      </Form.Item>
    </section>
  );
}

function FollowUpStep({ followUp, error }: { followUp: DiagnosisFollowUpResult | null; error: string | null }) {
  const questions = followUp?.questions ?? [];

  return (
    <section className="diagnosis-form-step-panel">
      <div className="diagnosis-step-heading">
        <span className="diagnosis-step-eyebrow">第 2 步</span>
        <Typography.Title level={5}>回答 Agent 生成的补充问题</Typography.Title>
        <Typography.Paragraph type="secondary">这些问题由预问诊 Agent 根据第一步内容生成。能回答多少就回答多少，不确定可以跳过。</Typography.Paragraph>
      </div>

      <div className="diagnosis-question-card">
        <div className="diagnosis-question-header">
          <SafetyCertificateOutlined className="diagnosis-question-icon" />
          <Space size={8} wrap>
            <Typography.Text strong>预问诊 Agent 追问</Typography.Text>
            <Tag color={followUp?.source === 'fallback' ? 'gold' : 'purple'}>{followUp?.source === 'fallback' ? '兜底问题' : 'Agent 生成'}</Tag>
            {followUp?.model ? <Tag>{followUp.model}</Tag> : null}
          </Space>
        </div>
        {error ? <Alert type="warning" showIcon className="diagnosis-form-hint" message="Agent 追问生成失败，当前显示兜底问题" description={error} /> : null}
        {followUp?.summary ? <Typography.Paragraph className="diagnosis-question-summary">{followUp.summary}</Typography.Paragraph> : null}
        <div className="diagnosis-question-list">
          {questions.map((question, index) => (
            <div className="diagnosis-question-item" key={question.id}>
              <div className="diagnosis-question-title">
                <span className="diagnosis-question-index">{index + 1}</span>
                <div>
                  <Typography.Text strong>{question.question}</Typography.Text>
                  <Typography.Text type="secondary">{question.reason}</Typography.Text>
                </div>
              </div>
              <Form.Item name={['followUpAnswers', question.id]} className="diagnosis-question-answer">
                <Input.TextArea rows={2} placeholder={question.answerHint || '不确定可以留空'} />
              </Form.Item>
            </div>
          ))}
        </div>
      </div>

      <Collapse
        ghost
        className="diagnosis-collapsible-fields"
        items={[
          { key: 'symptomDetails', label: '结构化症状补充（可选）', children: <SymptomDetailFields /> },
          { key: 'background', label: '医学背景', children: <BackgroundFields /> },
          { key: 'vitals', label: '体征与近期状态', children: <VitalsFields /> },
          { key: 'tcm', label: '中医观察（可跳过）', children: <TcmObservationFields /> },
          { key: 'freeText', label: '其它补充', children: <SupplementFields /> },
        ]}
      />
    </section>
  );
}

function SymptomDetailFields() {
  return (
    <>
      <Row gutter={[12, 0]}>
        <Col xs={24} md={12}>
          <Form.Item name="duration" label="持续时间">
            <Input placeholder="如 3 小时、2 天、反复 1 个月" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="quality" label="不适性质">
            <Select mode="tags" maxTagCount="responsive" options={qualityOptions.map(toSelectOption)} placeholder="如刺痛、胀痛、乏力" />
          </Form.Item>
        </Col>
      </Row>
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
    </>
  );
}

function BackgroundFields() {
  return (
    <>
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
    </>
  );
}

function VitalsFields() {
  return (
    <>
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
    </>
  );
}

function TcmObservationFields() {
  return (
    <>
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
    </>
  );
}

function SupplementFields() {
  return (
    <Form.Item name="freeText" label="还有什么想补充">
      <Input.TextArea rows={3} placeholder="例如近期检查、用药变化、症状变化规律等" />
    </Form.Item>
  );
}

function buildFollowUpRequest(values: FormValues): DiagnosisFollowUpRequest {
  return {
    chiefComplaint: String(values.chiefComplaint ?? '').trim(),
    symptomName: valueToString(values.symptomName),
    bodyPart: valueToString(values.bodyPart),
    severity: valueToNumber(values.severity),
    duration: valueToString(values.duration),
    redFlagSigns: splitList(values.redFlagSigns),
    includeRecentHealthContext: values.includeRecentHealthContext !== false,
  };
}

function buildClientFallbackFollowUp(values: FormValues): DiagnosisFollowUpResult {
  const request = buildFollowUpRequest(values);
  const questions: DiagnosisFollowUpQuestion[] = [];
  if (request.redFlagSigns.length) {
    questions.push({
      id: 'safety_status',
      question: `你勾选的「${request.redFlagSigns.slice(0, 2).join('、')}」现在是否仍在发生？是否已经联系急救或有人陪同？`,
      reason: '红旗线索需要先确认安全状态。',
      priority: 'safety',
      answerHint: '例如：仍在发生/已经缓解；是否已联系急救；身边是否有人。',
    });
  }
  if (!request.duration) {
    questions.push({
      id: 'duration',
      question: '症状从什么时候开始，持续多久了？',
      reason: '病程长短会影响急性风险和就医优先级。',
      priority: 'symptom_detail',
      answerHint: '例如：3 小时、2 天、反复 1 个月。',
    });
  }
  if (request.severity === undefined) {
    questions.push({
      id: 'severity',
      question: '如果用 1-10 分表示严重程度，现在大约是多少分？',
      reason: '严重程度有助于判断是否需要尽快线下评估。',
      priority: 'symptom_detail',
      answerHint: '1 分很轻，10 分最严重。',
    });
  }
  questions.push(
    {
      id: 'associated_symptoms',
      question: '有没有发热、呕吐、胸闷、呼吸困难、出汗、皮疹或其他伴随症状？',
      reason: '伴随症状能帮助排查红旗和判断方向。',
      priority: 'safety',
      answerHint: '没有也可以写“没有明显伴随症状”。',
    },
    {
      id: 'medical_context',
      question: '是否有慢病、正在用药、过敏史，或近期检查/诊断结果？',
      reason: '基础病、用药和过敏史会影响安全边界。',
      priority: 'medical_context',
      answerHint: '例如：高血压、糖尿病、阿司匹林、青霉素过敏。',
    },
  );

  return {
    summary: '无法连接预问诊 Agent 时，系统按安全优先原则给出兜底问题。',
    questions: questions.slice(0, 5),
    missingFields: questions.slice(0, 5).map((question) => question.id),
    source: 'fallback',
  };
}

function formatFollowUpAnswers(questions: DiagnosisFollowUpQuestion[] | undefined, answers: unknown) {
  if (!questions?.length || !answers || typeof answers !== 'object') return undefined;
  const values = answers as Record<string, unknown>;
  const lines = questions
    .map((question) => {
      const answer = valueToString(values[question.id]);
      return answer ? `问：${question.question}\n答：${answer}` : null;
    })
    .filter((item): item is string => Boolean(item));
  return lines.length ? `预问诊 Agent 追问与用户回答：\n${lines.join('\n')}` : undefined;
}

function inferSymptomName(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return '未明确不适';
  const matched = [...qualityOptions, ...bodyPartOptions].find((item) => text.includes(item));
  return matched ?? text.slice(0, 24);
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

function uniqueList(items: string[]) {
  return Array.from(new Set(items));
}

function joinText(items: Array<string | undefined>) {
  const text = items.filter((item): item is string => Boolean(item?.trim())).join('\n');
  return text || undefined;
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
