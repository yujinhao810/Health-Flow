import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AgentRunService } from './agent-run.service';

@Controller('agent-runs')
@UseGuards(AuthGuard)
export class AgentRunsController {
  constructor(private readonly agentRuns: AgentRunService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit);
    return this.agentRuns.list(user, Number.isFinite(parsedLimit) ? parsedLimit : undefined);
  }
}