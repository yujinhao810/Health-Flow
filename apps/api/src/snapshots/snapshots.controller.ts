import { Controller, Get, Post } from '@nestjs/common';
import { SnapshotsService } from './snapshots.service';

@Controller('health/snapshots')
export class SnapshotsController {
  constructor(private readonly snapshots: SnapshotsService) {}

  @Get('latest')
  latest() {
    return this.snapshots.latest();
  }

  @Post('generate')
  generate() {
    return this.snapshots.generateWeekly();
  }
}
