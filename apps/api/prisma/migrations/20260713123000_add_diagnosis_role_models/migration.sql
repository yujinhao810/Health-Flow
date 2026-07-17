ALTER TABLE "UserLlmConfig"
ADD COLUMN "diagnosisWesternModel" TEXT,
ADD COLUMN "diagnosisTcmModel" TEXT,
ADD COLUMN "diagnosisReviewerModel" TEXT,
ADD COLUMN "diagnosisIntegratorModel" TEXT;
