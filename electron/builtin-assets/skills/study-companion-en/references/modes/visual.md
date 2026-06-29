# 可视化讲解详细指南

## 核心理念

**一图胜千言。** 人类大脑对视觉信息的处理速度远超文字。将抽象概念转化为可视图形，能极大降低认知负担，加速理解。

可视化不是装饰，而是认知工具——好的可视化直接展现概念的结构和关系。

## 可视化类型与适用场景

### 1. 流程图
**适用**：算法步骤、因果链、决策过程

```
开始 → 输入 → 处理 → 判断 → [是] → 输出 → 结束
                        ↓ [否]
                      返回处理
```

### 2. 结构图/树状图
**适用**：分类体系、层级关系、组成结构

```
数据结构
├── 线性结构
│   ├── 数组
│   ├── 链表
│   ├── 栈
│   └── 队列
├── 树形结构
│   ├── 二叉树
│   ├── B树
│   └── 堆
└── 图结构
    ├── 有向图
    └── 无向图
```

### 3. 对比表格
**适用**：概念辨析、方案比较、特征对比

```
| 特性   | TCP          | UDP          |
|--------|-------------|-------------|
| 连接   | 面向连接     | 无连接       |
| 可靠性 | 可靠传输     | 不保证       |
| 速度   | 较慢        | 较快         |
| 适用   | 文件传输     | 视频直播     |
```

### 4. 关系图/网络图
**适用**：知识关联、系统架构、相互作用

```
[需求] ←→ [设计] ←→ [实现]
  ↑          ↑          ↑
  ↓          ↓          ↓
[测试] ←→ [部署] ←→ [运维]
```

### 5. 时间线
**适用**：历史事件、发展脉络、版本演进

```
1945 ── 1969 ── 1983 ── 1991 ── 2007
 │       │       │       │       │
ENIAC  ARPANET  TCP/IP  WWW    iPhone
```

### 6. 状态转换图
**适用**：状态机、进程状态、化学反应

```
      就绪 ──调度──→ 运行
       ↑              │  ↓
       │          时间片到  I/O请求
       │              │  ↓
       └─────←──── 运行  阻塞
                        ↓ I/O完成
                     就绪 ←──┘
```

### 7. 矩阵/坐标系
**适用**：多维对比、函数图像、概率分布

```
    │ 高影响
    │  ★紧急重要  ★重要不紧急
    │
    │  ★紧急不重要 ★不紧急不重要
    ──────────────────────→ 高紧迫
```

### 8. ASCII艺术
**适用**：物理示意、分子结构、设备架构

```
    太阳
     ☀
     │ 光线
     ↓
  ┌─────┐
  │电池板│ → 电能 → ┌───┐
  └─────┘         │灯泡│
                  └───┘
```

## 设计原则

### 1. 信息优先
可视化的首要目标是传递信息，不是追求美观。一个丑但清晰的图胜过一个美但模糊的图。

### 2. 渐进式展开
复杂概念从简图开始，逐步增加细节：

```
第一步：核心关系
  A → B

第二步：添加条件
  A ─[条件1]→ B

第三步：添加分支
  A ─[条件1]→ B
  └─[条件2]→ C

第四步：添加细节
  A ─[条件1]→ B → D
  └─[条件2]→ C → E
```

### 3. 标注关键点
在图上标注最重要的信息，不要让用户自己去发现：

```
[排序算法] ← 关键：选择依据
├── O(n²): 插入排序 ← 小数据量快
├── O(n log n): 快排 ← 实际最快
└── O(n): 计数排序 ← 有限范围整数
```

### 4. 对比变化
展示"之前"和"之后"来突出变化：

```
排序前：[5, 3, 8, 1, 9]
           ↓ 冒泡排序
排序后：[1, 3, 5, 8, 9]
```

## 交互式可视化

鼓励学生参与可视化过程：

1. **填空法**：给出部分图，让学生补全
2. **纠错法**：给出有错误的图，让学生找出并修正
3. **创作法**：让学生自己画图解释概念
4. **对比法**：让学生画两个相关概念的可视化对比

