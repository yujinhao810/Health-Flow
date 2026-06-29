import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateDiagnosisDto {
  @IsString()
  chiefComplaint!: string;

  @IsObject({ each: true })
  symptoms!: unknown[];

  @IsOptional()
  @IsObject()
  vitals?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  lifestyleSignals?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  medicalContext?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  tcmObservations?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  freeText?: string;

  @IsOptional()
  includeRecentHealthContext?: boolean;
}
