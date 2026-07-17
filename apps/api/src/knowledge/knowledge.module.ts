import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { LlmModule } from "../llm/llm.module";
import { DocumentIngestionService } from "./document-ingestion.service";
import { EmbeddingService } from "./embedding.service";
import { KnowledgeService } from "./knowledge.service";
import { RagService } from "./rag.service";
import { DashscopeRerankProvider } from "./rerank/providers/dashscope-rerank.provider";
import { RerankService } from "./rerank/rerank.service";

@Module({
  imports: [SettingsModule, LlmModule],
  providers: [
    KnowledgeService,
    RagService,
    EmbeddingService,
    DocumentIngestionService,
    RerankService,
    DashscopeRerankProvider,
  ],
  exports: [
    KnowledgeService,
    RagService,
    EmbeddingService,
    DocumentIngestionService,
  ],
})
export class KnowledgeModule {}
