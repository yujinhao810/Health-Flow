import { z } from "zod";

export const parsedBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["heading", "paragraph", "table", "list", "image", "ocr_text"]),
  text: z.string(),
  bbox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional()
    .nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  level: z.number().int().min(1).max(12).optional().nullable(),
});

export const parsedPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  width: z.number().positive().optional().nullable(),
  height: z.number().positive().optional().nullable(),
  blocks: z.array(parsedBlockSchema),
});

export const parsingQualitySchema = z.object({
  score: z.number().min(0).max(1),
  textCoverage: z.number().min(0).max(1),
  garbledRatio: z.number().min(0).max(1),
  ocrConfidence: z.number().min(0).max(1).optional().nullable(),
  pageCoverage: z.number().min(0).max(1),
  layoutCompleteness: z.number().min(0).max(1),
  tableCompleteness: z.number().min(0).max(1),
});

export const parsedDocumentSchema = z.object({
  parser: z.string().min(1),
  parserVersion: z.string().min(1),
  detectedMimeType: z.string().min(1),
  title: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  text: z.string(),
  pages: z.array(parsedPageSchema).min(1),
  quality: parsingQualitySchema,
  warnings: z.array(z.string()).default([]),
});

export type ParsedBlock = z.infer<typeof parsedBlockSchema>;
export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;

export type DetectedFileType = {
  mimeType: string;
  extension: string;
  category: "text" | "pdf" | "office" | "image" | "unknown";
};
