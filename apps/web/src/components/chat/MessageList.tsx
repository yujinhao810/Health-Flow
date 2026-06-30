import { Spin, Typography } from 'antd';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { withAuthToken } from '../../api/client';
import type { UiMessage } from '../../hooks/useChatStream';

const bottomThreshold = 24;
const sunflowerPetals = Array.from({ length: 16 });

export function MessageList({ messages, loading }: { messages: UiMessage[]; loading?: boolean }) {
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
        <div className="sunflower-empty" aria-label="会动的向日葵">
          <div className="sunflower-sky" />
          <div className="sunflower-bloom">
            <div className="sunflower-petals">
              {sunflowerPetals.map((_, index) => (
                <span key={index} className="sunflower-petal" />
              ))}
            </div>
            <div className="sunflower-face">
              <span className="sunflower-eye left" />
              <span className="sunflower-eye right" />
              <span className="sunflower-smile" />
            </div>
          </div>
          <div className="sunflower-stem">
            <span className="sunflower-leaf left" />
            <span className="sunflower-leaf right" />
          </div>
          <Typography.Text className="sunflower-empty-text">
            可以从最近的压力、情绪或困扰开始聊起，我会像向日葵一样温暖地陪你梳理。
          </Typography.Text>
        </div>
      </div>
    );
  }

  return (
    <div ref={windowRef} className="chat-window" onScroll={updateStickiness}>
      {messages.map((message) => (
        <div key={message.id} className={`chat-message ${message.role} ${message.status ?? ''}`}>
          <div className="chat-role">{message.role === 'user' ? '我' : '心理助手'}</div>
          <div className="chat-bubble">
            {message.content || (message.status === 'streaming' ? '正在回应...' : '')}
            {message.status === 'stopped' ? <span className="chat-status"> 已停止生成</span> : null}
            {message.ragStatus === 'searching' ? <div className="chat-rag-status">正在检索健康安全知识库...</div> : null}
            {message.attachments?.length ? (
              <div className="chat-attachments">
                {message.attachments.map((attachment) => {
                  const contentUrl = attachment.contentUrl ? withAuthToken(attachment.contentUrl) : undefined;

                  if (contentUrl && attachment.mimeType.startsWith('image/')) {
                    return (
                      <a key={attachment.id} href={contentUrl} target="_blank" rel="noreferrer" className="chat-image-link">
                        <img className="chat-image-thumb" src={contentUrl} alt={attachment.originalName} />
                      </a>
                    );
                  }

                  if (contentUrl) {
                    return (
                      <a key={attachment.id} href={contentUrl} target="_blank" rel="noreferrer" className="chat-attachment-chip">
                        文件：{attachment.originalName}
                      </a>
                    );
                  }

                  return (
                    <span key={attachment.id} className="chat-attachment-chip">
                      文件：{attachment.originalName}
                    </span>
                  );
                })}
              </div>
            ) : null}
            {message.citations?.length ? (
              <div className="chat-citations">
                <div className="chat-citations-title">参考来源</div>
                {message.citations.map((citation) => (
                  <div key={citation.chunkId} className="chat-citation-item">
                    <strong>{citation.title}</strong>
                    {citation.source ? <span> · {citation.source}</span> : null}
                    <p>{citation.excerpt}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
