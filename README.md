# HealthFlow：智慧健康助手

HealthFlow 是一个面向个人健康记录、心理对话和辅助分诊的全栈应用。项目包含 Web 前端、NestJS API、Prisma 数据模型、PostgreSQL/Redis 本地依赖，以及可切换的大模型供应商配置。

> 重要说明：这是开发中的健康辅助工具，不是医疗器械，也不能替代医生、心理咨询师、精神科或急救服务。涉及危险信号、用药、诊断或急症时，请优先寻求线下专业帮助。

## 技术栈

- 前端：React 18、TypeScript、Vite、Ant Design、TanStack Query、Zustand
- 后端：NestJS、Prisma、PostgreSQL、Redis、BullMQ
- AI 接入：Mock、本地 Ollama、Anthropic，以及 OpenAI-compatible 协议供应商
- 交互：SSE 流式对话、文件上传、知识库检索、账号登录
- 工作区：pnpm workspace，`apps/web`、`apps/api`、`packages/contracts`

## 当前能力

- 账号注册/登录，按用户隔离健康记录、对话、上传文件、分诊历史和模型设置
- 健康记录：睡眠、运动、心情、就医记录的创建、列表和删除
- 健康总览：今日心情、睡眠趋势、运动频率、主动洞察、最近 Agent 运行记录
- 心理对话：多轮会话、SSE 流式回复、会话历史、附件上传、引用展示
- 知识库增强 RAG：内置健康安全知识库，支持用户上传文档作为个人知识源
- 图片理解：可在模型设置中开启，将本轮上传图片发送给支持视觉能力的上游模型
- 辅助分诊：红旗风险识别、西医视角、中医视角和整合建议，支持历史记录查看
- 模型设置：Provider、模型、API Key、Base URL、RAG 开关、引用数量和视觉开关
- 安全边界：危机策略、健康免责声明、API Key 后端保存与加密/脱敏显示

## 目录结构

```text
.
├─ apps/
│  ├─ api/                 # NestJS API、Prisma、任务处理和上传存储
│  └─ web/                 # React/Vite 前端
├─ packages/
│  └─ contracts/           # 前后端共享类型、Zod schema、模型供应商元数据
├─ docker-compose.yml      # 本地 PostgreSQL + Redis
├─ pnpm-workspace.yaml
└─ package.json
```

## 快速开始

### 1. 安装依赖

```bash
corepack pnpm install
```

如果你已经全局安装了 pnpm，也可以直接使用：

```bash
pnpm install
```

### 2. 准备环境变量

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

本地开发默认使用 `mock` 模型，无需 API Key 即可跑通主要流程：

```env
LLM_PROVIDER=mock
LLM_MODEL=mock-health-assistant
```

几个常用配置：

- `DATABASE_URL`：PostgreSQL 连接，默认 `postgresql://health:health@localhost:5432/health_assistant`
- `REDIS_URL`：Redis 连接，默认 `redis://localhost:6379`
- `CORS_ORIGIN`：前端地址，默认 `http://localhost:5173`
- `ENCRYPTION_KEY`：后端加密模型 API Key，也会作为本地登录 token 的兜底签名密钥
- `VITE_API_BASE_URL`：前端 API 地址，开发环境默认 `/api`，由 Vite 代理到 `http://localhost:3001`
- `MAX_UPLOAD_BYTES`、`ALLOWED_UPLOAD_MIME_TYPES`：上传大小和文件类型限制

### 3. 启动本地基础设施

```bash
corepack pnpm infra:up
```

这会启动 PostgreSQL 16 和 Redis 7。

### 4. 初始化数据库

```bash
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
```

迁移文件已经随仓库提交。`db:seed` 会写入示例健康记录和内置健康安全知识库。

### 5. 启动开发服务

```bash
corepack pnpm dev
```

也可以分开启动：

```bash
corepack pnpm dev:api
corepack pnpm dev:web
```

访问地址：

```text
Web: http://localhost:5173
API: http://localhost:3001
```

首次进入页面后注册一个账号即可开始使用。新账号会自动创建一份默认 `mock` 模型配置。

## 大模型配置

应用支持以下 provider：

```text
mock, ollama, anthropic, openai, google, mistral, cohere, groq, xai,
openrouter, deepseek, moonshot, qwen, zhipu, baidu, tencent, volcengine
```

除 Anthropic 外，多数供应商走 OpenAI-compatible `/chat/completions` 协议。你可以在“模型设置”页面填写 API Key 和 Base URL，也可以通过环境变量配置，例如：

```env
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=你的_key
```

本地 Ollama 示例：

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1
OLLAMA_BASE_URL=http://localhost:11434/v1
```

RAG 和图片理解相关配置：

- `ragEnabled`：是否在心理对话中检索健康安全知识库
- `ragTopK`：每轮最多引用条数，范围 1-10
- `visionEnabled` / `LLM_VISION_ENABLED`：是否允许把上传图片发送给上游模型
- `EMBEDDING_MODEL`、`EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY`：可单独指定用户文档向量化使用的 Embedding 配置；不填时复用当前模型供应商

不要把真实 API Key 提交到代码仓库。

## 文件上传和知识库

默认允许上传：

- 图片：PNG、JPEG、WebP、GIF、BMP
- 文档：PDF、DOCX、DOC、TXT、Markdown、JSON、CSV

上传文件会保存在 API 侧存储目录中。文本类、PDF 和 DOCX 会尝试抽取文本；作为知识源上传的文档会切分为 chunks，并在对话时参与个人 RAG 检索。

## 常用命令

```bash
corepack pnpm lint        # TypeScript 检查
corepack pnpm build       # 构建 shared、api、web
corepack pnpm test        # 当前为占位测试脚本
corepack pnpm dev:worker  # 单独启动后台 worker
corepack pnpm infra:down  # 停止本地 PostgreSQL / Redis
```

数据库相关：

```bash
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
```

Windows 下仓库根目录还提供了 `start-api-3001.cmd` 和 `start-web-5173.cmd`，用于构建产物的本地启动。使用前请先运行 `corepack pnpm build`。

## 排查提示

- 前端能打开但接口失败：确认 API 是否在 `http://localhost:3001`，以及 `apps/web/.env` 中 `VITE_API_BASE_URL=/api`
- API 启动失败：确认 PostgreSQL/Redis 已通过 `corepack pnpm infra:up` 启动
- Prisma 报错：先运行 `corepack pnpm db:generate`，再运行 `corepack pnpm db:migrate`
- 模型连接失败：先在“模型设置”页使用“测试连接”，检查 API Key、Base URL、代理和后端网络
- RAG 引用为空：确认已运行 `corepack pnpm db:seed`，并且模型设置中开启了知识库增强

## 生产化提醒

当前项目仍偏开发阶段。正式部署前至少需要补齐：

- 更严格的认证、权限、密码策略和 token 管理
- API Key/KMS、上传文件隔离、审计日志和数据删除/导出流程
- 医疗/心理安全审查、风险分级策略、危机干预流程
- Worker 部署、任务重试、日志监控、告警和备份恢复
- 自动化测试、端到端测试和迁移发布流程
