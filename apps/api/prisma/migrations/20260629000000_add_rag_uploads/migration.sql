-- AlterTable
ALTER TABLE "UserLlmConfig" ADD COLUMN "ragEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserLlmConfig" ADD COLUMN "ragTopK" INTEGER NOT NULL DEFAULT 5;

-- CreateEnum
CREATE TYPE "UploadedFileStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "UploadedFilePurpose" AS ENUM ('chat_attachment', 'knowledge_source');

-- CreateEnum
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "UploadedFilePurpose" NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "UploadedFileStatus" NOT NULL DEFAULT 'pending',
    "extractedText" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT,
    "sourceUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'published',
    "tags" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "keywords" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadedFile_userId_purpose_createdAt_idx" ON "UploadedFile"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "UploadedFile_sha256_idx" ON "UploadedFile"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageAttachment_messageId_uploadedFileId_key" ON "ChatMessageAttachment"("messageId", "uploadedFileId");

-- CreateIndex
CREATE INDEX "ChatMessageAttachment_uploadedFileId_idx" ON "ChatMessageAttachment"("uploadedFileId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_title_key" ON "KnowledgeDocument"("title");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_status_updatedAt_idx" ON "KnowledgeDocument"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_documentId_ordinal_key" ON "KnowledgeChunk"("documentId", "ordinal");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageAttachment" ADD CONSTRAINT "ChatMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageAttachment" ADD CONSTRAINT "ChatMessageAttachment_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Retrieval indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "KnowledgeChunk_content_trgm_idx"
ON "KnowledgeChunk"
USING gin ("content" gin_trgm_ops);

