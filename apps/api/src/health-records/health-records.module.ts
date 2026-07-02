import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DataExportController } from './data-export.controller';
import { HealthRecordsController } from './health-records.controller';
import { HealthRecordsService } from './health-records.service';

@Module({
  imports: [AuthModule],
  controllers: [HealthRecordsController, DataExportController],
  providers: [HealthRecordsService],
  exports: [HealthRecordsService],
})
export class HealthRecordsModule {}
