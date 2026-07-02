# 对话空状态 — 抽象呼吸光球替换向日葵 — Agent 实现提示词

## 任务概述

将心理对话页面的向日葵空状态替换为**抽象呼吸光球**，使用项目紫色主题色系，通过多层径向渐变、呼吸脉动动画和玻璃质感打造安静、沉浸的视觉焦点，替代当前过于写实的向日葵设计。

## 需要修改的文件

| 文件 | 改动 |
|---|---|
| `apps/web/src/components/chat/MessageList.tsx` | 替换空状态 JSX：删除向日葵结构，改为光球结构 |
| `apps/web/src/styles.css` | 删除所有 `.sunflower-*` 样式（约 250 行），新增 `.orb-*` 样式 |

## 设计规格

### 视觉效果描述

一个悬浮在消息区中央的抽象光球，由多层半透明渐变叠加而成：

1. **最外层**：一个大面积的柔光晕（aura），直径约 260px，极淡的紫蓝渐变，高斯模糊，营造"光在空气中弥散"的感觉
2. **中间层**：2-3 个同心光环（ring），半透明细线圆环，间距不等，缓慢旋转或脉动
3. **核心球体**：直径约 100px 的实心球，径向渐变从中心的亮白色过渡到紫色再到深蓝边缘，带有玻璃高光
4. **内部高光**：球体左上方的弧形白色反光，模拟玻璃球质感
5. **底部倒影**：球体下方一个椭圆形极淡投影，增强悬浮感
6. **浮动粒子**（可选）：3-4 个微小的光点散布在球体周围，缓慢漂移

### 动画设计

- **呼吸脉动**：核心球体 `scale(0.96) → scale(1.04)` 循环，周期 4-5s，ease-in-out
- **光晕呼吸**：外层晕光与球体反相呼吸（球体放大时晕光收缩），增强"吞吐光芒"的感觉
- **光环旋转**：中间层圆环缓慢旋转（30-40s 一圈），不同环方向相反
- **粒子漂浮**：微光点随机缓慢漂移（translateX/Y 小范围），周期 8-12s
- **整体入场**：页面加载时从 `opacity: 0; scale(0.8)` 渐入到 `opacity: 1; scale(1)`，约 0.8s

### 配色（严格使用项目主题色）

| 元素 | 颜色 |
|---|---|
| 光球中心 | `rgba(255, 255, 255, 0.95)` → `rgba(167, 139, 250, 0.8)` → `rgba(109, 93, 252, 0.6)` |
| 光球边缘 | `rgba(59, 130, 246, 0.3)` → `transparent` |
| 外层晕光 | `rgba(109, 93, 252, 0.12)` + `rgba(59, 130, 246, 0.08)` |
| 光环线条 | `rgba(129, 140, 248, 0.18)` |
| 浮动粒子 | `rgba(167, 139, 250, 0.5)` ~ `rgba(255, 255, 255, 0.7)` |
| 底部投影 | `rgba(109, 93, 252, 0.08)` |

---

## 具体改动

### 1. MessageList.tsx — 替换空状态 JSX

**删除以下变量和导入：**
```tsx
// 删除
const sunflowerPetals = Array.from({ length: 24 });
const orbitDots = Array.from({ length: 6 });
```

**替换空状态 JSX（`if (!messages.length)` 分支内）：**

