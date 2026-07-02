import { Button, Collapse, Form, Input, InputNumber, Select, Space, Switch, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LLM_PROVIDER_METADATA, type LlmProviderName } from '@health/shared';
import { useEffect } from 'react';
import type { LlmConfigInput } from '../../api/settings';
import { getLlmConfig, saveLlmConfig, validateLlmConfig } from '../../api/settings';
import { formatErrorMessage } from './settings-utils';

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

export function ModelConfigTab() {
  const [form] = Form.useForm<LlmConfigInput>();
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ['llm-config'], queryFn: getLlmConfig });
  const provider = Form.useWatch('provider', form) ?? 'mock';
  const providerMeta = LLM_PROVIDER_METADATA[provider as LlmProviderName];
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

  function handleProviderChange() {
    form.setFieldValue('model', '');
    form.setFieldValue('baseUrl', undefined);
    form.setFieldValue('apiKey', undefined);
  }

  return (
    <div className="settings-tab-panel">
      <Typography.Title level={4}>上游大模型配置</Typography.Title>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ provider: 'mock', model: 'mock-health-assistant', ragEnabled: true, ragTopK: 5, visionEnabled: false }}
        onFinish={(values) => save.mutate({ ...values, apiKey: normalizeApiKeyInput(values.apiKey) })}
      >
        <Form.Item name="provider" label="提供商" rules={[{ required: true }]}>
          <Select options={PROVIDER_OPTIONS} onChange={handleProviderChange} />
        </Form.Item>
        <Form.Item
          name="model"
          label="模型"
          rules={[{ required: true }]}
          extra="填写提供商控制台中的模型 ID，如 gpt-4o、claude-sonnet-4-20250514、qwen-max 等。"
        >
          <Input placeholder={providerMeta.defaultModel} />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label="API Key"
          extra={providerMeta.requiresApiKey ? 'API Key 加密保存在后端，不会在前端展示。留空则使用系统默认配置。' : '该提供商无需 API Key。'}
        >
          <Input.Password
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            disabled={!providerMeta.requiresApiKey}
            placeholder={config.data?.maskedApiKey ? `已保存：${config.data.maskedApiKey}` : '仅后端保存，不在前端展示明文'}
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button onClick={handleValidate} loading={validate.isPending}>
              测试连接
            </Button>
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              保存配置
            </Button>
          </Space>
        </Form.Item>
        <Collapse
          ghost
          className="settings-advanced-collapse"
          items={[
            {
              key: 'advanced',
              label: <Typography.Text type="secondary">高级选项</Typography.Text>,
              children: (
                <>
                  <Form.Item
                    name="baseUrl"
                    label="Base URL（可选）"
                    extra="自定义模型服务的 API 地址。留空则使用默认地址，适合大多数情况。"
                  >
                    <Input placeholder={defaultBaseUrl ? `默认：${defaultBaseUrl}` : '留空使用默认地址'} />
                  </Form.Item>
                  <Form.Item
                    name="visionEnabled"
                    label="允许识别上传图片"
                    valuePropName="checked"
                    extra="开启后，对话中上传的图片会发送给上游模型进行识别。需要模型支持多模态。"
                  >
                    <Switch />
                  </Form.Item>
                  <Form.Item
                    name="ragEnabled"
                    label="健康安全知识库"
                    valuePropName="checked"
                    extra="关闭后，对话不会检索健康安全知识库；危机安全策略仍然始终生效。"
                  >
                    <Switch />
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate={(prev, current) => prev.ragEnabled !== current.ragEnabled}>
                    {({ getFieldValue }) =>
                      getFieldValue('ragEnabled') ? (
                        <Form.Item name="ragTopK" label="每轮最多引用条数">
                          <InputNumber min={1} max={10} />
                        </Form.Item>
                      ) : null
                    }
                  </Form.Item>
                </>
              ),
            },
          ]}
        />
      </Form>
    </div>
  );
}

function normalizeApiKeyInput(apiKey?: string) {
  const value = apiKey?.replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
  return value || undefined;
}
