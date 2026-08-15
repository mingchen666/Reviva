---
name: edu-chem-reaction
description: >-
  将教材范围内的化学反应生成 Three.js 微观分子交互网页，展示配平后的方程、断键成键、
  原子守恒、电子转移或基础有机机理。适用于燃烧、电解水、氧化还原、酯化等化学反应的
  可视化讲解；用户要求化学反应、分子动画、微观演示、原子守恒、化学方程式配平、
  断键成键、电子转移或反应机理网页时优先使用。不要用于通用反应预测、未验证的复杂机理
  或无法由内置分子库和 schema 支持的物种。
version: 1.0.0
allowed-tools:
  - file_read
  - file_write
  - vision_analyze
  - exec_command
---

# 化学反应微观演示

## 目标与边界

生成一个可直接打开的单文件 HTML：页面包含 Three.js 分子动画、KaTeX 化学方程、反应进度控制、断键/成键高亮、原子守恒计数、分步讲解，以及按需显示的能量曲线、电子转移或催化剂叠加层。

这是教学可视化，不是化学反应预测器。只生成以下两类内容：

- `scripts/generate.py list` 中已注册并经过 kernel 校验的反应。
- Agent 能根据 `references/problem-schema.md` 建模，且所有物种、原子映射、键变化都可通过 `lib/reaction_kernel.py` 校验的反应。

不支持的物种、模糊图片、无法核验的配平或机理，必须说明限制并请求补充；不能为了生成动画而猜测反应条件、产物、原子去向或电子转移。

## 何时使用

优先用于：

- 燃烧、电解、化合、分解、置换、复分解、氧化还原等反应的微观演示。
- 用户希望理解原子为何守恒、哪些键断裂或生成、电子如何转移。
- 教师需要课堂展示，或学生希望把一条已知化学方程式转成可交互网页。
- 基础有机反应机理，例如内置的酯化示例。

不要用于：

- 只需文字讲清的概念或普通流程图，优先使用 `concept-explainer` 或 `learning-visualization-skill`。
- 数学几何、网络协议或其他已有专项可视化场景。
- 需要预测未知反应、给出实验操作、危险化学品处置或未经资料核验的专业结论。

## 输入处理

按以下优先级处理资料：用户本轮明确要求 > 用户提供的题目/文件 > 已选择知识库 > 可核验资料 > Skill references > 通用知识。

- 对话文字：提取方程、反应条件、语言、教学目标和需要强调的内容。
- Markdown、TXT、JSON、CSV 或代码文件：用 `file_read` 读取。
- 图片、截图、扫描方程：先用 `vision_analyze` 识别方程、箭头条件和可见说明，再把识别结果回显给用户确认。图片模糊、化学式不完整或下标无法辨认时要求清晰图片或文字，不猜测。

当前脚本不包含通用的化学式解析器。收到自然语言反应请求时，先映射到注册反应；无法可靠映射时，只有在内置分子库和 schema 足够支持的情况下才构建临时 reaction spec。

## MindSpace 路径规则

Skill 目录只读：`/skills/edu-chem-reaction/` 只用于读取模板、脚本、分子库和 references。

最终 HTML 写入当前 Agent 的真实输出目录：

```text
/agents/<当前Agent英文名>/outputs/<系统提供的真实日期>/reaction-<reaction>.html
```

临时 spec、检查输出和可选脚本写入：

```text
/tmp/<当前Agent英文名>/<系统提供的真实日期>/
```

尖括号只用于说明路径结构。实际工具调用必须使用系统提供的真实 Agent 目录名和真实日期，不能把占位符原样写入。生成成功后返回实际输出路径；成果中心由系统扫描该目录注册，Skill 不操作数据库或伪造 artifact ID。

## 标准流程

### 1. 确认反应

识别用户提供的反应式和条件。图片输入必须先让用户确认识别结果。对于氧化还原，确认氧化剂、还原剂和电子转移是否有可靠依据；对于有机机理，确认催化剂和关键步骤，不把简化示意当作完整实验机制。

### 2. 选择数据路径

优先使用注册反应。可用 key 为：

- `combustion_ch4`
- `combustion_h2`
- `electrolysis_water`
- `redox_na_cl2`
- `esterification`
- `glucose_combustion`

若确实需要新反应，先读取 `references/problem-schema.md` 和 `references/conventions.md`。将临时 spec 写入当前 Agent 的 `/tmp` 目录，并且只使用 `lib/molecules.py` 已定义的物种；高层 spec 必须提供完整双射的 `atom_map`，低层机理必须明确 atoms、bonds 和 fragments。

### 3. 生成 HTML

先运行依赖检测：

```text
python "/skills/edu-chem-reaction/scripts/check_dependencies.py"
```

如果检测到必需包缺失，把检测器输出的一次性安装命令和包清单展示给用户，等待用户明确确认后再执行 `python -m pip install ...`。一次确认可以覆盖检测器列出的全部缺失包；安装完成后必须重新运行依赖检测。没有用户确认时不得安装、不得继续声称可以生成。检测器本身永远不会安装依赖。

