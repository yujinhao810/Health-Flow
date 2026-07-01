import { Alert, AutoComplete, Button, Card, Form, Input, InputNumber, Select, Space, Switch, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LLM_PROVIDER_METADATA, type LlmProviderName } from '@health/shared';
import { useEffect } from 'react';
import type { LlmConfigInput } from '../api/settings';
import { getLlmConfig, saveLlmConfig, validateLlmConfig } from '../api/settings';

const CATEGORY_LABELS = {
  local: '本地 / 开发',
  global: '国际主流',
  china: '国内主流',
  aggregator: '聚合 / 代理',
} as const;

const PROVIDER_OPTIONS = Object.entries(CATEGORY_LABELS).map(([category, label]) => ({
  label,
  options: Object.values(LLM_PROVIDER_METADATA)
    .filter((provider) => provider.category === category)
    .map((provider) => ({ value: provider.id, label: provider.label })),
}));

const DEFAULT_MODELS = new Set(Object.values(LLM_PROVIDER_METADATA).map((provider) => provider.defaultModel));

export function SettingsPage() {
  const [form] = Form.useForm<LlmConfigInput>();
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ['llm-config'], queryFn: getLlmConfig });
  const provider = Form.useWatch('provider', form) ?? 'mock';
  const providerMeta = LLM_PROVIDER_METADATA[provider as LlmProviderName];
  const modelOptions = providerMeta.models.map((model) => ({ value: model }));
  const apiKeyEnv = 'apiKeyEnv' in providerMeta ? providerMeta.apiKeyEnv : undefined;
  const baseUrlEnv = 'baseUrlEnv' in providerMeta ? providerMeta.baseUrlEnv : undefined;
  const defaultBaseUrl = 'defaultBaseUrl' in providerMeta ? providerMeta.defaultBaseUrl : undefined;

  useEffect(() => {
    if (!config.data) return;
    form.setFieldsValue({
      provider: config.data.provider,
      model: config.data.model,
      baseUrl: config.data.baseUrl,
      apiKey: undefined,
      ragEnabled: config.data.ragEnabled ?? true,
      ragTopK: config.data.ragTopK ?? 5,
      visionEnabled: config.data.visionEnabled ?? false,
    });
  }, [config.data, form]);

  const save = useMutation({
    mutationFn: saveLlmConfig,
    onSuccess: () => {
      message.success('模型配置已保存');
      form.setFieldValue('apiKey', undefined);
      queryClient.invalidateQueries({ queryKey: ['llm-config'] });
    },
    onError: (error) => message.error(`保存失败：${formatErrorMessage(error)}`),
  });

  const validate = useMutation({
    mutationFn: validateLlmConfig,
    onSuccess: (result) =>
      message[result.valid ? 'success' : 'error'](
        result.message ?? (result.valid ? '连接验证成功，请点击“保存配置”后用于对话' : '连接验证失败'),
      ),
    onError: (error) => message.error(`连接验证请求失败：${formatErrorMessage(error)}`),
  });

  async function handleValidate() {
    try {
      const values = await form.validateFields();
      validate.mutate({ ...values, apiKey: normalizeApiKeyInput(values.apiKey) });
    } catch {
      message.warning('请先填写提供商和模型');
    }
  }

  function handleProviderChange(nextProvider: LlmProviderName) {
    const currentModel = form.getFieldValue('model');
    const nextMeta = LLM_PROVIDER_METADATA[nextProvider];
    if (!currentModel || DEFAULT_MODELS.has(currentModel)) {
      form.setFieldValue('model', nextMeta.defaultModel);
    }
    form.setFieldValue('baseUrl', undefined);
    form.setFieldValue('apiKey', undefined);
  }

  return (
    <>
      <Typography.Title level={2}>模型设置</Typography.Title>
      <Card title="上游大模型配置">
        <Typography.Paragraph type="secondary">
          API Key 只由后端保存和调用。测试连接时，如果提示 fetch failed，通常表示后端访问模型服务的网络链路失败，而不是前端页面本身失败。
        </Typography.Paragraph>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Base URL 留空时会使用后端环境变量或内置默认地址；模型下拉仅提供推荐值，也可以直接输入控制台中的模型 ID。"
        />
        <Form
          form={form}
          layout="vertical"
          initialValues={{ provider: 'mock', model: 'mock-health-assistant', ragEnabled: true, ragTopK: 5, visionEnabled: false }}
          onFinish={(values) => save.mutate({ ...values, apiKey: normalizeApiKeyInput(values.apiKey) })}
        >
          <Form.Item name="provider" label="提供商" rules={[{ required: true }]}>
            <Select options={PROVIDER_OPTIONS} onChange={handleProviderChange} />
          </Form.Item>
          <Form.Item name="model" label="模型" rules={[{ required: true }]} extra={`默认推荐：${providerMeta.defaultModel}`}>
            <AutoComplete options={modelOptions} placeholder={providerMeta.defaultModel} />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            extra={
              providerMeta.requiresApiKey
                ? `不填写则后端尝试使用环境变量 ${apiKeyEnv ?? '对应供应商 API_KEY'}；前端不会展示明文。`
                : '该提供商不需要 API Key。'
            }
          >
            <Input.Password
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              disabled={!providerMeta.requiresApiKey}
              placeholder={config.data?.maskedApiKey ? `已保存：${config.data.maskedApiKey}` : '仅后端保存，不在前端展示明文'}
            />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL（可选）"
            extra={baseUrlEnv ? `可通过后端环境变量 ${baseUrlEnv} 覆盖。` : undefined}
          >
            <Input placeholder={defaultBaseUrl ? `默认：${defaultBaseUrl}` : '留空使用后端默认值'} />
          </Form.Item>
          <Card size="small" title="图片理解（多模态）" style={{ marginBottom: 16 }}>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="如果你使用的模型支持识别图片，但模型名称没有包含 vl、vision、omni 等明显标识，请打开此项。打开后，心理对话会把本轮上传的图片发送给上游大模型。"
            />
            <Form.Item name="visionEnabled" label="允许识别上传图片" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Card>
          <Card size="small" title="知识库增强 RAG" style={{ marginBottom: 16 }}>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="关闭后，心理对话不会检索健康安全知识库；危机安全策略仍然始终生效。RAG 不能替代医生或心理咨询师。"
            />
            <Form.Item name="ragEnabled" label="开启健康安全知识库" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="ragTopK" label="每轮最多引用条数">
              <InputNumber min={1} max={10} />
            </Form.Item>
          </Card>
          <Space>
            <Button onClick={handleValidate} loading={validate.isPending}>
              测试连接
            </Button>
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              保存配置
            </Button>
          </Space>
        </Form>
      </Card>
    </>
  );
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return simplifyApiError(error.message);
  }
  return '未知错误';
}

function normalizeApiKeyInput(apiKey?: string) {
  const value = apiKey?.replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
  return value || undefined;
}

function simplifyApiError(messageText: string) {
  const fallback = '无法连接后端 API，请确认 API 服务已启动并监听 http://localhost:3001';
  if (!messageText.trim()) return fallback;
  if (messageText === 'Failed to fetch' || messageText.includes('ECONNREFUSED')) return fallback;

  try {
    const parsed = JSON.parse(messageText) as { message?: unknown; error?: string };
    if (Array.isArray(parsed.message)) return parsed.message.join('；');
    if (typeof parsed.message === 'string') return parsed.message;
    return parsed.error || messageText;
  } catch {
    return messageText;
  }
}
