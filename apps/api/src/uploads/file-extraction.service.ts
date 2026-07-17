import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { detectFileType } from "./file-type-detector";
import {
  parsedDocumentSchema,
  type DetectedFileType,
  type ParsedDocument,
} from "./parsed-document.types";

@Injectable()
export class FileExtractionService {
  constructor(private readonly config: ConfigService) {}

  detect(buffer: Buffer, filename: string, declaredMimeType?: string) {
    return detectFileType(buffer, filename, declaredMimeType);
  }

  async extract(
    buffer: Buffer,
    filename: string,
    declaredMimeType?: string,
    signal?: AbortSignal,
  ): Promise<ParsedDocument> {
    const detected = this.detect(buffer, filename, declaredMimeType);
    if (detected.category === "unknown") {
      throw new BadRequestException(
        "无法识别这个文件的真实类型，或当前解析服务暂不支持该格式",
      );
    }

    const parserUrl =
      this.config.get<string>("DOCUMENT_PARSER_URL") ?? "http://127.0.0.1:8090";
    const timeoutMs =
      this.config.get<number>("DOCUMENT_PARSER_TIMEOUT_MS") ?? 180_000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: detected.mimeType }),
      filename,
    );
    form.append("declaredMimeType", declaredMimeType ?? detected.mimeType);

    try {
      const response = await fetch(`${parserUrl.replace(/\/$/, "")}/v1/parse`, {
        method: "POST",
        body: form,
        signal: combinedSignal,
      });
      if (!response.ok) {
        const detail = await response.text();
        if ([400, 415, 422].includes(response.status)) {
          throw new BadRequestException(`文件解析失败：${detail}`);
        }
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }
      const payload = await response.json();
      const parsed = parsedDocumentSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(
          `解析服务返回格式不正确：${parsed.error.issues[0]?.message ?? "unknown schema error"}`,
        );
      }
      assertDetectedTypeMatches(parsed.data, detected);
      return parsed.data;
    } catch (error) {
      if (detected.category === "text" && allowTextFallback(this.config)) {
        return buildTextFallback(buffer, filename, detected, error);
      }
      if (detected.category === "pdf" && allowPdfFallback(this.config)) {
        return extractPdfLocally(buffer, filename, detected, error);
      }
      if (error instanceof BadRequestException) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(`文档解析服务暂不可用：${detail}`);
    }
  }
}

function assertDetectedTypeMatches(
  document: ParsedDocument,
  detected: DetectedFileType,
) {
  if (document.detectedMimeType !== detected.mimeType) {
    throw new BadRequestException(
      `文件类型校验不一致：本地识别为 ${detected.mimeType}，解析服务识别为 ${document.detectedMimeType}`,
    );
  }
}

function allowTextFallback(config: ConfigService) {
  return (
    (
      config.get<string>("DOCUMENT_PARSER_ALLOW_TEXT_FALLBACK") ?? "true"
    ).toLowerCase() !== "false"
  );
}

function allowPdfFallback(config: ConfigService) {
  return (
    (
      config.get<string>("DOCUMENT_PARSER_ALLOW_PDF_FALLBACK") ?? "true"
    ).toLowerCase() !== "false"
  );
}

type PdfTextItem = {
  str: string;
  hasEOL?: boolean;
  width?: number;
  height?: number;
  transform?: number[];
};

type PdfDocumentLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: Array<PdfTextItem | object> }>;
    getViewport(options: { scale: number }): { width: number; height: number };
  }>;
  destroy?: () => Promise<void>;
};

type PdfJsModule = {
  version?: string;
  getDocument(options: {
    data: Uint8Array;
    useSystemFonts: boolean;
    isEvalSupported: boolean;
  }): { promise: Promise<PdfDocumentLike> };
};

const importEsmModule = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<PdfJsModule>;

export async function extractPdfLocally(
  buffer: Buffer,
  filename: string,
  detected: DetectedFileType,
  parserError: unknown,
): Promise<ParsedDocument> {
  let pdf: PdfDocumentLike | undefined;
  try {
    const pdfjs = await importEsmModule("pdfjs-dist/legacy/build/pdf.mjs");
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;

    const pages: ParsedDocument["pages"] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const pageText = reconstructPdfText(
        content.items.filter(isPdfTextItem),
      ).trim();
      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        blocks: pageText
          ? pageText
              .split(/\n\s*\n|\n/)
              .map((text) => text.trim())
              .filter(Boolean)
              .map((text, index) => ({
                id: `p${pageNumber}-b${index + 1}`,
                type: "paragraph" as const,
                text,
              }))
          : [],
      });
    }

    const text = pages
      .map((page) => page.blocks.map((block) => block.text).join("\n"))
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (!text) {
      throw new BadRequestException(
        "该 PDF 没有可读取的文本层，可能是扫描件或图片型 PDF；请启动 Docling + PaddleOCR 解析服务后重试",
      );
    }

    const populatedPages = pages.filter(
      (page) => page.blocks.length > 0,
    ).length;
    const pageCoverage = populatedPages / Math.max(pages.length, 1);
    const garbledRatio = calculateGarbledRatio(text);
    const score = clamp(0.58 + pageCoverage * 0.22 + (1 - garbledRatio) * 0.12);
    return {
      parser: "pdfjs-fallback",
      parserVersion: pdfjs.version ?? "unknown",
      detectedMimeType: detected.mimeType,
      title: filename,
      language: "zh-CN",
      text,
      pages,
      quality: {
        score,
        textCoverage: pageCoverage,
        garbledRatio,
        pageCoverage,
        layoutCompleteness: 0.62,
        tableCompleteness: 0.35,
      },
      warnings: [
        `Docling/PaddleOCR 服务不可用，已使用 PDF.js 读取原生文本层：${formatError(parserError)}`,
        "PDF.js 回退不执行 OCR，复杂表格和多栏版式可能需要解析服务才能完整还原",
      ],
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new ServiceUnavailableException(
      `PDF 本地文本解析失败：${formatError(error)}；扫描件需要 Docling + PaddleOCR 解析服务`,
    );
  } finally {
    if (typeof pdf?.destroy === "function") {
      await pdf.destroy().catch(() => undefined);
    }
  }
}

