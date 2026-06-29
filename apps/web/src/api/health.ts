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

export function listHealthRecords(type?: HealthRecordType) {
  return api<HealthRecord[]>(`/health/records${type ? `?type=${type}` : ''}`);
}

export function createHealthRecord(input: CreateHealthRecordInput) {
  return api<HealthRecord>('/health/records', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteHealthRecord(id: string) {
  return api<DeleteHealthRecordResult>(`/health/records/${id}`, { method: 'DELETE' });
}
