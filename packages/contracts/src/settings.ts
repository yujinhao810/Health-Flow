import { z } from 'zod';

type LlmProviderMetadata = {
  id: string;
  label: string;
  category: 'local' | 'global' | 'china' | 'aggregator';
  adapter: 'mock' | 'anthropic' | 'openai-compatible';
  requiresApiKey: boolean;
  apiKeyEnv?: string;
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
  defaultModel: string;
  models: readonly string[];
};

export const LLM_PROVIDER_METADATA = {
  mock: {
    id: 'mock',
    label: 'Mock 本地模拟',
    category: 'local',
    adapter: 'mock',
    requiresApiKey: false,
    defaultModel: 'mock-health-assistant',
    models: ['mock-health-assistant'],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama 本地模型',
    category: 'local',
    adapter: 'openai-compatible',
    requiresApiKey: false,
    baseUrlEnv: 'OLLAMA_BASE_URL',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    models: ['llama3.1', 'llama3.2', 'qwen2.5', 'deepseek-r1'],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    category: 'global',
    adapter: 'anthropic',
    requiresApiKey: true,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
    defaultModel: 'claude-opus-4-8',
    models: [
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'claude-fable-5',
      'claude-mythos-5',
    ],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    category: 'global',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrlEnv: 'OPENAI_BASE_URL',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    category: 'global',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'GOOGLE_API_KEY',
    baseUrlEnv: 'GOOGLE_BASE_URL',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-pro',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    category: 'global',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'MISTRAL_API_KEY',
    baseUrlEnv: 'MISTRAL_BASE_URL',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  },
  cohere: {
    id: 'cohere',
    label: 'Cohere',
    category: 'global',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'COHERE_API_KEY',
    baseUrlEnv: 'COHERE_BASE_URL',
    defaultBaseUrl: 'https://api.cohere.com/compatibility/v1',
    defaultModel: 'command-a-03-2025',
    models: ['command-a-03-2025', 'command-r-plus', 'command-r'],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    category: 'global',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'GROQ_API_KEY',
    baseUrlEnv: 'GROQ_BASE_URL',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'deepseek-r1-distill-llama-70b'],
  },
  xai: {
    id: 'xai',
    label: 'xAI Grok',
    category: 'global',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'XAI_API_KEY',
    baseUrlEnv: 'XAI_BASE_URL',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3',
    models: ['grok-3', 'grok-3-mini', 'grok-2-vision-1212'],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter 聚合',
    category: 'aggregator',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    baseUrlEnv: 'OPENROUTER_BASE_URL',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-opus-4.1',
    models: ['anthropic/claude-opus-4.1', 'openai/gpt-4.1', 'google/gemini-2.5-pro', 'deepseek/deepseek-chat'],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    category: 'china',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: 'DEEPSEEK_BASE_URL',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot / Kimi',
    category: 'china',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'MOONSHOT_API_KEY',
    baseUrlEnv: 'MOONSHOT_BASE_URL',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2-0711-preview',
    models: ['kimi-k2-0711-preview', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  qwen: {
    id: 'qwen',
    label: '阿里云通义千问 / DashScope',
    category: 'china',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'QWEN_API_KEY',
    baseUrlEnv: 'QWEN_BASE_URL',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-coder-plus'],
  },
  zhipu: {
    id: 'zhipu',
    label: '智谱 GLM',
    category: 'china',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'ZHIPU_API_KEY',
    baseUrlEnv: 'ZHIPU_BASE_URL',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'],
  },
  baidu: {
    id: 'baidu',
    label: '百度千帆 / ERNIE',
    category: 'china',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'BAIDU_API_KEY',
    baseUrlEnv: 'BAIDU_BASE_URL',
    defaultBaseUrl: 'https://qianfan.baidubce.com/v2',
    defaultModel: 'ernie-4.0-turbo-8k',
    models: ['ernie-4.0-turbo-8k', 'ernie-4.0-8k', 'ernie-speed-8k'],
  },
  tencent: {
    id: 'tencent',
    label: '腾讯混元',
    category: 'china',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'TENCENT_API_KEY',
    baseUrlEnv: 'TENCENT_BASE_URL',
    defaultBaseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    defaultModel: 'hunyuan-turbos-latest',
    models: ['hunyuan-turbos-latest', 'hunyuan-large', 'hunyuan-standard'],
  },
  volcengine: {
    id: 'volcengine',
    label: '火山引擎 Ark / 豆包',
    category: 'china',
    adapter: 'openai-compatible',
    requiresApiKey: true,
    apiKeyEnv: 'VOLCENGINE_API_KEY',
    baseUrlEnv: 'VOLCENGINE_BASE_URL',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-seed-1-6-250615',
    models: ['doubao-seed-1-6-250615', 'doubao-seed-1-6-thinking-250615', 'deepseek-v3-250324'],
  },
} as const satisfies Record<string, LlmProviderMetadata>;

export const LLM_PROVIDER_IDS = Object.keys(LLM_PROVIDER_METADATA) as [
  keyof typeof LLM_PROVIDER_METADATA,
  ...(keyof typeof LLM_PROVIDER_METADATA)[],
];

export type LlmProviderName = keyof typeof LLM_PROVIDER_METADATA;
export type LlmProviderAdapter = (typeof LLM_PROVIDER_METADATA)[LlmProviderName]['adapter'];
export type LlmProviderCategory = (typeof LLM_PROVIDER_METADATA)[LlmProviderName]['category'];

export const llmProviderSchema = z.enum(LLM_PROVIDER_IDS);

export const llmConfigSchema = z.object({
  provider: llmProviderSchema,
  model: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional().or(z.literal('')),
  ragEnabled: z.boolean().optional(),
  ragTopK: z.coerce.number().int().min(1).max(10).optional(),
});

export type LlmConfigInput = z.infer<typeof llmConfigSchema>;

export type PublicLlmConfig = {
  provider: LlmProviderName;
  model: string;
  maskedApiKey?: string;
  baseUrl?: string;
  ragEnabled?: boolean;
  ragTopK?: number;
  updatedAt?: string;
};

export type LlmValidationResult = {
  valid: boolean;
  message?: string;
};
