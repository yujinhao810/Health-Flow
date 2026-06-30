import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { HealthInsightsService } from './health-insights.service';

@Controller('health/insights')
@UseGuards(AuthGuard)
export class HealthInsightsController {
  constructor(private readonly insights: HealthInsightsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.insights.list(user);
  }

  @Post('refresh')
  refresh(@CurrentUser() user: AuthUser) {
    return this.insights.refresh(user);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.insights.markRead(user, id);
  }

  @Delete(':id')
  dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.insights.dismiss(user, id);
  }
}
