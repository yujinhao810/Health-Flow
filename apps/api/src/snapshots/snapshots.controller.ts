import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { SnapshotsService } from './snapshots.service';

@Controller('health/snapshots')
@UseGuards(AuthGuard)
export class SnapshotsController {
  constructor(private readonly snapshots: SnapshotsService) {}

  @Get('latest')
  latest(@CurrentUser() user: AuthUser) {
    return this.snapshots.latest(user);
  }

  @Post('generate')
  generate(@CurrentUser() user: AuthUser) {
    return this.snapshots.generateWeekly(user);
  }
}
