import { DeleteOutlined, FilePdfOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Form, Input, InputNumber, Select, Upload, message } from 'antd';
import type { ChatAttachment } from '@health/shared';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { createHealthRecordSchema, type CreateHealthRecordInput, type HealthRecordType } from '@health/shared';
import { useRef, useState } from 'react';
import { deleteUpload, uploadFile } from '../../api/chat';
import { useHealthRecords } from '../../hooks/useHealthRecords';
import { formatFileSize, isPdfMaterial, type MedicalMaterial } from '../../lib/medical-materials';

const { RangePicker } = DatePicker;

type RecordFormValues = {
  type: HealthRecordType;
  recordedAt: Dayjs;
  note?: string;
  sleepRange?: [Dayjs, Dayjs];
  quality?: number;
  activity?: string;
  durationMinutes?: number;
  intensity?: 'low' | 'medium' | 'high';
  score?: number;
  tags?: string[];
  visitType?: string;
  medication?: string;
  followUpAt?: Dayjs;
};

const typeOptions = [
  { value: 'sleep', label: '睡眠' },
  { value: 'exercise', label: '运动' },
  { value: 'mood', label: '心情' },
  { value: 'medical', label: '就医' },
];

const qualityOptions = [
  { value: 1, label: '1 · 很差' },
  { value: 2, label: '2 · 较差' },
  { value: 3, label: '3 · 一般' },
  { value: 4, label: '4 · 良好' },
  { value: 5, label: '5 · 很好' },
];

const activityOptions = [
  { value: '散步', label: '散步' },
  { value: '跑步', label: '跑步' },
  { value: '骑行', label: '骑行' },
  { value: '游泳', label: '游泳' },
  { value: '瑜伽', label: '瑜伽' },
  { value: '力量训练', label: '力量训练' },
  { value: '其他', label: '其他' },
];

const intensityOptions = [
  { value: 'low', label: '低强度' },
  { value: 'medium', label: '中等强度' },
  { value: 'high', label: '高强度' },
];

const moodTagOptions = ['开心', '平静', '焦虑', '疲惫', '压力大', '低落', '感恩', '烦躁'].map((tag) => ({
  value: tag,
  label: tag,
}));

const visitTypeOptions = ['门诊', '复诊', '体检', '急诊', '咨询'].map((type) => ({ value: type, label: type }));
const maxMedicalMaterials = 8;

