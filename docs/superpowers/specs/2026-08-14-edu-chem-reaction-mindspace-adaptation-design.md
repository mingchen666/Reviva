# Edu Chem Reaction MindSpace 完整适配设计

## 目标

将 `electron/builtin-assets/skills/edu-chem-reaction/` 适配为 MindSpace 内置 Skill，并接入适合生成化学反应微观可视化的对话型 Agent。

交付物是单文件 HTML：反应数据、页面样式与交互逻辑写入一个文件；Three.js、OrbitControls、KaTeX 和 Tailwind 仍由 CDN 加载。因此应准确称为“单文件 HTML，首次打开需要网络加载运行库”，不能称为完全离线自包含。

本次是完整 Skill 适配，不新增原生题库、化学反应预测服务、任务队列或新的前端页面。

## Skill 元数据与边界

新增 `config.json`，并让目录名、`config.id` 和 `SKILL.md` frontmatter `name` 均为 `edu-chem-reaction`。

- 显示名：化学反应微观演示
- 分类：学习
- 输出类型：HTML、Markdown
- 工具：`file_read`、`file_write`、`vision_analyze`、`exec_command`
- 版本：`1.0.0`

Skill 的可靠范围是内置分子库和注册表支持的教材反应，以及由 Agent 基于现有 schema 明确建模并通过 kernel 校验的反应。当前实现没有通用的化学式解析、反应预测或任意反应自动建模能力；遇到未支持物种、模糊图片或不能验证的原子映射时，必须要求补充或明确降级，不能伪造演示。

## 输入、路径与交付

输入路由如下：

- 对话中提供的反应式、条件和教学目标直接使用。
- Markdown、TXT、JSON 等文本文件通过 `file_read` 读取。
- 图片、截图和扫描的方程式通过 `vision_analyze` 识别；先回显方程、条件和类别让用户确认，识别不清时要求补图或文字。

最终 HTML 写入当前 Agent 的真实输出目录：

```text
/agents/{当前Agent英文名}/outputs/{系统提供的真实日期}/reaction-<reaction>.html
```

临时 spec、检查输出和可选脚本文件写入：

```text
/tmp/{当前Agent英文名}/{系统提供的真实日期}/
```

花括号仅说明规则；运行时必须替换为系统提供的真实 Agent 目录名和日期。`/skills/edu-chem-reaction/` 仅用于读取模板、脚本和参考资料，不能写入用户数据或生成结果。成果中心由系统扫描 Agent 输出目录，Skill 不操作 artifacts 数据库。

## 生成与校验流程

1. 从文字或经用户确认的图片提取反应式、条件、语言和教学目标。
2. 选择已注册反应，或在内置分子库和 `problem-schema.md` 支持的范围内构建 spec。
3. 使用 `reaction_kernel` 配平、校验原子守恒与映射，并推导断键和成键。
4. 通过 `exec_command` 运行内置 Python 脚本，并显式传入最终输出路径。
5. 运行新增的 `scripts/check_output.py`，检查文件非空、数据占位符已替换、反应数据可解析、必要的页面标记和 CDN 声明存在，并拒绝 localhost、Skill 目录输出或未替换路径占位符。
6. 返回实际 HTML 路径、反应内容摘要和 CDN 网络要求。

运行命令时使用产品实际支持的 `exec_command(command=...)` 接口。命令执行将继续触发产品已有的人机审批，不增加静默执行路径。

`scripts/generate.py` 改为要求所有会生成文件的分支提供显式输出目标：

```text
python /skills/edu-chem-reaction/scripts/generate.py <reaction-key> <output.html>
python /skills/edu-chem-reaction/scripts/generate.py random <output.html> [seed]
python /skills/edu-chem-reaction/scripts/generate.py all <output-directory>
```

`list` 不产生文件。脚本自动创建用户指定输出目标的父目录，成功时打印最终路径，参数错误和校验失败返回非零退出码。不会再默认写入 Skill 内的 `output/` 目录。

