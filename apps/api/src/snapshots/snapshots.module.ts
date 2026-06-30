import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SnapshotsController } from './snapshots.controller';
import { SnapshotBuilderService } from './snapshot-builder.service';
import { SnapshotsService } from './snapshots.service';

@Module({
  imports: [AuthModule],
  controllers: [SnapshotsController],
  providers: [SnapshotsService, SnapshotBuilderService],
  exports: [SnapshotsService, SnapshotBuilderService],
})
export class SnapshotsModule {}
