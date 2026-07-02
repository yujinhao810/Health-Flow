# HealthFlow 设置页面全面升级 — Agent 实现提示词

## 任务概述

当前设置页面 (`/settings`) 只有"上游大模型配置"一个功能模块。需要将其改造为完整的个人设置中心，分为**个人信息、模型设置、健康数据、外观偏好**四个 Tab 页。

## 项目技术栈上下文

- 前端: React 18 + Vite + Ant Design 5 + React Router 6 + TanStack Query 5
- 后端: NestJS + Prisma + PostgreSQL
- 样式: 无 Tailwind，Ant Design ConfigProvider 主题 + 自定义 CSS (`styles.css`)
- 主题色: `--healing-primary: #6d5dfc`，玻璃风格

## 当前 User 数据模型（Prisma schema）

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String?
  displayName   String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  // ... 各种 hasMany 关系
}
```

**注意:** User 模型目前非常精简，只有 email、displayName、passwordHash。没有头像、生日、身高体重等字段。

## 当前后端认证接口

| 方法 | 路由 | 功能 |
|---|---|---|
| POST | `/auth/register` | 注册（email + password + displayName） |
| POST | `/auth/login` | 登录 |
| GET | `/auth/me` | 获取当前用户（AuthGuard） |

**缺失:** 无修改资料、无修改密码、无删除账户接口。

## 当前侧边栏导航

```typescript
// apps/web/src/layout/AppShell.tsx
{ key: '/settings', icon: <SettingOutlined />, label: '模型设置' }
```

侧边栏底部有一个 account-panel，显示用户头像（UserOutlined 图标）、displayName、email 和退出登录按钮。

## 需要修改的关键文件

| 文件 | 作用 |
|---|---|
| `apps/web/src/pages/SettingsPage.tsx` | 设置页面（当前只有 LLM 配置） |
| `apps/web/src/layout/AppShell.tsx` | 侧边栏导航，`/settings` 标签文字 |
| `apps/web/src/api/auth.ts` | 前端认证 API 客户端 |
| `apps/web/src/api/settings.ts` | 前端 LLM 配置 API |
| `apps/web/src/hooks/useAuth.tsx` | 认证状态管理（AuthProvider） |
| `apps/web/src/styles.css` | 全局样式 |
| `apps/api/src/auth/auth.controller.ts` | 后端认证控制器 |
| `apps/api/src/auth/auth.service.ts` | 后端认证服务（含密码 hash、token 签发） |
| `apps/api/src/auth/dto/auth.dto.ts` | 认证 DTO 验证 |
| `apps/api/prisma/schema.prisma` | 数据库模型 |

---

## 分步实现计划

### Step 1: Prisma Schema 扩展

在 User 模型中增加以下可选字段：

```prisma
model User {
  // ... 现有字段保持不变

  // 新增：个人资料
  avatarUrl      String?       // 头像 URL（本地上传路径或外部 URL）
  bio            String?       // 个人简介，最长 200 字
  birthYear      Int?          // 出生年份（不存完整生日，降低隐私风险）
  gender         String?       // "male" | "female" | "other" | null
  heightCm       Float?        // 身高 cm
  weightKg       Float?        // 体重 kg

  // 新增：偏好设置
  themeMode      String        @default("system")  // "light" | "dark" | "system"
  locale         String        @default("zh-CN")   // 语言偏好（预留）
}
```

运行 `npx prisma migrate dev --name add-user-profile` 生成迁移。

### Step 2: 后端 — 新增用户资料和密码修改 API

**修改 `apps/api/src/auth/dto/auth.dto.ts`，新增 DTO：**

```typescript
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(80) displayName?: string;
  @IsOptional() @IsString() @MaxLength(200) bio?: string;
  @IsOptional() @IsInt() @Min(1900) @Max(2020) birthYear?: number;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsNumber() heightCm?: number;
  @IsOptional() @IsNumber() weightKg?: number;
}

export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) @MaxLength(128) newPassword!: string;
}

