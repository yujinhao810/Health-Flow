import { Module } from '@nestjs/common';
import { CrisisPolicyService } from './crisis-policy.service';
import { RedactionService } from './redaction.service';

@Module({
  providers: [CrisisPolicyService, RedactionService],
  exports: [CrisisPolicyService, RedactionService],
})
export class SafetyModule {}
