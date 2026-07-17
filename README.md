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
- 知识库增强 RAG：内置健康安全知识库和个人知识源分路召回，支持混合检索、RRF 融合、DashScope `gte-rerank-v2` 重排、证据 ID 与连续追问改写
- 图片理解：可在模型设置中开启，将本轮上传图片发送给支持视觉能力的上游模型
- 辅助分诊：分层红旗识别、西医/中医初评、交叉审查和安全仲裁，支持在原会话补充信息后重新会诊
- 模型设置：Provider、主模型、可选的分诊角色模型、API Key、Base URL、RAG 开关、引用数量和视觉开关
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
- `RAG_RERANK_ENABLED`：是否启用 Rerank，默认开启；失败或超时时自动回退到 RRF
- `RAG_RERANK_MODEL`：DashScope Rerank 模型，默认 `gte-rerank-v2`
- `RAG_RERANK_API_KEY`：可选；Qwen 提供商默认复用当前保存的 DashScope API Key
- `RAG_RERANK_CANDIDATE_K`：送入 Rerank 的候选片段数，默认 20，最终仍受每轮 TopK 限制
- `RAG_RERANK_TIMEOUT_MS`、`RAG_RERANK_MIN_SCORE`：Rerank 超时和最低相关性分数
- `RAG_PUBLIC_RERANK_MIN_SCORE`：公共知识库无答案门控阈值，标准集校准默认值为 0.15；低于阈值的公共片段不会进入回答上下文
- 对话中上传的个人知识文档按会话隔离：同一会话可连续追问，新会话不会检索旧会话文件；删除会话时会清理不再被其他消息引用的文件和向量数据
- `DOCUMENT_PARSER_URL`：Docling + PaddleOCR 解析服务地址，默认 `http://127.0.0.1:8090`
- `DOCUMENT_PARSER_TIMEOUT_MS`：单个文件解析超时，默认 180 秒
- `DOCUMENT_PARSER_MIN_QUALITY`：知识文件最低解析质量，默认 0.55
- `DOCUMENT_PARSER_ALLOW_TEXT_FALLBACK`：解析服务不可用时是否允许纯文本文件使用 Node 本地回退
- `DOCUMENT_PARSER_ALLOW_PDF_FALLBACK`：解析服务不可用时是否允许文本型 PDF 使用 PDF.js 读取原生文本层（扫描件仍需 OCR）
- `LLM_HTTP_PROXY`：可选的模型 API HTTP/HTTPS 代理，例如本机 Clash 的 `http://127.0.0.1:7897`

不要把真实 API Key 提交到代码仓库。

## 文件上传和知识库

默认允许上传：

- 图片：PNG、JPEG、WebP、GIF、BMP、TIFF
- 文档：PDF、DOCX、XLSX、PPTX、TXT、Markdown、JSON、CSV

上传前会根据 Magic Bytes 和 OOXML 内部标记确认真实文件类型。Docling 负责原生 PDF 和 Office 文档结构解析，PaddleOCR 负责图片和扫描 PDF；解析结果经过文本覆盖率、乱码率、OCR 置信度、页面覆盖率和结构完整性门控后，按标题、页面和表格语义切块并参与个人 RAG 检索。图片仍作为聊天附件，但会额外尝试 OCR，以便视觉模型关闭时也能使用可识别文字。

解析服务由 Docker Compose 启动：

```bash
corepack pnpm infra:up
curl http://localhost:8090/health
```

首次 OCR 会下载 PaddleOCR 模型，启动和首个请求耗时会明显长于后续请求。模型缓存在 Docker volume 中。

## 常用命令

```bash
corepack pnpm lint        # TypeScript 检查
corepack pnpm build       # 构建 shared、api、web
corepack pnpm test        # 共享类型检查、前端检查和 API 回归测试
corepack pnpm --filter api run eval:rag   # 运行 72 题标准集，评测 RRF 的 Recall、Precision、MRR、nDCG 和拒答准确率
corepack pnpm --filter api exec tsx scripts/evaluate-rag.ts --use-saved-config  # 使用已保存的 DashScope Key 增加真实 Rerank 对照
corepack pnpm --filter api run smoke:api  # 对运行中的 API 做认证/设置/分诊闭环烟测
corepack pnpm dev:worker  # 单独启动后台 worker
corepack pnpm infra:down  # 停止本地 PostgreSQL / Redis / 文档解析服务
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
- 扩充由临床专业人员审阅的安全评测集、对抗样本和真实模型对照实验
