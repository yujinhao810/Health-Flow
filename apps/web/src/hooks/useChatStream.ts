import type { ChatAttachment, ChatMessage, RagCitation } from '@health/shared';
import { useCallback, useRef, useState } from 'react';
import { createConversation, deleteConversation, getConversation, listConversations, streamConversation, type Conversation } from '../api/chat';

export type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'streaming' | 'error' | 'stopped';
  attachments?: ChatAttachment[];
  citations?: RagCitation[];
  ragStatus?: 'searching' | 'done' | 'off';
};

export type SendChatInput = {
  content: string;
  attachments?: ChatAttachment[];
  ragEnabled?: boolean;
};

function toUiMessage(message: ChatMessage): UiMessage | null {
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  const metadata = message.metadata as { rag?: { citations?: RagCitation[]; enabled?: boolean } } | undefined;
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: message.attachments,
    citations: metadata?.rag?.citations,
    ragStatus: metadata?.rag?.enabled === false ? 'off' : metadata?.rag?.citations?.length ? 'done' : undefined,
  };
}

function toUiMessages(messages?: ChatMessage[]) {
  return (messages ?? []).map(toUiMessage).filter((message): message is UiMessage => Boolean(message));
}

function buildConversationTitle(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '心理对话';
  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
}

export function useChatStream() {
  const [conversationId, setConversationId] = useState<string>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    setError(undefined);
    try {
      const threads = await listConversations();
      setConversations(threads);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载会话列表失败');
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setStreaming(false);
    setLoadingMessages(true);
    setConversationId(id);
    setWarning(undefined);
    setError(undefined);

    try {
      const thread = await getConversation(id);
      setMessages(toUiMessages(thread.messages));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载会话失败');
    } finally {
      setLoadingMessages(false);
      abortRef.current = null;
    }
  }, []);

  const startNewConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setConversationId(undefined);
    setMessages([]);
    setStreaming(false);
    setWarning(undefined);
    setError(undefined);
  }, []);

  const removeConversation = useCallback(
    async (id: string) => {
      if (streaming) return;

      setDeletingConversationId(id);
      setError(undefined);
      try {
        await deleteConversation(id);
        setConversations((current) => current.filter((conversation) => conversation.id !== id));

        if (conversationId === id) {
          abortRef.current?.abort();
          abortRef.current = null;
          setConversationId(undefined);
          setMessages([]);
          setWarning(undefined);
          setStreaming(false);
        }
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : '删除会话失败');
        throw deleteError;
      } finally {
        setDeletingConversationId(undefined);
      }
    },
    [conversationId, streaming],
  );

  async function send(input: SendChatInput) {
    if (streaming) return;

    const content = input.content.trim();
    if (!content) return;

    setWarning(undefined);
    setError(undefined);

    const thread = conversationId ? undefined : await createConversation(buildConversationTitle(content));
    const threadId = conversationId ?? thread?.id;
    if (!threadId) return;

    setConversationId(threadId);
    if (thread) setConversations((current) => [thread, ...current]);

    const streamingId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content, attachments: input.attachments },
      { id: streamingId, role: 'assistant', content: '', status: 'streaming', ragStatus: input.ragEnabled === false ? 'off' : undefined },
    ]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamConversation(
        threadId,
        { content, attachmentIds: input.attachments?.map((attachment) => attachment.id), ragEnabled: input.ragEnabled },
        {
          onRetrievalStarted: () => {
            setMessages((current) => current.map((message) => (message.id === streamingId ? { ...message, ragStatus: 'searching' } : message)));
          },
          onRetrievalDone: (event) => {
            setMessages((current) =>
              current.map((message) => (message.id === streamingId ? { ...message, citations: event.citations, ragStatus: 'done' } : message)),
            );
          },
          onDelta: (text) => {
            setMessages((current) =>
              current.map((message) => (message.id === streamingId ? { ...message, content: message.content + text, status: 'streaming' } : message)),
            );
          },
          onWarning: (message) => {
            setWarning(message);
          },
          onDone: (fullText) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === streamingId
                  ? { ...message, content: message.content || fullText || '我在这里陪着你。', status: undefined }
                  : message,
              ),
            );
            setStreaming(false);
            abortRef.current = null;
            void loadConversations();
          },
          onError: (streamError) => {
            setError(streamError.message);
            setMessages((current) =>
              current.map((message) =>
                message.id === streamingId ? { ...message, content: `出错了：${streamError.message}`, status: 'error' } : message,
              ),
            );
            setStreaming(false);
            abortRef.current = null;
          },
        },
        controller.signal,
      );
    } catch (sendError) {
      if (controller.signal.aborted) return;
      const message = sendError instanceof Error ? sendError.message : '未知错误';
      setError(message);
      setMessages((current) =>
        current.map((item) => (item.id === streamingId ? { ...item, content: `出错了：${message}`, status: 'error' } : item)),
      );
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setMessages((current) =>
      current.map((message, index) => {
        const isLastMessage = index === current.length - 1;
        if (!isLastMessage || message.role !== 'assistant' || message.status !== 'streaming') return message;
        return { ...message, content: message.content || '已停止生成。', status: 'stopped' };
      }),
    );
    setStreaming(false);
    abortRef.current = null;
  }

  return {
    conversationId,
    conversations,
    messages,
    streaming,
    loadingConversations,
    loadingMessages,
    deletingConversationId,
    warning,
    error,
    loadConversations,
    selectConversation,
    startNewConversation,
    removeConversation,
    send,
    stop,
  };
}
