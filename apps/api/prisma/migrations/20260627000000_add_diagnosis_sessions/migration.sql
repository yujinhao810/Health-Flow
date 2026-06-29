-- CreateEnum
CREATE TYPE "DiagnosisStatus" AS ENUM ('pending', 'completed', 'safety_blocked', 'failed');

-- CreateEnum
CREATE TYPE "DiagnosisSafetyLevel" AS ENUM ('emergency', 'urgent', 'clinician_recommended', 'supportive');

-- CreateTable
CREATE TABLE "DiagnosisSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DiagnosisStatus" NOT NULL DEFAULT 'pending',
    "safetyLevel" "DiagnosisSafetyLevel",
    "input" JSONB NOT NULL,
    "contextSnapshot" JSONB,
    "redFlagResult" JSONB,
    "westernOutput" JSONB,
    "tcmOutput" JSONB,
    "integratedOutput" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosisSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiagnosisSession_userId_createdAt_idx" ON "DiagnosisSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosisSession_userId_safetyLevel_createdAt_idx" ON "DiagnosisSession"("userId", "safetyLevel", "createdAt");

-- AddForeignKey
ALTER TABLE "DiagnosisSession" ADD CONSTRAINT "DiagnosisSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
