import { PaperClipOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import type { ChatAttachment } from '@health/shared';
import { Button, Input, Switch, Upload, message } from 'antd';
import type { KeyboardEvent } from 'react';
import { useState } from 'react';
import { uploadFile } from '../../api/chat';
import type { SendChatInput } from '../../hooks/useChatStream';

export function Composer({
  onSend,
  onStop,
  streaming,
}: {
  onSend: (input: SendChatInput) => void;
  onStop: () => void;
  streaming: boolean;
}) {
  const [value, setValue] = useState('');
  const [ragEnabled, setRagEnabled] = useState(true);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const trimmedValue = value.trim();

  const send = () => {
    if (!trimmedValue || streaming || uploading) return;
    onSend({ content: trimmedValue, attachments, ragEnabled });
    setValue('');
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
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="chat-rag-toggle">
        <span>本轮使用知识库</span>
        <Switch size="small" checked={ragEnabled} onChange={setRagEnabled} disabled={streaming} />
      </div>
      <div className="chat-composer-shell">
        <Upload
          showUploadList={false}
          maxCount={1}
          beforeUpload={async (file) => {
            setUploading(true);
            try {
              const uploaded = await uploadFile(file);
              setAttachments((current) => [...current, uploaded].slice(0, 6));
              message.success('附件已上传');
            } catch (error) {
              message.error(error instanceof Error ? error.message : '附件上传失败');
            } finally {
              setUploading(false);
            }
            return Upload.LIST_IGNORE;
          }}
          disabled={streaming || uploading || attachments.length >= 6}
        >
          <Button icon={<PaperClipOutlined />} loading={uploading} disabled={streaming || attachments.length >= 6}>
            附件
          </Button>
        </Upload>
        <Input.TextArea
          className="chat-composer-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          autoSize={{ minRows: 2, maxRows: 4 }}
          disabled={streaming}
          placeholder="说说你今天的状态，或问我最近健康记录有什么变化..."
        />
        {streaming ? (
          <Button className="chat-composer-action" danger icon={<StopOutlined />} onClick={onStop}>
            停止
          </Button>
        ) : (
          <Button className="chat-composer-action" type="primary" icon={<SendOutlined />} onClick={send} disabled={!trimmedValue || uploading}>
            发送
          </Button>
        )}
      </div>
    </div>
  );
}