学生自己画图时，理解程度立竿见影——画不出来说明没理解。

## 工具提示

虽然我们主要使用ASCII可视化，但对于需要更复杂图表的情况，可以建议学生使用：

- 思维导图：XMind、MindNode
- 流程图：draw.io、Mermaid
- 数学图形：Desmos、GeoGebra
- 代码可视化：Python Tutor

## HTML可视化格式

AI可以生成自包含的HTML文件，支持比ASCII更丰富的可视化效果。

### 可视化格式选择指南

| 格式 | 适用场景 | 优势 | 劣势 |
|------|---------|------|------|
| ASCII | 聊天内快速展示、简单结构图 | 零依赖、即时可见 | 表现力有限、无法交互 |
| Mermaid | 流程图、序列图、甘特图、类图 | 语法简洁、支持多种图类型 | 复杂布局可能出错 |
| KaTeX | 数学公式渲染 | LaTeX语法、渲染质量高 | 仅限公式 |
| SVG | 精确的几何图形、力图、电路图 | 矢量缩放、可交互 | 手写SVG代码量大 |
| vis-network | 复杂关系图、知识图谱 | 交互式拖拽、缩放、物理布局 | 需CDN |
| Chart.js | 数据图表（折线、柱状、饼图） | 美观、动画、响应式 | 需数据量支撑 |
| Reveal.js | 幻灯片式讲解 | 步骤展示、演示感强 | 较重 |

### CDN引用

```html
<!-- Mermaid.js - 流程图/序列图/类图 -->
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>

<!-- KaTeX - 数学公式渲染 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js"></script>

<!-- vis-network - 交互式网络图 -->
<script src="https://cdn.jsdelivr.net/npm/vis-network@9/standalone/umd/vis-network.min.js"></script>

<!-- Chart.js - 数据图表 -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>

<!-- Reveal.js - 幻灯片 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/theme/simple.css">
<script src="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.js"></script>

<!-- 3Dmol.js - 分子结构3D查看 -->
<script src="https://cdn.jsdelivr.net/npm/3dmol@2/build/3Dmol-min.js"></script>
```

### Mermaid图表示例

```html
<div class="mermaid">
graph TD
    A[输入数据] --> B{是否有序?}
    B -->|是| C[二分查找 O(log n)]
    B -->|否| D{数据量?}
    D -->|小| E[线性查找 O(n)]
    D -->|大| F[先排序再二分]
    F --> G[排序 O(n log n) + 查找 O(log n)]
</div>
<script>mermaid.initialize({startOnLoad:true});</script>
```

### KaTeX公式渲染示例

```html
<div id="math"></div>
<script>
katex.render(
  "f'(\\xi) = \\frac{f(b)-f(a)}{b-a}, \\quad \\xi \\in (a,b)",
  document.getElementById('math'),
  {displayMode: true, throwOnError: false}
);
</script>
```

### vis-network交互式图示例

```html
<div id="network" style="width:600px;height:400px;border:1px solid #ddd;"></div>
<script>
const nodes = new vis.DataSet([
  {id:1, label:'牛顿第二定律', group:'law'},
  {id:2, label:'F=ma', group:'formula'},
  {id:3, label:'动量守恒', group:'law'},
  {id:4, label:'冲量定理', group:'law'},
]);
const edges = new vis.DataSet([
  {from:1, to:2, label:'表达为'},
  {from:1, to:3, label:'推论'},
  {from:1, to:4, label:'变形'},
  {from:3, to:4, label:'等价'},
]);
new vis.Network(document.getElementById('network'), {nodes, edges}, {
  groups: { law: {color:{background:'#e3f2fd'}}, formula: {color:{background:'#fff3e0'}} }
});
</script>
```

## 交互式可视化

超越静态展示，交互式可视化让学生主动探索概念。

### 可点击图

节点可点击展开详细信息：

