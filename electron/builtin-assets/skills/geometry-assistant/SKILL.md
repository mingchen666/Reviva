---
name: geometry-assistant
description: Use when rendering high-school solid-geometry problem data into an interactive 3D standalone HTML artifact with known-condition highlights, step-by-step constructions, faces, polygons, line-plane angles, or dihedral angles.
version: 1.0.0
allowed-tools:
  - file_read
  - file_write
  - document_read
  - vision_analyze
  - exec_command
metadata:
  short-description: 立体几何 3D 单文件 HTML 可视化
---

# Geometry Assistant

## 技术方案

SINGLE_FILE_HTML_ONLY：本 Skill 只交付单文件 HTML。geometryData、样式和页面逻辑嵌入一个 `.html` 文件，用户不需要启动服务端；Three.js 与 addons 通过 jsDelivr CDN 加载，因此首次打开或浏览器未缓存依赖时需要联网。不要宣称完全离线或零外部依赖。

已淘汰的 localhost/--serve 方案只保留在 archive/legacy-localhost-preview.md 中作为历史记录，不属于当前工作流。遇到浏览器已经打开 localhost 页面时，不要沿用该页面判断结果；应重新生成 HTML 文件并让用户打开该文件。

## 标准流程

1. 读取题目并完成数学分析；读取 `references/data-format.md`。
2. 构建 geometryData JSON。
3. 用 `file_write` 将临时 JSON 写入系统提示给出的当前 Agent 临时目录。
4. 用 `exec_command` 运行内置 `/skills/geometry-assistant/scripts/deploy.py`，显式指定最终 HTML 输出路径。
5. 运行 `/skills/geometry-assistant/scripts/check_output.py` 检查生成结果；Node 可用时增加 `--node-check`。
6. 交付最终 `.html` 虚拟路径和 CDN 联网说明。不要启动本地服务器。

## MindSpace 输入处理

- 用户直接粘贴题目：从对话提取题干、已知条件和问题。
- 图片、截图或扫描试卷：使用 `vision_analyze` 识别文字、顶点、线段、面、垂直/平行关系和图形标注；看不清时要求用户补充，不猜测。
- PDF、Word、Excel、PPT：使用 `document_read` 读取；需要理解内嵌图形时，用 `document_read(intent="extract_images")` 导出图片，再交给 `vision_analyze`。
- Markdown、TXT、JSON 等普通文本：使用 `file_read`。

先完成数学解题和 geometryData 设计，再渲染。不能为了让图形闭合而编造题目未给出的长度、角度、垂直、平行、圆或辅助点。

## MindSpace 路径规则

最终 HTML 必须写入系统提示给出的当前 Agent 当日输出目录，例如：

```text
/agents/{当前Agent英文名}/outputs/{真实日期}/立体几何-题目名称.html
```

临时文件写入系统提示给出的当前 Agent 当日临时目录，例如：

```text
/tmp/{当前Agent英文名}/{真实日期}/geometry-data.json
/tmp/{当前Agent英文名}/{真实日期}/geometry-module.mjs
```

这些花括号只用于解释。实际调用时必须替换为系统提示中的真实 Agent 目录名和真实日期，不能原样写 `{date}`、`YYYY-MM-DD` 或“当天日期”。

`/skills/geometry-assistant/` 是只读目录，只能读取脚本、模板和 references；不得把用户题目、临时 JSON、中间脚本或最终 HTML 写回 Skill 目录。

调用示例（实际使用时替换所有路径）：

```text
exec_command({
  "cmd": "python",
  "args": [
    "/skills/geometry-assistant/scripts/deploy.py",
    "/tmp/当前Agent/真实日期/geometry-data.json",
    "--output",
    "/agents/当前Agent/outputs/真实日期/立体几何-题目名称.html"
  ],
  "cwd": "/"
})
```

优先使用结构化 `cmd`、`args`、`cwd`。不要调用 bash、sh、execute，也不要通过 localhost 预览。

## 数据构建要点

