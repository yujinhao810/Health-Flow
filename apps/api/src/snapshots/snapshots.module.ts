import { Module } from '@nestjs/common';
import { HealthRecordsModule } from '../health-records/health-records.module';
import { SettingsModule } from '../settings/settings.module';
import { SnapshotsController } from './snapshots.controller';
import { SnapshotBuilderService } from './snapshot-builder.service';
import { SnapshotsService } from './snapshots.service';

@Module({
  imports: [HealthRecordsModule, SettingsModule],
  controllers: [SnapshotsController],
  providers: [SnapshotsService, SnapshotBuilderService],
  exports: [SnapshotsService, SnapshotBuilderService],
})
export class SnapshotsModule {}
