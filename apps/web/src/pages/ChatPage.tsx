import { Typography } from 'antd';
import { ChatPanel } from '../components/chat/ChatPanel';

export function ChatPage() {
  return (
    <>
      <div className="page-intro">
        <Typography.Title level={2}>心理对话助手</Typography.Title>
        <Typography.Paragraph type="secondary">
          在安全边界内整理情绪与困扰，必要时请及时寻求专业帮助。
        </Typography.Paragraph>
      </div>
      <ChatPanel />
    </>
  );
}
