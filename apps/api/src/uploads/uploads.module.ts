import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { FileExtractionService } from './file-extraction.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [SettingsModule],
  controllers: [UploadsController],
  providers: [UploadsService, FileExtractionService],
  exports: [UploadsService],
})
export class UploadsModule {}
