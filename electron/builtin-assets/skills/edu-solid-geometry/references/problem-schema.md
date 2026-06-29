# 数据格式参考（problem-schema）

三个入口（文字 / 图片 / 随机）最终都归一成同一份 **problem spec**，再由计算与渲染共用。

## 1. problem spec（结构化题目，入口归一的中间产物）

```jsonc
{
  "language": "zh-CN",            // 跟随提示词语言：zh-CN / en / ...
  "body": "regular_quad_pyramid", // 几何体类型，见 conventions.md
  "dims": { "base_edge": 2, "height": 1 },  // 几何体尺寸参数
  "givens": [                     // 额外构造点 / 条件
    { "name": "E", "kind": "midpoint", "of": ["P", "C"] }
  ],
  "query": {                      // 所求
    "type": "line_plane_angle",   // 见 conventions.md 的解法配方
    "line": ["B", "E"],
    "plane": ["P", "A", "C"]
  }
}
```

> 图片入口：先把识别到的 spec **回显给用户确认**（题面、几何体、尺寸、所求、语言）再继续。
> 随机入口：由 kernel 反向生成 spec（随机参数→求解→答案不规整则重抽），自带标准答案。

## 2. lesson data（注入模板 `__LESSON_DATA__` 的最终数据）

模板 `template/lesson.html` 读取一个 JSON 对象，含三部分：`lesson` / `steps` / `model`。

```jsonc
{
  "lesson": {
    "language": "zh-CN",
    "meta": "交互解题 · 线面角",          // 顶部小标签
    "title": "……题面……",
    "answerLabel": "……答案的文字说明……",
    "answerValue": "$\\frac{2\\sqrt{22}}{11}$",  // LaTeX，含 $…$
    "ui": { /* 可选：覆盖界面文案，见下文多语言 */ }
  },
  "steps": [
    {
      "title": "步骤标题",
      "content": "<p>HTML 段落，行内公式 $…$，独立公式 $$…$$</p>",
      "highlight": ["Line_BE", "Plane_PAC"],   // 该步要“可见”的可切换元素（绝对集合）
      "cameraPos": { "x": 4, "y": 4.5, "z": 4 } // 该步镜头位置（three 坐标）
    }
  ],
  "model": {
    "points": { "P": [0, 1.5, 0], "A": [2.12, 0, 0] },  // three 坐标（y 向上），来自 kernel.to_three
    "spheres": ["P", "A", "B", "C", "D", "E"],           // 画小球+标签的点
    "edges": [                                            // 始终可见的骨架棱
      { "a": "A", "b": "B" },
      { "a": "D", "b": "A", "dashed": true },             // 虚线
      { "a": "B", "b": "D", "color": "aux", "dashed": true, "name": "Line_BD" } // 命名后可被 highlight
    ],
    "elements": {                                         // 可切换命名元素，默认隐藏
      "Line_BE":  { "type": "line",  "a": "B", "b": "E", "color": "emphasis", "depthTest": false },
      "Plane_PAC":{ "type": "plane", "pts": ["P", "A", "C"] },         // 3 或 4 个点
      "Normal_Vector": { "type": "arrow", "origin": "O", "dir": [0,0,1], "length": 1.5, "color": "normal" },
      "Axis":     { "type": "axes",  "size": 3 }
    },
    "target": [0, 0.45, 0],        // OrbitControls 注视点（three 坐标）
    "initialCamera": [5, 4, 5]     // 初始相机位置
  }
}
```

### 元素类型（model.elements[*].type）
- `line` — 需要 `a`、`b`（点名）；`color`（语义色名）；`dashed`；`depthTest:false` 表示永远画在最前。
- `plane` — 需要 `pts`（3 或 4 个点名）。
- `arrow` — 需要 `origin`（点名或坐标）、`dir`（three 方向向量）、`length`、`color`。
- `axes` — 需要 `size`。
- `measure` — 线段长度标注：在 `a`、`b` 两点中点处朝几何体外侧偏移贴一个 **MathJax** 长度标签。
  - `a`、`b`：线段端点（点名）。
  - `label`：长度的 LaTeX（不带 `$`），如 `"2"`、`"2\\sqrt{2}"`、`"\\frac{\\sqrt3}{2}"`。
  - `offset`：可选，朝外偏移量（默认 0.24），避免压住棱。
  - **何时用**：题面给出了线段长度（已知条件）就为对应棱加一个 `measure`，并把它的 key 放进"建系/列已知条件"那步的 `highlight`。和其它元素一样受分步 `highlight` 控制显隐。
  - **总开关**：只要存在任一 `measure`，3D 画布左上会自动出现"长度标注：开/关"按钮，可一键显示/隐藏全部长度标签（叠加在分步 highlight 之上）。无需额外数据。英文输出时在 `lesson.ui` 设 `measureToggleOn` / `measureToggleOff` 文案。

### 颜色语义名（COLORS）
`frame`(骨架灰) · `aux`(辅助浅灰) · `emphasis`(强调洋红) · `normal`(法向量红) · `plane`(平面蓝) · `point`(顶点深蓝)

### highlight 规则
每步的 `highlight` 是该步**应可见的可切换元素的完整列表**（绝对集合，不是增量）。骨架棱、顶点小球始终可见，不必列入。

### 动点拖拽 + 实时数值（model.draggable，可选）
让一个动点沿约束线段拖动，联动依赖点与图元，并实时显示真实几何量（在**数学坐标**下计算）。需要同时提供 `model.scale` 与 `model.mathPoints`（各点数学坐标，数值数组）。

```jsonc
"model": {
  "scale": 1.4,                       // 与 kernel.to_three 用的 scale 一致
  "mathPoints": { "A1": [2,0,2], "C1": [0,2,2], "P": [0.5,1.5,2], "C": [0,2,0], "B1": [0,0,2], "A": [2,0,0] },
  "draggable": {
    "point": "P",                     // 被拖动的点（会画成更大的强调色球）
    "along": ["A1", "C1"],            // 约束线段端点（点名）
    "t": 0.75,                        // 题目设定位置的参数 t∈[0,1]（如 A1P=3PC1 -> 0.75）
    "standardLabel": "标准位 A₁P=3PC₁",
    "dependent": [ { "name": "D", "kind": "midpoint", "of": ["P", "C"] } ], // 随动点重算的依赖点
    "readouts": [                     // 实时数值（数学坐标下计算）
      { "label": "三棱锥 B₁-APC 体积", "type": "volume_tetra", "pts": ["B1","A","P","C"] },
      { "label": "A₁P 长度", "type": "length", "pts": ["A1","P"] }
    ]
  }
}
```
- readout `type` 支持：`volume_tetra`(4 点)、`length`(2 点)、`line_plane_angle_sin`(`line`:2 点, `plane`:3 点)。
- 拖到 `t` 附近会显示"标准位 ✓"。题面步骤里的精确符号解仍对应该标准位。

### 多语言（lesson.ui，可选）
模板内置中文 `defaultUI` 兜底。输出英文时，把界面文案放入 `lesson.ui`（键见 `template/lesson.html` 的 `defaultUI`），例如 `previous/next/finish/stepTemplate/sceneLabel/...`，并把 `lesson.language` 设为 `en`。`steps.content` 与 `title` 由模型按目标语言书写。`answerValue` 等 LaTeX 与语言无关。
