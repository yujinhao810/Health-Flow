import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

@Injectable()
@Processor('chat-summaries')
export class ChatSummaryProcessor extends WorkerHost {
  async process(job: Job<{ threadId: string }>) {
    return { ok: true, threadId: job.data.threadId };
  }
}
