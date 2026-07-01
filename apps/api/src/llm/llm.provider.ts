import { Injectable } from '@nestjs/common';
import { ProviderFactory } from './providers/provider.factory';
import { LlmConfig, LlmEmbeddingRequest, LlmStreamRequest, LlmStructuredRequest, LlmToolStreamRequest } from './llm.types';

@Injectable()
export class LlmService {
  constructor(private readonly providerFactory: ProviderFactory) {}

  validate(config: LlmConfig) {
    return this.providerFactory.get(config.provider).validate(config);
  }

  supportsToolUse(config: LlmConfig) {
    return this.providerFactory.get(config.provider).capabilities.supportsToolUse;
  }

  supportsEmbeddings(config: LlmConfig) {
    return this.providerFactory.get(config.provider).capabilities.supportsEmbeddings;
  }

  supportsVision(config: LlmConfig) {
    return config.visionEnabled === true || supportsVisionModel(config.provider, config.model);
  }

  streamChat(request: LlmStreamRequest) {
    return this.providerFactory.get(request.config.provider).streamChat(request);
  }

  streamChatWithTools(request: LlmToolStreamRequest) {
    const provider = this.providerFactory.get(request.config.provider);
    if (!provider.streamChatWithTools) {
      throw new Error('当前模型提供商暂不支持工具调用');
    }
    return provider.streamChatWithTools(request);
  }

  embedTexts(request: LlmEmbeddingRequest) {
    const provider = this.providerFactory.get(request.config.provider);
    if (!provider.embedTexts) {
      throw new Error('当前模型提供商暂不支持 Embedding API');
    }
    return provider.embedTexts(request);
  }

  generateStructured<T = unknown>(request: LlmStructuredRequest) {
    return this.providerFactory.get(request.config.provider).generateStructured<T>(request);
  }
}

function supportsVisionModel(provider: LlmConfig['provider'], model: string) {
  const normalized = model.toLowerCase();
  if (provider === 'mock') return false;
  if (provider === 'anthropic') return true;
  if (provider === 'google') return true;
  if (provider === 'openai') return /gpt-4o|gpt-4\.1|vision|omni/.test(normalized);
  if (provider === 'xai') return /vision|grok-2-vision/.test(normalized);
  if (provider === 'qwen') return /vl|omni|vision/.test(normalized);
  if (provider === 'openrouter') return /claude|gpt-4o|gpt-4\.1|gemini|vision|vl|omni/.test(normalized);
  return /vision|vl|omni|multimodal/.test(normalized);
}
