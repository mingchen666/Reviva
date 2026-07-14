# Geometry Assistant

Geometry Assistant 将立体几何题目的 geometryData JSON 渲染为交互式 3D 场景，输出一个可直接打开的单文件 HTML。适合高中数学立体几何辅导：已知条件高亮、精确长度标注、逐步显示辅助构造、面/线面角/面面角高亮。

## 技术方案

SINGLE_FILE_HTML_ONLY：当前唯一交付方案是单文件 HTML。

- 用户拿到的是一个 .html 文件，直接用浏览器打开。
- 不要求用户启动服务端。
- 不使用 localhost:8080 作为预览或交付地址。
- geometryData、样式和页面逻辑已嵌入 HTML；Three.js 与 addons 通过 jsDelivr CDN 加载，首次打开需要联网。
- 旧 localhost/--serve 方案已淘汰，只在 archive/legacy-localhost-preview.md 中保留历史说明。

## MindSpace 内置使用

作为 MindSpace 内置 Skill 使用时，无需 pip 安装，也不要从 GitHub 下载。Agent 直接读取：

```text
/skills/geometry-assistant/scripts/deploy.py
/skills/geometry-assistant/scripts/check_output.py
/skills/geometry-assistant/references/data-format.md
```

使用该 Skill 的 Agent 需要开启：

- 文件读取
- 文件写入
- 图片理解（处理截图或扫描题时）
- 文档读取（处理 PDF/Office 时）
- 执行命令

Python 是 HTML 生成的必要依赖。Node.js 只用于增强的 module script 语法检查，不是生成 HTML 的硬依赖。

## MindSpace 保存路径

临时 geometryData 写入当前 Agent 当日临时目录：

```text
/tmp/{当前Agent英文名}/{真实日期}/geometry-data.json
```

最终 HTML 写入当前 Agent 当日输出目录：

```text
/agents/{当前Agent英文名}/outputs/{真实日期}/立体几何-题目名称.html
```

实际运行时必须替换为系统提示给出的真实 Agent 名称和真实日期，不能原样使用占位符。`/skills/geometry-assistant/` 是只读目录，不能保存用户成果。

## 使用

```bash
python /skills/geometry-assistant/scripts/deploy.py \
  /tmp/AgentName/2026-07-12/geometry-data.json \
  --output /agents/AgentName/outputs/2026-07-12/立体几何-题目.html
```

命令会先校验 geometryData，再生成单文件 HTML。随后运行：

```bash
python /skills/geometry-assistant/scripts/check_output.py \
  /agents/AgentName/outputs/2026-07-12/立体几何-题目.html \
  --module-output /tmp/AgentName/2026-07-12/geometry-module.mjs \
  --node-check
```

MindSpace Agent 应通过结构化 `exec_command` 调用这些命令，不使用 bash、sh、execute 或 localhost 服务。

仓库外独立使用时，仍可选择安装 Python 包并运行 `geometry-assistant <json> --output <html>`，但这不是 MindSpace 内置工作流。`--output` 为必填参数，避免结果落入不可发现的系统临时目录。

## 面向 AI 的提示词

```text
使用高中数学知识解答本题，并使用 geometry-assistant 输出一个单文件 HTML 3D 图形。按原题小问拆分；初始图只显示题面直接给出的结构；辅助构造、坐标轴、线面角和二面角相关面随步骤逐步显示；题目已知长度用精确值标注；输出前运行 validator 与 check_output.py。
```

## 数据要点

- 坐标：pos: [x, z, y]，第三个坐标是竖直高度。
- 顶点 ID：大写字母，如 A、B、P。
- 边 ID：两端点拼接，如 AB、PA。
- 面 ID：顶点拼接，如 ABC、PAB、PAM。
- 已知长度：可用 valueText/displayValue/label/exactValue 显示无理数或分数。
- conditions 只放题目直接给出的已知条件；辅助构造放 solutionSteps。

详细格式见 references/data-format.md。

## 高亮与标注

- 选中面、多边形、线面角、面面角时，对应面使用半透明柔和蓝色高亮。
- 二面角步骤中提到的两个面，例如 PAM 与 PAC，会跟随步骤高亮。
- length 与 equal-length 已知条件会在线段中点显示题目给出的精确长度标签。

## 项目结构

```text
geometry-assistant/
  pyproject.toml
  SKILL.md
  README.md
  archive/
    legacy-localhost-preview.md
  assets/
    template.html
  references/
    data-format.md
  scripts/
    check_output.py
    deploy.py
  src/geometry_assistant/
    core.py
    cli.py
    assets/template.html
```

## 依赖

- Python 3.8+
- 支持 WebGL 的浏览器
- 首次加载页面需访问 `cdn.jsdelivr.net` 获取 Three.js 与 addons
- Node.js 可选，仅用于增强语法检查

## 成果交付

生成成功后，Agent 返回最终 HTML 的虚拟路径。MindSpace 会在 Agent 运行结束后扫描当前 Agent 输出目录并注册成果；Skill 不直接操作数据库或创建 artifact ID。

## 许可证

MIT
