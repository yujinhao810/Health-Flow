import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER_METADATA, LlmProviderName } from '@health/shared';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { LlmConfig } from '../llm/llm.types';

const DEMO_USER_EMAIL = 'demo@example.com';
const ENCRYPTION_PREFIX = 'v1';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getDemoUser() {
    return this.prisma.user.upsert({
      where: { email: DEMO_USER_EMAIL },
      update: {},
      create: { email: DEMO_USER_EMAIL, displayName: 'Demo User' },
    });
  }

  async getLlmConfig(user: AuthUser): Promise<LlmConfig> {
    const saved = await this.prisma.userLlmConfig.findFirst({
      where: { userId: user.id, enabled: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (saved) {
      const provider = saved.provider as LlmConfig['provider'];
      return {
        provider,
        model: saved.model,
        diagnosisWesternModel: saved.diagnosisWesternModel ?? undefined,
        diagnosisTcmModel: saved.diagnosisTcmModel ?? undefined,
        diagnosisReviewerModel: saved.diagnosisReviewerModel ?? undefined,
        diagnosisIntegratorModel: saved.diagnosisIntegratorModel ?? undefined,
        apiKey: saved.encryptedApiKey ? this.decryptSecret(saved.encryptedApiKey) : this.getProviderApiKey(provider),
        baseUrl: this.resolveBaseUrl(provider, saved.baseUrl ?? undefined),
        embeddingApiKey: this.config.get<string>('EMBEDDING_API_KEY'),
        embeddingBaseUrl: this.config.get<string>('EMBEDDING_BASE_URL'),
        embeddingModel: this.config.get<string>('EMBEDDING_MODEL'),
        ragEnabled: saved.ragEnabled,
        ragTopK: saved.ragTopK,
        visionEnabled: saved.visionEnabled,
      };
    }

    const provider = (this.config.get<string>('LLM_PROVIDER') ?? 'mock') as LlmConfig['provider'];
    return {
      provider,
      model: this.config.get<string>('LLM_MODEL') || this.getDefaultModel(provider),
      apiKey: this.getProviderApiKey(provider),
      baseUrl: this.resolveBaseUrl(provider),
      embeddingApiKey: this.config.get<string>('EMBEDDING_API_KEY'),
      embeddingBaseUrl: this.config.get<string>('EMBEDDING_BASE_URL'),
      embeddingModel: this.config.get<string>('EMBEDDING_MODEL'),
      ragEnabled: true,
      ragTopK: 5,
      visionEnabled: this.config.get<string>('LLM_VISION_ENABLED') === 'true',
    };
  }

  async getPublicLlmConfig(user: AuthUser) {
    const saved = await this.prisma.userLlmConfig.findFirst({
      where: { userId: user.id, enabled: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (saved) {
      const provider = saved.provider as LlmConfig['provider'];
      const envApiKey = this.getProviderApiKey(provider);
      return {
        provider: saved.provider,
        model: saved.model,
        diagnosisWesternModel: saved.diagnosisWesternModel ?? undefined,
        diagnosisTcmModel: saved.diagnosisTcmModel ?? undefined,
        diagnosisReviewerModel: saved.diagnosisReviewerModel ?? undefined,
        diagnosisIntegratorModel: saved.diagnosisIntegratorModel ?? undefined,
        maskedApiKey: saved.maskedApiKey ?? (envApiKey ? maskSecret(envApiKey) : undefined),
        baseUrl: this.resolveBaseUrl(provider, saved.baseUrl ?? undefined),
        ragEnabled: saved.ragEnabled,
        ragTopK: saved.ragTopK,
        visionEnabled: saved.visionEnabled,
        updatedAt: saved.updatedAt.toISOString(),
      };
    }

    const config = await this.getLlmConfig(user);
    return {
      provider: config.provider,
      model: config.model,
      diagnosisWesternModel: config.diagnosisWesternModel,
      diagnosisTcmModel: config.diagnosisTcmModel,
      diagnosisReviewerModel: config.diagnosisReviewerModel,
      diagnosisIntegratorModel: config.diagnosisIntegratorModel,
      maskedApiKey: config.apiKey ? maskSecret(config.apiKey) : undefined,
      baseUrl: config.baseUrl,
      ragEnabled: config.ragEnabled ?? true,
      ragTopK: config.ragTopK ?? 5,
      visionEnabled: config.visionEnabled ?? false,
    };
  }

  resolveProviderRuntimeConfig(config: LlmConfig): LlmConfig {
    return {
      ...config,
      apiKey: config.apiKey ?? this.getProviderApiKey(config.provider),
      baseUrl: this.resolveBaseUrl(config.provider, config.baseUrl),
      embeddingApiKey: config.embeddingApiKey ?? this.config.get<string>('EMBEDDING_API_KEY'),
      embeddingBaseUrl: config.embeddingBaseUrl ?? this.config.get<string>('EMBEDDING_BASE_URL'),
      embeddingModel: config.embeddingModel ?? this.config.get<string>('EMBEDDING_MODEL'),
    };
  }

  async saveLlmConfig(user: AuthUser, config: LlmConfig) {
    const current = await this.prisma.userLlmConfig.findFirst({
      where: { userId: user.id, enabled: true },
      orderBy: { updatedAt: 'desc' },
    });
    const apiKey = normalizeApiKey(config.apiKey);
    const existingEncryptedKey = current?.provider === config.provider ? current.encryptedApiKey ?? undefined : undefined;
    const existingMaskedKey = current?.provider === config.provider ? current.maskedApiKey ?? undefined : undefined;
    const encryptedApiKey = apiKey ? this.encryptSecret(apiKey) : existingEncryptedKey;
    const maskedApiKey = apiKey ? maskSecret(apiKey) : existingMaskedKey;
    const metadata = LLM_PROVIDER_METADATA[config.provider];

    const configuredModels = [
      config.model,
      config.diagnosisWesternModel,
      config.diagnosisTcmModel,
      config.diagnosisReviewerModel,
      config.diagnosisIntegratorModel,
    ].filter((model): model is string => Boolean(model));
    const invalidAnthropicModel =
      config.provider === 'anthropic'
        ? configuredModels.find((model) => !LLM_PROVIDER_METADATA.anthropic.models.some((allowed) => allowed === model))
        : undefined;
    if (invalidAnthropicModel) {
      throw new BadRequestException(
        `模型 ${invalidAnthropicModel} 不属于 Anthropic Claude。请选择正确的提供商后再保存，或改用 Claude 模型。`,
      );
    }

    if (metadata.requiresApiKey && !encryptedApiKey && !this.getProviderApiKey(config.provider)) {
      throw new BadRequestException(`${metadata.label} API key is required for ${config.provider} provider`);
    }

    await this.prisma.userLlmConfig.updateMany({ where: { userId: user.id }, data: { enabled: false } });
    return this.prisma.userLlmConfig.create({
      data: {
        userId: user.id,
        provider: config.provider,
        model: config.model,
        diagnosisWesternModel: normalizeOptionalModel(config.diagnosisWesternModel),
        diagnosisTcmModel: normalizeOptionalModel(config.diagnosisTcmModel),
        diagnosisReviewerModel: normalizeOptionalModel(config.diagnosisReviewerModel),
        diagnosisIntegratorModel: normalizeOptionalModel(config.diagnosisIntegratorModel),
        encryptedApiKey,
        maskedApiKey,
        baseUrl: normalizeBaseUrl(config.baseUrl),
        ragEnabled: config.ragEnabled ?? current?.ragEnabled ?? true,
        ragTopK: config.ragTopK ?? current?.ragTopK ?? 5,
        visionEnabled: config.visionEnabled ?? current?.visionEnabled ?? false,
        enabled: true,
      },
    });
  }

  private getProviderApiKey(provider: LlmProviderName) {
    const metadata = LLM_PROVIDER_METADATA[provider];
    const envName = 'apiKeyEnv' in metadata ? metadata.apiKeyEnv : undefined;
    return envName ? this.config.get<string>(envName) : undefined;
  }

  private resolveBaseUrl(provider: LlmProviderName, savedBaseUrl?: string) {
    const metadata = LLM_PROVIDER_METADATA[provider];
    const baseUrlEnv = 'baseUrlEnv' in metadata ? metadata.baseUrlEnv : undefined;
    const defaultBaseUrl = 'defaultBaseUrl' in metadata ? metadata.defaultBaseUrl : undefined;
    if (savedBaseUrl) return savedBaseUrl;
    if (baseUrlEnv) {
      const providerBaseUrl = this.config.get<string>(baseUrlEnv);
      if (providerBaseUrl) return providerBaseUrl;
    }
    return this.config.get<string>('LLM_BASE_URL') || defaultBaseUrl;
  }

  private getDefaultModel(provider: LlmProviderName) {
    return LLM_PROVIDER_METADATA[provider].defaultModel;
  }

  private encryptSecret(secret: string) {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [ENCRYPTION_PREFIX, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  private decryptSecret(payload: string) {
    if (!payload.startsWith(`${ENCRYPTION_PREFIX}:`)) {
      return payload;
    }

    const [, ivBase64, tagBase64, encryptedBase64] = payload.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.getEncryptionKey(), Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private getEncryptionKey() {
    const rawKey = this.config.get<string>('ENCRYPTION_KEY');
    if (!rawKey || rawKey.length < 16) {
      throw new BadRequestException('ENCRYPTION_KEY must be configured before saving API keys');
    }
    return createHash('sha256').update(rawKey).digest();
  }
}

function maskSecret(secret: string) {
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

function normalizeApiKey(apiKey?: string) {
  const value = apiKey?.replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
  if (!value || value.includes('****')) return undefined;
  return value;
}

function normalizeOptionalModel(value: string | undefined) {
  return value?.trim() || null;
}

function normalizeBaseUrl(baseUrl?: string) {
  const value = baseUrl?.trim();
  return value || undefined;
}
