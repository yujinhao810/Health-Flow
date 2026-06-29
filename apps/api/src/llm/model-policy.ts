import { LLM_PROVIDER_METADATA } from '@health/shared';

export const ANTHROPIC_MODELS = LLM_PROVIDER_METADATA.anthropic.models;

export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];

const ALLOWED_ANTHROPIC_MODELS = new Set<string>(ANTHROPIC_MODELS);

export function assertAllowedModel(provider: string, model: string): asserts model is AnthropicModel {
  if (provider === 'anthropic' && !ALLOWED_ANTHROPIC_MODELS.has(model)) {
    throw new Error(
      `当前生效的提供商是 Anthropic，但模型 ${model} 不是 Claude 模型。请在模型设置中选择正确的提供商（例如 OpenAI），点击“保存配置”后再发起对话；或改用 Claude 模型（例如 claude-opus-4-8）。`,
    );
  }
}
