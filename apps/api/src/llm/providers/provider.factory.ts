import { Injectable } from '@nestjs/common';
import { LLM_PROVIDER_METADATA } from '@health/shared';
import { LlmProvider, LlmProviderName } from '../llm.types';
import { AnthropicProvider } from './anthropic.provider';
import { MockProvider } from './mock.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Injectable()
export class ProviderFactory {
  constructor(
    private readonly mockProvider: MockProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly openAiCompatibleProvider: OpenAiCompatibleProvider,
  ) {}

  get(provider: LlmProviderName): LlmProvider {
    const adapter = LLM_PROVIDER_METADATA[provider].adapter;
    if (adapter === 'mock') return this.mockProvider;
    if (adapter === 'anthropic') return this.anthropicProvider;
    if (adapter === 'openai-compatible') return this.openAiCompatibleProvider;
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
