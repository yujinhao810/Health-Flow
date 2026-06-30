import type { CreateHealthRecordInput, HealthRecordType } from '@health/shared';
import { api } from './client';

export type HealthRecord = {
  id: string;
  type: HealthRecordType;
  recordedAt: string;
  note?: string;
  payload: Record<string, unknown>;
};

export type DeleteHealthRecordResult = {
  id: string;
  deleted: true;
};

export type HealthInsight = {
  id: string;
  type: string;
  severity: 'info' | 'watch' | 'warning' | string;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  recommendation: string;
  status: 'new' | 'read' | 'dismissed' | string;
  generatedAt: string;
  readAt?: string | null;
  dismissedAt?: string | null;
};

export function listHealthRecords(type?: HealthRecordType) {
  return api<HealthRecord[]>(`/health/records${type ? `?type=${type}` : ''}`);
}

export function createHealthRecord(input: CreateHealthRecordInput) {
  return api<HealthRecord>('/health/records', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteHealthRecord(id: string) {
  return api<DeleteHealthRecordResult>(`/health/records/${id}`, { method: 'DELETE' });
}

export function listHealthInsights() {
  return api<HealthInsight[]>('/health/insights');
}

export function refreshHealthInsights() {
  return api<HealthInsight[]>('/health/insights/refresh', { method: 'POST' });
}

export function markHealthInsightRead(id: string) {
  return api<{ count: number }>(`/health/insights/${id}/read`, { method: 'POST' });
}

export function dismissHealthInsight(id: string) {
  return api<{ count: number }>(`/health/insights/${id}`, { method: 'DELETE' });
}