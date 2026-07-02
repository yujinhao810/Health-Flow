import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { HealthRecordType } from '@prisma/client';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

type ExportRecord = {
  id: string;
  type: HealthRecordType;
  recordedAt: Date;
  note: string | null;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

@Controller('health/export')
@UseGuards(AuthGuard)
export class DataExportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('json')
  async exportJson(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const records = await this.getRecords(user.id);
    const grouped: Record<HealthRecordType, ExportRecord[]> = {
      sleep: [],
      exercise: [],
      mood: [],
      medical: [],
    };

    for (const record of records) grouped[record.type].push(record);

    res.setHeader('Content-Disposition', `attachment; filename="${buildExportFilename('json')}"`);
    return grouped;
  }

  @Get('csv')
  async exportCsv(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const records = await this.getRecords(user.id);
    const csv = toCsv(records);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${buildExportFilename('csv')}"`);
    return `\ufeff${csv}`;
  }

  private getRecords(userId: string) {
    return this.prisma.healthRecord.findMany({
      where: { userId },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }
}

function toCsv(records: ExportRecord[]) {
  const flattenedRecords = records.map((record) => {
    const payload = flattenPayload(record.payload);
    return {
      base: {
        id: record.id,
        type: record.type,
        recordedAt: record.recordedAt.toISOString(),
        note: record.note ?? '',
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      },
      payload,
    };
  });

  const payloadColumns = [...new Set(flattenedRecords.flatMap((record) => Object.keys(record.payload)))].sort();
  const columns = ['id', 'type', 'recordedAt', 'note', ...payloadColumns.map((column) => `payload.${column}`), 'createdAt', 'updatedAt'];
  const rows = flattenedRecords.map((record) =>
    [
      record.base.id,
      record.base.type,
      record.base.recordedAt,
      record.base.note,
      ...payloadColumns.map((column) => record.payload[column] ?? ''),
      record.base.createdAt,
      record.base.updatedAt,
    ].map(csvEscape).join(','),
  );

  return [columns.map(csvEscape).join(','), ...rows].join('\n');
}

function flattenPayload(value: unknown, prefix = ''): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value)) return { [prefix || 'value']: JSON.stringify(value) };

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      Object.assign(result, flattenPayload(entry, nextKey));
    } else {
      result[nextKey] = entry === undefined || entry === null ? '' : typeof entry === 'string' ? entry : JSON.stringify(entry);
    }
  }

  return result;
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildExportFilename(format: 'json' | 'csv') {
  return `healthflow-export-${new Date().toISOString().slice(0, 10)}.${format}`;
}
