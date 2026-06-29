import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { RagService } from './rag.service';

@Module({
  providers: [KnowledgeService, RagService],
  exports: [KnowledgeService, RagService],
})
export class KnowledgeModule {}
