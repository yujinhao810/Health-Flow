# 模型配置 UI 精简改造 — Agent 实现提示词

## 任务概述

精简设置页面的"模型配置"Tab，将当前铺平展示的 6 个表单项重组为**主区（3 项）+ 折叠区（高级选项）**的布局，模型选择从 AutoComplete 改为纯文本输入，减少视觉复杂度，消除模型列表滞后的问题。

## 需要修改的文件

| 文件 | 改动 |
|---|---|
| `apps/web/src/pages/SettingsPage.tsx` | 重组模型配置表单布局 |
| `apps/web/src/styles.css` | 新增折叠区相关样式（如需） |

## 当前布局问题

```
当前（全部铺平，且暴露开发者信息）：
├── [Typography] "API Key 只由后端保存和调用...fetch failed..."  ← 开发者文档！
├── [Alert] "Base URL 留空时使用后端环境变量..."                 ← 技术说明！
├── 提供商 (Select)
├── 模型 (AutoComplete + 固定模型列表)                          ← 列表滞后 + 视觉噪音
├── API Key (Input.Password, extra 暴露环境变量名)              ← 技术细节！
├── Base URL (Input, extra 暴露环境变量名)                      ← 大部分人不用 + 技术细节！
├── [Card] 图片理解                                             ← 嵌套 Card 层级混乱
│   └── Vision Switch
├── [Card] 知识库 RAG                                           ← 又一层嵌套 Card
│   ├── RAG Switch
│   └── TopK InputNumber
├── 测试连接 Button
└── 保存配置 Button
```

## 改造后布局

```
改造后（干净的用户界面）：

[主区 - 始终可见]
├── 提供商 (Select)                     ← 保持下拉选择
├── 模型 (Input 纯文本)                  ← placeholder 显示推荐模型，extra 引导用户查模型 ID
├── API Key (Input.Password)            ← extra 只说"加密保存"，不提后端架构
├── [水平排列] 测试连接 | 保存配置        ← 按钮紧跟主表单

[折叠区 - Collapse, 默认收起]
└── ▶ 高级选项
    ├── Base URL (Input)                ← extra 说"自定义 API 地址"，不提环境变量
    ├── Vision Switch (图片理解)
    ├── RAG Switch (知识库增强)
    └── RAG TopK (仅 RAG 开启时显示)
```

## 具体改动

### 1. 模型字段：AutoComplete → Input

**当前代码：**
```tsx
<Form.Item name="model" label="模型" rules={[{ required: true }]} extra={`默认推荐：${providerMeta.defaultModel}`}>
  <AutoComplete options={modelOptions} placeholder={providerMeta.defaultModel} />
</Form.Item>
```

**改为：**
```tsx
<Form.Item
  name="model"
  label="模型"
  rules={[{ required: true }]}
  extra="填写提供商控制台中的模型 ID，如 gpt-4o、claude-sonnet-4-20250514、qwen-max 等。"
>
  <Input placeholder={providerMeta.defaultModel} />
</Form.Item>
```

**要点：**
- 移除 `AutoComplete` 和 `modelOptions` 相关代码（`DEFAULT_MODELS`、`modelOptions` 变量）
- 改用普通 `Input`，`placeholder` 显示当前提供商的推荐模型（用户不填时作为视觉提示）
- `extra` 提示语改为通用说明，引导用户去提供商控制台查模型 ID
- 不再需要从 `LLM_PROVIDER_METADATA` 读取 `models` 数组，但 `defaultModel` 仍然用于 placeholder
- 移除 `AutoComplete` 的 import

### 2. 主表单区精简

将提供商、模型、API Key 三个核心字段保留在主区，按钮紧跟其后：

