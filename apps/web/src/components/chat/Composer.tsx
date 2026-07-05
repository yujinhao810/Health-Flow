import { ArrowUpOutlined, PaperClipOutlined, SearchOutlined, StopOutlined } from '@ant-design/icons';
import type { ChatAttachment } from '@health/shared';
import { Button, Input, Tooltip, Upload, message } from 'antd';
import type { KeyboardEvent } from 'react';
import { useState } from 'react';
import { uploadFile } from '../../api/chat';
import type { SendChatInput } from '../../hooks/useChatStream';

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  onKnowledgeUploaded,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (input: SendChatInput) => void;
  onStop: () => void;
  streaming: boolean;
  onKnowledgeUploaded?: () => void;
}) {
  const [ragEnabled, setRagEnabled] = useState(true);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const trimmedValue = value.trim();

  const send = () => {
    if (!trimmedValue || streaming || uploading) return;
    onSend({ content: trimmedValue, attachments, ragEnabled });
    onChange('');
    setAttachments([]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    send();
  };

  return (
    <div className="chat-composer">
      {attachments.length ? (
        <div className="chat-attachments composer-attachments">
          {attachments.map((attachment) => (
            <span key={attachment.id} className="chat-attachment-chip">
              {attachment.mimeType.startsWith('image/') ? '图片' : '文件'}：{attachment.originalName}
              <button type="button" disabled={streaming} onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}>
                删除
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="chat-composer-shell">
        <Input.TextArea
          className="chat-composer-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          autoSize={{ minRows: 2, maxRows: 4 }}
          disabled={streaming}
          placeholder="给 HealthFlow 发送消息..."
        />

        <div className="chat-composer-toolbar">
          <div className="chat-composer-modes">
            <button
              className={`chat-mode-pill ${ragEnabled ? 'active' : ''}`}
              type="button"
              onClick={() => setRagEnabled(!ragEnabled)}
              disabled={streaming}
              aria-pressed={ragEnabled}
            >
              <SearchOutlined />
              <span>知识库检索</span>
            </button>
          </div>

          <div className="chat-composer-actions">
            <Tooltip title="上传图片或资料">
              <Upload
                showUploadList={false}
                maxCount={1}
                accept=".pdf,.doc,.docx,.txt,.md,.markdown,.json,.csv,.png,.jpg,.jpeg,.webp,.gif,.bmp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/json,text/csv,image/*"
                beforeUpload={async (file) => {
                  setUploading(true);
                  const purpose = getUploadPurpose(file);
                  try {
                    const uploaded = await uploadFile(file, purpose);
                    if (uploaded.purpose === 'knowledge_source') {
                      onKnowledgeUploaded?.();
                      message.success('资料已入库，可以直接提问');
                    } else {
                      setAttachments((current) => [...current, uploaded].slice(0, 6));
                      message.success('附件已上传，将随本轮消息发送');
                    }
                  } catch (uploadError) {
                    message.error(uploadError instanceof Error ? uploadError.message : '上传失败');
                  } finally {
                    setUploading(false);
                  }
                  return Upload.LIST_IGNORE;
                }}
                disabled={streaming || uploading}
              >
                <Button className="chat-upload-button" icon={<PaperClipOutlined />} loading={uploading} disabled={streaming} aria-label="上传附件" />
              </Upload>
            </Tooltip>

            {streaming ? (
              <Button className="chat-composer-action" danger icon={<StopOutlined />} onClick={onStop} aria-label="停止生成" />
            ) : (
              <Button className="chat-composer-action" type="primary" icon={<ArrowUpOutlined />} onClick={send} disabled={!trimmedValue || uploading} aria-label="发送" />
            )}
          </div>
        </div>
      </div>
      <div className="chat-safety-note">我可以陪你梳理情绪，但不能替代医生或心理咨询师；若有紧急危险，请立刻联系当地紧急服务或可信任的人。</div>
    </div>
  );
}

function getUploadPurpose(file: File): 'chat_attachment' | 'knowledge_source' {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return 'chat_attachment';
  if (/\.(txt|md|markdown|csv|json|pdf|docx)$/i.test(name)) return 'knowledge_source';
  if (
    [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ].includes(file.type)
  ) {
    return 'knowledge_source';
  }
  return 'chat_attachment';
}
