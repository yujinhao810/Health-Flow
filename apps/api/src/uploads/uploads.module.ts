import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { FileExtractionService } from "./file-extraction.service";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [AuthModule, KnowledgeModule],
  controllers: [UploadsController],
  providers: [UploadsService, FileExtractionService],
  exports: [UploadsService],
})
export class UploadsModule {}
