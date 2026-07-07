import { HeartOutlined } from '@ant-design/icons';
import { Image, Spin, Typography } from 'antd';
import type { AnchorHTMLAttributes, CSSProperties, TableHTMLAttributes } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { withAuthToken } from '../../api/client';
import type { UiMessage } from '../../hooks/useChatStream';
import { formatFileSize, getAttachmentCardMeta } from './attachmentMeta';

const bottomThreshold = 24;
const citationUseThreshold = 7;
const maxVisibleCitations = 3;
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
      {messages.map((message, index) => {
        const displayContent = stripInlineCitationLines(message.content);
        const renderedContent = displayContent || (message.status === 'streaming' ? '正在回应...' : '');
        const excludedCitations = message.role === 'assistant' ? getPreviousUserKnowledgeCitationRefs(messages, index) : undefined;
        const citationSources = getUsedCitationSources(message.citations, message.content, displayContent, excludedCitations);

        return (
          <div key={message.id} className={`chat-message ${message.role} ${message.status ?? ''}`}>
            {message.role === 'assistant' ? (
              <div className="chat-message-avatar assistant" aria-hidden="true">
                <HeartOutlined />
              </div>
            ) : null}
            <div className="chat-message-stack">
              {message.attachments?.length ? <MessageAttachmentStrip attachments={message.attachments} /> : null}
              <div className="chat-bubble">
                <MessageMarkdown content={renderedContent} />
                {message.status === 'stopped' ? <span className="chat-status"> 已停止生成</span> : null}
                {message.ragStatus === 'searching' ? <div className="chat-rag-status">正在检索健康安全知识库...</div> : null}
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

function MessageAttachmentStrip({ attachments }: { attachments: NonNullable<UiMessage['attachments']> }) {
  return (
    <div className="message-attachment-strip" aria-label="消息附件">
      {attachments.map((attachment) => {
        const contentUrl = attachment.contentUrl ? withAuthToken(attachment.contentUrl) : undefined;

        if (contentUrl && attachment.mimeType.startsWith('image/')) {
          return (
            <a key={attachment.id} className="message-image-attachment" href={contentUrl} target="_blank" rel="noreferrer" title={attachment.originalName}>
              <Image className="chat-image-thumb" src={contentUrl} alt={attachment.originalName} preview={{ mask: '预览图片' }} />
            </a>
          );
        }

        return <MessageDocumentCard key={attachment.id} attachment={attachment} contentUrl={contentUrl} />;
      })}
    </div>
  );
}

function MessageDocumentCard({ attachment, contentUrl }: { attachment: NonNullable<UiMessage['attachments']>[number]; contentUrl?: string }) {
  const meta = getAttachmentCardMeta(attachment);
  const content = (
    <>
      <span className={`knowledge-document-icon ${meta.tone}`} aria-hidden="true">
        {meta.icon}
      </span>
      <span className="knowledge-document-copy">
        <strong>{attachment.originalName}</strong>
        <span>
          {meta.label} {formatFileSize(attachment.sizeBytes)}
        </span>
      </span>
    </>
  );

  if (contentUrl) {
    return (
      <a className="knowledge-document-card message-document-card" href={contentUrl} target="_blank" rel="noreferrer" title={attachment.originalName}>
        {content}
      </a>
    );
  }

  return (
    <article className="knowledge-document-card message-document-card" title={attachment.originalName}>
      {content}
    </article>
  );
}

function MessageMarkdown({ content }: { content: string }) {
  const displayContent = stripInlineCitationLines(content);
  if (!displayContent) return null;
  return (
    <div className="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {displayContent}
      </ReactMarkdown>
    </div>
  );
}

function getInitial(value?: string) {
  return (value || '我').trim().slice(0, 1).toUpperCase();
}

function getPreviousUserKnowledgeCitationRefs(messages: UiMessage[], index: number) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (message.role !== 'user') continue;

    const attachments = (message.attachments ?? []).filter((attachment) => attachment.purpose === 'knowledge_source');
    return {
      documentIds: new Set(attachments.map((attachment) => attachment.documentId).filter((value): value is string => Boolean(value))),
      identities: new Set(attachments.flatMap((attachment) => citationNameIdentities(attachment.originalName))),
    };
  }

  return undefined;
}

function stripInlineCitationLines(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => !inlineCitationLinePattern.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type ExcludedCitationRefs = { documentIds: Set<string>; identities: Set<string> };

function getUsedCitationSources(citations: UiMessage['citations'], rawContent: string, displayContent: string, excludedRefs?: ExcludedCitationRefs) {
  const explicitSources = getExplicitCitationSources(citations, extractInlineCitationReferences(rawContent), excludedRefs);
  if (explicitSources.length) return explicitSources;

  const answer = normalizeCitationText(displayContent);
  const byDocument = new Map<string, { key: string; title: string; score: number; retrievalScore: number }>();

  for (const citation of citations ?? []) {
    if (isExcludedCitation(citation, excludedRefs)) continue;
    const key = citationDisplayKey(citation);
    const current = {
      key,
      title: citation.title || citation.source || '知识库文档',
      score: citationRelevance(citation, answer),
      retrievalScore: citation.score,
    };
    const existing = byDocument.get(key);
    if (!existing || current.score > existing.score || (current.score === existing.score && current.retrievalScore > existing.retrievalScore)) {
      byDocument.set(key, current);
    }
  }

  return [...byDocument.values()]
    .filter((citation) => citation.score >= citationUseThreshold)
    .sort((left, right) => right.score - left.score || right.retrievalScore - left.retrievalScore)
    .slice(0, maxVisibleCitations)
    .map(({ key, title }) => ({ key, title }));
}

function extractInlineCitationReferences(content: string) {
  const references = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const match = line.trim().match(inlineCitationReferencePattern);
    if (!match?.[1]) continue;

    for (const item of match[1].split(/[、,，;；]+/)) {
      const reference = normalizeCitationText(item.replace(/^[\s"'“”‘’()[\]（）【】]+|[\s"'“”‘’()[\]（）【】.。]+$/g, ''));
      if (reference && !emptyCitationReferenceTerms.has(reference)) references.add(reference);
    }
  }

  return [...references];
}

function getExplicitCitationSources(citations: UiMessage['citations'], references: string[], excludedRefs?: ExcludedCitationRefs) {
  if (!references.length) return [];

  const byDocument = new Map<string, { key: string; title: string; score: number; retrievalScore: number }>();
  for (const citation of citations ?? []) {
    if (isExcludedCitation(citation, excludedRefs)) continue;
    const score = explicitCitationScore(citation, references);
    if (!score) continue;

    const key = citationDisplayKey(citation);
    const current = {
      key,
      title: citation.title || citation.source || '知识库文档',
      score,
      retrievalScore: citation.score,
    };
    const existing = byDocument.get(key);
    if (!existing || current.score > existing.score || (current.score === existing.score && current.retrievalScore > existing.retrievalScore)) {
      byDocument.set(key, current);
    }
  }

  return [...byDocument.values()]
    .sort((left, right) => right.score - left.score || right.retrievalScore - left.retrievalScore)
    .slice(0, maxVisibleCitations)
    .map(({ key, title }) => ({ key, title }));
}

function explicitCitationScore(citation: NonNullable<UiMessage['citations']>[number], references: string[]) {
  const identities = citationIdentityTerms(citation);
  let score = 0;

  for (const reference of references) {
    if (identities.some((identity) => identity.includes(reference) || reference.includes(identity))) {
      score = Math.max(score, reference.length);
    }
  }

  return score;
}

function isExcludedCitation(citation: NonNullable<UiMessage['citations']>[number], excludedRefs?: ExcludedCitationRefs) {
  if (!excludedRefs) return false;
  if (excludedRefs.documentIds.has(citation.documentId)) return true;
  return citationIdentityTerms(citation).some((identity) => excludedRefs.identities.has(identity));
}

function citationDisplayKey(citation: NonNullable<UiMessage['citations']>[number]) {
  return citationNameIdentities(citation.title || citation.source || '')[0] || citation.documentId || citation.chunkId;
}

function citationIdentityTerms(citation: NonNullable<UiMessage['citations']>[number]) {
  const identities = new Set<string>();

  for (const value of [citation.title, citation.source, citation.sourceUrl].filter((item): item is string => Boolean(item))) {
    citationNameIdentities(value).forEach((identity) => {
      if (identity.length >= 2) identities.add(identity);
    });
  }

  return [...identities];
}

function citationNameIdentities(value: string) {
  const normalized = normalizeCitationText(value);
  const filename = normalized.split(/[\\/]/).at(-1) ?? normalized;
  const stem = filename.replace(/\.(md|csv|txt|pdf|docx?|xlsx?)$/i, '');
  return [...new Set([normalized, filename, stem].filter((identity) => identity.length >= 2))];
}

function citationRelevance(citation: NonNullable<UiMessage['citations']>[number], normalizedAnswer: string) {
  if (!normalizedAnswer) return 0;
  const citationText = normalizeCitationText([citation.title, citation.source, citation.excerpt].filter(Boolean).join(' '));
  let hasStrongHit = false;
  const score = extractEvidenceTerms(normalizedAnswer).reduce((total, term) => {
    if (!citationText.includes(term.value)) return total;
    if (term.weight >= 3) hasStrongHit = true;
    return total + term.weight;
  }, 0);

  return hasStrongHit ? score : Math.min(score, citationUseThreshold - 0.1);
}

function normalizeCitationText(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractEvidenceTerms(text: string) {
  const terms = new Map<string, number>();
  const add = (value: string, weight: number) => {
    const normalized = value.trim().toLowerCase();
    if (normalized.length < 2) return;
    terms.set(normalized, Math.max(terms.get(normalized) ?? 0, weight));
  };

  for (const match of text.matchAll(/[a-z0-9][a-z0-9_.:%+-]{1,}/giu)) {
    const value = match[0];
    add(value, /\d/.test(value) ? 6 : 2);
  }

  for (const value of importantCitationTerms) {
    if (text.includes(value)) add(value, 3);
  }

  const cjkChars = text.match(/[\u4e00-\u9fff]/gu) ?? [];
  for (let size = 4; size >= 3; size -= 1) {
    for (let index = 0; index <= cjkChars.length - size; index += 1) {
      const value = cjkChars.slice(index, index + size).join('');
      if (!citationStopTerms.has(value)) add(value, size === 4 ? 1.6 : 1.1);
    }
  }

  return [...terms.entries()].map(([value, weight]) => ({ value, weight }));
}

const inlineCitationLinePattern = /^\s*(?:[-*]\s*)?(参考|参考来源|参考资料|来源)\s*[:：]/;
const inlineCitationReferencePattern = /^\s*(?:[-*]\s*)?(?:参考|参考来源|参考资料|来源)\s*[:：]\s*(.+)$/;

const emptyCitationReferenceTerms = new Set(['无', '暂无', '没有', 'none', 'n/a']);

const importantCitationTerms = [
  '青岚',
  '午睡',
  '补觉',
  '夜醒',
  '灯光',
  '卧室',
  '雾灯',
  '入睡',
  '起床',
  '睡前',
  '咖啡',
  '咖啡因',
  '浓茶',
  '能量饮料',
  '血糖',
  '空腹血糖',
  '铁蛋白',
  '疲劳',
  '缺铁',
  '红线桩',
  '红线',
  '自伤',
  '危机',
  '紧急服务',
  '药物',
  '剂量',
  '停药',
  '加药',
  '药师',
  '医生',
];

const citationStopTerms = new Set(['建议', '可以', '如果', '资料', '文档', '参考', '健康', '安全', '根据', '关于', '具体', '如下', '用户', '需要', '这个', '那个']);
