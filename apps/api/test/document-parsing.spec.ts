import assert from "node:assert/strict";
import test from "node:test";
import { splitParsedDocument } from "../src/knowledge/semantic-document-chunker";
import { assertDocumentQuality } from "../src/uploads/document-quality-gate";
import { extractPdfLocally } from "../src/uploads/file-extraction.service";
import { detectFileType } from "../src/uploads/file-type-detector";
import type { ParsedDocument } from "../src/uploads/parsed-document.types";

test("magic bytes override misleading file extensions", () => {
  const pdf = detectFileType(
    Buffer.from("%PDF-1.7\ncontent"),
    "report.txt",
    "text/plain",
  );
  assert.equal(pdf.mimeType, "application/pdf");
  assert.equal(pdf.category, "pdf");

  const fakeDocx = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from("word/document.xml"),
  ]);
  const docx = detectFileType(fakeDocx, "upload.zip", "application/zip");
  assert.equal(
    docx.mimeType,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
});

test("PDF.js fallback extracts a text PDF when the parser service is offline", async () => {
  const document = await extractPdfLocally(
    createPdf("HealthFlow PDF fallback"),
    "report.pdf",
    {
      mimeType: "application/pdf",
      extension: ".pdf",
      category: "pdf",
    },
    new Error("connect ECONNREFUSED 127.0.0.1:8090"),
  );

  assert.equal(document.parser, "pdfjs-fallback");
  assert.equal(document.pages.length, 1);
  assert.match(document.text, /HealthFlow PDF fallback/);
  assert.equal(document.quality.pageCoverage, 1);
});

test("PDF.js fallback identifies PDFs without a readable text layer", async () => {
  await assert.rejects(
    extractPdfLocally(
      createPdf(),
      "scan.pdf",
      {
        mimeType: "application/pdf",
        extension: ".pdf",
        category: "pdf",
      },
      new Error("parser offline"),
    ),
    /扫描件或图片型 PDF.*Docling \+ PaddleOCR/,
  );
});

test("quality gate rejects low coverage and garbled parsing", () => {
  const document = parsedDocument({
    score: 0.42,
    textCoverage: 0.4,
    garbledRatio: 0.2,
    pageCoverage: 0.25,
    layoutCompleteness: 0.5,
    tableCompleteness: 1,
  });
  assert.throws(() => assertDocumentQuality(document, 0.55), /解析质量未通过/);
});

test("semantic chunking preserves headings, pages and tables", () => {
  const document = parsedDocument(
    {
      score: 0.95,
      textCoverage: 0.98,
      garbledRatio: 0,
      pageCoverage: 1,
      layoutCompleteness: 0.9,
      tableCompleteness: 1,
    },
    [
      {
        pageNumber: 1,
        blocks: [
          { id: "h1", type: "heading", text: "血常规报告", level: 1 },
          { id: "p1", type: "paragraph", text: "本次检查结果如下。" },
          {
            id: "t1",
            type: "table",
            text: "| 项目 | 结果 |\n|---|---|\n| 白细胞 | 6.2 |",
          },
        ],
      },
      {
        pageNumber: 2,
        blocks: [
          { id: "p2", type: "paragraph", text: "建议结合临床情况评估。" },
        ],
      },
    ],
  );
  const chunks = splitParsedDocument(document, {
    maxChars: 500,
    overlapChars: 0,
  });
  assert.ok(
    chunks.some(
      (chunk) => chunk.contentType === "table" && chunk.pageStart === 1,
    ),
  );
  assert.ok(chunks.every((chunk) => chunk.headingPath.includes("血常规报告")));
  assert.ok(chunks.some((chunk) => chunk.pageEnd === 2));
});

function parsedDocument(
  quality: ParsedDocument["quality"],
  pages?: ParsedDocument["pages"],
): ParsedDocument {
  const resolvedPages =
    pages ??
    ([
      {
        pageNumber: 1,
        blocks: [{ id: "p1", type: "paragraph", text: "可读文本" }],
      },
    ] satisfies ParsedDocument["pages"]);
  return {
    parser: "test",
    parserVersion: "1",
    detectedMimeType: "text/plain",
    title: "test.txt",
    language: "zh-CN",
    text: resolvedPages
      .flatMap((page) => page.blocks.map((block) => block.text))
      .join("\n"),
    pages: resolvedPages,
    quality,
    warnings: [],
  };
}

function createPdf(text?: string) {
  const content = text
    ? `BT\n/F1 18 Tf\n72 720 Td\n(${escapePdfString(text)}) Tj\nET`
    : "q\nQ";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ].join("\n");
  return Buffer.from(`${body}${xref}\n`, "latin1");
}

function escapePdfString(value: string) {
  return value.replace(/([\\()])/g, "\\$1");
}
