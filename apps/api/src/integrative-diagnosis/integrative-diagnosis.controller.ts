import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { IntegrativeDiagnosisService } from './integrative-diagnosis.service';

@Controller('integrative-diagnosis')
export class IntegrativeDiagnosisController {
  constructor(private readonly diagnosis: IntegrativeDiagnosisService) {}

  @Post()
  create(@Body() body: CreateDiagnosisDto) {
    return this.diagnosis.create(body);
  }

  @Get()
  list() {
    return this.diagnosis.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.diagnosis.get(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.diagnosis.remove(id);
  }
}