function isPdfTextItem(item: PdfTextItem | object): item is PdfTextItem {
  return "str" in item && typeof (item as PdfTextItem).str === "string";
}

function reconstructPdfText(items: PdfTextItem[]) {
  const lines: string[] = [];
  let line = "";
  let previous: PdfTextItem | undefined;

  for (const item of items) {
    const value = item.str.trim();
    if (!value) continue;
    const startsNewLine =
      previous !== undefined &&
      (previous.hasEOL === true || isDifferentPdfLine(previous, item));
    if (startsNewLine && line.trim()) {
      lines.push(line.trim());
      line = "";
    }
    line += `${needsPdfWordSpace(previous, item, line) ? " " : ""}${value}`;
    previous = item;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

function isDifferentPdfLine(previous: PdfTextItem, current: PdfTextItem) {
  const previousY = previous.transform?.[5];
  const currentY = current.transform?.[5];
  if (previousY === undefined || currentY === undefined) return false;
  return (
    Math.abs(previousY - currentY) > Math.max(previous.height ?? 0, 2) * 0.5
  );
}

function needsPdfWordSpace(
  previous: PdfTextItem | undefined,
  current: PdfTextItem,
  line: string,
) {
  if (
    !previous ||
    !line ||
    /\s$/.test(line) ||
    /^[,.;:!?，。；：！？、）\]}]/.test(current.str)
  ) {
    return false;
  }
  const previousX = previous.transform?.[4];
  const currentX = current.transform?.[4];
  if (
    previousX === undefined ||
    currentX === undefined ||
    previous.width === undefined
  ) {
    return (
      /[\p{L}\p{N}]$/u.test(previous.str) && /^[\p{L}\p{N}]/u.test(current.str)
    );
  }
  const gap = currentX - (previousX + previous.width);
  return gap > Math.max((previous.height ?? 10) * 0.12, 1);
}

function calculateGarbledRatio(text: string) {
  const broken =
    text.match(/�|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g)?.length ?? 0;
  return clamp(broken / Math.max(text.length, 1));
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildTextFallback(
  buffer: Buffer,
  filename: string,
  detected: DetectedFileType,
  error: unknown,
): ParsedDocument {
  const text = decodeText(buffer)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 500_000);
  if (!text)
    throw new BadRequestException("这个文件没有提取到可用于检索的文本内容");
  const warning = `外部解析服务不可用，使用本地纯文本回退：${error instanceof Error ? error.message : String(error)}`;
  return {
    parser: "node-text-fallback",
    parserVersion: "1",
    detectedMimeType: detected.mimeType,
    title: filename,
    language: "zh-CN",
    text,
    pages: [
      {
        pageNumber: 1,
        blocks: text
          .split(/\n\s*\n/)
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value, index) => ({
            id: `p1-b${index + 1}`,
            type: "paragraph" as const,
            text: value,
          })),
      },
    ],
    quality: {
      score: 0.72,
      textCoverage: 0.9,
      garbledRatio: text.includes("�")
        ? text.split("�").length / Math.max(text.length, 1)
        : 0,
      pageCoverage: 1,
      layoutCompleteness: 0.45,
      tableCompleteness: 0.5,
    },
    warnings: [warning],
  };
}

function decodeText(buffer: Buffer) {
  const candidates = [
    new TextDecoder("utf-8").decode(buffer),
    new TextDecoder("gb18030").decode(buffer),
    buffer.toString("latin1"),
  ];
  return (
    candidates.sort(
      (left, right) => readability(right) - readability(left),
    )[0] ?? ""
  );
}

function readability(value: string) {
  const useful =
    value.match(
      /[\p{L}\p{N}\u4e00-\u9fff，。！？、；：“”‘’（）《》【】,.!?;:'"()[\]\s/%+\-]/gu,
    )?.length ?? 0;
  const broken = value.match(/�|[\u00c0-\u00ff]/g)?.length ?? 0;
  return (useful - broken * 2) / Math.max(value.length, 1);
}
