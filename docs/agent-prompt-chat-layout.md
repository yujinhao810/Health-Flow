# 心理对话页面布局改造 — Agent 实现提示词

## 任务概述

将心理对话页面改造为**全屏沉浸式布局**，类似微信/Telegram Web 的体验：左侧历史会话固定高度撑满视口，右侧消息区内部滚动、输入框固定在底部，删除页面顶部标题区以释放垂直空间。

## 需要修改的文件

| 文件 | 改动 |
|---|---|
| `apps/web/src/pages/ChatPage.tsx` | 删除 `page-intro` 区域 |
| `apps/web/src/styles.css` | 改造 `.chat-layout`、`.chat-sidebar`、`.chat-main`、`.chat-window`、`.chat-composer` 的高度和定位方式 |

## 具体改动

### 1. ChatPage.tsx — 删除页面标题

**当前代码：**
```tsx
export function ChatPage() {
  return (
    <>
      <div className="page-intro">
        <Typography.Title level={2}>心理对话助手</Typography.Title>
        <Typography.Paragraph type="secondary">
          聊聊今天的状态，我会陪你慢慢梳理。
        </Typography.Paragraph>
      </div>
      <ChatPanel />
    </>
  );
}
```

**改为：**
```tsx
export function ChatPage() {
  return <ChatPanel />;
}
```

同时移除不再需要的 `Typography` import。

### 2. styles.css — 布局改造

核心思路：`.chat-layout` 从 `min-height` 改为 `height`，撑满视口剩余空间。侧边栏和主区域各自高度锁定，内部各自滚动。

**`.chat-layout`（约第 966 行）：**

```css
/* 改前 */
.chat-layout {
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr);
  gap: 18px;
  min-height: calc(100vh - 190px);
}

/* 改后 */
.chat-layout {
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr);
  gap: 18px;
  height: calc(100vh - clamp(48px, 4.4vw, 108px));
  /* 108px = 顶部padding + 底部padding (clamp 24px*2 到 54px*2) */
  /* 删掉 page-intro 后不需要额外减去标题高度 */
}
```

**注意：** `.app-content` 的 padding 是 `clamp(24px, 2.2vw, 54px)`，上下各一份，所以 `chat-layout` 的高度应该是 `100vh - padding上下 * 2`，即 `calc(100vh - clamp(48px, 4.4vw, 108px))`。

**`.chat-sidebar`（约第 973 行）：**

```css
/* 改前 */
.chat-sidebar {
  display: flex;
  min-height: 560px;
  min-width: 0;
  flex-direction: column;
  padding: 14px;
  ...
}

/* 改后 */
.chat-sidebar {
  display: flex;
  min-width: 0;
  height: 100%;           /* 撑满 chat-layout 的高度 */
  flex-direction: column;
  padding: 14px;
  overflow: hidden;       /* 侧边栏自身不滚动，内部 thread-list 滚动 */
  ...（其余属性保持不变）
}
```

删除 `min-height: 560px`，改为 `height: 100%`。侧边栏内部的 `.chat-thread-list` 已经有 `flex: 1; overflow: auto;`，它会自动承担滚动职责。

**`.chat-main`（约第 1147 行）：**

```css
/* 改前 */
.chat-main {
  display: flex;
  min-width: 0;
  min-height: 560px;
  flex-direction: column;
  overflow: hidden;
  ...
}

/* 改后 */
.chat-main {
  display: flex;
  min-width: 0;
  height: 100%;           /* 撑满 chat-layout 的高度 */
  flex-direction: column;
  overflow: hidden;
  ...（其余属性保持不变）
}
```

删除 `min-height: 560px`，改为 `height: 100%`。`.chat-main` 内部是 flex column 布局，`.chat-window` 已经设置了 `flex: 1; min-height: 0; overflow: auto;`，所以消息区会自动占据剩余空间并内部滚动。`.chat-composer` 作为 flex column 的最后一个子元素，自然固定在底部。

**`.chat-composer`（约第 1642 行）：**

