import type { HealthSnapshot } from '@health/shared';
import { api } from './client';

export type { HealthSnapshot };

export function getLatestSnapshot() {
  return api<HealthSnapshot>('/health/snapshots/latest');
}

export function generateSnapshot() {
  return api<HealthSnapshot>('/health/snapshots/generate', { method: 'POST' });
}
