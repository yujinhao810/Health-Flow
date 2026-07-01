export type TextChunk = {
  ordinal: number;
  content: string;
  startChar: number;
  endChar: number;
};

const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 180;
const MIN_CHUNK_CHARS = 80;

export function splitTextIntoChunks(text: string, options?: { maxChars?: number; overlapChars?: number }): TextChunk[] {
  const maxChars = Math.max(options?.maxChars ?? DEFAULT_MAX_CHARS, 300);
  const overlapChars = Math.min(Math.max(options?.overlapChars ?? DEFAULT_OVERLAP_CHARS, 0), Math.floor(maxChars / 3));
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const pieces = splitIntoPieces(normalized, maxChars);
  const chunks: TextChunk[] = [];
  let current = '';
  let currentStart = 0;
  let cursor = 0;

  for (const piece of pieces) {
    const separator = current ? '\n\n' : '';
    if (current && current.length + separator.length + piece.length > maxChars) {
      const content = current.trim();
      chunks.push({ ordinal: chunks.length + 1, content, startChar: currentStart, endChar: currentStart + content.length });
      const overlap = overlapChars ? tailText(content, overlapChars) : '';
      current = overlap ? `${overlap}\n\n${piece}` : piece;
      currentStart = Math.max(cursor - overlap.length, 0);
    } else {
      if (!current) currentStart = cursor;
      current = `${current}${separator}${piece}`;
    }

    cursor += piece.length + 2;
  }

  const last = current.trim();
  if (last.length >= MIN_CHUNK_CHARS || !chunks.length) {
    chunks.push({ ordinal: chunks.length + 1, content: last, startChar: currentStart, endChar: currentStart + last.length });
  }

  return chunks.filter((chunk) => chunk.content.trim().length > 0);
}

export function inferKeywords(text: string, maxKeywords = 12) {
  const candidates = text.match(/[\p{L}\p{N}]{2,}|[\u4e00-\u9fff]{2,4}/gu) ?? [];
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (normalized.length < 2 || STOP_WORDS.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, maxKeywords)
    .map(([keyword]) => keyword);
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function splitIntoPieces(text: string, maxChars: number) {
  return text
    .split(/\n\s*\n/g)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .flatMap((piece) => splitLongPiece(piece, maxChars));
}

function splitLongPiece(piece: string, maxChars: number) {
  if (piece.length <= maxChars) return [piece];

  const result: string[] = [];
  for (let start = 0; start < piece.length; start += maxChars) {
    const end = Math.min(start + maxChars, piece.length);
    result.push(piece.slice(start, end).trim());
  }
  return result.filter(Boolean);
}

function tailText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  const tail = text.slice(-maxChars);
  const sentenceBoundary = Math.max(tail.indexOf('。'), tail.indexOf('.'), tail.indexOf('\n'));
  return sentenceBoundary > 20 ? tail.slice(sentenceBoundary + 1).trim() : tail.trim();
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  '一个',
  '一些',
  '就是',
  '但是',
  '因为',
  '所以',
  '如果',
  '可以',
  '没有',
  '自己',
]);
