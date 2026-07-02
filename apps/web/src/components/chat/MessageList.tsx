import { HeartOutlined } from '@ant-design/icons';
import { Image, Spin, Typography } from 'antd';
import type { AnchorHTMLAttributes, CSSProperties, TableHTMLAttributes } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { withAuthToken } from '../../api/client';
import type { UiMessage } from '../../hooks/useChatStream';

const bottomThreshold = 24;
const starterPrompts = [
  { label: '压力', text: '最近压力有点大，想和你一起理一理。' },
  { label: '睡眠', text: '我最近睡眠不太稳定，可以帮我看看怎么调整吗？' },
  { label: '情绪', text: '今天情绪有点乱，我想先把它说清楚。' },
];

const markdownComponents = {
  a: ({ node: _node, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => <a {...props} target="_blank" rel="noreferrer" />,
  table: ({ node: _node, ...props }: TableHTMLAttributes<HTMLTableElement> & { node?: unknown }) => (
    <div className="chat-markdown-table-wrap">
      <table {...props} />
    </div>
  ),
};

export function MessageList({
  messages,
  loading,
  userLabel,
  onPromptSelect,
}: {
  messages: UiMessage[];
  loading?: boolean;
  userLabel?: string;
  onPromptSelect?: (prompt: string) => void;
}) {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const updateStickiness = useCallback(() => {
    const element = windowRef.current;
    if (!element) return;

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom <= bottomThreshold;
  }, []);

  useLayoutEffect(() => {
    const element = windowRef.current;
    if (!element || !shouldStickToBottomRef.current) return;

    element.scrollTop = element.scrollHeight;
  }, [messages]);

  if (loading) {
    return (
      <div ref={windowRef} className="chat-window chat-window-centered" onScroll={updateStickiness}>
        <Spin tip="正在加载对话..." />
      </div>
    );
  }

  if (!messages.length) {
    return (
      <div ref={windowRef} className="chat-window chat-window-centered" onScroll={updateStickiness}>
        <div className="orb-empty" aria-label="呼吸光球空状态">
          <div className="orb-aura" aria-hidden="true" />
          <div className="orb-rings" aria-hidden="true">
            <span className="orb-ring" />
            <span className="orb-ring orb-ring-reverse" />
          </div>
          <div className="orb-core" aria-hidden="true">
            <span className="orb-highlight" />
            <span className="orb-inner-glow" />
          </div>
          <div className="orb-reflection" aria-hidden="true" />
          <div className="orb-particles" aria-hidden="true">
            <span className="orb-particle" style={{ '--px': '-68px', '--py': '-42px', '--duration': '9s' } as CSSProperties} />
            <span className="orb-particle" style={{ '--px': '56px', '--py': '-58px', '--duration': '11s' } as CSSProperties} />
            <span className="orb-particle" style={{ '--px': '72px', '--py': '24px', '--duration': '7.5s' } as CSSProperties} />
            <span className="orb-particle" style={{ '--px': '-50px', '--py': '46px', '--duration': '10s' } as CSSProperties} />
          </div>
          <div className="orb-empty-copy">
            <Typography.Title level={4}>先把心里的重量放下来</Typography.Title>
            <Typography.Text>可以从最近的压力、情绪或困扰开始聊起，我会陪你慢慢梳理出清晰的一步。</Typography.Text>
            <div className="orb-prompts" aria-label="对话开场建议">
              {starterPrompts.map((prompt) => (
                <button key={prompt.label} type="button" onClick={() => onPromptSelect?.(prompt.text)}>
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={windowRef} className="chat-window" onScroll={updateStickiness}>
      {messages.map((message) => {
        const citationSources = getCitationSources(message.citations);

        return (
          <div key={message.id} className={`chat-message ${message.role} ${message.status ?? ''}`}>
            {message.role === 'assistant' ? (
              <div className="chat-message-avatar assistant" aria-hidden="true">
                <HeartOutlined />
              </div>
            ) : null}
            <div className="chat-message-stack">
              <div className="chat-bubble">
                <MessageMarkdown content={message.content || (message.status === 'streaming' ? '正在回应...' : '')} />
                {message.status === 'stopped' ? <span className="chat-status"> 已停止生成</span> : null}
                {message.ragStatus === 'searching' ? <div className="chat-rag-status">正在检索健康安全知识库...</div> : null}
                {message.attachments?.length ? (
                  <div className="chat-attachments">
                    {message.attachments.map((attachment) => {
                      const contentUrl = attachment.contentUrl ? withAuthToken(attachment.contentUrl) : undefined;

                      if (contentUrl && attachment.mimeType.startsWith('image/')) {
                        return (
                          <Image
                            key={attachment.id}
                            className="chat-image-thumb"
                            src={contentUrl}
                            alt={attachment.originalName}
                            preview={{ mask: '预览图片' }}
                          />
                        );
                      }

                      if (contentUrl) {
                        return (
                          <a key={attachment.id} href={contentUrl} target="_blank" rel="noreferrer" className="chat-attachment-chip">
                            {attachment.purpose === 'knowledge_source' ? '资料' : '文件'}：{attachment.originalName}
                          </a>
                        );
                      }

                      return (
                        <span key={attachment.id} className="chat-attachment-chip">
                          {attachment.purpose === 'knowledge_source' ? '资料' : '文件'}：{attachment.originalName}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {citationSources.length ? (
                  <div className="chat-citations">
                    <div className="chat-citations-title">参考来源</div>
                    {citationSources.map((citation) => (
                      <div key={citation.key} className="chat-citation-item">
                        <strong>{citation.title}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            {message.role === 'user' ? (
              <div className="chat-message-avatar user" aria-label={userLabel || '我'}>
                {getInitial(userLabel)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MessageMarkdown({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div className="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function getInitial(value?: string) {
  return (value || '我').trim().slice(0, 1).toUpperCase();
}

function getCitationSources(citations: UiMessage['citations']) {
  const seen = new Set<string>();
  return (citations ?? [])
    .map((citation) => ({
      key: citation.documentId || citation.chunkId,
      title: citation.title || citation.source || '知识库文档',
    }))
    .filter((citation) => {
      if (seen.has(citation.key)) return false;
      seen.add(citation.key);
      return true;
    });
}
