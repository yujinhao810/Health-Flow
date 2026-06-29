# Health Assistant

个人健康助手全栈脚手架。

## Stack

- React + TypeScript + Ant Design + Vite
- NestJS + Prisma
- PostgreSQL + Redis/BullMQ
- SSE streaming chat
- Mock / Anthropic Claude / OpenAI-compatible mainstream LLM providers

## Quick start

### 1. Install dependencies

如果系统没有全局 `pnpm`，可以使用 `corepack pnpm`：

```bash
corepack pnpm install
```

如已安装全局 pnpm，也可以：

```bash
pnpm install
```

### 2. Copy environment files

Bash:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

默认使用 mock 模型，无需 API key 即可跑通前后端：

```env
LLM_PROVIDER=mock
LLM_MODEL=mock-health-assistant
```

模型设置页已内置主流供应商：`anthropic`、`openai`、`google`、`deepseek`、`moonshot`、`qwen`、`zhipu`、`baidu`、`tencent`、`volcengine`、`mistral`、`cohere`、`groq`、`xai`、`openrouter`、`ollama`。除 Anthropic 外，大多数供应商通过 OpenAI-compatible `/chat/completions` 协议接入，Base URL 可在页面填写，也可用 `<PROVIDER>_BASE_URL` 环境变量覆盖。

如需使用 Anthropic Claude：

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-opus-4-8
ANTHROPIC_API_KEY=你的_key
```

Claude 推荐模型：默认 `claude-opus-4-8`；平衡速度与质量可用 `claude-sonnet-4-6`；低成本快速可用 `claude-haiku-4-5`。`claude-fable-5` 和 `claude-mythos-5` 已列为可选模型，但 Fable 5 有 30 天数据保留与 refusal/fallback 注意事项，Mythos 5 仅 Project Glasswing 可用。

如需使用 DeepSeek 等 OpenAI-compatible 平台：

```env
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=你的_key
```

如需使用本地 Ollama：

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1
OLLAMA_BASE_URL=http://localhost:11434/v1
```

API key 会在后端使用 `ENCRYPTION_KEY` 加密保存。不要把真实 key 提交到代码仓库。

### 3. Start local infrastructure

```bash
corepack pnpm infra:up
```

This starts PostgreSQL and Redis.

### 4. Generate Prisma client and initialize database

```bash
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
```

当前脚手架没有提交初始 migration；第一次运行 `pnpm db:migrate` 时按提示输入迁移名，例如 `init`。

### 5. Start development servers

```bash
corepack pnpm dev
```

Or start them separately:

```bash
corepack pnpm dev:api
corepack pnpm dev:web
```

Open:

```text
http://localhost:5173
```

API runs at:

```text
http://localhost:3001
```

## Useful commands

```bash
corepack pnpm lint
corepack pnpm build
corepack pnpm dev:worker
corepack pnpm infra:down
```

## Main features in this scaffold

- Health record CRUD skeleton
- Weekly health snapshot generation
- Multi-turn chat persistence
- SSE streaming assistant response
- Mock provider for local development
- Anthropic provider adapter
- OpenAI-compatible provider adapter for mainstream LLM vendors
- User model settings page with provider metadata and API key validation
- Basic safety disclaimer and API key redaction/encryption skeleton

## Notes

- The normal API path does not import BullMQ workers by default, so chat/settings/records can run without starting the worker process.
- `pnpm dev:worker` uses Redis and starts the background processor module.
- This is a development scaffold, not a production medical product. Keep medical/psychological safety review, audit logging, encryption/KMS, authentication, and data deletion/export on the production checklist.