```tsx
<Form form={form} layout="vertical" ...>
  {/* 主区：核心三件套 */}
  <Form.Item name="provider" label="提供商" rules={[{ required: true }]}>
    <Select options={PROVIDER_OPTIONS} onChange={handleProviderChange} />
  </Form.Item>

  <Form.Item name="model" label="模型" rules={[{ required: true }]} extra="...">
    <Input placeholder={providerMeta.defaultModel} />
  </Form.Item>

  <Form.Item name="apiKey" label="API Key" extra={...}>
    <Input.Password ... />
  </Form.Item>

  {/* 操作按钮：紧跟主表单 */}
  <Form.Item>
    <Space>
      <Button onClick={handleValidate} loading={validate.isPending}>测试连接</Button>
      <Button type="primary" htmlType="submit" loading={save.isPending}>保存配置</Button>
    </Space>
  </Form.Item>

  {/* 折叠区：高级选项 */}
  <Collapse
    ghost
    className="settings-advanced-collapse"
    items={[{
      key: 'advanced',
      label: <Typography.Text type="secondary">高级选项</Typography.Text>,
      children: (
        <>
          <Form.Item name="baseUrl" label="Base URL（可选）" extra={...}>
            <Input placeholder={...} />
          </Form.Item>

          <Form.Item
            name="visionEnabled"
            label="允许识别上传图片"
            valuePropName="checked"
            extra="开启后，对话中上传的图片会发送给上游模型进行识别。需要模型支持多模态。"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            name="ragEnabled"
            label="健康安全知识库"
            valuePropName="checked"
            extra="关闭后，对话不会检索健康安全知识库；危机安全策略仍然始终生效。"
          >
            <Switch />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.ragEnabled !== cur.ragEnabled}>
            {({ getFieldValue }) =>
              getFieldValue('ragEnabled') ? (
                <Form.Item name="ragTopK" label="每轮最多引用条数">
                  <InputNumber min={1} max={10} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </>
      ),
    }]}
  />
</Form>
```

### 3. 移除嵌套 Card

**当前代码中** Vision 和 RAG 各被包裹在一个 `Card size="small"` 里，形成了卡片中卡片的嵌套层级，视觉上很碎。

**改造后** 这些嵌套 Card 全部移除，改为扁平的 `Form.Item` 放在 Collapse 折叠面板内，用 `extra` 属性承载说明文字。

### 4. 清除所有开发者视角的技术文案

当前页面中有多处写给开发者而非用户看的技术说明，需要全部移除或改为用户能理解的语言：

**4a. 删除页面顶部的技术说明段落：**

```tsx
// 删除这段 —— 这是开发者文档，不是用户界面
<Typography.Paragraph type="secondary">
  API Key 只由后端保存和调用。测试连接时，如果提示 fetch failed，通常表示后端访问模型服务的网络链路失败，而不是前端页面本身失败。
</Typography.Paragraph>
```

这段文字暴露了后端架构细节（"后端保存和调用"、"网络链路"），普通用户完全不需要知道这些。如果测试连接失败，应该由 `message.error()` 的错误提示来引导用户（当前的 `simplifyApiError` 函数已经在做这件事）。

**4b. 删除表单上方的 Info Alert：**

```tsx
// 删除这个 Alert —— 信息已融入各字段的 extra 提示中
<Alert
  type="info"
  showIcon
  message="Base URL 留空时会使用后端环境变量或内置默认地址；模型下拉仅提供推荐值..."
/>
```

**4c. 清理 API Key 字段的 extra 文案：**

当前 API Key 的 extra 包含技术细节（`apiKeyEnv` 环境变量名）：

```tsx
// 改前 —— 暴露了后端环境变量名
extra={providerMeta.requiresApiKey
  ? `不填写则后端尝试使用环境变量 ${apiKeyEnv ?? '对应供应商 API_KEY'}；前端不会展示明文。`
  : '该提供商不需要 API Key。'}
```

改为面向用户的语言：

```tsx
// 改后
extra={providerMeta.requiresApiKey
  ? 'API Key 加密保存在后端，不会在前端展示。留空则使用系统默认配置。'
  : '该提供商无需 API Key。'}
```

**4d. 清理 Base URL 字段的 extra 文案：**

```tsx
// 改前 —— 暴露了后端环境变量名
extra={baseUrlEnv ? `可通过后端环境变量 ${baseUrlEnv} 覆盖。` : undefined}
```

改为：

```tsx
// 改后
extra="自定义模型服务的 API 地址。留空则使用默认地址，适合大多数情况。"
```

**4e. 删除不再使用的 import：**

移除 `AutoComplete`、`Alert` 的 import（如果改造后整个页面不再用到 `Alert`）。

