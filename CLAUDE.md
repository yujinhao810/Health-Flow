# CLAUDE.md

本文档给 AI 开发 agent 使用，帮助在 HealthFlow 项目中更快理解上下文、保持一致的实现风格，并避免破坏已有用户改动。

## 项目概览

HealthFlow：智慧健康助手，是一个个人健康记录、心理对话、知识库增强 RAG 和辅助分诊应用。

核心边界：

- 这是健康辅助工具，不是医疗器械。
- 不要让功能或文案暗示可替代医生、心理咨询师、精神科或急救服务。
- 涉及危机、自伤、用药、诊断、急症时，必须保留保守安全提示和线下求助导向。

主要目录：

```text
apps/web                 React + Vite 前端
apps/api                 NestJS API、Prisma、上传、任务和 LLM 调用
packages/contracts       前后端共享类型、Zod schema、模型供应商元数据
apps/api/prisma          Prisma schema、migrations、seed 数据
```

## 技术栈和运行方式

- 包管理：pnpm workspace，优先使用 `corepack pnpm ...`
- 前端：React 18、TypeScript、Ant Design、TanStack Query、Zustand、Vite
- 后端：NestJS、Prisma、PostgreSQL、Redis、BullMQ
- LLM：mock、ollama、anthropic、openai-compatible provider
- 本地基础设施：`docker-compose.yml` 启动 PostgreSQL 和 Redis

常用命令：

```bash
corepack pnpm install
corepack pnpm infra:up
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev
corepack pnpm lint
corepack pnpm build
```

单独启动：

```bash
corepack pnpm dev:api
corepack pnpm dev:web
corepack pnpm dev:worker
```

默认地址：

```text
Web: http://localhost:5173
API: http://localhost:3001
```

## 环境变量要点

参考 `.env.example`、`apps/api/.env.example`、`apps/web/.env.example`。

常用变量：

- `DATABASE_URL`：PostgreSQL
- `REDIS_URL`：Redis
- `CORS_ORIGIN`：前端 origin
- `JWT_SECRET`：登录 token 签名；未配置时会兜底使用 `ENCRYPTION_KEY`
- `ENCRYPTION_KEY`：加密保存用户模型 API Key
- `LLM_PROVIDER`、`LLM_MODEL`：默认可用 `mock` / `mock-health-assistant`
- `VITE_API_BASE_URL`：前端 API base，开发默认 `/api`
- `MAX_UPLOAD_BYTES`、`ALLOWED_UPLOAD_MIME_TYPES`：上传限制

不要提交真实 API Key、token、用户数据或私密上传文件。

## 前端开发约定

- 前端入口在 `apps/web/src/main.tsx`，路由在 `apps/web/src/router.tsx`。
- 已登录后的主布局在 `apps/web/src/layout/AppShell.tsx`。
- 未登录时显示 `apps/web/src/pages/AuthPage.tsx`。
- 页面级代码在 `apps/web/src/pages`，业务组件在 `apps/web/src/components`，请求封装在 `apps/web/src/api`，React Query hooks 在 `apps/web/src/hooks`。
- 当前项目没有 Tailwind 配置，视觉样式主要在 `apps/web/src/styles.css`，组件库为 Ant Design。除非任务明确要求，不要引入新的 CSS 框架。
- 使用现有 Ant Design + 全局 CSS 风格；保持 Clean Tech & Medical 的蓝、白、浅紫视觉语言。
- 如果新增前端 API 类型，优先从 `packages/contracts` 复用或补充共享 schema/type。
- 不要在前端保存或展示明文 API Key。模型 API Key 只通过后端保存和调用。

交互注意：

- 登录、模型设置、上传、对话和分诊都已接入账号态。新增接口时要确认是否需要认证。
- 图片理解由模型设置中的 `visionEnabled` 控制，不要默认把图片发送给上游模型。
- RAG 引用、附件、错误提示等用户可见文案应保守、清晰，不夸大能力。

## 后端开发约定

- API 入口模块在 `apps/api/src/app.module.ts`。
- 配置校验在 `apps/api/src/config/env.schema.ts`。
- Prisma schema 在 `apps/api/prisma/schema.prisma`，不要手改数据库而不补 migration。
- 认证在 `apps/api/src/auth`，受保护接口使用 `AuthGuard` 和 `CurrentUser`。
- LLM provider 在 `apps/api/src/llm`，provider 元数据来自 `packages/contracts/src/settings.ts`。
- 健康记录、快照、对话、上传、知识库、辅助分诊、洞察、Agent 运行记录分别有独立 module/service/controller。
- DTO 使用 class-validator；共享输入/输出类型优先维护在 `packages/contracts`。
- 文件上传和抽取逻辑在 `apps/api/src/uploads`，RAG 和 embedding 在 `apps/api/src/knowledge`。

数据库相关：

- 修改 Prisma schema 后，创建 migration 并运行 `corepack pnpm db:generate`。
- 种子数据在 `apps/api/prisma/seed.ts`，包含 demo 健康记录和内置健康安全知识库。
- RAG 使用 PostgreSQL `pg_trgm` 和全文检索；相关扩展在 migration 中处理。

## 健康与安全约束

所有 AI/健康相关功能必须遵守：

- 不提供诊断结论、处方、停药/加药建议或紧急情况替代方案。
- 不把心理对话描述成心理治疗。
- 遇到自伤、伤害他人、急性胸痛、呼吸困难、意识异常等高风险场景，应优先安全和线下帮助。
- 辅助分诊建议应说明不确定性，鼓励记录症状并咨询专业人士。
- 用户上传资料可能包含高度敏感健康信息，处理时避免日志泄露和无关传输。

## 修改前后的检查

推荐按改动范围选择验证：

```bash
corepack pnpm --filter web run lint
corepack pnpm --filter api run lint
corepack pnpm lint
corepack pnpm build
```

如果修改数据库：

```bash
corepack pnpm db:generate
corepack pnpm db:migrate
```

如果修改前端视觉或交互：

- 启动 `corepack pnpm dev:web` 或完整 `corepack pnpm dev`
- 在浏览器检查桌面和移动宽度
- 确认文字不溢出、不遮挡、主要流程可点击

## 工作方式约定

- 开始前先查看相关文件和现有模式，不要凭空重构。
- 保持改动范围小；不要顺手重排无关文件。
- 工作区可能已有用户未提交改动。不要回滚、不覆盖、不清理与任务无关的改动。
- 手动编辑文件时优先使用补丁式修改。
- 新增依赖前先确认现有依赖是否已经能解决问题。
- 更新 README、CLAUDE.md 或环境变量示例时，确保与实际脚本和代码一致。

## 常见任务入口

- 登录页：`apps/web/src/pages/AuthPage.tsx`、`apps/web/src/styles.css`
- 主导航/账号状态：`apps/web/src/layout/AppShell.tsx`
- 健康记录：`apps/web/src/pages/RecordsPage.tsx`、`apps/api/src/health-records`
- 心理对话：`apps/web/src/pages/ChatPage.tsx`、`apps/web/src/components/chat`、`apps/api/src/chat`
- 辅助分诊：`apps/web/src/pages/DiagnosisPage.tsx`、`apps/web/src/components/diagnosis`、`apps/api/src/integrative-diagnosis`
- 模型设置：`apps/web/src/pages/SettingsPage.tsx`、`apps/api/src/settings`、`packages/contracts/src/settings.ts`
- 上传和知识库：`apps/api/src/uploads`、`apps/api/src/knowledge`
- Prisma 数据模型：`apps/api/prisma/schema.prisma`
