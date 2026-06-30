-- Agent observability, persistent user memory, and proactive health insights.
CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT,
  "diagnosisSessionId" TEXT,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "input" JSONB,
  "memorySnapshot" JSONB,
  "steps" JSONB NOT NULL DEFAULT '[]',
  "provider" TEXT,
  "model" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "error" TEXT,

  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserMemory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "facts" JSONB NOT NULL,
  "preferences" JSONB NOT NULL,
  "riskSignals" JSONB NOT NULL,
  "sourceStats" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthInsight" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "recommendation" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HealthInsight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentRun_userId_startedAt_idx" ON "AgentRun"("userId", "startedAt");
CREATE INDEX "AgentRun_conversationId_idx" ON "AgentRun"("conversationId");
CREATE INDEX "AgentRun_diagnosisSessionId_idx" ON "AgentRun"("diagnosisSessionId");

CREATE UNIQUE INDEX "UserMemory_userId_scope_key" ON "UserMemory"("userId", "scope");
CREATE INDEX "UserMemory_userId_generatedAt_idx" ON "UserMemory"("userId", "generatedAt");

CREATE INDEX "HealthInsight_userId_status_generatedAt_idx" ON "HealthInsight"("userId", "status", "generatedAt");
CREATE INDEX "HealthInsight_userId_type_generatedAt_idx" ON "HealthInsight"("userId", "type", "generatedAt");

ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_diagnosisSessionId_fkey" FOREIGN KEY ("diagnosisSessionId") REFERENCES "DiagnosisSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthInsight" ADD CONSTRAINT "HealthInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
