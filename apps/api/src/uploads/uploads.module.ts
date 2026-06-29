import { Module } from '@nestjs/common';
import { FileExtractionService } from './file-extraction.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, FileExtractionService],
  exports: [UploadsService],
})
export class UploadsModule {}
