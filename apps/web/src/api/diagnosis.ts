import type { DiagnosisInput, DiagnosisSession } from '@health/shared';
import { api } from './client';

export type { DiagnosisInput, DiagnosisSession };

export type DeleteDiagnosisResult = {
  id: string;
  deleted: true;
};

export function createDiagnosis(input: DiagnosisInput) {
  return api<DiagnosisSession>('/integrative-diagnosis', { method: 'POST', body: JSON.stringify(input) });
}

export function listDiagnoses() {
  return api<DiagnosisSession[]>('/integrative-diagnosis');
}

export function getDiagnosis(id: string) {
  return api<DiagnosisSession>(`/integrative-diagnosis/${id}`);
}

export function deleteDiagnosis(id: string) {
  return api<DeleteDiagnosisResult>(`/integrative-diagnosis/${id}`, { method: 'DELETE' });
}
