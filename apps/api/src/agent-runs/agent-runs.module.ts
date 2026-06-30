import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentRunsController } from './agent-runs.controller';
import { AgentRunService } from './agent-run.service';

@Module({
  imports: [AuthModule],
  controllers: [AgentRunsController],
  providers: [AgentRunService],
  exports: [AgentRunService],
})
export class AgentRunsModule {}