import { Module } from '@nestjs/common';
import { LlmService } from './llm.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { MockProvider } from './providers/mock.provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';
import { OpenAiResponsesProvider } from './providers/openai-responses.provider';
import { ProviderFactory } from './providers/provider.factory';

@Module({
  providers: [
    LlmService,
    ProviderFactory,
    MockProvider,
    AnthropicProvider,
    OpenAiCompatibleProvider,
    OpenAiResponsesProvider,
  ],
  exports: [LlmService],
})
export class LlmModule {}