export class UpdatePreferencesDto {
  @IsOptional() @IsString() themeMode?: string;  // "light" | "dark" | "system"
}
```

**修改 `apps/api/src/auth/auth.controller.ts`，新增路由：**

| 方法 | 路由 | 功能 | 备注 |
|---|---|---|---|
| PATCH | `/auth/profile` | 更新个人资料 | AuthGuard，返回更新后的 user |
| POST | `/auth/change-password` | 修改密码 | AuthGuard，需验证旧密码 |
| PATCH | `/auth/preferences` | 更新偏好设置 | AuthGuard，返回更新后的 user |
| DELETE | `/auth/account` | 删除账户 | AuthGuard，级联删除所有数据（Prisma 已有 cascade） |

**修改 `apps/api/src/auth/auth.service.ts`，新增方法：**

- `updateProfile(userId, dto)` — `prisma.user.update` 设置新字段
- `changePassword(userId, dto)` — 验证旧密码（复用 `verifyPassword`），更新 `passwordHash`
- `updatePreferences(userId, dto)` — 更新 themeMode 等偏好字段
- `deleteAccount(userId)` — `prisma.user.delete`（Prisma schema 已配置 cascade delete）

**修改 `GET /auth/me` 返回值：** 把新增的字段（avatarUrl, bio, birthYear, gender, heightCm, weightKg, themeMode）也返回给前端。

### Step 3: 后端 — 健康数据导出 API

**新建 `apps/api/src/health-records/data-export.controller.ts`：**

| 方法 | 路由 | 功能 |
|---|---|---|
| GET | `/health/export/json` | 导出全部健康记录为 JSON（Auth header） |
| GET | `/health/export/csv` | 导出全部健康记录为 CSV（Auth header） |

- JSON 导出: 查询当前用户全部 HealthRecord，按 type 分组，返回 `{ sleep: [...], exercise: [...], mood: [...], medical: [...] }`
- CSV 导出: 展平为单表，列包括 `type, recordedAt, note, payload字段展平...`，返回 `Content-Type: text/csv` + `Content-Disposition: attachment`
- 使用 `@UseGuards(AuthGuard)` 保护
- 注册到 `HealthRecordsModule` 或 `AppModule`

### Step 4: 前端 — API 客户端扩展

**修改 `apps/web/src/api/auth.ts`，新增：**

```typescript
export type UserProfile = AuthUser & {
  bio?: string | null;
  birthYear?: number | null;
  gender?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  avatarUrl?: string | null;
  themeMode?: string;
};

export function updateProfile(input: Partial<UserProfile>) {
  return api<{ user: UserProfile }>('/auth/profile', { method: 'PATCH', body: JSON.stringify(input) });
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return api<{ success: true }>('/auth/change-password', { method: 'POST', body: JSON.stringify(input) });
}

