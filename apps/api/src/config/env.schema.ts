import { LLM_PROVIDER_IDS } from "@health/shared";
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(8).optional(),
  JWT_ACCESS_TTL: z.string().default("2h"),
  WEB_BASE_URL: z.string().url().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  SMTP_URL: z.string().url().optional(),
  SMTP_FROM: z.string().default("HealthFlow <no-reply@healthflow.local>"),
  SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  SMTP_GREETING_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  SMTP_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  ENCRYPTION_KEY: z.string().min(16).optional(),
  ALLOW_CUSTOM_LLM_BASE_URLS: z.enum(["true", "false"]).default("false"),
  ALLOW_INSECURE_LLM_BASE_URLS: z.enum(["true", "false"]).default("false"),
  LLM_PROVIDER: z.enum(LLM_PROVIDER_IDS).default("mock"),
  LLM_MODEL: z.string().optional(),
  LLM_VISION_ENABLED: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_HTTP_PROXY: z.string().url().optional(),
  EMBEDDING_MODEL: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  RAG_RERANK_ENABLED: z.enum(["true", "false"]).default("true"),
  RAG_RERANK_PROVIDER: z.literal("dashscope").default("dashscope"),
  RAG_RERANK_MODEL: z.string().default("gte-rerank-v2"),
  RAG_RERANK_BASE_URL: z
    .string()
    .url()
    .default(
      "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
    ),
  RAG_RERANK_API_KEY: z.string().optional(),
  RAG_RERANK_CANDIDATE_K: z.coerce.number().int().min(2).max(50).default(20),
  RAG_RERANK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(30_000)
    .default(5_000),
  RAG_RERANK_MIN_SCORE: z.coerce.number().min(0).max(1).default(0),
  RAG_PUBLIC_RERANK_MIN_SCORE: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.165),
  DOCUMENT_PARSER_URL: z.string().url().default("http://127.0.0.1:8090"),
  DOCUMENT_PARSER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(180_000),
  DOCUMENT_PARSER_MIN_QUALITY: z.coerce.number().min(0).max(1).default(0.55),
  DOCUMENT_PARSER_ALLOW_TEXT_FALLBACK: z
    .enum(["true", "false"])
    .default("true"),
  DOCUMENT_PARSER_ALLOW_PDF_FALLBACK: z.enum(["true", "false"]).default("true"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_BASE_URL: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_BASE_URL: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  COHERE_BASE_URL: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  XAI_BASE_URL: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().optional(),
  MOONSHOT_API_KEY: z.string().optional(),
  MOONSHOT_BASE_URL: z.string().optional(),
  QWEN_API_KEY: z.string().optional(),
  QWEN_BASE_URL: z.string().optional(),
  ZHIPU_API_KEY: z.string().optional(),
  ZHIPU_BASE_URL: z.string().optional(),
  BAIDU_API_KEY: z.string().optional(),
  BAIDU_BASE_URL: z.string().optional(),
  TENCENT_API_KEY: z.string().optional(),
  TENCENT_BASE_URL: z.string().optional(),
  VOLCENGINE_API_KEY: z.string().optional(),
  VOLCENGINE_BASE_URL: z.string().optional(),
  UPLOAD_DIR: z.string().optional(),
  AVATAR_DIR: z.string().optional(),
  MAX_AVATAR_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  ALLOWED_UPLOAD_MIME_TYPES: z
    .string()
    .default(
      "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown,application/json,text/csv",
    ),
}).superRefine((env, context) => {
  if (Boolean(env.ADMIN_EMAIL) !== Boolean(env.ADMIN_PASSWORD)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ADMIN_EMAIL and ADMIN_PASSWORD must be configured together",
    });
  }

  if (env.NODE_ENV !== "production") return;

  const weakValues = new Set(["change-me", "changeme", "secret", "development"]);
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || weakValues.has(env.JWT_SECRET.toLowerCase())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_SECRET"], message: "JWT_SECRET must be at least 32 non-placeholder characters in production" });
  }
  if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length < 32 || weakValues.has(env.ENCRYPTION_KEY.toLowerCase())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ENCRYPTION_KEY"], message: "ENCRYPTION_KEY must be at least 32 non-placeholder characters in production" });
  }
  if (!env.WEB_BASE_URL?.startsWith("https://")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["WEB_BASE_URL"], message: "WEB_BASE_URL must use HTTPS in production" });
  }
  if (!env.CORS_ORIGIN.startsWith("https://")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGIN"], message: "CORS_ORIGIN must use HTTPS in production" });
  }
});

export type Env = z.infer<typeof envSchema>;
