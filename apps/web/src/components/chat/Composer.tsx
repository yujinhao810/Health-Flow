import { DeleteOutlined, PaperClipOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import type { ChatAttachment } from '@health/shared';
import { Button, Input, Switch, Upload, message } from 'antd';
import type { KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';
import { deleteUpload, listUploads, uploadFile } from '../../api/chat';
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
  const [knowledgeUploads, setKnowledgeUploads] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [deletingUploadId, setDeletingUploadId] = useState<string>();
  const trimmedValue = value.trim();

  useEffect(() => {
    let active = true;
    setLoadingKnowledge(true);

    listUploads('knowledge_source')
      .then((uploads) => {
        if (active) setKnowledgeUploads(uploads);
      })
      .catch((error) => {
        if (active) message.error(error instanceof Error ? error.message : '加载知识库文档失败');
      })
      .finally(() => {
        if (active) setLoadingKnowledge(false);
      });

    return () => {
      active = false;
    };
  }, []);

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

  const handleDeleteKnowledgeUpload = async (id: string) => {
    if (streaming || deletingUploadId) return;

    setDeletingUploadId(id);
    try {
      await deleteUpload(id);
      setKnowledgeUploads((current) => current.filter((item) => item.id !== id));
      message.success('知识库文档已删除');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除知识库文档失败');
    } finally {
      setDeletingUploadId(undefined);
    }
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
      {knowledgeUploads.length || loadingKnowledge ? (
        <div className="chat-attachments composer-knowledge" aria-label="知识库文档">
          {loadingKnowledge ? <span className="composer-knowledge-hint">正在加载知识库文档...</span> : null}
          {knowledgeUploads.map((attachment) => (
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
          accept=".pdf,.doc,.docx,.txt,.md,.markdown,.json,.csv,.png,.jpg,.jpeg,.webp,.gif,.bmp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/json,text/csv,image/*"
          beforeUpload={async (file) => {
            setUploading(true);
            const purpose = getUploadPurpose(file);
            try {
              const uploaded = await uploadFile(file, purpose);
              if (uploaded.purpose === 'knowledge_source') {
                setKnowledgeUploads((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
                message.success('资料已入库，可以直接提问');
              } else {
                setAttachments((current) => [...current, uploaded].slice(0, 6));
                message.success('附件已上传，将随本轮消息发送');
              }
            } catch (error) {
              message.error(error instanceof Error ? error.message : '上传失败');
            } finally {
              setUploading(false);
            }
            return Upload.LIST_IGNORE;
          }}
          disabled={streaming || uploading}
        >
          <Button icon={<PaperClipOutlined />} loading={uploading} disabled={streaming}>
            上传
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