不需要改布局属性，但确认它有 `flex-shrink: 0`（或至少没有 `flex: 1`），保证不被压缩。当前 `.chat-composer` 没有设置 flex 属性，作为默认 block 元素在 flex column 中不会被 flex: 1 的 `.chat-window` 挤压，但建议显式加上：

```css
.chat-composer {
  flex-shrink: 0;          /* 新增：确保输入框不被压缩 */
  width: 100%;
  padding: 12px 16px 14px;
  ...（其余保持不变）
}
```

**`.chat-window`（约第 1161 行）：**

当前已经是 `flex: 1; min-height: 0; overflow: auto;`，这是正确的，不需要修改。

### 3. 响应式断点适配

**1600px+ 断点（约第 2156 行）：**
```css
/* 当前 */
.chat-layout {
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 24px;
}
```
这个断点只改了列宽和间距，高度计算由基础规则继承，无需额外修改。

**900px 移动端断点（约第 2265 行）：**
```css
/* 改前 */
.chat-layout {
  grid-template-columns: 1fr;
}
.chat-sidebar {
  min-height: 260px;
  max-height: 340px;
}
.chat-window {
  min-height: 360px;
}

/* 改后 */
.chat-layout {
  grid-template-columns: 1fr;
  height: auto;                   /* 移动端不强制全屏，允许自然流 */
  min-height: calc(100vh - clamp(48px, 4.4vw, 108px));
}
.chat-sidebar {
  max-height: 340px;              /* 保持移动端侧边栏最大高度限制 */
  /* 删除 min-height: 260px，让内容自然撑开 */
}
.chat-main {
  height: calc(100vh - 400px);    /* 移动端消息区给一个合理的最小高度 */
  min-height: 360px;
}
.chat-window {
  /* 删除 min-height: 360px，flex:1 会自动撑满 */
}
```

移动端改为单列后，侧边栏在上方（max-height 340px 内部滚动），消息区在下方。不再强制两侧等高。

## 实现注意事项

1. **不要改 `.chat-window` 的 `flex: 1` 和 `min-height: 0`**，这两个属性组合是让 flex 子元素在 column 方向正确占满剩余空间并允许内部滚动的关键。缺少 `min-height: 0` 会导致 flex 子元素不会收缩到比内容小，滚动条不会出现。

2. **`.chat-composer` 内的附件 chips 和 RAG 开关等组件保持不变。** Composer 高度会随内容自适应（TextArea 的 `autoSize`），但因为 `flex-shrink: 0`，它不会被消息区挤压。

3. **侧边栏底部的 `KnowledgeBasePanel`（`<details>` 折叠面板）保持不变。** 它在 `.chat-sidebar` 的 flex column 中位于 `.chat-thread-list` 之后。当知识库展开时，thread-list 会自动收缩（因为 `flex: 1; min-height: 0;`）。

4. **删除 `page-intro` 后不影响其他页面。** `.page-intro` 样式类仍被 DashboardPage、RecordsPage 等页面使用，不要删除 CSS 中的 `.page-intro` 样式定义，只删除 ChatPage.tsx 中的 JSX。

5. **向日葵空状态（`.sunflower-empty`）不受影响。** 它在 `.chat-window-centered` 内居中显示，`.chat-window` 的高度变化只会让它有更大的居中区域。

## 验收标准

- [ ] 页面顶部不再显示"心理对话助手"标题和副标题
- [ ] 左侧历史会话区高度与视口底部齐平，会话过多时 `.chat-thread-list` 内部出现滚动条
- [ ] 右侧消息区 `.chat-window` 内部滚动，消息多时上下滚动，消息少时不出现滚动条
- [ ] 输入框 `.chat-composer` 固定在主区域底部，不随消息滚动
- [ ] 发送消息后消息区自动滚动到底部，输入框位置不变
- [ ] 移动端（< 900px）单列布局正常：侧边栏在上有最大高度限制，消息区在下方可滚动
- [ ] 知识库折叠面板展开时，侧边栏会话列表自动收缩
- [ ] 无新增 TypeScript 编译错误，构建通过
