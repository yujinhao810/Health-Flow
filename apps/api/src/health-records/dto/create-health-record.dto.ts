import { HealthRecordType } from '@prisma/client';
import { IsEnum, IsISO8601, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHealthRecordDto {
  @IsEnum(HealthRecordType)
  type!: HealthRecordType;

  @IsISO8601()
  recordedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
