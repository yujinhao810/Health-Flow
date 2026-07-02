# HealthFlow 仪表盘可视化升级 — Agent 实现提示词

## 任务概述

将 HealthFlow 仪表盘的静态 CSS 迷你柱状图替换为基于 Recharts 的可交互图表，支持 **周 / 月 / 年** 三种时间粒度切换，卡片内嵌紧凑图表，点击可展开为全屏详细视图。

---

## 项目技术栈上下文

- **前端**: React 18 + Vite 5 + Ant Design 5 + React Router 6 + TanStack Query 5
- **样式**: 无 Tailwind，全部使用 Ant Design ConfigProvider 主题 + 自定义 CSS (`styles.css`)
- **数据获取**: `useHealthRecords()` hook 通过 `GET /health/records?type=xxx` 获取全量记录，前端聚合
- **后端**: NestJS + Prisma + PostgreSQL，API 端口 3001
- **主题色系**: 紫色治愈系毛玻璃风格，CSS 变量如下：
  - `--healing-primary: #6d5dfc` (主色)
  - `--healing-blue: #3b82f6`
  - `--healing-purple: #a78bfa`
  - `--healing-ink: #1e1b4b` (文字)
  - `--healing-muted: #64748b` (次要文字)
  - `--healing-surface: rgba(255, 255, 255, 0.74)` (卡片背景)
  - `--healing-border: rgba(129, 140, 248, 0.18)`

---

## 需要修改的关键文件

| 文件 | 作用 |
|---|---|
| `apps/web/src/pages/DashboardPage.tsx` | 仪表盘主页面，包含 3 个指标卡片 + 洞察面板 + Agent 运行面板 + 快照卡片 |
| `apps/web/src/components/snapshots/SnapshotCard.tsx` | 健康快照卡片，含睡眠/心情/运动三栏 MiniBars |
| `apps/web/src/hooks/useHealthRecords.ts` | 数据获取 hook，当前只支持 `listHealthRecords(type?)` |
| `apps/web/src/api/health.ts` | API 客户端，`listHealthRecords` 只接受 type 参数，无日期过滤 |
| `apps/web/src/styles.css` | 全局样式，~2000 行自定义 CSS |
| `apps/api/src/health-records/health-records.controller.ts` | 后端控制器，当前 `GET` 只支持 `?type=` 过滤 |
| `apps/api/src/health-records/health-records.service.ts` | 后端服务层 |

---

## 分步实现计划

### Step 1: 安装 Recharts

```bash
cd apps/web && pnpm add recharts
```

Recharts 选这个库是因为 React 原生、轻量、API 简洁，和 Ant Design 搭配无障碍。

### Step 2: 后端 — 扩展健康记录查询接口

当前 `GET /health/records` 只支持 `?type=` 过滤。需要增加日期范围参数：

**修改 `apps/api/src/health-records/health-records.controller.ts`:**
- `list` 方法增加 `@Query('from') from?: string` 和 `@Query('to') to?: string` 参数
- 传递到 service 层

**修改 `apps/api/src/health-records/health-records.service.ts`:**
- `list` 方法在 Prisma `findMany` 的 `where` 条件中加入 `recordedAt: { gte: from, lte: to }` 过滤
- 如果 from/to 未传则不过滤（保持向后兼容）

**修改 `apps/web/src/api/health.ts`:**
- `listHealthRecords` 签名改为 `listHealthRecords(type?, from?, to?)`，拼接 query 参数

**修改 `apps/web/src/hooks/useHealthRecords.ts`:**
- `useHealthRecords` 增加可选的 `from` 和 `to` 参数，拼入 queryKey 和 queryFn

### Step 3: 新建前端数据聚合工具模块

创建 `apps/web/src/lib/chart-data.ts`，封装从原始 `HealthRecord[]` 到图表数据的转换逻辑：

