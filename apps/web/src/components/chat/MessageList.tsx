import { Image, Spin, Typography } from 'antd';
import type { CSSProperties } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { withAuthToken } from '../../api/client';
import type { UiMessage } from '../../hooks/useChatStream';

const bottomThreshold = 24;
const sunflowerPetals = Array.from({ length: 24 });
const orbitDots = Array.from({ length: 6 });

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
        <div className="sunflower-empty" aria-label="温暖的向日葵空状态">
          <div className="sunflower-aura" />
          <div className="sunflower-orbit" aria-hidden="true">
            {orbitDots.map((_, index) => (
              <span key={index} />
            ))}
          </div>
          <div className="sunflower-bloom" aria-hidden="true">
            <div className="sunflower-petals">
              {sunflowerPetals.map((_, index) => (
                <span
                  key={index}
                  className="sunflower-petal"
                  style={{ '--petal-index': index, '--petal-scale': 0.9 + (index % 3) * 0.05 } as CSSProperties}
                />
              ))}
            </div>
            <div className="sunflower-core">
              <span className="sunflower-core-glass" />
              <span className="sunflower-core-shine" />
            </div>
          </div>
          <div className="sunflower-stem" aria-hidden="true">
            <span className="sunflower-leaf left" />
            <span className="sunflower-leaf right" />
          </div>
          <div className="sunflower-empty-copy">
            <Typography.Title level={4}>先把心里的重量放下来</Typography.Title>
            <Typography.Text>可以从最近的压力、情绪或困扰开始聊起，我会陪你慢慢梳理出清晰的一步。</Typography.Text>
            <div className="sunflower-prompts" aria-hidden="true">
              <span>压力</span>
              <span>睡眠</span>
              <span>情绪</span>
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
        );
      })}
    </div>
  );
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
