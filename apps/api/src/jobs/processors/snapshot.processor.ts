import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { SnapshotsService } from '../../snapshots/snapshots.service';

@Injectable()
@Processor('snapshots')
export class SnapshotProcessor extends WorkerHost {
  constructor(private readonly snapshots: SnapshotsService) {
    super();
  }

  async process(job: Job<{ userId: string }>) {
    return this.snapshots.generateWeekly();
  }
}
