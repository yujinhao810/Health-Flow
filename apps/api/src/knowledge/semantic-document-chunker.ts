import type {
  ParsedBlock,
  ParsedDocument,
} from "../uploads/parsed-document.types";

export type SemanticDocumentChunk = {
  ordinal: number;
  content: string;
  pageStart: number;
  pageEnd: number;
  contentType: ParsedBlock["type"] | "mixed";
  headingPath: string[];
  blockIds: string[];
  confidence?: number;
};

const DEFAULT_MAX_CHARS = 1800;
const DEFAULT_OVERLAP_CHARS = 180;

export function splitParsedDocument(
  document: ParsedDocument,
  options?: { maxChars?: number; overlapChars?: number },
): SemanticDocumentChunk[] {
  const maxChars = Math.max(options?.maxChars ?? DEFAULT_MAX_CHARS, 500);
  const overlapChars = Math.min(
    Math.max(options?.overlapChars ?? DEFAULT_OVERLAP_CHARS, 0),
    Math.floor(maxChars / 4),
  );
  const chunks: SemanticDocumentChunk[] = [];
  const headings: string[] = [];
  let pending: PendingChunk | undefined;

  const flush = (preserveOverlap = false) => {
    if (!pending?.parts.length) return;
    const body = pending.parts.join("\n\n").trim();
    const prefix = pending.headingPath.length
      ? `${pending.headingPath.join(" > ")}\n\n`
      : "";
    const confidenceValues = pending.confidences.filter(
      (value): value is number => value !== undefined,
    );
    chunks.push({
      ordinal: chunks.length + 1,
      content: `${prefix}${body}`.trim(),
      pageStart: pending.pageStart,
      pageEnd: pending.pageEnd,
      contentType: pending.types.size === 1 ? [...pending.types][0] : "mixed",
      headingPath: pending.headingPath,
      blockIds: pending.blockIds,
      confidence: confidenceValues.length
        ? confidenceValues.reduce((sum, value) => sum + value, 0) /
          confidenceValues.length
        : undefined,
    });
    const overlap =
      preserveOverlap && overlapChars && pending.types.has("paragraph")
        ? tail(body, overlapChars)
        : "";
    pending = overlap
      ? {
          parts: [overlap],
          pageStart: pending.pageEnd,
          pageEnd: pending.pageEnd,
          headingPath: [...pending.headingPath],
          blockIds: [],
          types: new Set(["paragraph"]),
          confidences: [],
        }
      : undefined;
  };

  for (const page of [...document.pages].sort(
    (left, right) => left.pageNumber - right.pageNumber,
  )) {
    for (const block of page.blocks) {
      const text = block.text.replace(/\s+\n/g, "\n").trim();
      if (!text) continue;
      if (block.type === "heading") {
        flush(false);
        const level = Math.max(1, block.level ?? 1);
        headings.splice(level - 1);
        headings[level - 1] = text;
        continue;
      }
      if (block.type === "table") {
        flush(false);
        for (const tablePart of splitTable(text, maxChars)) {
          chunks.push({
            ordinal: chunks.length + 1,
            content: headings.length
              ? `${headings.join(" > ")}\n\n${tablePart}`
              : tablePart,
            pageStart: page.pageNumber,
            pageEnd: page.pageNumber,
            contentType: "table",
            headingPath: [...headings],
            blockIds: [block.id],
            confidence: block.confidence ?? undefined,
          });
        }
        continue;
      }

      const projectedLength =
        (pending?.parts.join("\n\n").length ?? 0) + text.length + 2;
      if (pending && projectedLength > maxChars) flush(true);
      if (pending && !sameHeading(pending.headingPath, headings)) flush(false);
      pending ??= {
        parts: [],
        pageStart: page.pageNumber,
        pageEnd: page.pageNumber,
        headingPath: [...headings],
        blockIds: [],
        types: new Set(),
        confidences: [],
      };
      pending.parts.push(text);
      pending.pageEnd = page.pageNumber;
      pending.blockIds.push(block.id);
      pending.types.add(block.type);
      pending.confidences.push(block.confidence ?? undefined);
    }
  }
  flush(false);

  return chunks
    .filter((chunk) => chunk.content.trim().length > 0)
    .map((chunk, index) => ({ ...chunk, ordinal: index + 1 }));
}

type PendingChunk = {
  parts: string[];
  pageStart: number;
  pageEnd: number;
  headingPath: string[];
  blockIds: string[];
  types: Set<ParsedBlock["type"]>;
  confidences: Array<number | undefined>;
};

function splitTable(text: string, maxChars: number) {
  if (text.length <= maxChars) return [text];
  const lines = text.split("\n");
  const header =
    lines.length >= 2 && /\|/.test(lines[0]) ? lines.slice(0, 2) : [];
  const body = header.length ? lines.slice(2) : lines;
  const parts: string[] = [];
  let current = [...header];
  for (const line of body) {
    if (
      current.length > header.length &&
      [...current, line].join("\n").length > maxChars
    ) {
      parts.push(current.join("\n"));
      current = [...header];
    }
    current.push(line);
  }
  if (current.length) parts.push(current.join("\n"));
  return parts;
}

function sameHeading(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function tail(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  const value = text.slice(-maxChars);
  const boundary = Math.max(
    value.indexOf("。"),
    value.indexOf("."),
    value.indexOf("\n"),
  );
  return boundary > 20 ? value.slice(boundary + 1).trim() : value.trim();
}
