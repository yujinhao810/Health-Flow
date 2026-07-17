import type { DiagnosisFollowUpRequest, DiagnosisFollowUpResult, DiagnosisInput, DiagnosisSession, DiagnosisSupplementInput } from '@health/shared';
import { api } from './client';

export type { DiagnosisFollowUpRequest, DiagnosisFollowUpResult, DiagnosisInput, DiagnosisSession };

export type DeleteDiagnosisResult = {
  id: string;
  deleted: true;
};

export function createDiagnosis(input: DiagnosisInput) {
  return api<DiagnosisSession>('/integrative-diagnosis', { method: 'POST', body: JSON.stringify(input) });
}

export function generateDiagnosisFollowUp(input: DiagnosisFollowUpRequest) {
  return api<DiagnosisFollowUpResult>('/integrative-diagnosis/follow-up', { method: 'POST', body: JSON.stringify(input) });
}

export function supplementDiagnosis(id: string, input: DiagnosisSupplementInput) {
  return api<DiagnosisSession>(`/integrative-diagnosis/${id}/supplement`, { method: 'POST', body: JSON.stringify(input) });
}

export function retryDiagnosis(id: string) {
  return api<DiagnosisSession>(`/integrative-diagnosis/${id}/retry`, { method: 'POST' });
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