```typescript
// 核心函数签名示例

type TimeRange = 'week' | 'month' | 'year';

// 按日聚合睡眠时长
function aggregateSleepData(records: HealthRecord[], range: TimeRange): ChartPoint[]

// 按日聚合心情评分
function aggregateMoodData(records: HealthRecord[], range: TimeRange): ChartPoint[]

// 按日聚合运动分钟数
function aggregateExerciseData(records: HealthRecord[], range: TimeRange): ChartPoint[]

// 综合概览数据（三条线合一）
function aggregateOverviewData(records: HealthRecord[], range: TimeRange): OverviewChartPoint[]

// 辅助：根据 range 计算日期窗口
function getDateRange(range: TimeRange): { from: string; to: string }

// 辅助：填充缺失日期（没有记录的日期用 null 或 0 填充，保证 X 轴连续）
function fillMissingDates(data: ChartPoint[], range: TimeRange): ChartPoint[]

type ChartPoint = { date: string; value: number | null };
type OverviewChartPoint = { date: string; sleep: number | null; mood: number | null; exercise: number | null };
```

**关键细节:**
- `week` = 最近 7 天，`month` = 最近 30 天，`year` = 最近 365 天
- 月/年视图下，如果数据点太多（>60），考虑按周聚合而不是按日
- 缺失日期填充 `null`，让 Recharts 的 `connectNulls` 控制是否连线
- 睡眠时长从 `payload.startedAt` 和 `payload.endedAt` 计算差值（小时）
- 心情评分从 `payload.score` 提取
- 运动时长从 `payload.durationMinutes` 提取

### Step 4: 创建可复用的图表组件

#### 4a. 紧凑图表组件 — `CompactTrendChart`

文件: `apps/web/src/components/charts/CompactTrendChart.tsx`

用于替换仪表盘三张指标卡片中的 `MiniMetricBars` 和 `Progress`。

```
要求:
- 尺寸紧凑：高度 80-100px，宽度 100%（响应式）
- 使用 Recharts 的 ResponsiveContainer + AreaChart 或 BarChart
- 睡眠卡片: AreaChart，渐变填充色 rgba(109,93,252,0.15) -> rgba(109,93,252,0.02)，线条色 #6d5dfc
- 心情卡片: AreaChart，渐变填充色 rgba(167,139,250,0.15) -> rgba(167,139,250,0.02)，线条色 #a78bfa
- 运动卡片: BarChart，柱状色 linear-gradient(#38bdf8, #6d5dfc)，圆角 4px
- 隐藏 X/Y 轴刻度和网格线（保持紧凑）
- Tooltip: 精简样式，显示日期和数值，背景 var(--healing-surface-strong)
- 无数据时显示 Ant Design Empty 组件
- 外层包裹一个"展开"按钮（右上角，图标用 antd 的 ExpandOutlined），点击触发展开
```

#### 4b. 详细图表组件 — `TrendDetailModal`

文件: `apps/web/src/components/charts/TrendDetailModal.tsx`

全屏模态框（Ant Design Modal，`width="80vw"` 或 `style={{ maxWidth: 1200 }}`），展示选中维度的完整交互图表。

```
要求:
- 顶部: 标题 + 时间范围切换器（Ant Design Segmented: 周/月/年）
- 中间: Recharts AreaChart 或 ComposedChart，高度 400px
  - XAxis: 日期标签，周视图显示 MM/DD，月视图显示 M月，年视图显示 YYYY-MM
  - YAxis: 带刻度标签和单位
  - CartesianGrid: 虚线，颜色 var(--healing-border)
  - Tooltip: 完整信息卡片，玻璃风格背景
  - Legend: 如果是综合视图，显示图例
  - Brush: 年和月视图底部显示 Brush 组件支持缩放拖拽
  - ReferenceLine: 睡眠图在 8h 处画一条虚线参考线（推荐睡眠），心情图在 5 分处画中线
- 底部: 统计摘要（平均值、最高值、最低值、记录天数/总天数）
- 玻璃风格: Modal body 背景 rgba(243,240,255,0.6) + backdrop-filter: blur(20px)
- 圆角: 22px（和 Ant Design Card 一致）
```

#### 4c. 综合趋势图（可选增强）

文件: `apps/web/src/components/charts/OverviewTrendChart.tsx`

替换或增强 `SnapshotCard` 中的三栏迷你图，用一个 ComposedChart 同时展示睡眠、心情、运动三条线。

