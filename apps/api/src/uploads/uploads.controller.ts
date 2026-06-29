import { Controller, Delete, Get, Param, Post, Res, UploadedFile, UseInterceptors, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(@UploadedFile() file: Express.Multer.File | undefined, @Body('purpose') purpose: 'chat_attachment' | 'knowledge_source') {
    return this.uploads.create(file, purpose);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.uploads.get(id);
  }

  @Get(':id/content')
  async content(@Param('id') id: string, @Res() res: Response) {
    const file = await this.uploads.getOwnedFile(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    createReadStream(file.storagePath).pipe(res);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.uploads.remove(id);
  }
}
