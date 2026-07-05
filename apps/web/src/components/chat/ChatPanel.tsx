import { BookOutlined, DeleteOutlined, MenuFoldOutlined, MenuUnfoldOutlined, PlusOutlined } from '@ant-design/icons';
import type { ChatAttachment } from '@health/shared';
import { Button, Empty, Popconfirm, Spin, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { deleteUpload, listUploads, type Conversation } from '../../api/chat';
import { useAuth } from '../../hooks/useAuth';
import { useChatStream } from '../../hooks/useChatStream';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

export function ChatPanel() {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const [knowledgeReloadKey, setKnowledgeReloadKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const {
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
  } = useChatStream();

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (warning) message.warning({ key: 'chat-warning', content: warning });
  }, [warning]);

  useEffect(() => {
    if (error) message.error({ key: 'chat-error', content: error });
  }, [error]);

  async function handleDeleteConversation(id: string) {
    try {
      await removeConversation(id);
      message.success('会话已删除');
    } catch {
      // useChatStream exposes the error; the toast above keeps this path quiet.
    }
  }

  function handleStartNewConversation() {
    startNewConversation();
    setDraft('');
  }

  return (
    <div className={sidebarCollapsed ? 'chat-layout chat-layout-sidebar-collapsed' : 'chat-layout'}>
      {sidebarCollapsed ? (
        <Button
          className="chat-sidebar-open-button"
          type="primary"
          shape="circle"
          icon={<MenuUnfoldOutlined />}
          aria-label="打开历史会话边栏"
          onClick={() => setSidebarCollapsed(false)}
        />
      ) : (
        <aside className="chat-sidebar">
          <Button className="chat-new-button" type="primary" icon={<PlusOutlined />} onClick={handleStartNewConversation} disabled={streaming}>
            新对话
          </Button>

          <div className="chat-sidebar-header">
            <Typography.Text strong>历史会话</Typography.Text>
            <Button
              className="chat-sidebar-collapse-button"
              type="text"
              shape="circle"
              icon={<MenuFoldOutlined />}
              aria-label="收起历史会话边栏"
              onClick={() => setSidebarCollapsed(true)}
            />
          </div>

          <div className="chat-thread-list" aria-label="历史会话">
            {loadingConversations ? (
              <div className="chat-sidebar-state">
                <Spin size="small" />
              </div>
            ) : conversations.length ? (
              conversations.map((conversation) => (
                <ThreadCard
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === conversationId}
                  disabled={streaming}
                  deleting={deletingConversationId === conversation.id}
                  onSelect={() => void selectConversation(conversation.id)}
                  onDelete={() => void handleDeleteConversation(conversation.id)}
                />
              ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史会话" />
            )}
          </div>

          <KnowledgeBasePanel reloadKey={knowledgeReloadKey} streaming={streaming} />
        </aside>
      )}

      <section className="chat-main">
        <MessageList
          messages={messages}
          loading={loadingMessages}
          userLabel={user?.displayName || user?.email.split('@')[0]}
          onPromptSelect={setDraft}
        />
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          onStop={stop}
          streaming={streaming}
          onKnowledgeUploaded={() => setKnowledgeReloadKey((value) => value + 1)}
        />
      </section>
    </div>
  );
}

function ThreadCard({
  conversation,
  active,
  disabled,
  deleting,
  onSelect,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  disabled: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const preview = conversation.messages?.[conversation.messages.length - 1]?.content || conversation.summary || '点击继续对话';

  return (
    <div
      className={active ? 'chat-thread-card active' : 'chat-thread-card'}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-current={active ? 'true' : undefined}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      onKeyDown={(event) => {
        if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onSelect();
      }}
    >
      <div className="chat-thread-copy">
        <Typography.Text strong>{conversation.title || '心理对话'}</Typography.Text>
        <Typography.Text type="secondary">{preview}</Typography.Text>
      </div>
      <span className="chat-thread-delete-wrap" onClick={(event) => event.stopPropagation()}>
        <Popconfirm
          title="删除这段历史会话？"
          description="删除后会话内容将无法恢复。"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={onDelete}
        >
          <Button
            className="chat-thread-delete"
            type="text"
            danger
            icon={<DeleteOutlined />}
            loading={deleting}
            disabled={disabled}
            aria-label="删除会话"
          />
        </Popconfirm>
      </span>
    </div>
  );
}

function KnowledgeBasePanel({ reloadKey, streaming }: { reloadKey: number; streaming: boolean }) {
  const [uploads, setUploads] = useState<ChatAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingUploadId, setDeletingUploadId] = useState<string>();

  useEffect(() => {
    let active = true;
    setLoading(true);

    listUploads('knowledge_source')
      .then((items) => {
        if (active) setUploads(items);
      })
      .catch((loadError) => {
        if (active) message.error(loadError instanceof Error ? loadError.message : '加载知识库文档失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function handleDeleteKnowledgeUpload(id: string) {
    if (streaming || deletingUploadId) return;

    setDeletingUploadId(id);
    try {
      await deleteUpload(id);
      setUploads((current) => current.filter((item) => item.id !== id));
      message.success('知识库文档已删除');
    } catch (deleteError) {
      message.error(deleteError instanceof Error ? deleteError.message : '删除知识库文档失败');
    } finally {
      setDeletingUploadId(undefined);
    }
  }

  return (
    <details className="chat-knowledge-panel">
      <summary>
        <span>
          <BookOutlined />
          知识库文档
        </span>
        <em>{loading ? '加载中' : `${uploads.length} 个`}</em>
      </summary>
      <div className="chat-knowledge-list">
        {loading ? (
          <Spin size="small" />
        ) : uploads.length ? (
          uploads.map((attachment) => (
            <span key={attachment.id} className="chat-attachment-chip knowledge-chip" title={attachment.originalName}>
              <span className="knowledge-chip-name">{attachment.originalName}</span>
              <Button
                aria-label={`删除 ${attachment.originalName}`}
                className="knowledge-chip-delete"
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                loading={deletingUploadId === attachment.id}
                disabled={streaming || Boolean(deletingUploadId)}
                onClick={() => void handleDeleteKnowledgeUpload(attachment.id)}
              />
            </span>
          ))
        ) : (
          <Typography.Text type="secondary">上传文档后会显示在这里。</Typography.Text>
        )}
      </div>
    </details>
  );
}
