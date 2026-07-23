import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentRunsModule } from './agent-runs/agent-runs.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { envSchema } from './config/env.schema';
import { HealthRecordsModule } from './health-records/health-records.module';
import { HealthCheckModule } from './health-check/health-check.module';
import { IntegrativeDiagnosisModule } from './integrative-diagnosis/integrative-diagnosis.module';
import { InsightsModule } from './insights/insights.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module';
import { SafetyModule } from './safety/safety.module';
import { SettingsModule } from './settings/settings.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => envSchema.parse(env),
    }),
    PrismaModule,
    AgentRunsModule,
    AdminModule,
    AuthModule,
    LlmModule,
    SafetyModule,
    SettingsModule,
    HealthRecordsModule,
    HealthCheckModule,
    SnapshotsModule,
    KnowledgeModule,
    UploadsModule,
    ChatModule,
    IntegrativeDiagnosisModule,
    InsightsModule,
  ],
})
export class AppModule {}

