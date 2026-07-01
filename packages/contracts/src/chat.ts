import { z } from 'zod';

export const createThreadSchema = z.object({
  title: z.string().min(1).max(120).optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(8000),
  attachmentIds: z.array(z.string().uuid()).max(6).optional(),
  ragEnabled: z.boolean().optional(),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  purpose: 'chat_attachment' | 'knowledge_source';
  status: 'pending' | 'ready' | 'failed';
  documentId?: string;
  chunkCount?: number;
  hasExtractedText?: boolean;
  contentUrl?: string;
  createdAt: string;
};

export type RagCitation = {
  chunkId: string;
  documentId: string;
  title: string;
  source?: string;
  sourceUrl?: string;
  excerpt: string;
  score: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  metadata?: unknown;
};

export type StreamEvent =
  | { type: 'conversation_started'; conversationId: string; messageId: string }
  | { type: 'retrieval_started'; query: string }
  | { type: 'retrieval_done'; citations: RagCitation[] }
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_done'; messageId: string; fullText: string }
  | { type: 'usage'; provider: string; model: string; inputTokens?: number; outputTokens?: number }
  | { type: 'warning'; message: string }
  | { type: 'agent_step'; message: string }
  | { type: 'tool_call'; id: string; name: string; title?: string; inputPreview?: string }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; summary?: string }
  | { type: 'plan_generated'; title: string; timeframe: string }
  | { type: 'error'; message: string };
