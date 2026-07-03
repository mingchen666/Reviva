# 408 可视化支持

## 目标

把抽象机制转成可检查、可复习、可交互的学习产物。可视化不是装饰，必须帮助用户看清状态变化、数据流、字段拆分、队列变化或算法过程。

生成 HTML 可视化前，先遵循 `references/visual-template-ui.md` 的 UI 规范。模板应像学习工作台，而不是普通网页或炫技动画。

研究参考显示，高质量的 CS 学习可视化通常具备这些共同点：

- 可逐步执行，而不是只播放动画；
- 显示当前状态表、变量/寄存器/队列/矩阵；
- 允许使用用户自定义输入数据；
- 同步展示解释、手算路径和考试书写模板；
- 提供即时自测或 quick check；
- 对复杂过程保留表格化推演，方便纸笔考试迁移。

## 技能选择

| 场景 | 首选技能 | 输出 |
|---|---|---|
| 数据结构与算法过程 | `data-structure-visualization` | 单文件 HTML，模板: `algorithm-stepper.html` / `tree-graph-stepper.html` |
| 组成原理机制和计算题 | `computer-organization-visualization` | 单文件 HTML，模板: `architecture-stepper.html` / `cache-mapping.html` / `pipeline-grid.html` |
| 操作系统状态和表格推演 | `operating-system-visualization` | 单文件 HTML，模板: `os-stepper.html` / `page-replacement.html` / `banker-matrix.html` |
| 机制动画、复习网页、交互步骤 | `learning-visualization-skill` | 单文件 HTML |
| 数据通路、状态机、流程图、时序图、表驱动技术图 | `technical-diagram-skill` | HTML/SVG/PNG |
| 网络协议、数据包、路由/交换、抓包流程 | `network-protocol-viz` | 单文件 HTML 动画 |
| 复习资料包、可打印讲义 | `note-skill` 或 `officecli-skills` | HTML/DOCX |

## 数据结构可视化

优先使用 `data-structure-visualization`。

- 树：二叉树遍历、哈夫曼树构造、BST 插入/删除、平衡调整。
- 图：BFS/DFS、Kruskal、Prim、Dijkstra、Floyd、拓扑排序、关键路径。
- 查找：折半查找、哈希冲突、B/B+ 树查找路径。
- 排序：每一趟数组状态、比较和移动次数、稳定性标注。

要求：

- 每一步显示当前结构、操作、变化原因。
- 标注复杂度和易错点。
- 对考试题，保留“手算表格”而不是只做动画。
- 如果涉及代码，优先同步高亮当前伪代码行、关键变量和结构变化。

## 组成原理可视化

优先使用 `computer-organization-visualization`。

- 数据表示：补码范围、浮点格式、规格化过程。
- Cache：地址字段切分、直接/组相联/全相联映射、替换过程。
- CPU：取指、译码、执行、访存、写回的数据通路。
- 流水线：时序表、停顿、转发、结构/数据/控制冒险。
- I/O：中断流程、DMA 数据传输路径。

要求：

- 图中必须标明位数、字段、部件名称和数据方向。
- 计算题要同步展示公式和单位。
- 对 CPU/流水线题，必须显示周期级表格、寄存器/内存状态和 hazard/stall/forwarding 标记。
- 对 Cache 题，必须显示地址字段切分、set/line/table 状态、hit/miss 和替换依据。

## 操作系统可视化

优先使用 `operating-system-visualization`。

- 进程状态：创建、就绪、运行、阻塞、终止的状态机。
- 调度算法：FCFS、SJF、优先级、RR 的甘特图和队列变化。
- 同步互斥：信号量、等待队列、前驱关系图。
- 死锁：资源分配图、银行家算法表。
- 内存管理：页表、TLB、地址转换、缺页中断、页面置换。
- 文件/I/O：索引分配、空闲空间管理、磁盘调度路径。

要求：

- 同时展示“当前状态”和“下一步为什么这样变”。
- 对 PV 题，先可视化约束关系，再给伪代码。
- 对调度题，必须显示 Gantt 图、就绪队列变化和等待/周转时间计算表。
- 对死锁/银行家算法，必须显示 Allocation/Max/Need/Available 矩阵和安全序列推演。
- 对页面置换，必须显示引用串、页框表、缺页标记和替换原因。

## 计算机网络可视化

优先交给网络专项技能：

- `computer-network-learning`：先讲机制；
- `network-protocol-viz`：生成协议/数据包流动动画；
- `network-packet-lab`：抓包实验解释；
- `network-exam-practice`：转成题目训练。

典型可视化：

- OSI/TCP-IP 封装与解封装；
- Ethernet 帧、IPv4 数据报、TCP 报文段字段；
- ARP、DHCP、DNS、HTTP/HTTPS/TLS 流程；
- 交换机 MAC 表学习、路由表最长前缀匹配；
- TCP 三次握手、四次挥手、滑动窗口、拥塞控制。

## 产物模板

### 单知识点交互页

```markdown
# [Topic] Interactive Review

## Layout
- left: concept map or mechanism diagram
- center: animated state/data flow
- right: step explanation and exam notes
- bottom: quick check questions

## Required controls
- next step
- previous step
- reset
- show exam trap
```

### 408 总复习可视化页

```markdown
# 408 Knowledge Map

## Sections
1. 四科结构
2. 高频机制
3. 易错点
4. 今日训练
5. 错题回流
```

## 质量检查

- 是否把机制讲清楚，而不是只画漂亮图。
- 是否显示关键字段、状态、队列、地址位或算法步骤。
- 是否保留考试手算路径。
- 是否说明常见陷阱和检查方法。
- 是否能独立打开，不依赖构建步骤。
- 是否支持用户给定输入，而不是只展示固定示例。
- 是否有 “下一步/上一步/重置” 控制，并且每一步解释与图表状态一致。