export function RecordForm() {
  const [form] = Form.useForm<RecordFormValues>();
  const type = Form.useWatch('type', form) ?? 'mood';
  const [medicalMaterials, setMedicalMaterials] = useState<ChatAttachment[]>([]);
  const [medicalUploading, setMedicalUploading] = useState(false);
  const [removingMaterialId, setRemovingMaterialId] = useState<string>();
  const pendingMedicalUploadCount = useRef(0);
  const { create } = useHealthRecords();

  function buildInput(values: RecordFormValues): CreateHealthRecordInput | null {
    const common = {
      recordedAt: values.recordedAt.toISOString(),
      note: values.note?.trim() || undefined,
    };

    switch (values.type) {
      case 'sleep': {
        const [startedAt, endedAt] = values.sleepRange ?? [];
        if (!startedAt || !endedAt) return null;
        if (!endedAt.isAfter(startedAt)) {
          message.warning('睡眠结束时间需要晚于开始时间');
          return null;
        }
        return {
          ...common,
          type: 'sleep',
          payload: {
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
            quality: values.quality,
          },
        };
      }
      case 'exercise':
        return {
          ...common,
          type: 'exercise',
          payload: {
            activity: values.activity ?? '',
            durationMinutes: values.durationMinutes ?? 0,
            intensity: values.intensity,
          },
        };
      case 'mood':
        return {
          ...common,
          type: 'mood',
          payload: {
            score: values.score ?? 0,
            tags: values.tags ?? [],
          },
        };
      case 'medical':
        return {
          ...common,
          type: 'medical',
          payload: {
            visitType: values.visitType ?? '',
            medicalMaterials: medicalMaterials.map(toMedicalMaterialPayload),
            medication: values.medication?.trim() || undefined,
            followUpAt: values.followUpAt?.toISOString(),
          },
        };
    }
  }

  function handleFinish(values: RecordFormValues) {
    const input = buildInput(values);
    if (!input) return;

    const parsed = createHealthRecordSchema.safeParse(input);
    if (!parsed.success) {
      message.error('请检查健康记录内容是否填写完整');
      return;
    }

    create.mutate(parsed.data, {
      onSuccess: () => {
        message.success('健康记录已保存');
        setMedicalMaterials([]);
        form.resetFields();
      },
      onError: (error) => message.error(error instanceof Error ? error.message : '保存失败，请稍后重试'),
    });
  }

  async function handleMedicalMaterialUpload(file: File) {
    if (!isSupportedMedicalMaterial(file)) {
      message.warning('仅支持上传图片或 PDF 文件');
      return;
    }

    if (medicalMaterials.length + pendingMedicalUploadCount.current >= maxMedicalMaterials) {
      message.warning(`最多上传 ${maxMedicalMaterials} 份就医资料`);
      return;
    }

    pendingMedicalUploadCount.current += 1;
    setMedicalUploading(true);
    try {
      const uploaded = await uploadFile(file, 'chat_attachment');
      setMedicalMaterials((current) => {
        if (current.length >= maxMedicalMaterials) {
          void deleteUpload(uploaded.id);
          return current;
        }
        return [...current, uploaded];
      });
      message.success('就医资料已上传');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传失败，请稍后重试');
    } finally {
      pendingMedicalUploadCount.current = Math.max(pendingMedicalUploadCount.current - 1, 0);
      setMedicalUploading(pendingMedicalUploadCount.current > 0);
    }
  }

  async function handleRemoveMedicalMaterial(id: string) {
    setRemovingMaterialId(id);
    try {
      await deleteUpload(id);
      setMedicalMaterials((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除资料失败，请稍后重试');
    } finally {
      setRemovingMaterialId(undefined);
    }
  }

  return (
    <Card title="新增健康记录" extra={<span className="soft-card-extra">温柔记录身体与情绪</span>}>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ type: 'mood', recordedAt: dayjs(), score: 7, tags: [] }}
        onFinish={handleFinish}
      >
        <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择记录类型' }]}>
          <Select options={typeOptions} />
        </Form.Item>
        <Form.Item name="recordedAt" label="记录时间" rules={[{ required: true, message: '请选择记录时间' }]}>
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>

        {type === 'sleep' && (
          <>
            <Form.Item name="sleepRange" label="睡眠时间" rules={[{ required: true, message: '请选择睡眠开始和结束时间' }]}>
              <RangePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="quality" label="睡眠质量">
              <Select allowClear placeholder="选择醒来后的主观感受" options={qualityOptions} />
            </Form.Item>
          </>
        )}

        {type === 'exercise' && (
          <>
            <Form.Item name="activity" label="运动类型" rules={[{ required: true, message: '请选择运动类型' }]}>
              <Select options={activityOptions} />
            </Form.Item>
            <Form.Item name="durationMinutes" label="运动时长（分钟）" rules={[{ required: true, message: '请填写运动时长' }]}>
              <InputNumber min={1} max={1440} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="intensity" label="运动强度">
              <Select allowClear options={intensityOptions} />
            </Form.Item>
          </>
        )}

        {type === 'mood' && (
          <>
            <Form.Item name="score" label="心情分数" rules={[{ required: true, message: '请填写 1-10 的心情分数' }]}>
              <InputNumber min={1} max={10} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="tags" label="心情标签">
              <Select mode="tags" placeholder="选择或输入当前感受" options={moodTagOptions} />
            </Form.Item>
          </>
        )}

        {type === 'medical' && (
          <>
            <Form.Item name="visitType" label="就医类型" rules={[{ required: true, message: '请选择或输入就医类型' }]}>
              <Select showSearch options={visitTypeOptions} />
            </Form.Item>
            <Form.Item label="上传就医资料" extra={`支持图片和 PDF 文件，最多 ${maxMedicalMaterials} 份`}>
              <Upload
                accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,application/pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf"
                beforeUpload={async (file) => {
                  await handleMedicalMaterialUpload(file);
                  return Upload.LIST_IGNORE;
                }}
                disabled={medicalUploading || medicalMaterials.length >= maxMedicalMaterials}
                maxCount={maxMedicalMaterials}
                multiple
                showUploadList={false}
              >
                <Button icon={<UploadOutlined />} loading={medicalUploading} disabled={medicalMaterials.length >= maxMedicalMaterials}>
                  上传图片或 PDF
                </Button>
              </Upload>
              {medicalMaterials.length ? (
                <div className="medical-upload-list">
                  {medicalMaterials.map((material) => (
                    <div className="medical-upload-item" key={material.id}>
                      <span className={`medical-upload-icon ${isPdfMaterial(material) ? 'pdf' : 'image'}`}>
                        {isPdfMaterial(material) ? <FilePdfOutlined /> : <PictureOutlined />}
                      </span>
                      <span className="medical-upload-copy">
                        <span className="medical-upload-name">{material.originalName}</span>
                        <span className="medical-upload-meta">{formatFileSize(material.sizeBytes)}</span>
                      </span>
                      <Button
                        aria-label={`删除 ${material.originalName}`}
                        danger
                        icon={<DeleteOutlined />}
                        loading={removingMaterialId === material.id}
                        size="small"
                        type="text"
                        onClick={() => void handleRemoveMedicalMaterial(material.id)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </Form.Item>
            <Form.Item name="medication" label="用药记录">
              <Input.TextArea rows={3} placeholder="记录药物名称、剂量或医生建议" />
            </Form.Item>
            <Form.Item name="followUpAt" label="复诊时间">
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
          </>
        )}

        <Form.Item name="note" label="备注">
          <Input.TextArea rows={2} placeholder="补充一点感受、环境或想提醒自己的内容" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={create.isPending} block>
          保存记录
        </Button>
      </Form>
    </Card>
  );
}

function isSupportedMedicalMaterial(file: File) {
  return file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(png|jpe?g|webp|gif|bmp|pdf)$/i.test(file.name);
}

function toMedicalMaterialPayload(material: ChatAttachment): MedicalMaterial {
  return {
    id: material.id,
    originalName: material.originalName,
    mimeType: material.mimeType,
    sizeBytes: material.sizeBytes,
    purpose: material.purpose,
    status: material.status,
    contentUrl: material.contentUrl,
    createdAt: material.createdAt,
  };
}
