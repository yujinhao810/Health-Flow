import { Module } from '@nestjs/common';
import { HealthRecordsModule } from '../health-records/health-records.module';
import { LlmModule } from '../llm/llm.module';
import { SafetyModule } from '../safety/safety.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { HealthPlanGenerateSkill } from './health/health-plan-generate.skill';
import { HealthRecordCreateSkill } from './health/health-record-create.skill';
import { HealthRecordsListSkill } from './health/health-records-list.skill';
import { SnapshotGenerateWeeklySkill } from './health/snapshot-generate-weekly.skill';
import { SnapshotLatestSkill } from './health/snapshot-latest.skill';
import { SkillRunnerService } from './skill-runner.service';
import { REGISTERED_SKILLS, SkillRegistry } from './skill.registry';

const HEALTH_SKILLS = [HealthRecordsListSkill, HealthRecordCreateSkill, SnapshotLatestSkill, SnapshotGenerateWeeklySkill, HealthPlanGenerateSkill];

@Module({
  imports: [HealthRecordsModule, SnapshotsModule, LlmModule, SafetyModule],
  providers: [
    ...HEALTH_SKILLS,
    {
      provide: REGISTERED_SKILLS,
      inject: HEALTH_SKILLS,
      useFactory: (...skills: InstanceType<(typeof HEALTH_SKILLS)[number]>[]) => skills,
    },
    SkillRegistry,
    SkillRunnerService,
  ],
  exports: [SkillRegistry, SkillRunnerService],
})
export class SkillsModule {}