- 坐标使用 pos: [x, z, y]，第三个坐标是竖直高度。
- 顶点 ID 用大写字母；边 ID 用两端点拼接，如 AB、PA。
- 面 ID 用顶点顺序拼接，如 ABC、PAB、PAM。
- conditions 只放题目直接给出的已知条件。
- 用户手动添加的标注不需要反向更新题目已知条件。
- 题目已知长度可用 valueText、displayValue、label 或 exactValue 提供精确显示，例如 2√2、sqrt(2)/2、3/4。
- 题干出现“圆 O”“圆心 O”“AB 是圆 O 的直径”等命名圆时，必须在 solids[].circles 声明圆，例如 { "id": "circle_O", "centerVertex": "O", "radiusVertex": "A" }，不能只画 OA/OB/OC 半径线。
- 真实几何边应根据视线遮挡动态切换实线/虚线；只有题面明确隐藏、辅助或构造的边才使用 dashed 或 renderMode: "auxiliary" 作为固定虚线。

## 高亮规则

- 选中的面、多边形、线面角、面面角，对应面或多边形必须高亮。
- 面高亮统一使用半透明柔和蓝色，避免橙色或强饱和色。
- solutionSteps[].highlights 可混用顶点、边、面 ID。
- 若步骤文字中提到已有 face ID，例如 PAM、PAC，也应纳入高亮，避免二面角说明中漏高亮两个面。
- length 和 equal-length 已知条件应在线段中点显示题目给出的精确长度标签；只限题目已知条件。
- 页面初始不自动高亮任何已知条件；点击已知条件右侧眼睛按钮时，才显示该条件对应的线段、面或标注。

## 解题展示边界

- 初始图只展示题面直接给出的结构。
- 辅助点、投影线、垂线、平面角、坐标轴等随 solutionSteps 逐步显示。
- 线面角、二面角、截面平面角等默认属于解题构造，不应放进全局 conditions，除非题面已明确给出对应辅助对象。
- 多问问题必须使用 parts 或 questionParts，并为每个 part 指定 stepIds 和 conditionIds。
- 每个 solutionSteps[] 必须提供 rules 数组列出本步骤使用的定理、性质、推论或公式；theorem 写证明、计算或构造过程，不能只写定理名。

## 坐标系规则

- 使用坐标法、法向量、平面方程、向量夹角公式或点到平面距离公式的步骤，必须同步显示 x/y/z 坐标轴。
- 坐标轴使用 renderMode: "axis" 和 auxiliary: true。
- 轴端点使用 axisEndpoint: true 和 label: ""，不要显示成普通几何点。
- x/y/z 坐标轴端点必须分别沿第 1/第 2/第 3 坐标正方向放置，避免 y 轴画反。

## 垂直与直角标记

- 题面已知条件出现垂直、直角或 90° 时，图上必须画 L 形直角标记。
- 这些标记属于已知条件注记，点击对应条件时显示，不要作为新推导塞进步骤。

## 运行后注意

- 生成的 HTML 不依赖本地 Node 服务端。
- 页面通过 importmap 加载 Three.js CDN，打开 HTML 时需要能访问 `cdn.jsdelivr.net`。
- 可在浏览器控制台调用 window.__debugVertices() 调试几何点。

## 依赖与失败处理

### 没有 exec_command 或命令权限

说明当前 Agent 需要在工具与权限中开启“执行命令”和“文件写入”。可以先保存 geometryData JSON，但不能声称 HTML 已生成。

### Python 不可用

说明需要在“设置 > 环境检测”安装或修复 Python。不要自动运行 pip，不从 GitHub 安装；内置脚本不需要额外 Python 第三方包。

### Node 不可用

Python validator 和 HTML 结构检查仍然必须通过。跳过增强的 `node --check`，并在交付说明中注明。Node 不是生成 HTML 的硬依赖。

### CDN 不可用

HTML 仍可生成，但浏览器无法加载 3D 库。说明页面需要访问 `cdn.jsdelivr.net`，不要为此恢复 localhost 服务。

### geometryData 校验失败

根据 validator 的具体错误修改 JSON 后重新生成。不能绕过 validator、删除校验规则或交付未通过校验的 HTML。

## 输出检查

生成后运行：

```text
python /skills/geometry-assistant/scripts/check_output.py <最终HTML> --module-output <临时MJS> --node-check
```

检查内容：

- HTML 存在且非空；
- 已嵌入 `window.__GEOMETRY_DATA__`；
- 有 importmap 和 Three.js CDN；
- 没有活动的 localhost 依赖；
- 能提取 module script；
- Node 可用时 module script 通过语法检查。

创建成功后向用户返回最终 HTML 的虚拟路径。成果中心注册由系统运行结束后的产物扫描处理；不要操作数据库或伪造 artifact ID。
