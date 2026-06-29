import { Alert, Button, Card, List, Popconfirm, Space, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useEffect } from 'react';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { useChatStream } from '../../hooks/useChatStream';

export function ChatPanel() {
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

  async function handleDeleteConversation(id: string) {
    try {
      await removeConversation(id);
      message.success('会话已删除');
    } catch (deleteError) {
      message.error(deleteError instanceof Error ? deleteError.message : '删除失败，请稍后重试');
    }
  }

  return (
    <Card
      title="心理对话助手"
      extra={
        <Button icon={<PlusOutlined />} onClick={startNewConversation} disabled={streaming}>
          新对话
        </Button>
      }
    >
      <Alert
        type="info"
        showIcon
        message="本助手不能替代医生或心理咨询师。如有紧急危险，请立即联系当地紧急服务或可信任的人。"
        style={{ marginBottom: 16 }}
      />
      {warning ? <Alert type="warning" showIcon message={warning} style={{ marginBottom: 16 }} /> : null}
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}

      <div className="chat-layout">
        <aside className="chat-sidebar">
          <Space className="chat-sidebar-header">
            <Typography.Text strong>历史会话</Typography.Text>
          </Space>
          <List
            size="small"
            loading={loadingConversations}
            dataSource={conversations}
            locale={{ emptyText: '暂无历史会话' }}
            renderItem={(conversation) => (
              <List.Item
                className={conversation.id === conversationId ? 'chat-thread active' : 'chat-thread'}
                actions={[
                  <span key="delete" onClick={(event) => event.stopPropagation()}>
                    <Popconfirm
                      title="删除这段历史会话？"
                      description="删除后会话内容将无法恢复。"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handleDeleteConversation(conversation.id)}
                    >
                      <Button
                        className="chat-thread-delete"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        loading={deletingConversationId === conversation.id}
                        disabled={streaming}
                        aria-label="删除会话"
                      />
                    </Popconfirm>
                  </span>,
                ]}
                onClick={() => {
                  if (!streaming) void selectConversation(conversation.id);
                }}
              >
                <List.Item.Meta
                  title={conversation.title || '心理对话'}
                  description={conversation.messages?.[conversation.messages.length - 1]?.content || '点击继续对话'}
                />
              </List.Item>
            )}
          />
        </aside>

        <section className="chat-main">
          <MessageList messages={messages} loading={loadingMessages} />
          <Composer onSend={send} onStop={stop} streaming={streaming} />
        </section>
      </div>
    </Card>
  );
}
