import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';

test('production accepts a public HTTP model URL when explicitly enabled', () => {
  const service = createSettingsService({
    NODE_ENV: 'production',
    ALLOW_CUSTOM_LLM_BASE_URLS: 'true',
    ALLOW_INSECURE_LLM_BASE_URLS: 'true',
  });

  assert.doesNotThrow(() => service.assertAllowedUserBaseUrl('openai', 'http://203.0.113.10/v1'));
});

test('production rejects a public HTTP model URL without the insecure opt-in', () => {
  const service = createSettingsService({
    NODE_ENV: 'production',
    ALLOW_CUSTOM_LLM_BASE_URLS: 'true',
    ALLOW_INSECURE_LLM_BASE_URLS: 'false',
  });

  assert.throws(
    () => service.assertAllowedUserBaseUrl('openai', 'http://203.0.113.10/v1'),
    /必须使用 HTTPS/,
  );
});

test('production still rejects private HTTP model URLs when insecure HTTP is enabled', () => {
  const service = createSettingsService({
    NODE_ENV: 'production',
    ALLOW_CUSTOM_LLM_BASE_URLS: 'true',
    ALLOW_INSECURE_LLM_BASE_URLS: 'true',
  });

  assert.throws(
    () => service.assertAllowedUserBaseUrl('openai', 'http://192.168.1.20/v1'),
    /内网 IP/,
  );
});

function createSettingsService(environment: Record<string, string | undefined>) {
  const config = {
    get<T = string>(key: string) {
      return environment[key] as T | undefined;
    },
  } as ConfigService;

  return new SettingsService({} as PrismaService, config);
}
