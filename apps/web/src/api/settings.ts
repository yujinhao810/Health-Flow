import type { LlmConfigInput, LlmValidationResult, PublicLlmConfig } from '@health/shared';
import { api } from './client';

export type { LlmConfigInput, LlmValidationResult, PublicLlmConfig };

export function getLlmConfig() {
  return api<PublicLlmConfig>('/llm/config');
}

export function saveLlmConfig(input: LlmConfigInput) {
  return api<PublicLlmConfig>('/llm/config', { method: 'POST', body: JSON.stringify(input) });
}

export function validateLlmConfig(input: LlmConfigInput) {
  return api<LlmValidationResult>('/llm/validate', { method: 'POST', body: JSON.stringify(input) });
}