```
要求:
- 三轴归一化（睡眠 0-12h, 心情 0-10, 运动 0-180min），都映射到 0-100 的相对刻度
- 三条线颜色: sleep=#6d5dfc, mood=#a78bfa, exercise=#38bdf8
- 同样支持周/月/年切换
- 图例可点击切换显示/隐藏某条线
```

### Step 5: 改造 DashboardPage.tsx

**替换三张指标卡片中的迷你图:**

1. **睡眠卡片** (`<Col xs={24} md={8}>`):
   - 移除 `<MiniMetricBars />`
   - 替换为 `<CompactTrendChart type="sleep" range="week" />`
   - 保留 Statistic 标题文字不变
   - 卡片底部或右上角添加展开按钮

2. **心情卡片**:
   - 保留 `<Statistic>` 和 `<Tag>` 部分
   - 在 Tag 下方新增 `<CompactTrendChart type="mood" range="week" />`

3. **运动卡片**:
   - 移除 `<Progress />`
   - 替换为 `<CompactTrendChart type="exercise" range="week" />`
   - 保留统计数字

**状态管理:**
- 新增 `selectedChart: 'sleep' | 'mood' | 'exercise' | null` 状态，控制哪个图表展开了详细 Modal
- Modal 关闭时 `setSelectedChart(null)`

**数据获取调整:**
- 紧凑视图默认加载 `week` 范围的数据（和现有行为一致）
- 展开 Modal 时，根据选择的 range 动态获取对应范围数据
- 如果当前 `useHealthRecords()` 已经获取了全量数据，可以先纯前端过滤聚合，不必改后端 API（降低改动风险）。后续数据量大了再改为服务端分页。

### Step 6: 改造 SnapshotCard.tsx

**替换三栏 MiniBars:**

将 `<MiniBars data={...} />` 替换为 `<CompactTrendChart>` 或直接用 Recharts `<ResponsiveContainer>` + `<AreaChart>`。

保持三栏布局 (`<Row gutter>` + `<Col lg={8}>`) 不变，只是每栏内的图表升级为可交互。

### Step 7: 样式补充

在 `apps/web/src/styles.css` 中追加图表相关样式:

```css
/* ===== 图表组件样式 ===== */

.compact-chart-wrapper {
  position: relative;
  height: 88px;
  margin-top: 8px;
}

.compact-chart-expand {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.2s;
}

.compact-chart-wrapper:hover .compact-chart-expand {
  opacity: 1;
}

/* Recharts Tooltip 定制 */
.chart-tooltip {
  background: var(--healing-surface-strong) !important;
  border: 1px solid var(--healing-border) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 24px rgba(80, 70, 180, 0.12) !important;
  padding: 10px 14px !important;
  backdrop-filter: blur(12px);
}

.chart-tooltip-label {
  color: var(--healing-muted);
  font-size: 12px;
}

.chart-tooltip-value {
  color: var(--healing-ink);
  font-weight: 600;
}

/* 详细 Modal */
.trend-detail-modal .ant-modal-content {
  background: rgba(243, 240, 255, 0.85) !important;
  backdrop-filter: blur(20px);
  border-radius: 22px !important;
  border: 1px solid var(--healing-border);
}

.trend-detail-modal .ant-modal-header {
  background: transparent !important;
  border-bottom: 1px solid var(--healing-border);
}

/* 统计摘要条 */
.trend-stats-bar {
  display: flex;
  gap: 24px;
  padding: 12px 0;
  border-top: 1px solid var(--healing-border);
  margin-top: 16px;
}

.trend-stats-bar .stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.trend-stats-bar .stat-label {
  font-size: 12px;
  color: var(--healing-muted);
}

.trend-stats-bar .stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--healing-ink);
}

/* Recharts 线条和区域动画 */
.recharts-area-curve,
.recharts-line-curve {
  filter: drop-shadow(0 2px 4px rgba(109, 93, 252, 0.2));
}
```

### Step 8: 颜色配置常量

创建 `apps/web/src/lib/chart-theme.ts`:

```typescript
export const CHART_COLORS = {
  sleep: { line: '#6d5dfc', area: 'rgba(109,93,252,0.12)', gradient: ['#6d5dfc', '#818cf8'] },
  mood: { line: '#a78bfa', area: 'rgba(167,139,250,0.12)', gradient: ['#a78bfa', '#c4b5fd'] },
  exercise: { line: '#38bdf8', area: 'rgba(56,189,248,0.12)', gradient: ['#38bdf8', '#6d5dfc'] },
  grid: 'rgba(129,140,248,0.12)',
  text: '#64748b',
  referenceLine: 'rgba(109,93,252,0.3)',
} as const;

export const CHART_BREAKPOINTS = {
  week: { tickFormat: 'MM/DD', aggregateBy: 'day' },
  month: { tickFormat: 'MM/DD', aggregateBy: 'day' },  // 超过 31 天自动切周
  year: { tickFormat: 'YYYY-MM', aggregateBy: 'week' },
} as const;
```

---

## 交互设计规格

### 仪表盘卡片内（紧凑视图）

1. 卡片默认显示 7 天趋势图（和现有行为一致）
2. 鼠标悬停图表时显示 Tooltip（日期 + 数值）
3. 鼠标悬停卡片时右上角出现展开按钮（ExpandOutlined 图标）
4. 点击展开按钮打开 `TrendDetailModal`

### 详细视图（Modal）

1. 顶部: 维度标题 + `Segmented` 切换 周 / 月 / 年
2. 切换时间范围时图表平滑过渡（Recharts 自带动画）
3. 月/年视图底部显示 `Brush` 拖拽缩放条
4. 底部统计摘要: 均值、峰值、谷值、记录天数
5. 关闭按钮在右上角（Ant Design Modal 默认）

### 无数据状态

- 紧凑视图: 高度 88px 的区域内显示灰色文字 "暂无趋势数据"
- 详细视图: Ant Design `Empty` 组件，描述 "所选时间范围内暂无 XX 记录"

---

## 实现注意事项

1. **不要修改或删除 `MiniMetricBars` 和 `MiniBars` 函数定义**，它们可能在其他地方被引用。在 DashboardPage 和 SnapshotCard 中替换使用处即可。

2. **数据获取策略**: 优先使用前端聚合（现有 `useHealthRecords()` 已获取全量数据），仅在数据量导致性能问题时才改后端。如果选择纯前端方案，Step 2 的后端改动可以跳过。

3. **Recharts 的 `ResponsiveContainer` 需要父容器有明确高度**，确保 `.compact-chart-wrapper` 设置了 `height: 88px`。

4. **Ant Design `Segmented` 组件**用于时间范围切换，比 `Radio.Group` 更紧凑现代。

5. **年视图数据点较多（365天）**，建议按周聚合（每周一个数据点 ≈ 52 个点），避免图表过于拥挤。

6. **颜色必须使用项目主题色系**，不要引入新的颜色。渐变方向统一从上到下（线性渐变）。

7. **prefers-reduced-motion**: 在 `styles.css` 中已有的 `@media (prefers-reduced-motion: reduce)` 查询中，补充 Recharts 动画禁用规则：
   ```css
   @media (prefers-reduced-motion: reduce) {
     .recharts-wrapper * { animation: none !important; transition: none !important; }
   }
   ```

8. **不要引入新的 CSS 框架**（如 Tailwind）。所有样式继续使用自定义 CSS + Ant Design 主题 token。

---

## 验收标准

- [ ] 仪表盘三张指标卡片的迷你柱状图替换为 Recharts 紧凑图表
- [ ] 悬停卡片时展开按钮出现，点击打开详细 Modal
- [ ] Modal 内可切换 周/月/年，图表数据正确更新
- [ ] Tooltip 显示日期和数值，样式符合玻璃主题
- [ ] 睡眠图有 8h 参考线，心情图有 5 分中线
- [ ] 年视图按周聚合，月/年视图有 Brush 缩放
- [ ] 无数据时优雅降级（不报错、不白屏）
- [ ] SnapshotCard 中的 MiniBars 也升级为 Recharts 图表
- [ ] `prefers-reduced-motion` 下禁用动画
- [ ] 无新增 TypeScript 编译错误
- [ ] 构建通过 (`pnpm build`)