```html
<style>
  .node { padding:10px; border:2px solid #ccc; border-radius:8px; cursor:pointer; margin:5px; display:inline-block; }
  .node:hover { border-color:#2196f3; background:#e3f2fd; }
  .detail { display:none; padding:10px; background:#f5f5f5; border-radius:8px; margin:5px; }
  .detail.active { display:block; }
</style>
<div class="node" onclick="toggle('d1')">TCP</div>
<div class="detail" id="d1">
  <b>TCP特点</b>：面向连接、可靠传输、流量控制、拥塞控制<br>
  <b>适用</b>：文件传输、网页浏览、邮件
</div>
```

### 可展开节点

知识图谱中的节点可展开/折叠：

```html
<style>
  .tree-node { margin-left:20px; }
  .tree-label { cursor:pointer; padding:4px 8px; border-radius:4px; }
  .tree-label:hover { background:#e8f5e9; }
  .tree-children { display:none; }
  .tree-children.open { display:block; }
</style>
<div class="tree-node">
  <span class="tree-label" onclick="this.nextElementSibling.classList.toggle('open')">▶ 数据结构</span>
  <div class="tree-children">
    <div class="tree-node">
      <span class="tree-label" onclick="this.nextElementSibling.classList.toggle('open')">▶ 线性结构</span>
      <div class="tree-children">
        <div>数组 · 链表 · 栈 · 队列</div>
      </div>
    </div>
  </div>
</div>
```

### 步进动画

分步展示过程，学生点击"下一步"推进：

```html
<div id="step-display" style="font-family:monospace; white-space:pre; padding:20px; background:#1e1e1e; color:#d4d4d4; border-radius:8px;"></div>
<div style="margin:10px;">
  <button onclick="prevStep()">◀ 上一步</button>
  <span id="step-info"></span>
  <button onclick="nextStep()">下一步 ▶</button>
</div>
<script>
const steps = [
  {arr: [5,3,8,1], desc: "初始数组", highlight: []},
  {arr: [3,5,8,1], desc: "比较5和3，交换", highlight: [0,1]},
  {arr: [3,5,8,1], desc: "比较5和8，不交换", highlight: [1,2]},
  {arr: [3,5,1,8], desc: "比较8和1，交换", highlight: [2,3]},
  {arr: [1,3,5,8], desc: "排序完成！", highlight: []},
];
let current = 0;
function render(i) {
  const s = steps[i];
  document.getElementById('step-display').innerHTML = s.arr.map((v,j) =>
    `<span style="color:${s.highlight.includes(j)?'#ff6b6b':'#d4d4d4'};font-size:24px;padding:0 8px;">${v}</span>`
  ).join(' ');
  document.getElementById('step-info').textContent = `步骤 ${i+1}/${steps.length}: ${s.desc}`;
}
function nextStep() { if(current<steps.length-1) { current++; render(current); } }
function prevStep() { if(current>0) { current--; render(current); } }
render(0);
</script>
```

## 各学科可视化示例

### 数学：函数变换
```
f(x) = x²
  → f(x) + 2 = x² + 2     （上移2）
  → f(x-1) = (x-1)²       （右移1）
  → 2f(x) = 2x²            （纵向拉伸2倍）
  → f(2x) = (2x)² = 4x²   （横向压缩2倍）
```

### 物理：电路分析
```
    ┌──[R₁]──┐
    │         │
──[+]        [R₃]──
──[-]        │
    │         │
    └──[R₂]──┘
  R₁和R₂串联，再与R₃并联
```

### 化学：反应机理
```
  H     H                H     H
  |     |                |     |
H-C─────C-H  →  H-C═══C-H + H₂
  |     |                |
  H     H                H
  乙烷 → 乙烯 + 氢气（消除反应）
```

### CS：排序过程
```
冒泡排序：[5, 3, 8, 1]

第1轮：[3, 5, 8, 1] → [3, 5, 1, 8]    8到位
第2轮：[3, 1, 5, 8]                    5到位
第3轮：[1, 3, 5, 8]                    完成
```

## Python可视化

当ASCII和浏览器端可视化不足以满足需求时，使用Python脚本生成更专业的图表和材料。

### 可视化技术选择决策

