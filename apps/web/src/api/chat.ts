import type { ChatAttachment, ChatMessage, CreateThreadInput, SendMessageInput, StreamEvent } from '@health/shared';
import { API_BASE_URL, api, authHeaders, clearAuthToken } from './client';

export type Conversation = {
  id: string;
  title?: string;
  summary?: string;
  createdAt?: string;
  updatedAt?: string;
  messages?: ChatMessage[];
};

export type DeleteConversationResult = {
  id: string;
  deleted: true;
};

export function createConversation(title?: string) {
  const input: CreateThreadInput = { title };
  return api<Conversation>('/conversations', { method: 'POST', body: JSON.stringify(input) });
}

export function listConversations() {
  return api<Conversation[]>('/conversations');
}

export function getConversation(conversationId: string) {
  return api<Conversation>(`/conversations/${conversationId}`);
}

export function deleteConversation(conversationId: string) {
  return api<DeleteConversationResult>(`/conversations/${conversationId}`, { method: 'DELETE' });
}

export async function uploadFile(file: File, purpose: 'chat_attachment' | 'knowledge_source' = 'chat_attachment') {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', purpose);

  const response = await fetch(`${API_BASE_URL}/uploads`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  if (!response.ok) {
    if (response.status === 401) clearAuthToken();
    throw new Error(await response.text());
  }

  return response.json() as Promise<ChatAttachment>;
}

export async function streamConversation(
  conversationId: string,
  input: SendMessageInput,
  handlers: {
    onDelta: (text: string) => void;
    onWarning?: (message: string) => void;
    onRetrievalStarted?: (event: Extract<StreamEvent, { type: 'retrieval_started' }>) => void;
    onRetrievalDone?: (event: Extract<StreamEvent, { type: 'retrieval_done' }>) => void;
    onToolCall?: (event: Extract<StreamEvent, { type: 'tool_call' }>) => void;
    onToolResult?: (event: Extract<StreamEvent, { type: 'tool_result' }>) => void;
    onPlanGenerated?: (event: Extract<StreamEvent, { type: 'plan_generated' }>) => void;
    onDone?: (fullText?: string) => void;
    onError?: (error: Error) => void;
  },
  signal?: AbortSignal,
) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok || !response.body) {
    if (response.status === 401) clearAuthToken();
    throw new Error(await response.text());
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneNotified = false;

  const handleEvent = (raw: string) => {
    const dataLine = raw.split('\n').find((line) => line.startsWith('data: '));
    if (!dataLine) return;

    let data: StreamEvent;
    try {
      data = JSON.parse(dataLine.slice(6)) as StreamEvent;
    } catch {
      handlers.onError?.(new Error('解析服务器响应失败'));
      return;
    }

    if (data.type === 'assistant_delta') handlers.onDelta(data.text);
    if (data.type === 'retrieval_started') handlers.onRetrievalStarted?.(data);
    if (data.type === 'retrieval_done') handlers.onRetrievalDone?.(data);
    if (data.type === 'warning') handlers.onWarning?.(data.message);
    if (data.type === 'agent_step') handlers.onWarning?.(data.message);
    if (data.type === 'tool_call') handlers.onToolCall?.(data);
    if (data.type === 'tool_result') handlers.onToolResult?.(data);
    if (data.type === 'plan_generated') handlers.onPlanGenerated?.(data);
    if (data.type === 'assistant_done' && !doneNotified) {
      doneNotified = true;
      handlers.onDone?.(data.fullText);
    }
    if (data.type === 'error') handlers.onError?.(new Error(data.message));
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const raw of events) handleEvent(raw);
  }

  if (buffer.trim()) handleEvent(buffer);
}
