import {
  FileExcelOutlined,
  FileImageOutlined,
  FileMarkdownOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileWordOutlined,
} from "@ant-design/icons";
import type { ChatAttachment } from "@health/shared";

export function getAttachmentCardMeta(attachment: ChatAttachment) {
  const name = attachment.originalName.toLowerCase();
  const mimeType = attachment.mimeType.toLowerCase();
  const extension = name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "";

  if (
    extension === "md" ||
    extension === "markdown" ||
    mimeType.includes("markdown")
  ) {
    return { label: "MD", tone: "markdown", icon: <FileMarkdownOutlined /> };
  }
  if (
    ["csv", "xls", "xlsx"].includes(extension) ||
    mimeType.includes("spreadsheet")
  ) {
    return {
      label: extension === "csv" ? "CSV" : "XLSX",
      tone: "sheet",
      icon: <FileExcelOutlined />,
    };
  }
  if (
    ["ppt", "pptx"].includes(extension) ||
    mimeType.includes("presentation")
  ) {
    return { label: "PPTX", tone: "word", icon: <FilePptOutlined /> };
  }
  if (extension === "json" || mimeType.includes("json"))
    return { label: "JSON", tone: "code", icon: <FileTextOutlined /> };
  if (extension === "pdf" || mimeType.includes("pdf"))
    return { label: "PDF", tone: "pdf", icon: <FilePdfOutlined /> };
  if (["doc", "docx"].includes(extension) || mimeType.includes("word"))
    return {
      label: extension === "doc" ? "DOC" : "DOCX",
      tone: "word",
      icon: <FileWordOutlined />,
    };
  if (mimeType.startsWith("image/"))
    return {
      label: extension.toUpperCase() || "IMG",
      tone: "image",
      icon: <FileImageOutlined />,
    };
  if (extension === "txt" || mimeType.startsWith("text/"))
    return { label: "TXT", tone: "text", icon: <FileTextOutlined /> };

  return {
    label: extension.toUpperCase() || "FILE",
    tone: "file",
    icon: <FileOutlined />,
  };
}

export function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes}B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(2)}KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(2)}MB`;
}
