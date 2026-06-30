import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MemoryModule } from '../memory/memory.module';
import { HealthInsightsController } from './health-insights.controller';
import { HealthInsightsService } from './health-insights.service';

@Module({
  imports: [AuthModule, MemoryModule],
  controllers: [HealthInsightsController],
  providers: [HealthInsightsService],
  exports: [HealthInsightsService],
})
export class InsightsModule {}
