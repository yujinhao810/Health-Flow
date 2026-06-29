export const appConfig = () => ({
  apiPort: Number(process.env.API_PORT ?? 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  encryptionKey: process.env.ENCRYPTION_KEY,
  llmProvider: process.env.LLM_PROVIDER ?? 'mock',
  llmModel: process.env.LLM_MODEL ?? 'claude-opus-4-8',
});
