import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { IntegrativeDiagnosisService } from './integrative-diagnosis.service';

@Controller('integrative-diagnosis')
@UseGuards(AuthGuard)
export class IntegrativeDiagnosisController {
  constructor(private readonly diagnosis: IntegrativeDiagnosisService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateDiagnosisDto) {
    return this.diagnosis.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.diagnosis.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.diagnosis.get(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.diagnosis.remove(user, id);
  }
}