```
需要可视化？
├── 简单流程/结构 → ASCII图（最快，无需工具）
├── 交互式学习材料 → HTML模板（浏览器直接用）
│   ├── 知识关系 → knowledge-graph-template.html
│   ├── 时间脉络 → timeline-template.html
│   ├── 函数图像 → math-viz-template.html
│   ├── 记忆卡片 → flashcard-template.html
│   ├── 练习测验 → quiz-template.html
│   └── 知识串讲 → presentation-template.html
├── 精确数据图表 → Python gen_chart.py
│   ├── 静态图（打印/嵌入）→ matplotlib → SVG
│   └── 交互图（探索数据）→ plotly → HTML
├── 代码讲解 → Python highlight_code.py
├── Anki复习 → Python gen_flashcard_data.py
└── 打印材料 → Python gen_study_guide.py → PDF
```

### gen_chart.py 使用指南

**何时使用**：数学函数图、物理运动轨迹、化学数据图、统计分析图、任何需要精确坐标轴和标注的图表。

**工作流**：
1. AI根据学生问题确定需要什么图表
2. AI生成JSON数据文件（包含x/y值、标题、轴标签等）
3. 调用 `python -m scripts.gen_chart --data data.json --output plot.svg`
4. 将生成的SVG嵌入HTML或直接提供文件路径

**学科应用示例**：

| 学科 | 图表类型 | 示例 |
|------|---------|------|
| 数学 | line | 函数图像对比（sin/cos/tan）、导数与原函数关系 |
| 数学 | line | 极限过程可视化（ε-δ定义） |
| 物理 | line | 运动学v-t图、a-t图 |
| 物理 | scatter | 实验数据拟合 |
| 化学 | bar | 元素性质对比（电负性、原子半径） |
| 化学 | heatmap | 周期表性质热力图 |
| 统计 | histogram | 数据分布可视化 |
| 经济 | pie | 市场份额、产业结构 |

**输出格式选择**：
- **SVG**（默认）：矢量格式，适合嵌入HTML，缩放不失真，文件小
- **PNG**：位图格式，适合需要固定分辨率的场景（dpi=150）
- **HTML**（plotly）：交互式，支持缩放/悬停/3D旋转，文件较大

### highlight_code.py 使用指南

**何时使用**：CS学科讲解代码、任何需要展示源代码的学习材料。

**工作流**：
1. 将代码保存为临时文件或使用 `--code` 参数
2. 调用 `python -m scripts.highlight_code --input code.py --language python --output code.html`
3. 将生成的HTML片段嵌入学习材料

**支持的语言**：Python, Java, C/C++, JavaScript, Go, Rust, SQL, HTML/CSS, Bash等所有Pygments支持的语言。

### gen_flashcard_data.py 使用指南

**何时使用**：学生需要大量间隔重复复习，且已安装Anki。

**与HTML闪卡的区别**：
- HTML闪卡：无需安装，浏览器直接用，适合快速复习
- Anki .apkg：功能更强（多媒体、统计、同步），适合长期复习

**工作流**：
1. AI根据学习内容生成卡片JSON数据
2. 调用 `python -m scripts.gen_flashcard_data --data cards.json --output deck.apkg`
3. 学生在Anki中导入.apkg文件

### gen_study_guide.py 使用指南

**何时使用**：考前需要打印随身携带的复习材料、老师要求提交纸面笔记。

**工作流**：
1. AI整理学习内容为结构化JSON（标题、章节、要点、公式、例题）
2. 调用 `python -m scripts.gen_study_guide --data guide.json --output guide.pdf`
3. 学生打印PDF

### Python与HTML的配合

Python生成的输出可以嵌入HTML学习材料：

1. **SVG嵌入**：matplotlib生成的SVG可直接作为`<img>`标签或内联SVG嵌入HTML
2. **代码高亮嵌入**：Pygments生成的HTML片段可直接插入HTML的`<div>`中
3. **plotly独立HTML**：plotly生成的是完整HTML页面，可独立使用

示例——数学函数讲解页面：
```
1. 用gen_chart.py生成函数图SVG
2. 用highlight_code.py高亮Python绘图代码
3. 生成HTML页面：KaTeX公式 + SVG函数图 + 高亮代码 + 文字讲解
```
