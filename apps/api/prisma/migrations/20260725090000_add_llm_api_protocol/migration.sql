ALTER TABLE "UserLlmConfig"
ADD COLUMN "apiProtocol" TEXT NOT NULL DEFAULT 'chat_completions';