```tsx
if (!messages.length) {
  return (
    <div ref={windowRef} className="chat-window chat-window-centered" onScroll={updateStickiness}>
      <div className="orb-empty" aria-label="呼吸光球空状态">
        {/* 最外层柔光晕 */}
        <div className="orb-aura" aria-hidden="true" />
        {/* 中间层光环 */}
        <div className="orb-rings" aria-hidden="true">
          <span className="orb-ring" />
          <span className="orb-ring orb-ring-reverse" />
        </div>
        {/* 核心球体 */}
        <div className="orb-core" aria-hidden="true">
          <span className="orb-highlight" />
          <span className="orb-inner-glow" />
        </div>
        {/* 底部倒影 */}
        <div className="orb-reflection" aria-hidden="true" />
        {/* 浮动粒子 */}
        <div className="orb-particles" aria-hidden="true">
          <span className="orb-particle" style={{ '--px': '-68px', '--py': '-42px', '--duration': '9s' } as CSSProperties} />
          <span className="orb-particle" style={{ '--px': '56px', '--py': '-58px', '--duration': '11s' } as CSSProperties} />
          <span className="orb-particle" style={{ '--px': '72px', '--py': '24px', '--duration': '7.5s' } as CSSProperties} />
          <span className="orb-particle" style={{ '--px': '-50px', '--py': '46px', '--duration': '10s' } as CSSProperties} />
        </div>
        {/* 文案和操作区 */}
        <div className="orb-empty-copy">
          <Typography.Title level={4}>先把心里的重量放下来</Typography.Title>
          <Typography.Text>可以从最近的压力、情绪或困扰开始聊起，我会陪你慢慢梳理出清晰的一步。</Typography.Text>
          <div className="sunflower-prompts" aria-label="对话开场建议">
            {starterPrompts.map((prompt) => (
              <button key={prompt.label} type="button" onClick={() => onPromptSelect?.(prompt.text)}>
                {prompt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**注意：** `.sunflower-prompts` 类名保持不变（避免影响已有 CSS），后续可改为 `.orb-prompts` 并同步更新 CSS。`CSSProperties` 的 import 保持不变。

### 2. styles.css — 删除向日葵样式，新增光球样式

#### 2a. 删除以下样式块（约第 1175 行到第 1440 行之间）：

- `.sunflower-empty` 及其 `::before`、`::after`
- `.sunflower-aura`
- `.sunflower-orbit` 及 `.sunflower-orbit span`、所有 `nth-child`
- `.sunflower-bloom`
- `.sunflower-petals`
- `.sunflower-petal` 及 `:nth-child(2n)`
- `.sunflower-core`
- `.sunflower-core-glass`
- `.sunflower-core-shine`
- `.sunflower-stem` 及 `::before`
- `.sunflower-leaf`、`.sunflower-leaf.left`、`.sunflower-leaf.right`
- `.sunflower-empty-copy` 及其子选择器
- `.sunflower-prompts` 及子元素
- `@keyframes sunflower-float`
- `@keyframes sunflower-aura`
- `@keyframes sunflower-orbit`

**保留** `.sunflower-prompts` 及 `.sunflower-prompts button` 样式（提示词按钮），仅重命名类名为 `.orb-prompts`。

#### 2b. 新增光球样式：

```css
/* ===== 呼吸光球空状态 ===== */

.orb-empty {
  position: relative;
  display: flex;
  width: min(520px, 100%);
  min-height: 300px;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  isolation: isolate;
  padding: 36px 22px 28px;
  text-align: center;
  animation: orb-entrance 0.8s ease-out both;
}

@keyframes orb-entrance {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 最外层柔光晕 */
.orb-aura {
  position: absolute;
  z-index: -2;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 45% 42%, rgba(109, 93, 252, 0.14), transparent 55%),
    radial-gradient(circle at 58% 56%, rgba(59, 130, 246, 0.10), transparent 50%),
    radial-gradient(circle at 50% 50%, rgba(167, 139, 250, 0.08), transparent 65%);
  filter: blur(28px);
  transform: translateY(-40px);
  animation: orb-aura-breathe 4.5s ease-in-out infinite;
}

@keyframes orb-aura-breathe {
  0%, 100% {
    opacity: 0.7;
    transform: translateY(-40px) scale(1.06);
  }
  50% {
    opacity: 1;
    transform: translateY(-42px) scale(0.94);
  }
}

/* 中间层光环 */
.orb-rings {
  position: absolute;
  z-index: -1;
  width: 180px;
  height: 180px;
  transform: translateY(-40px);
}

.orb-ring {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(129, 140, 248, 0.16);
  border-radius: 50%;
  animation: orb-ring-spin 36s linear infinite;
}

.orb-ring::before {
  position: absolute;
  inset: 18px;
  border: 1px solid rgba(129, 140, 248, 0.10);
  border-radius: 50%;
  content: '';
}

