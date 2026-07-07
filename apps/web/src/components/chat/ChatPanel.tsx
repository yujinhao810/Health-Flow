import { DeleteOutlined, MessageOutlined, MenuFoldOutlined, MenuUnfoldOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Popconfirm, Spin, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import type { Conversation } from '../../api/chat';
import { useAuth } from '../../hooks/useAuth';
import { useChatStream } from '../../hooks/useChatStream';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

export function ChatPanel() {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
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
            <span className="chat-sidebar-title">
              <MessageOutlined />
              <Typography.Text strong>历史会话</Typography.Text>
            </span>
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
      <span className="chat-thread-icon" aria-hidden="true">
        <MessageOutlined />
      </span>
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
