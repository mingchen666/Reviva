# MindSpace 自定义主题

MindSpace 支持导入完整主题，也支持在软件内直接填写自定义 CSS。完整用户主题只需要一个文件夹和两个文件：

```text
my-theme/
  theme.json
  theme.css
```

文件夹名称必须和主题 ID 相同。用户主题使用普通 CSS，不需要 Sass，也不需要重新构建应用。

## 主题如何生效

“经典”主题直接使用 MindSpace 页面现有样式，是默认视觉基线。其他内置主题和用户主题不会要求修改页面源码，而是通过主题变量和 CSS 选择器覆盖对话区、设置页、表格、弹窗等现有元素。

应用内置覆盖层只对非经典主题生效。用户主题 CSS 在覆盖层之后加载，可以继续调整具体细节。建议优先使用公开变量；变量无法表达时，再使用以 `.theme-my-theme` 开头的选择器。

内置覆盖层适配产品外壳、公共表单和弹窗，以及 Workchat、Settings、Docs、Wiki、Notes 等主要界面。业务状态色、文件类型色、代码高亮和用户内容不会被强制改成主题强调色。

## theme.json

```json
{
  "schemaVersion": 1,
  "id": "my-theme",
  "name": "我的主题",
  "description": "一套自定义主题",
  "version": "1.0.0",
  "author": "Your Name",
  "supports": ["light", "dark"],
  "entry": "theme.css",
  "accentHex": "#3B82F6"
}
```

- `id` 只能包含小写字母、数字和短横线。
- `supports` 至少包含 `light` 或 `dark`。
- `entry` 默认是 `theme.css`，并且必须位于主题根目录。
- `default`、`clarity`、`serene`、`contrast`、`neon-protocol`、`vermilion-archive` 和 `amber-terminal` 是内置主题 ID，不能使用。

## theme.css

```css
.theme-my-theme {
  --ui-brand-400: #60a5fa;
  --ui-brand-500: #3b82f6;
  --ui-brand-600: #2563eb;
  --ui-brand-400-rgb: 96, 165, 250;
  --ui-brand-500-rgb: 59, 130, 246;
  --ui-brand-600-rgb: 37, 99, 235;
  --ui-radius-control: 5px;
  --ui-radius-card: 9px;
  --ui-radius-dialog: 12px;
}

.theme-my-theme.theme-light {
  --ui-bg-0: #f8fafc;
  --ui-bg-1: #f1f5f9;
  --ui-bg-2: #ffffff;
  --ui-bg-3: #f8fafc;
  --ui-bg-4: #e2e8f0;
  --ui-bg-0-rgb: 248, 250, 252;
  --ui-bg-1-rgb: 241, 245, 249;
  --ui-bg-2-rgb: 255, 255, 255;
  --ui-bg-3-rgb: 248, 250, 252;
  --ui-bg-4-rgb: 226, 232, 240;
  --ui-text-main: #0f172a;
  --ui-text-sub: #475569;
  --ui-text-aux: #64748b;
  --ui-text-dim: #94a3b8;
  --ui-text-main-rgb: 15, 23, 42;
  --ui-text-sub-rgb: 71, 85, 105;
  --ui-text-aux-rgb: 100, 116, 139;
  --ui-text-dim-rgb: 148, 163, 184;
  --ui-border-panel: #d8e0e9;
  --ui-border-card: #cbd5e1;
  --ui-border-panel-rgb: 216, 224, 233;
  --ui-border-card-rgb: 203, 213, 225;
}

.theme-my-theme.theme-dark {
  --ui-bg-0: #0b1120;
  --ui-bg-1: #111827;
  --ui-bg-2: #172033;
  --ui-bg-3: #1e293b;
  --ui-bg-4: #334155;
  --ui-bg-0-rgb: 11, 17, 32;
  --ui-bg-1-rgb: 17, 24, 39;
  --ui-bg-2-rgb: 23, 32, 51;
  --ui-bg-3-rgb: 30, 41, 59;
  --ui-bg-4-rgb: 51, 65, 85;
  --ui-text-main: #f8fafc;
  --ui-text-sub: #cbd5e1;
  --ui-text-aux: #94a3b8;
  --ui-text-dim: #64748b;
  --ui-text-main-rgb: 248, 250, 252;
  --ui-text-sub-rgb: 203, 213, 225;
  --ui-text-aux-rgb: 148, 163, 184;
  --ui-text-dim-rgb: 100, 116, 139;
  --ui-border-panel: #334155;
  --ui-border-card: #475569;
  --ui-border-panel-rgb: 51, 65, 85;
  --ui-border-card-rgb: 71, 85, 105;
}
```

