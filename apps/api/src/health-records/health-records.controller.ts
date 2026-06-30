import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { HealthRecordType } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CreateHealthRecordDto } from './dto/create-health-record.dto';
import { HealthRecordsService } from './health-records.service';

@Controller('health/records')
@UseGuards(AuthGuard)
export class HealthRecordsController {
  constructor(private readonly records: HealthRecordsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('type') type?: HealthRecordType) {
    return this.records.list(user, type);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateHealthRecordDto) {
    return this.records.create(user, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.records.remove(user, id);
  }
}
