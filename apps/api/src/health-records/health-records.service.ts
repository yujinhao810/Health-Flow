import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHealthRecordSchema } from '@health/shared';
import { HealthRecordType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateHealthRecordDto } from './dto/create-health-record.dto';

@Injectable()
export class HealthRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async list(type?: HealthRecordType) {
    const user = await this.settings.getDemoUser();
    return this.prisma.healthRecord.findMany({
      where: { userId: user.id, type },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });
  }

  async create(input: CreateHealthRecordDto) {
    const parsed = createHealthRecordSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: '健康记录内容格式不正确',
        issues: parsed.error.flatten(),
      });
    }

    const user = await this.settings.getDemoUser();
    const recordedAt = new Date(parsed.data.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) {
      throw new BadRequestException('recordedAt must be a valid ISO date');
    }

    return this.prisma.healthRecord.create({
      data: {
        userId: user.id,
        type: parsed.data.type,
        recordedAt,
        note: parsed.data.note,
        payload: parsed.data.payload as Prisma.InputJsonValue,
      },
    });
  }

  async remove(id: string) {
    const user = await this.settings.getDemoUser();
    const result = await this.prisma.healthRecord.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) {
      throw new NotFoundException('Health record not found');
    }

    return { id, deleted: true };
  }
}
