import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MulterModule } from "@nestjs/platform-express";
import { AuthModule } from "../auth/auth.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { FileExtractionService } from "./file-extraction.service";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [
    AuthModule,
    KnowledgeModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: config.get<number>("MAX_UPLOAD_BYTES") ?? 10 * 1024 * 1024,
          files: 1,
          fields: 2,
          fieldNameSize: 100,
        },
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, FileExtractionService],
  exports: [UploadsService],
})
export class UploadsModule {}
