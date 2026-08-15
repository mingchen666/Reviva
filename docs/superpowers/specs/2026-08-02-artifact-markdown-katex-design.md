# 创作成果 Markdown 与 LaTeX 渲染设计

## 目标

让 Q&A 问答卡、术语表和速查表中的 AI 生成文本可靠显示 Markdown 与 LaTeX 公式，同时保持现有预览的布局、筛选、折叠和打印行为不变。

## 范围

- 复用 `src/utils/markdown.js` 中的 `createMarkdownRenderer()` 与已安装的 KaTeX。
- 新增仅供结构化成果使用的渲染封装，输出已净化的 HTML。
- 三个预览按字段需要使用行内或块级 Markdown 渲染。
- 三个生成器提示词约束公式分隔符与 JSON 转义。

不新增 `markdown-it-katex` 依赖，不变更成果 JSON schema，也不调整用户已修改的视觉布局。

## 架构

新增 `src/utils/artifactMarkdown.js`：

1. 基于 `createMarkdownRenderer({ breaks: true, linkify: false })` 创建专用实例；原始 HTML 继续保持禁用。
2. 暴露行内与块级渲染函数。行内函数用于标题、标签、术语名等；块级函数用于答案、定义、语境和速查内容。
3. 在渲染前将标准 LaTeX 分隔符 `\\(...\\)`、`\\[...\\]` 规范为现有渲染器支持的 `$...$`、`$$...$$`，并保留原生 `$...$`、`$$...$$` 支持。
4. 空值返回空字符串。KaTeX 以 `throwOnError: false` 降级显示错误公式，不能使整个预览失败。

预览组件只将现有纯文本插值替换为该封装的渲染结果；传入 `v-html` 的内容始终来自该封装，绝不直接渲染模型原文。

## 字段映射

| 成果 | 行内字段 | 块级字段 |
| --- | --- | --- |
| Q&A | question、key_point、tags | answer |
| 术语表 | term、aliases、category | definition、context |
| 速查表 | title、section.title、item.label | summary、item.content、item.note |

公式块采用可横向滚动的容器，避免在窄预览和打印以外的屏幕宽度中溢出。速查表的 `formula` 项不强制等宽字体，以免覆盖 KaTeX 的排版字体。

## 生成约束

三个生成器提示词都会说明：

- 可使用 `$...$`（行内）和 `$$...$$`（块级）LaTeX；
- 公式不放进代码围栏；
- JSON 字符串中的反斜杠必须转义，例如 `\\frac`；
- 速查表优先将公式、单位、适用条件与边界写入对应字段。

## 验证

只做定向静态检查：检查改动 diff、导入路径和 Vue 模板字段对应关系，并以包含行内/块级公式的样例确认渲染器输出。不运行 build 或全量测试。
