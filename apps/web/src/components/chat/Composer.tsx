import {
  ArrowUpOutlined,
  CloseOutlined,
  PaperClipOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";
import type { ChatAttachment } from "@health/shared";
import { Button, Input, Tooltip, Upload, message } from "antd";
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { deleteUpload, uploadFile } from "../../api/chat";
import type { SendChatInput } from "../../hooks/useChatStream";
import { formatFileSize, getAttachmentCardMeta } from "./attachmentMeta";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (input: SendChatInput) => void;
  onStop: () => void;
  streaming: boolean;
}) {
  const [ragEnabled, setRagEnabled] = useState(true);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [knowledgeUploads, setKnowledgeUploads] = useState<ChatAttachment[]>(
    [],
  );
  const [deletingKnowledgeId, setDeletingKnowledgeId] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const trimmedValue = value.trim();

  const send = () => {
    if (!trimmedValue || streaming || uploading) return;
    onSend({
      content: trimmedValue,
      attachments: [...knowledgeUploads, ...attachments],
      ragEnabled,
    });
    onChange("");
    setAttachments([]);
    setKnowledgeUploads([]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    send();
  };

  async function handleDeleteKnowledgeUpload(id: string) {
    if (streaming || deletingKnowledgeId) return;

    setDeletingKnowledgeId(id);
    try {
      await deleteUpload(id);
      setKnowledgeUploads((current) =>
        current.filter((item) => item.id !== id),
      );
      message.success("知识库文档已删除");
    } catch (deleteError) {
      message.error(
        deleteError instanceof Error
          ? deleteError.message
          : "删除知识库文档失败",
      );
    } finally {
      setDeletingKnowledgeId(undefined);
    }
  }

  return (
    <div className="chat-composer">
      {attachments.length ? (
        <div className="chat-attachments composer-attachments">
          {attachments.map((attachment) => (
            <span key={attachment.id} className="chat-attachment-chip">
              {attachment.mimeType.startsWith("image/") ? "图片" : "文件"}：
              {attachment.originalName}
              <button
                type="button"
                disabled={streaming}
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((item) => item.id !== attachment.id),
                  )
                }
              >
                删除
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="chat-composer-shell">
        <KnowledgeDocumentStrip
          uploads={knowledgeUploads}
          streaming={streaming}
          deletingId={deletingKnowledgeId}
          onDelete={handleDeleteKnowledgeUpload}
        />

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
              className={`chat-mode-pill ${ragEnabled ? "active" : "inactive"}`}
              type="button"
              onClick={() => setRagEnabled(!ragEnabled)}
              disabled={streaming}
              aria-pressed={ragEnabled}
              aria-label={`知识库检索${ragEnabled ? "已开启" : "已关闭"}`}
              title={`知识库检索${ragEnabled ? "已开启" : "已关闭"}`}
            >
              <span className="chat-mode-icon" aria-hidden="true">
                <SearchOutlined />
              </span>
              <span className="chat-mode-label">知识库检索</span>
              <span className="chat-mode-switch" aria-hidden="true">
                <span className="chat-mode-switch-thumb" />
              </span>
            </button>
          </div>

          <div className="chat-composer-actions">
            <Tooltip title="上传图片或资料">
              <Upload
                showUploadList={false}
                maxCount={1}
                accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.markdown,.json,.csv,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown,application/json,text/csv,image/*"
                beforeUpload={async (file) => {
                  setUploading(true);
                  const purpose = getUploadPurpose(file);
                  try {
                    const uploaded = await uploadFile(file, purpose);
                    if (uploaded.purpose === "knowledge_source") {
                      setKnowledgeUploads((current) => [
                        uploaded,
                        ...current.filter((item) => item.id !== uploaded.id),
                      ]);
                      message.success("资料已入库，可以直接提问");
                    } else {
                      setAttachments((current) =>
                        [...current, uploaded].slice(0, 6),
                      );
                      message.success("附件已上传，将随本轮消息发送");
                    }
                  } catch (uploadError) {
                    message.error(
                      uploadError instanceof Error
                        ? uploadError.message
                        : "上传失败",
                    );
                  } finally {
                    setUploading(false);
                  }
                  return Upload.LIST_IGNORE;
                }}
                disabled={streaming || uploading}
              >
                <Button
                  className="chat-upload-button"
                  icon={<PaperClipOutlined />}
                  loading={uploading}
                  disabled={streaming}
                  aria-label="上传附件"
                />
              </Upload>
            </Tooltip>

            {streaming ? (
              <Button
                className="chat-composer-action"
                danger
                icon={<StopOutlined />}
                onClick={onStop}
                aria-label="停止生成"
              />
            ) : (
              <Button
                className="chat-composer-action"
                type="primary"
                icon={<ArrowUpOutlined />}
                onClick={send}
                disabled={!trimmedValue || uploading}
                aria-label="发送"
              />
            )}
          </div>
        </div>
      </div>
      <div className="chat-safety-note">
        我可以陪你梳理情绪，但不能替代医生或心理咨询师；若有紧急危险，请立刻联系当地紧急服务或可信任的人。
      </div>
    </div>
  );
}

function KnowledgeDocumentStrip({
  uploads,
  streaming,
  deletingId,
  onDelete,
}: {
  uploads: ChatAttachment[];
  streaming: boolean;
  deletingId?: string;
  onDelete: (id: string) => void | Promise<void>;
}) {
  if (!uploads.length) return null;

  return (
    <div className="knowledge-document-strip" aria-label="知识库文档">
      {uploads.map((attachment) => {
        const meta = getAttachmentCardMeta(attachment);

        return (
          <article
            key={attachment.id}
            className="knowledge-document-card"
            title={attachment.originalName}
          >
            <span
              className={`knowledge-document-icon ${meta.tone}`}
              aria-hidden="true"
            >
              {meta.icon}
            </span>
            <span className="knowledge-document-copy">
              <strong>{attachment.originalName}</strong>
              <span>
                {meta.label} {formatFileSize(attachment.sizeBytes)}
                {attachment.pageCount ? ` · ${attachment.pageCount} 页` : ""}
                {attachment.chunkCount ? ` · ${attachment.chunkCount} 块` : ""}
                {attachment.parsingQualityScore !== undefined
                  ? ` · 质量 ${Math.round(attachment.parsingQualityScore * 100)}%`
                  : ""}
              </span>
            </span>
            <Tooltip title="删除知识库文档">
              <Button
                className="knowledge-document-delete"
                type="text"
                size="small"
                icon={<CloseOutlined />}
                loading={deletingId === attachment.id}
                disabled={streaming || Boolean(deletingId)}
                aria-label={`删除 ${attachment.originalName}`}
                onClick={() => void onDelete(attachment.id)}
              />
            </Tooltip>
          </article>
        );
      })}
    </div>
  );
}

function getUploadPurpose(file: File): "chat_attachment" | "knowledge_source" {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "chat_attachment";
  if (/\.(txt|md|markdown|csv|json|pdf|docx|xlsx|pptx)$/i.test(name))
    return "knowledge_source";
  if (
    [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ].includes(file.type)
  ) {
    return "knowledge_source";
  }
  return "chat_attachment";
}
