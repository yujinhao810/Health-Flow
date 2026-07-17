import { extname } from "node:path";
import type { DetectedFileType } from "./parsed-document.types";

const OOXML_MARKERS = [
  {
    marker: "word/document.xml",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
  },
  {
    marker: "xl/workbook.xml",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: ".xlsx",
  },
  {
    marker: "ppt/presentation.xml",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extension: ".pptx",
  },
] as const;

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

export function detectFileType(
  buffer: Buffer,
  filename: string,
  declaredMimeType?: string,
): DetectedFileType {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { mimeType: "application/pdf", extension: ".pdf", category: "pdf" };
  }
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: "image/png", extension: ".png", category: "image" };
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mimeType: "image/jpeg", extension: ".jpg", category: "image" };
  }
  if (["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    return { mimeType: "image/gif", extension: ".gif", category: "image" };
  }
  if (buffer.subarray(0, 2).toString("ascii") === "BM") {
    return { mimeType: "image/bmp", extension: ".bmp", category: "image" };
  }
  if (isTiff(buffer)) {
    return { mimeType: "image/tiff", extension: ".tiff", category: "image" };
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: ".webp", category: "image" };
  }
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    for (const type of OOXML_MARKERS) {
      if (buffer.includes(Buffer.from(type.marker))) {
        return {
          mimeType: type.mimeType,
          extension: type.extension,
          category: "office",
        };
      }
    }
  }

  const extension = extname(filename).toLowerCase();
  if (
    looksLikeText(buffer) &&
    (TEXT_MIME_TYPES.has(declaredMimeType ?? "") ||
      /\.(txt|md|markdown|csv|json)$/i.test(extension))
  ) {
    const mimeType =
      extension === ".json"
        ? "application/json"
        : extension === ".csv"
          ? "text/csv"
          : extension === ".md" || extension === ".markdown"
            ? "text/markdown"
            : "text/plain";
    return { mimeType, extension: extension || ".txt", category: "text" };
  }
  return {
    mimeType: "application/octet-stream",
    extension,
    category: "unknown",
  };
}

function startsWith(buffer: Buffer, signature: number[]) {
  return signature.every((byte, index) => buffer[index] === byte);
}

function isTiff(buffer: Buffer) {
  return (
    startsWith(buffer, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(buffer, [0x4d, 0x4d, 0x00, 0x2a])
  );
}

function looksLikeText(buffer: Buffer) {
  const sample = buffer.subarray(0, 8192);
  if (!sample.length || sample.includes(0)) return false;
  let controls = 0;
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) controls += 1;
  }
  return controls / sample.length < 0.03;
}
