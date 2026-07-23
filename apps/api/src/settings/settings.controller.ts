import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { llmConfigSchema } from '@health/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { LlmService } from '../llm/llm.provider';
import { LlmConfig } from '../llm/llm.types';
import { SettingsService } from './settings.service';

@Controller('llm')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly llm: LlmService,
  ) {}

  @Get('config')
  getConfig(@CurrentUser() user: AuthUser) {
    return this.settings.getPublicLlmConfig(user);
  }

  @Post('config')
  async saveConfig(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const config = parseLlmConfig(body);
    await this.settings.saveLlmConfig(user, config);
    return this.settings.getPublicLlmConfig(user);
  }

  @Post('validate')
  async validate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    try {
      const config = parseLlmConfig(body);
      this.settings.assertAllowedUserBaseUrl(config.provider, config.baseUrl);
      const current = await this.settings.getLlmConfig(user);
      const mergedConfig = this.settings.resolveProviderRuntimeConfig({
        ...config,
        apiKey: normalizeApiKey(config.apiKey) || (current.provider === config.provider ? current.apiKey : undefined),
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
    apiKey: normalizeApiKey(parsed.data.apiKey),
    baseUrl: parsed.data.baseUrl || undefined,
  };
}

function formatValidationError(error: unknown) {
  if (error instanceof Error) return error.message;
  return '连接验证失败';
}

function normalizeApiKey(apiKey?: string) {
  const value = apiKey?.replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
  return value || undefined;
}
