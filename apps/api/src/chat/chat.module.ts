import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';
import { HealthRecordsModule } from '../health-records/health-records.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LlmModule } from '../llm/llm.module';
import { MemoryModule } from '../memory/memory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { SafetyModule } from '../safety/safety.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { SkillsModule } from '../skills/skills.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AgentRuntimeService } from './agent-runtime.service';
import { ChatController } from './chat.controller';
import { ChatContextService } from './chat-context.service';
import { ChatService } from './chat.service';
import { ChatStreamService } from './chat-stream.service';
import { HealthAgentToolsService } from './health-agent-tools.service';

@Module({
  imports: [AgentRunsModule, AuthModule, PrismaModule, SettingsModule, LlmModule, MemoryModule, SnapshotsModule, SafetyModule, HealthRecordsModule, KnowledgeModule, UploadsModule, SkillsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatContextService, ChatStreamService, AgentRuntimeService, HealthAgentToolsService],
  exports: [ChatService, ChatContextService, ChatStreamService],
})
export class ChatModule {}