### 5. 样式补充（如需要）

在 `styles.css` 中追加：

```css
/* ===== 设置页高级选项折叠区 ===== */

.settings-advanced-collapse.ant-collapse {
  margin-top: 8px;
}

.settings-advanced-collapse .ant-collapse-header {
  padding: 8px 0 !important;
}

.settings-advanced-collapse .ant-collapse-content-box {
  padding: 16px 0 0 !important;
}
```

Ant Design 的 Collapse 组件默认样式已经和玻璃主题比较兼容，使用 `ghost` 属性去除边框和背景后，只保留一个可点击的"高级选项"标题，视觉干扰最小。

---

## 实现注意事项

1. **`Input` 替换 `AutoComplete` 后，表单字段类型不变（都是 string），不影响 `form.setFieldsValue` 和 `form.validateFields` 的逻辑。**

2. **`handleProviderChange` 中原有的逻辑（切换提供商时自动填入默认模型）需要调整。** 之前是 `form.setFieldValue('model', nextMeta.defaultModel)`，现在改为只清空模型字段让用户自己填：`form.setFieldValue('model', '')`。因为纯输入模式下自动填入一个值会让用户困惑——他们会以为必须用这个模型。

   或者更友好的做法：切换提供商时不自动填模型，但 placeholder 会动态更新为当前提供商的推荐模型，作为视觉提示。

3. **`Collapse` 使用 `ghost` 属性**，这样没有边框和背景色，和现有的表单风格保持一致。不要用默认带边框的 Collapse。

4. **RAG TopK 的条件显示**使用 `Form.Item noStyle shouldUpdate` 模式，这是 Ant Design Form 的标准联动方式。只在 `ragEnabled = true` 时渲染 TopK 输入框。

5. **`Collapse` 默认收起。** 大多数用户只需要填提供商、模型、API Key 三个字段。高级选项是低频操作，默认隐藏可以减少认知负担。

6. **不要删除 `LLM_PROVIDER_METADATA` 中的 `models` 数组。** 虽然前端不再用于下拉选项，但后端 `SettingsService` 可能在验证模型名时使用（如 Anthropic 模型名白名单校验）。

7. **不要修改后端逻辑。** 这次改造纯前端 UI，后端接收的字段和验证规则不变。

8. **移除顶部 Alert 后，确保 Base URL 的说明信息没有丢失。** 检查 `baseUrl` 字段的 `extra` 属性是否已包含"留空使用后端默认值"的说明。

9. **测试连接失败的错误提示需要用户友好。** 删除了"fetch failed 是后端网络问题"的技术说明后，错误引导的责任完全在 `simplifyApiError` 函数。确认该函数对常见错误场景（连接超时、API Key 无效、模型不存在、网络不可达）都返回了用户能理解的中文提示。如果不够完善，可以在此处追加几个常见错误的映射，例如：`timeout` → "连接超时，请检查网络或稍后重试"，`401` → "API Key 无效或已过期"，`404` → "模型 ID 不存在，请到提供商控制台确认"。

## 验收标准

- [ ] 页面顶部不再有"API Key 只由后端保存和调用...fetch failed..."等技术说明段落
- [ ] 表单上方不再有 Info Alert（关于 Base URL 和环境变量的技术说明）
- [ ] API Key 字段的 extra 不包含环境变量名，只显示"加密保存在后端"
- [ ] Base URL 字段的 extra 不包含环境变量名，只显示"自定义 API 地址"
- [ ] 主区只显示 3 个表单项：提供商、模型、API Key
- [ ] 模型字段为纯文本 Input，placeholder 显示当前提供商的推荐模型
- [ ] 切换提供商时 placeholder 动态更新，不自动填入模型值
- [ ] 测试连接和保存配置按钮紧跟主表单
- [ ] 高级选项默认折叠，展开后显示 Base URL、Vision、RAG 配置
- [ ] RAG TopK 仅在 RAG 开关打开时显示
- [ ] 原有的嵌套 Card（图片理解、知识库 RAG）已移除
- [ ] 保存和测试连接功能不受影响
- [ ] 无新增 TypeScript 编译错误，构建通过