常用变量：

```text
--ui-bg-0 ... --ui-bg-4
--ui-text-main / --ui-text-sub / --ui-text-aux / --ui-text-dim
--ui-border-panel / --ui-border-card / --ui-border-focus
--ui-brand-50 ... --ui-brand-600
--ui-accent-secondary / --ui-accent-secondary-rgb
--ui-radius-small / --ui-radius-control / --ui-radius-medium
--ui-radius-card / --ui-radius-dialog
--ui-shadow-small / --ui-shadow-panel / --ui-shadow-popup / --ui-shadow-dialog
--ui-motion-fast / --ui-motion-normal / --ui-motion-slow / --ui-motion-ease
```

如果颜色需要透明度工具类，请同时定义对应的 `-rgb` 变量。

设置中的“主题颜色”只替换交互主色，不会改变界面主题定义的背景、圆角、边框、阴影、间距、动效和第二强调色。

## CSS 选择器覆盖

主题也可以直接覆盖产品样式：

```css
.theme-my-theme nav {
  border-right-style: dashed;
}

.theme-my-theme .md-content pre {
  border: 1px solid var(--ui-border-card);
}
```

建议所有选择器以 `.theme-my-theme` 开头。内部组件类名可能随版本变化，CSS 变量更稳定。

用户 CSS 在内置主题和共享覆盖层之后加载。Naive UI 等公共组件的部分变量使用了 `!important`；高级覆盖可以使用完整主题根选择器：

```css
.theme-my-theme[data-theme='my-theme'][data-color-mode] .n-input {
  --n-border-radius: 10px !important;
  --n-color: var(--ui-bg-2) !important;
}
```

只在普通选择器无法覆盖组件变量时使用 `!important`，不要使用全局 `*` 覆盖。

页面类名属于高级覆盖接口，不保证跨版本稳定。升级后如果局部覆盖失效，应检查对应元素的类名；公开的 `--ui-*` 变量仍是推荐接口。

## 使用方法

1. 在“设置 > 主题”点击“导入主题”。
2. 选择包含 `theme.json` 的文件夹。
3. 修改主题目录里的 `theme.css` 后，点击“重新加载”。
4. 如果样式异常，切回“经典”主题；也可以关闭应用后移走主题文件夹。

第一版 CSS 上限为 1 MB，不编译 `.scss`，也不解析主题内相对图片或字体资源。

## 软件内自定义 CSS

如果只需要调整局部样式，不必创建主题包。在“设置 > 主题”的“自定义 CSS”区域直接输入或粘贴 CSS，然后点击“应用”。

- 应用后有 5 秒试用时间；点击“保留样式”才会永久保存。
- 未确认、离开页面或界面被隐藏时会自动恢复上一份样式。
- “重置”清空自定义 CSS，并恢复当前主题。
- `Ctrl/Command + Alt + Shift + R` 可以紧急清除自定义 CSS。
- 软件内 CSS 最大 1 MB，不支持 `@import`、脚本 URL 和远程资源。

保护机制负责试用回退、文件安全和紧急恢复，不限制 CSS 可以使用的选择器或属性。`#app`、`html`、`body`、全局 `*` 和 `display: none` 等规则仍可能改变或隐藏整个界面。优先使用公开的 `--ui-*` 变量；页面类名属于可能随版本变化的高级接口。

已确认样式保存在本目录的 `custom.css`。`custom.pending.css` 只是试用文件，应用重启后不会加载。