使用 `exec_command` 的实际 `command` 参数执行 Python。所有命令都应引用显式输出路径，等待产品要求的命令审批；不要调用 `bash`、`sh`、`execute` 或启动本地服务。

```text
python "/skills/edu-chem-reaction/scripts/generate.py" \
  combustion_ch4 \
  "/agents/<真实Agent>/outputs/<真实日期>/reaction-methane-combustion.html"
```

需要按 spec 生成时：

```text
python "/skills/edu-chem-reaction/scripts/generate.py" \
  spec \
  "/tmp/<真实Agent>/<真实日期>/reaction-spec.json" \
  "/agents/<真实Agent>/outputs/<真实日期>/reaction-custom.html"
```

可用 `random <output.html> [seed]` 生成一个已注册反应；`all <output-directory>` 只用于明确要求批量示例时。脚本会创建输出父目录、拒绝写入 Skill 目录，并在成功时打印最终路径。

### 4. 确定性校验

生成后必须运行：

```text
python "/skills/edu-chem-reaction/scripts/check_output.py" \
  "/agents/<真实Agent>/outputs/<真实日期>/reaction-methane-combustion.html"
```

校验器检查文件非空、数据岛可解析、必需页面标记存在、模板占位符已替换，且输出不依赖 localhost 或写入 Skill 目录。校验失败时修正 spec 或命令后重试，不能声称文件已经可用。

Node 可用时，可把抽取出的页面脚本写到当前 Agent `/tmp` 目录中的显式 `.mjs` 路径并额外检查语法：

```text
python "/skills/edu-chem-reaction/scripts/check_output.py" \
  "/agents/<真实Agent>/outputs/<真实日期>/reaction-methane-combustion.html" \
  --node-check \
  "/tmp/<真实Agent>/<真实日期>/reaction-module.mjs"
```

### 5. 交付

回复只说明：已生成的实际文件路径、反应和教学重点、验证结果，以及页面首次打开需要访问 CDN。不要启动 localhost 预览，也不要将输出写入系统临时目录或 Skill 目录。

## 核心领域规则

- `reaction_kernel` 是配平、原子守恒、原子映射和键差的唯一数据源。不要手算后绕过 kernel。
- `morph` 用于燃烧、分解、置换和氧化还原，强调原子重组与守恒。
- `mechanism` 用于已明确的有机机理，采用关键帧片段来呈现催化剂、过渡态或离去基团。
- 方程系数、分子实例数、原子守恒计数和动画数据必须来自同一份已校验 spec。
- 内置 Python 仅探测 RDKit 是否可用，当前生成路径不依赖或自动调用 RDKit；不要把它宣传为可用的任意分子构象生成能力。

## 依赖与失败处理

- Python 与 `sympy` 是硬依赖。缺失时先运行依赖检测，向用户展示完整清单；只有用户明确确认后，才用当前解释器执行一次 `python -m pip install ...`，随后重新检测。不能静默安装、切换解释器或从 GitHub 下载依赖。
- Node 可用于增强语法检查，但不是生成 HTML 的硬依赖。传入当前 Agent `/tmp` 内的显式 `.mjs` 路径时，校验器会抽取内联脚本并执行 `node --check`；Node 缺失时保留 Python 和 HTML 结构校验，并说明跳过增强检查。
- 页面为单文件 HTML，但 Three.js、OrbitControls、KaTeX 和 Tailwind 使用 CDN。文件可生成不等于离线环境可完整运行；CDN 不可访问时明确说明运行受限。
- 若当前 Agent 缺少 `file_write`、`vision_analyze` 或 `exec_command`，说明缺少的工具/权限并请求切换到已配置 Agent；不伪造生成成功。
- 命令失败时以 stderr 和退出码为准，说明具体失败点。不得通过启动 localhost、写入 Skill 目录或自动安装依赖来规避失败。

## 与其他 Skills 的边界

- `concept-explainer` 负责文字化解释；当用户明确需要化学反应微观页面时再接入本 Skill。
- `learning-visualization-skill` 适合通用概念、流程和关系，不替代基于原子映射的反应演示。
- `edu-solid-geometry`、`edu-analytic-geometry` 和 `network-protocol-viz` 分别处理几何与网络专项场景，不混用。
- `practice-quiz`、`error-analysis` 和 `review-plan` 负责学习闭环；本 Skill 可作为其中的可视化环节。

## 质量自检

交付前确认：

1. 方程、反应条件和资料来源与用户确认内容一致。
2. kernel 已通过配平、守恒、映射和键差校验。
3. 最终 HTML 位于当前 Agent 的 outputs 目录，临时文件位于该 Agent 的 `/tmp` 目录。
4. `check_output.py` 成功，命令没有遗留服务或后台进程。
5. 已说明 CDN 网络要求、依赖降级和无法支持的部分。
