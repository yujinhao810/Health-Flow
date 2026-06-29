import { Injectable } from '@nestjs/common';
import { ProviderFactory } from './providers/provider.factory';
import { LlmConfig, LlmStreamRequest, LlmStructuredRequest, LlmToolStreamRequest } from './llm.types';

@Injectable()
export class LlmService {
  constructor(private readonly providerFactory: ProviderFactory) {}

  validate(config: LlmConfig) {
    return this.providerFactory.get(config.provider).validate(config);
  }

  supportsToolUse(config: LlmConfig) {
    return this.providerFactory.get(config.provider).capabilities.supportsToolUse;
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

  generateStructured<T = unknown>(request: LlmStructuredRequest) {
    return this.providerFactory.get(request.config.provider).generateStructured<T>(request);
  }
}