export function updatePreferences(input: { themeMode: string }) {
  return api<{ user: UserProfile }>('/auth/preferences', { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteAccount() {
  return api<{ deleted: true }>('/auth/account', { method: 'DELETE' });
}
```

**新建 `apps/web/src/api/data-export.ts`：**

```typescript
export function exportHealthData(format: 'json' | 'csv') {
  return api<Blob>(`/health/export/${format}`, { responseType: 'blob' });
  // 注意：api 客户端需要支持 blob 响应，或者直接用 fetch
}
```

实际实现时，导出接口返回文件流，前端用 `fetch` + `response.blob()` + 创建 `<a>` 标签触发下载，不走现有的 `api()` JSON 封装。

### Step 5: 前端 — 改造 SettingsPage 为 Tab 布局

**重写 `apps/web/src/pages/SettingsPage.tsx`：**

```
整体结构:
  <Typography.Title level={2}>个人设置</Typography.Title>
  <Card>
    <Tabs defaultActiveKey="profile" items={[
      { key: 'profile', label: '个人信息', icon: <UserOutlined />, children: <ProfileTab /> },
      { key: 'model', label: '模型配置', icon: <ApiOutlined />, children: <ModelConfigTab /> },
      { key: 'data', label: '健康数据', icon: <DatabaseOutlined />, children: <DataTab /> },
      { key: 'appearance', label: '外观偏好', icon: <SkinOutlined />, children: <AppearanceTab /> },
    ]} />
  </Card>
```

把现有 LLM 配置表单抽成 `ModelConfigTab` 组件（代码基本不变），其他三个 Tab 分别新建组件。

### Step 6: ProfileTab 组件

文件: `apps/web/src/components/settings/ProfileTab.tsx`

```
布局（Ant Design Form, layout="vertical"）:

[头像区] 圆形头像预览（80px，无头像时显示 displayName 首字母彩色圆形）
         "修改头像"按钮（一期先不做上传，只放按钮占位，点击提示"即将上线"）

[基本信息]
  - 昵称 (Input, maxLength=80, 默认值=当前 displayName)
  - 个人简介 (TextArea, maxLength=200, placeholder="写几句话介绍自己")
  - 邮箱 (Input, disabled, 显示当前 email，旁边标注"邮箱暂不支持修改")

[健康档案]
  - 出生年份 (InputNumber, min=1900, max=2020)
  - 性别 (Select: 男/女/其他/不愿透露)
  - 身高 cm (InputNumber, min=50, max=250, step=0.1)
  - 体重 kg (InputNumber, min=20, max=300, step=0.1)
  - BMI 自动计算 (只读显示，体重/身高², 保留1位小数，标注范围: 偏瘦/正常/偏胖)

[安全]
  - 修改密码区域:
    - 当前密码 (Input.Password)
    - 新密码 (Input.Password, rules: minLength=8)
    - 确认新密码 (Input.Password, rules: 和新密码一致)
    - "修改密码"按钮

底部:
  - "保存资料"按钮 (primary)
  - "退出登录"按钮 (danger, 复用 useAuth().logout)
  - "删除账户"按钮 (danger, 二次 Popconfirm 确认，文案: "此操作不可撤销，将永久删除你的所有健康记录、对话和配置。")
```

**数据流:**
- 进入页面时 `GET /auth/me` 的返回值填充表单（需要 AuthProvider 的 user 对象包含新字段）
- 保存资料 → `PATCH /auth/profile`，成功后更新 AuthProvider 中的 user 对象
- 修改密码 → `POST /auth/change-password`，成功后清空密码表单
- 删除账户 → `DELETE /auth/account`，成功后调用 `logout()` 跳回登录

### Step 7: DataTab 组件

文件: `apps/web/src/components/settings/DataTab.tsx`

```
[数据概览]
  显示当前数据统计（调用 useHealthRecords 获取）:
  - 睡眠记录 X 条
  - 运动记录 X 条
  - 心情记录 X 条
  - 就医记录 X 条
  - 对话会话 X 个
  - 诊断记录 X 个

[数据导出]
  - "导出 JSON"按钮 — 点击后下载 health-data.json
  - "导出 CSV"按钮 — 点击后下载 health-data.csv
  - 说明文字: "导出的文件包含你的全部健康记录，可以交给医生或用于个人备份。"

[数据导入]（一期标记为"即将上线"）
  - "导入 JSON"按钮 (disabled)
  - 说明: "支持从导出的 JSON 文件恢复数据"

[数据清理]
  - "清除所有健康记录" (Popconfirm, 二次确认)
  - "清除所有对话记录" (Popconfirm, 二次确认)
  - 注意: 这两个操作需要后端新增批量删除接口，或者一期只做前端按钮占位
```

**导出实现:**
```typescript
async function handleExport(format: 'json' | 'csv') {
  const response = await fetch(`/api/health/export/${format}`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthflow-export-${new Date().toISOString().slice(0,10)}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### Step 8: AppearanceTab 组件

文件: `apps/web/src/components/settings/AppearanceTab.tsx`

```
[主题模式]
  Ant Design Segmented: 浅色 / 深色 / 跟随系统
  切换后立即保存 → PATCH /auth/preferences

[主题预览]
  显示当前主题色的色板预览（主色、辅助色、背景色的小色块）
  一期不做主题色切换，只做展示

[说明]
  - 提示文字: "深色模式将在后续版本中支持完整切换。选择「跟随系统」会自动匹配你的操作系统设置。"
  - 如果用户选了"深色"，弹 message.info: "深色模式正在开发中，当前仅保存偏好，界面暂不变化。"
```

**主题模式持久化:**
- 保存到后端 `user.themeMode`
- 同时写入 `localStorage('healthflow.themeMode')` 方便 `main.tsx` 在启动时读取
- `main.tsx` 中根据 themeMode 切换 Ant Design 的 `algorithm` (theme.defaultAlgorithm / theme.darkAlgorithm)（一期可以先只存值不变 UI）

### Step 9: 修改侧边栏

**修改 `apps/web/src/layout/AppShell.tsx`:**

```typescript
// 导航标签改名
{ key: '/settings', icon: <SettingOutlined />, label: '设置' }  // 从"模型设置"改为"设置"
```

### Step 10: 修改 AuthProvider

**修改 `apps/web/src/hooks/useAuth.tsx`:**

- `user` 类型从 `AuthUser` 扩展为 `UserProfile`（包含新字段）
- 新增 `refreshUser()` 方法，调用 `GET /auth/me` 重新拉取用户信息并更新 context
- 导出 `refreshUser` 供 SettingsPage 在保存资料后调用

### Step 11: 样式补充

在 `apps/web/src/styles.css` 中追加：

```css
/* ===== 设置页面 ===== */

.settings-avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, var(--healing-blue), var(--healing-purple));
  box-shadow: 0 4px 16px rgba(109, 93, 252, 0.24);
}

.settings-avatar-section {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
}

.settings-section-divider {
  margin: 24px 0 16px;
  border-top: 1px solid var(--healing-border);
  padding-top: 16px;
}

.settings-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--healing-ink);
  margin-bottom: 16px;
}

.settings-bmi-display {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 12px;
  background: var(--healing-surface);
  border: 1px solid var(--healing-border);
}

.settings-data-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.settings-data-stat-card {
  padding: 14px 18px;
  border-radius: 14px;
  background: var(--healing-surface);
  border: 1px solid var(--healing-border);
}

.settings-data-stat-card .stat-number {
  font-size: 24px;
  font-weight: 700;
  color: var(--healing-primary);
}

.settings-data-stat-card .stat-label {
  font-size: 13px;
  color: var(--healing-muted);
}

.settings-color-palette {
  display: flex;
  gap: 8px;
}

.settings-color-swatch {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--healing-border);
}

.settings-danger-zone {
  margin-top: 32px;
  padding: 20px;
  border-radius: 16px;
  border: 1px solid rgba(239, 68, 68, 0.24);
  background: rgba(254, 242, 242, 0.5);
}
```

---

## 实现注意事项

1. **User 模型新增字段全部可选（`?`），向后兼容。** 已有的用户数据不会受影响，`prisma migrate` 会安全添加列。

2. **修改密码必须验证旧密码。** `auth.service.ts` 中已有 `verifyPassword()` 函数可直接复用。新密码同样用 `hashPassword()` 加密存储。

3. **头像上传一期不做。** 头像区域只放一个占位圆形和按钮，按钮点击 `message.info('头像上传功能即将上线')`。后续可复用 `uploads` 模块实现。

4. **数据清理（批量删除）一期可以只放按钮 + 占位。** 如果需要实现，后端在 `HealthRecordsController` 新增 `DELETE /health/records` 不带 `:id` 的批量删除路由，或在 `ChatController` 新增批量删除会话路由。

5. **BMI 计算纯前端。** `weightKg / (heightCm/100)²`，不需要后端参与。参考标准：< 18.5 偏瘦，18.5-24 正常，24-28 偏胖，>28 肥胖（中国标准）。

6. **`GET /auth/me` 返回完整用户信息后，AuthProvider 中的 user 对象需要同步更新。** 建议在 `useAuth` hook 的 login 成功回调和新增的 `refreshUser` 方法中都走 `setCurrentUser(user)` 更新。

7. **Tab 默认激活项用 URL hash 或 query 控制（可选）。** 比如 `/settings?tab=data` 直接跳到数据管理 Tab，方便分享链接。用 `useSearchParams` 实现。

8. **Ant Design Tabs 的 `destroyInactiveTabPane` 设为 `false`**（默认），这样切换到模型配置 Tab 时不会丢失已加载的表单状态。

9. **不要引入新的 CSS 框架。** 全部样式继续用自定义 CSS + Ant Design 主题 token。

10. **侧边栏 label 从"模型设置"改为"设置"。** 这是一个小但重要的细节，避免用户以为设置页面只能配模型。

---

## 验收标准

- [ ] 设置页面显示四个 Tab：个人信息、模型配置、健康数据、外观偏好
- [ ] 个人信息 Tab 可修改昵称、简介、出生年份、性别、身高、体重并保存
- [ ] BMI 根据身高体重自动计算并显示
- [ ] 修改密码需要输入旧密码，旧密码错误时有明确错误提示
- [ ] 模型配置 Tab 功能与改造前完全一致（不回归）
- [ ] 健康数据 Tab 显示各类型记录条数
- [ ] 导出 JSON / CSV 按钮点击后触发文件下载
- [ ] 外观偏好 Tab 可切换浅色/深色/跟随系统并保存
- [ ] 删除账户有二次确认，确认后清除 token 跳回登录页
- [ ] 侧边栏"模型设置"改为"设置"
- [ ] 无新增 TypeScript 编译错误
- [ ] 构建通过 (`pnpm build`)
