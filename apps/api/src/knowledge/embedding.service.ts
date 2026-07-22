import { Injectable } from '@nestjs/common';
import type { LlmConfig } from '../llm/llm.types';
import { LlmService } from '../llm/llm.provider';

export type EmbeddingBatch = {
  vectors: number[][];
  model: string;
  provider: string;
  fallbackReason?: string;
};

const LOCAL_EMBEDDING_MODEL = 'local-hash-embedding-v1';
const LOCAL_DIMENSIONS = 384;
const REMOTE_BATCH_SIZE = 10;

@Injectable()
export class EmbeddingService {
  constructor(private readonly llm: LlmService) {}

  async embedTexts(config: LlmConfig, texts: string[], signal?: AbortSignal): Promise<EmbeddingBatch> {
    const normalizedTexts = texts.map((text) => text.replace(/\s+/g, ' ').trim());
    if (!normalizedTexts.length) return { vectors: [], model: LOCAL_EMBEDDING_MODEL, provider: 'local' };

    if (this.llm.supportsEmbeddings(config)) {
      try {
        const vectors: number[][] = [];
        let model: string | undefined;
        for (const texts of chunkTexts(normalizedTexts, REMOTE_BATCH_SIZE)) {
          const result = await this.llm.embedTexts({ config, texts, signal });
          if (model && result.model !== model) {
            throw new Error(`Embedding API 批次模型不一致：${model} / ${result.model}`);
          }
          if (result.vectors.length !== texts.length || !result.vectors.every(isValidVector)) {
            throw new Error('Embedding API 返回的向量数量或格式无效');
          }
          model = result.model;
          vectors.push(...result.vectors);
        }
        if (model && vectors.length === normalizedTexts.length) {
          return {
            vectors: vectors.map(normalizeVector),
            model,
            provider: config.provider,
          };
        }
      } catch (error) {
        return {
          vectors: normalizedTexts.map((text) => localEmbedding(text)),
          model: LOCAL_EMBEDDING_MODEL,
          provider: 'local',
          fallbackReason: error instanceof Error ? error.message : 'Embedding API 调用失败',
        };
      }
    }

    return {
      vectors: normalizedTexts.map((text) => localEmbedding(text)),
      model: LOCAL_EMBEDDING_MODEL,
      provider: 'local',
      fallbackReason: '当前模型提供商没有可用的 Embedding API',
    };
  }
}

function chunkTexts(texts: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < texts.length; index += size) {
    chunks.push(texts.slice(index, index + size));
  }
  return chunks;
}

export function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function asNumberVector(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const vector = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return vector.length ? vector : undefined;
}

function isValidVector(vector: number[]) {
  return Array.isArray(vector) && vector.length > 0 && vector.every((value) => typeof value === 'number' && Number.isFinite(value));
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

function localEmbedding(text: string) {
  const vector = Array.from({ length: LOCAL_DIMENSIONS }, () => 0);
  const tokens = tokenize(text);

  for (const token of tokens.length ? tokens : [text.slice(0, 120)]) {
    const index = Math.abs(hash(token)) % LOCAL_DIMENSIONS;
    vector[index] += 1;
  }

  return normalizeVector(vector);
}

function tokenize(text: string) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const tokens = normalized.match(/[\p{L}\p{N}]{2,}|[\u4e00-\u9fff]/gu) ?? [];
  const grams: string[] = [];

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const gram = normalized.slice(index, index + 2).trim();
    if (gram.length === 2) grams.push(gram);
  }

  return [...new Set([...tokens, ...grams])];
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result;
}
