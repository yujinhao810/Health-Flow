import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { HealthRecordType } from '@prisma/client';
import { CreateHealthRecordDto } from './dto/create-health-record.dto';
import { HealthRecordsService } from './health-records.service';

@Controller('health/records')
export class HealthRecordsController {
  constructor(private readonly records: HealthRecordsService) {}

  @Get()
  list(@Query('type') type?: HealthRecordType) {
    return this.records.list(type);
  }

  @Post()
  create(@Body() body: CreateHealthRecordDto) {
    return this.records.create(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.records.remove(id);
  }
}