.orb-ring-reverse {
  inset: 24px;
  animation-direction: reverse;
  animation-duration: 28s;
  border-color: rgba(167, 139, 250, 0.12);
}

.orb-ring-reverse::before {
  inset: 14px;
  border-color: rgba(167, 139, 250, 0.08);
}

@keyframes orb-ring-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 核心球体 */
.orb-core {
  position: relative;
  z-index: 1;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 38% 32%, rgba(255, 255, 255, 0.5), transparent 28px),
    radial-gradient(circle at 50% 50%,
      rgba(255, 255, 255, 0.95) 0%,
      rgba(196, 181, 253, 0.85) 24%,
      rgba(167, 139, 250, 0.7) 42%,
      rgba(109, 93, 252, 0.55) 62%,
      rgba(59, 130, 246, 0.3) 82%,
      transparent 100%
    );
  box-shadow:
    0 0 40px rgba(109, 93, 252, 0.2),
    0 0 80px rgba(109, 93, 252, 0.1),
    inset 0 -8px 24px rgba(59, 130, 246, 0.15),
    inset 0 8px 20px rgba(255, 255, 255, 0.25);
  transform: translateY(-40px);
  animation: orb-core-breathe 4.5s ease-in-out infinite;
}

@keyframes orb-core-breathe {
  0%, 100% {
    transform: translateY(-40px) scale(0.96);
    box-shadow:
      0 0 36px rgba(109, 93, 252, 0.18),
      0 0 72px rgba(109, 93, 252, 0.08),
      inset 0 -8px 24px rgba(59, 130, 246, 0.15),
      inset 0 8px 20px rgba(255, 255, 255, 0.25);
  }
  50% {
    transform: translateY(-40px) scale(1.04);
    box-shadow:
      0 0 52px rgba(109, 93, 252, 0.28),
      0 0 96px rgba(109, 93, 252, 0.14),
      inset 0 -8px 24px rgba(59, 130, 246, 0.18),
      inset 0 8px 20px rgba(255, 255, 255, 0.3);
  }
}

/* 球体高光（左上弧形反光） */
.orb-highlight {
  position: absolute;
  top: 14px;
  left: 18px;
  width: 26px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.72);
  filter: blur(3px);
  transform: rotate(-20deg);
}

/* 球体内部柔光 */
.orb-inner-glow {
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 42% 38%, rgba(255, 255, 255, 0.18), transparent 60%);
}

/* 底部倒影 */
.orb-reflection {
  position: absolute;
  z-index: 0;
  width: 120px;
  height: 24px;
  margin-top: -16px;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 0%, rgba(109, 93, 252, 0.1), transparent 70%);
  filter: blur(6px);
  animation: orb-reflection-breathe 4.5s ease-in-out infinite;
}

@keyframes orb-reflection-breathe {
  0%, 100% {
    opacity: 0.6;
    transform: scaleX(1.04);
  }
  50% {
    opacity: 0.9;
    transform: scaleX(0.96);
  }
}

/* 浮动粒子 */
.orb-particles {
  position: absolute;
  z-index: 0;
  width: 200px;
  height: 200px;
  transform: translateY(-40px);
  pointer-events: none;
}

.orb-particle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(167, 139, 250, 0.5);
  box-shadow: 0 0 10px rgba(167, 139, 250, 0.3);
  transform: translate(var(--px), var(--py));
  animation: orb-particle-drift var(--duration, 9s) ease-in-out infinite;
}

.orb-particle:nth-child(2) {
  width: 4px;
  height: 4px;
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
}

.orb-particle:nth-child(3) {
  width: 3px;
  height: 3px;
  background: rgba(109, 93, 252, 0.4);
}

.orb-particle:nth-child(4) {
  width: 4px;
  height: 4px;
  background: rgba(59, 130, 246, 0.45);
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.25);
}

