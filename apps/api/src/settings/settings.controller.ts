import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { llmConfigSchema } from '@health/shared';
import { LlmService } from '../llm/llm.provider';
import { LlmConfig } from '../llm/llm.types';
import { SettingsService } from './settings.service';

@Controller('llm')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly llm: LlmService,
  ) {}

  @Get('config')
  getConfig() {
    return this.settings.getPublicLlmConfig();
  }

  @Post('config')
  async saveConfig(@Body() body: unknown) {
    const config = parseLlmConfig(body);
    await this.settings.saveLlmConfig(config);
    return this.settings.getPublicLlmConfig();
  }

  @Post('validate')
  async validate(@Body() body: unknown) {
    try {
      const config = parseLlmConfig(body);
      const current = await this.settings.getLlmConfig();
      const mergedConfig = this.settings.resolveProviderRuntimeConfig({
        ...config,
        apiKey: config.apiKey?.trim() || (current.provider === config.provider ? current.apiKey : undefined),
        baseUrl: config.baseUrl || (current.provider === config.provider ? current.baseUrl : undefined),
      });
      return this.llm.validate(mergedConfig);
    } catch (error) {
      return { valid: false, message: formatValidationError(error) };
    }
  }
}

function parseLlmConfig(body: unknown): LlmConfig {
  const parsed = llmConfigSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten());
  }

  return {
    ...parsed.data,
    apiKey: parsed.data.apiKey?.trim() || undefined,
    baseUrl: parsed.data.baseUrl || undefined,
  };
}

function formatValidationError(error: unknown) {
  if (error instanceof Error) return error.message;
  return '连接验证失败';
}
