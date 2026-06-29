import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { SnapshotProcessor } from './processors/snapshot.processor';
import { ChatSummaryProcessor } from './processors/chat-summary.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379' },
      }),
    }),
    BullModule.registerQueue(
      { name: 'snapshots' },
      { name: 'chat-summaries' },
    ),
  ],
  providers: [SnapshotProcessor, ChatSummaryProcessor],
  exports: [BullModule],
})
export class JobsModule {}