@keyframes orb-particle-drift {
  0%, 100% {
    transform: translate(var(--px), var(--py));
    opacity: 0.5;
  }
  25% {
    transform: translate(calc(var(--px) + 8px), calc(var(--py) - 6px));
    opacity: 0.8;
  }
  50% {
    transform: translate(calc(var(--px) - 4px), calc(var(--py) + 10px));
    opacity: 0.4;
  }
  75% {
    transform: translate(calc(var(--px) + 6px), calc(var(--py) + 4px));
    opacity: 0.7;
  }
}

/* 文案区 */
.orb-empty-copy {
  position: relative;
  z-index: 1;
  display: flex;
  max-width: 480px;
  align-items: center;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}

.orb-empty-copy .ant-typography {
  margin: 0;
}

.orb-empty-copy .ant-typography:not(h4) {
  color: #5b5f8f !important;
  font-size: 14px;
  line-height: 1.75;
}

/* 提示词按钮（复用原 sunflower-prompts 样式，仅改名） */
.orb-prompts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
}

.orb-prompts button {
  cursor: pointer;
  padding: 5px 12px;
  border: 1px solid rgba(129, 140, 248, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.66);
  color: #6b6f98;
  font-size: 12px;
  box-shadow: 0 8px 18px rgba(80, 70, 180, 0.06);
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.orb-prompts button:hover {
  background: rgba(109, 93, 252, 0.12);
  color: var(--healing-primary);
  transform: translateY(-1px);
}
```

#### 2c. 重命名提示词按钮类名

在 MessageList.tsx 中将 `.sunflower-prompts` 改为 `.orb-prompts`，在 CSS 中同步。或者保留旧类名避免遗漏——由 agent 自行判断。

### 3. prefers-reduced-motion 支持

在 `styles.css` 中已有的 `@media (prefers-reduced-motion: reduce)` 查询中追加：

```css
@media (prefers-reduced-motion: reduce) {
  .orb-core,
  .orb-aura,
  .orb-ring,
  .orb-reflection,
  .orb-particle {
    animation: none !important;
  }
}
```

---

## 实现注意事项

1. **光球整体高度约 180px（球体 + 倒影 + 间距），比原向日葵（花 + 茎 + 叶约 230px）更紧凑。** 配合文案区总共约 300px，在消息区内居中显示。

2. **不要用 SVG 或图片。** 全部用纯 CSS 实现（div + 渐变 + 动画），保持和原方案一致的技术路线，避免引入额外资源。

3. **核心球体的渐变是关键。** 从中心白色到紫色到蓝色边缘再到透明，这个多层渐变决定了球体的"发光"质感。不要简化为单一渐变。

4. **球体和光晕的呼吸是反相的**（球体放大时光晕缩小），这个细节让光球看起来像是在"吞吐光芒"，比同相呼吸更有生命力。

5. **粒子用 CSS 自定义属性 `--px`、`--py`、`--duration` 控制位置和周期，** 这样 JSX 中可以内联设置每个粒子的参数，避免为每个粒子写单独的 nth-child 规则。

6. **删除向日葵样式后，CSS 文件大约减少 250 行、新增约 200 行。** 总体更精简。

7. **入口动画 `orb-entrance` 只播放一次**（`animation-fill-mode: both`），不要设为 infinite。呼吸动画是 infinite。

## 验收标准

- [ ] 向日葵元素完全移除（花瓣、花盘、花茎、叶子、轨道点）
- [ ] 光球居中显示，由多层渐变构成，有玻璃质感高光
- [ ] 球体有呼吸脉动动画（放大/缩小 + 光影变化）
- [ ] 外层光晕与球体反相呼吸
- [ ] 光环缓慢旋转，两个环方向相反
- [ ] 3-4 个微光粒子在球体周围缓慢漂移
- [ ] 页面加载时整体渐入（opacity + scale）
- [ ] 底部有柔和的椭圆倒影增强悬浮感
- [ ] 配色全部来自项目紫色主题色系，无黄色/棕色/绿色
- [ ] 文案"先把心里的重量放下来"和提示词按钮正常显示
- [ ] `prefers-reduced-motion` 下所有动画停止
- [ ] 无新增 TypeScript 编译错误，构建通过
