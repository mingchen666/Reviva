# deep-research Skill for Reviva

这是 Reviva 内置 `deep-researcher` 的专属核心技能，基于 hoolulu/deep-research 方法论做了产品内适配。运行时以 `SKILL.md`、`RULES.md`、`TYPES.md`、`profiles.json`、`prompts/` 和内置 agent 配置为准。

## 当前定位

用于学习教育、教师备课、资料综述、办公调研、政策解读、行业/竞品分析等较长研究任务。它不是普通聊天 agent 的轻量检索工具；普通 agent 需要简短资料核验和简报时，应使用 `research-brief-skill`。

## 数据来源

- 用户上传或选择的本地资料。
- Markdown、TXT、CSV、JSON 等文本文件通过 `file_read` 读取。
- DOCX、PPTX、XLSX、PDF 通过 `document_read` 读取；如果环境不可用，标注未解析，不自动安装依赖。
- 云端知识库通过 `kb_search` 检索。
- 联网搜索按当前 agent 实际可用工具执行，例如 `web_search_bing`、`mcp:exa`、`mcp:jina-mcp-server`。这些都是可选增强通道，没有任何单一搜索提供方是必需项。

## 输出产物

默认输出目录：

```text
/agents/deep-researcher/outputs/{今天日期}/
```

默认产物：

- `research-report.md`：完整 Markdown 研究报告，包含结构化论证、引用、来源表、限制说明。
- `research-report.html`：自包含 HTML 展示页，用于快速浏览和汇报预览，不替代完整 Markdown 报告。

中间文件默认放在授权根目录的 `/tmp/deep-researcher/{今天日期}/deep-research-{时间戳}/` 虚拟目录。Reviva 通过 artifact 规则扫描输出目录。不要把报告或临时文件写到 skill 目录，也不要生成或刷新 `reports-browser`。

## 运行规则

- `/skills/deep-research/` 是只读技能目录。
- 不在用户端自动执行 `git pull`、`git clone` 或覆盖内置 skill。
- 不自动安装 Python 包、Scrapling、SearXNG、浏览器、ASR 或其它外部依赖。
- 外部搜索、网页读取、MCP 和脚本不可用时必须降级继续，而不是直接失败。
- 本地资料优先；资料不足、联网不可用或来源冲突时必须明确说明。
- 不编造来源、URL、页码、官方表述、日期、作者或统计数据。

## 维护说明

这个目录随 Reviva 应用版本发布。升级内置 skill 时，应由开发者修改 `electron/builtin-assets/skills/deep-research/` 并随应用发布，不由运行中的 Agent 自行更新。

## 来源

Adapted from [hoolulu/deep-research](https://github.com/hoolulu/deep-research), MIT License.