## 依赖与失败降级

- Python 和 `sympy` 是生成硬依赖。缺失时提示用户在“设置 > 环境检测”修复，不自动执行 pip 或下载依赖。
- RDKit 是可选增强能力；缺失时采用内置 VSEPR 分子库，绝不自动安装。
- Node 只用于可选脚本语法检查；缺失时仍执行 Python 和 HTML 结构校验，并报告跳过增强检查。
- CDN 不可访问时，HTML 仍可能已经生成，但浏览器无法加载 3D/公式运行库；交付时明确这一限制，不启动 localhost 规避。
- `exec_command` 或文件写入不可用时，只说明需要的 Agent 工具和权限，不能声称已生成 HTML。

## Agent 接入

接入以下四个对话型内置 Agent，并在其 PROMPT 中增加明确路由：化学方程式的微观分子动画、原子守恒、断键成键、氧化还原电子转移和教材范围内的有机机理，优先使用 `edu-chem-reaction`；通用概念图、数学几何和网络协议图继续使用各自专项 Skill。

| Agent | 配置变更 | 原因 |
|---|---|---|
| `concept-agent` | 绑定 skill；新增 `vision_analyze`；补齐 `fileRead`、`fileWrite`、`execCommand` 权限 | 当前配置虽列出文件和命令工具，但未授予对应权限，无法可靠生成页面。 |
| `teacher-prep-agent` | 绑定 skill；新增 `vision_analyze` | 教师备课和课堂演示需要从题目图片生成可视化。 |
| `final-review-agent` | 绑定 skill；新增 `vision_analyze` | 化学复习可将反应机理和守恒关系转为交互巩固材料。 |
| `general-study-assistant` | 绑定 skill；新增 `exec_command` 并设置 `execCommand: true` | 作为跨学科学习入口，应能实际生成，而非只暴露无法执行的 Skill。 |

所有四个 Agent 已有或将拥有 `file_read`、`file_write`、`vision_analyze` 和 `exec_command`。受影响 Agent 的 `builtin_version` 将提升为 `1.1.0`，使内置模板更新可追踪。不会给只承担问答、出题或专项非化学职责的 Agent 增加命令执行权限。

## 文档与评测

- 重写 `SKILL.md` 的工具名、路径、输出、依赖和失败说明；删除 `python3` 固定路径、`Path.cwd()` 默认交付和 localhost/preview 流程。
- 新增 README，说明 MindSpace 安装、输入、输出、依赖、成果中心边界和内置更新行为。
- 同步 `references/conventions.md` 与 `problem-schema.md` 中的命令、输出与自检规则。
- 新增 `evals/evals.json`，覆盖一个注册反应生成、一个图片确认流程和一个依赖或权限失败场景。

## 验证

1. 解析 config 和 eval JSON，核验 folder/config/frontmatter ID 一致。
2. 核验 Skill 和四个 Agent 使用的工具均在产品注册表中存在，且权限足够。
3. 扫描 Skill 中的 localhost、默认 Skill 输出、固定主目录、自动安装和日期占位符等危险模式。
4. 对 Python 脚本执行语法检查，随后清理测试产生的 `__pycache__`。
5. 使用 `combustion_ch4` 运行真实生成测试，检查 HTML 存在、非空且能通过 `check_output.py`。
6. 运行一个失败路径，例如未知反应 key 或遗漏输出参数，确认返回非零且不生成错误产物。
7. 运行 `git diff --check`，不修改用户现有的快捷键相关未提交文件。

## 安装更新

新 Skill 在应用启动时被发现并安装。当前 `SkillService` 会在工作区副本属于 platform 来源且版本变化或规格无效时刷新，因此新配置和明确版本能使官方副本随应用更新；自定义 Skill 或用户覆盖仍不应被误当作可覆盖的目标。
