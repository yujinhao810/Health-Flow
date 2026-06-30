import { Module } from '@nestjs/common';
import { HealthMemoryService } from './health-memory.service';

@Module({
  providers: [HealthMemoryService],
  exports: [HealthMemoryService],
})
export class MemoryModule {}
