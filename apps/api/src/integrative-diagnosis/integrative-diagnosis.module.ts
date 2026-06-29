import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { SafetyModule } from '../safety/safety.module';
import { SettingsModule } from '../settings/settings.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { DiagnosisContextService } from './diagnosis-context.service';
import { IntegrativeDiagnosisController } from './integrative-diagnosis.controller';
import { IntegrativeDiagnosisService } from './integrative-diagnosis.service';
import { RedFlagTriageService } from './red-flag-triage.service';

@Module({
  imports: [LlmModule, SafetyModule, SettingsModule, SnapshotsModule],
  controllers: [IntegrativeDiagnosisController],
  providers: [DiagnosisContextService, IntegrativeDiagnosisService, RedFlagTriageService],
})
export class IntegrativeDiagnosisModule {}
