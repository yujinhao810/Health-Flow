export type MedicalMaterial = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  purpose?: 'chat_attachment' | 'knowledge_source';
  status?: 'pending' | 'ready' | 'failed';
  contentUrl?: string;
  createdAt?: string;
};

export function getMedicalMaterials(payload: Record<string, unknown>) {
  const raw = payload.medicalMaterials ?? payload.materials ?? payload.attachments;
  if (!Array.isArray(raw)) return [];
  return raw.map(toMedicalMaterial).filter((item): item is MedicalMaterial => Boolean(item));
}

export function getMedicalVisitType(payload: Record<string, unknown>) {
  return typeof payload.visitType === 'string' && payload.visitType.trim() ? payload.visitType : '就医记录';
}

export function getMedicalMedication(payload: Record<string, unknown>) {
  return typeof payload.medication === 'string' && payload.medication.trim() ? payload.medication : undefined;
}

export function getMedicalDiagnosis(payload: Record<string, unknown>) {
  return typeof payload.diagnosis === 'string' && payload.diagnosis.trim() ? payload.diagnosis : undefined;
}

export function getMedicalFollowUpAt(payload: Record<string, unknown>) {
  return typeof payload.followUpAt === 'string' ? payload.followUpAt : undefined;
}

export function isImageMaterial(material: MedicalMaterial) {
  return material.mimeType.startsWith('image/');
}

export function isPdfMaterial(material: MedicalMaterial) {
  return material.mimeType === 'application/pdf' || /\.pdf$/i.test(material.originalName);
}

export function formatFileSize(sizeBytes?: number) {
  if (!Number.isFinite(sizeBytes) || !sizeBytes) return '未知大小';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function toMedicalMaterial(value: unknown): MedicalMaterial | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.originalName !== 'string' || typeof item.mimeType !== 'string') return null;

  return {
    id: item.id,
    originalName: item.originalName,
    mimeType: item.mimeType,
    sizeBytes: typeof item.sizeBytes === 'number' ? item.sizeBytes : 0,
    purpose: item.purpose === 'chat_attachment' || item.purpose === 'knowledge_source' ? item.purpose : undefined,
    status: item.status === 'pending' || item.status === 'ready' || item.status === 'failed' ? item.status : undefined,
    contentUrl: typeof item.contentUrl === 'string' ? item.contentUrl : undefined,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  };
}
