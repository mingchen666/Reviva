# 单条 AI 消息导出 Word 设计

## 目标

在工作台聊天消息的“更多操作”菜单中启用“导出 Word”，把当前已完成的单条 AI 消息转换为 `.docx` 文件并保存到用户选择的位置。本次范围只包含单条 AI 消息，不扩展整个对话导出弹窗。

## 已确认的范围与约束

- 仅允许导出 `assistant` 且状态为 `completed` 的消息，与现有 Markdown 导出条件一致。
- Word 文档的正文来源复用现有 `buildSingleMessageMarkdown`，包括可选的来源尾注和附件列表。
- 复用现有 Base64 图片清理逻辑，避免把超大图片数据直接放入转换请求；普通远程图片保留给转换库处理。
- 文件名沿用 `deriveMessageExportTitle` 的标题规则和现有安全字符清理规则，仅将扩展名改为 `.docx`。
- 取消保存、转换失败和写入失败都必须安全返回，并在界面显示明确的失败提示。

## 方案

采用 Electron 主进程转换：

1. `MessageOutputMenu.vue` 将 Word 菜单项从禁用占位改为可用，并发出 `export-word` 事件。
2. `MessageActionsBar.vue` 转发该事件，`workchat/index.vue` 增加单条消息 Word 导出处理器。
3. 处理器复用消息校验、会话查找、标题生成和 Markdown 构建逻辑，将 Markdown 与保存选项交给新的 Electron API。
4. preload 暴露专用 API；主进程注册 `dialog:saveMarkdownDocx` IPC。该处理器动态加载 `markdown-docx`，调用 `markdownDocx(markdown, options)` 与 `Packer.toBuffer(doc)`，弹出保存对话框并直接写入二进制文件。
5. IPC 返回 `{ success, path, canceled, error }`，渲染进程依据结果显示成功或失败提示，并在 `finally` 中清理导出忙碌状态。

主进程负责转换和写入，避免 DOCX 二进制通过 `contextBridge` 往返，也避免把 `docx`、`marked`、`katex` 等依赖加入渲染器首屏包。

## 转换配置

初始使用库默认 Markdown/GFM 支持，并提供稳定的文档主题覆盖：正文可读字号、标题层级、页边距和代码块样式。转换选项集中在主进程 IPC 处理器中，后续可在不改变前端事件链的情况下调整。转换过程不修改原始消息内容。

## 错误处理

- 输入不是非空字符串：返回 `INVALID_MARKDOWN_CONTENT`。
- 用户取消保存：返回 `canceled: true`，不显示错误提示。
- 库转换异常或文件写入异常：记录主进程错误，返回失败原因；前端显示“Word 导出失败，请检查保存位置后重试”。
- 非 Electron 环境调用 API：返回统一的不可用结果，不触发未捕获异常。

## 验证策略

- 运行新增/修改 JavaScript 的语法检查。
- 运行 Vue/TypeScript 类型检查或项目已有构建命令，确认事件、preload 类型和依赖解析无误。
- 在 Electron 中手动验证：打开单条已完成 AI 消息菜单，选择“导出 Word”，取消保存、正常保存各一次；用 Word/LibreOffice 打开生成文件，检查标题、段落、列表、代码块、表格和链接等 Markdown 基础结构。

## 非目标

- 不改整个对话导出弹窗及其 Markdown-only 流程。
- 不新增独立的 Word 编辑器、预览器或导出选项面板。
- 不保证任意 HTML、Mermaid、Base64 图片或复杂自定义 Markdown 扩展在 Word 中保持像素级一致。
