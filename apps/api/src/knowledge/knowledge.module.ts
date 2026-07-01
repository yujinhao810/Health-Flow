import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { LlmModule } from '../llm/llm.module';
import { DocumentIngestionService } from './document-ingestion.service';
import { EmbeddingService } from './embedding.service';
import { KnowledgeService } from './knowledge.service';
import { RagService } from './rag.service';

@Module({
  imports: [SettingsModule, LlmModule],
  providers: [KnowledgeService, RagService, EmbeddingService, DocumentIngestionService],
  exports: [KnowledgeService, RagService, EmbeddingService, DocumentIngestionService],
})
export class KnowledgeModule {}
