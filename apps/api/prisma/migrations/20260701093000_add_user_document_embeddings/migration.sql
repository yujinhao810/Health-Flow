-- User-uploaded document RAG metadata and stored chunk embeddings.
ALTER TABLE "KnowledgeDocument" ADD COLUMN "userId" TEXT;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "uploadedFileId" TEXT;
ALTER TABLE "KnowledgeChunk" ADD COLUMN "embedding" JSONB;
ALTER TABLE "KnowledgeChunk" ADD COLUMN "embeddingModel" TEXT;

CREATE UNIQUE INDEX "KnowledgeDocument_uploadedFileId_key" ON "KnowledgeDocument"("uploadedFileId");
CREATE INDEX "KnowledgeDocument_userId_status_updatedAt_idx" ON "KnowledgeDocument"("userId", "status", "updatedAt");
CREATE INDEX "KnowledgeDocument_uploadedFileId_idx" ON "KnowledgeDocument"("uploadedFileId");

ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
