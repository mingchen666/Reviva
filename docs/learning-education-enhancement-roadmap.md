# 学习教育与轻办公能力增强规划

## 背景

Reviva 当前已经具备一批面向学习、复习、资料整理和轻办公创作的内置 Agent 与 Skill。现有能力已经能覆盖“讲解知识点、整理资料、生成笔记、做可视化、出题复习、生成演示文稿”等核心链路。

后续增强不应盲目堆叠 Skill，而应围绕用户真实学习流程扩展：用户可能上传文档、笔记、课件、图片、视频、网页资料，也可能只是输入一个模糊问题。系统需要把这些来源转成可理解、可复习、可输出的学习资产。

主打场景：

- 学习教育：概念理解、课内复习、考试训练、错题归因、知识可视化。
- 轻办公：资料整理、汇报生成、会议/培训材料、轻量研究报告、可编辑 Office 输出。

## 当前能力基线

### 学习理解

- `concept-agent`：分层讲解复杂概念。
- `concept-explainer`：类比、例子、误区、不同理解层级。
- `socratic-tutor`：提问式引导。
- `feynman-learning-coach`：费曼法复述与漏洞诊断。

### 复习训练

- `final-review-agent`：期末复习统筹。
- `review-plan`：复习计划。
- `knowledge-organize`：知识框架与考点整理。
- `practice-quiz`：练习题。
- `mock-exam`：模拟考试。
- `exam-prep`：考前速记与冲刺。
- `flashcard-generator`：闪卡。
- `error-analysis`：错题分析。

### 可视化与交互

- `learning-visualization-skill`：概念图、流程图、原理动画、时间线、AI/ML 模型可视化。
- `network-protocol-viz`：网络协议动画。
- `edu-solid-geometry`：Three.js 立体几何交互网页。
- `edu-analytic-geometry`：Canvas 解析几何动态画板。
- `technical-diagram-skill`：架构图、时序图、数据流图、状态机图。

### 笔记与输出

- `note-skill`：手写笔记风格 HTML。
- `html-ppt-skill`：HTML 演示文稿。
- `pptx-deck-skill`：OfficeCLI 原生 PPTX 设计层。
- `officecli-skills`：DOCX/PPTX/XLSX 创建与编辑。

### 教师备课与教研

- `teacher-prep-agent`（教学教研助手）：面向教学设计、备课、课件、学案、课堂活动、练习作业、教学评价、资料检索、课堂管理和轻办公培训材料的一体化 Agent。
- `lesson-plan-skill`：标准教案、单元教学设计、说课稿、公开课/赛课方案、教学反思。
- `worksheet-skill`：学案、导学案、练习单、分层作业、教师版答案解析。
- `classroom-activity-skill`：课堂导入、探究任务、小组讨论、提问链、实验活动、出门条。
- `teaching-assessment-skill`：评价量规、形成性评价、作业批改标准、课堂观察表、教学反思。
- `teaching-document-writing-skill`：说课稿、教研总结、听评课记录、教学案例、培训方案、家校沟通、工作计划和工作总结。
- `teaching-resource-research-skill`：联网检索和筛选课程标准、政策、教材背景、公开资料、案例、时事素材和引用依据。
- `classroom-management-differentiation-skill`：课堂管理、分组、过渡、注意力维持、分层教学、培优补差、特殊支持和风险预案。

## 用户需求地图

| 用户需求 | 典型表达 | 推荐能力 |
| --- | --- | --- |
| 听不懂概念 | “这个知识点讲简单点” | `concept-agent` + `concept-explainer` |
| 想看图理解 | “能不能画出来” | `learning-visualization-skill` |
| 做数学几何题 | “这道立体几何怎么做” | `edu-solid-geometry` / `edu-analytic-geometry` |
| 复习考试 | “帮我复习期末” | `final-review-agent` |
| 资料太多 | “帮我整理这份课件” | `knowledge-organize` |
| 背不住 | “做成闪卡” | `flashcard-generator` |
| 练习检测 | “出几道题测我” | `practice-quiz` / `mock-exam` |
| 错题复盘 | “为什么总错这类题” | `error-analysis` |
| 做学习资料 | “整理成笔记/Word” | `note-skill` / `officecli-skills` |
| 做汇报课件 | “做成 PPT” | `presentation-agent` + `pptx-deck-skill` / `html-ppt-skill` |
| 技术方案说明 | “画个架构图/时序图” | `technical-diagram-skill` |
| 教师备课 | “帮我备一节课/生成教案” | `teacher-prep-agent` + `lesson-plan-skill` |
| 做学案作业 | “给这节课配学案/分层作业” | `worksheet-skill` + `practice-quiz` |
| 公开课/赛课 | “设计公开课互动和评价” | `lesson-plan-skill` + `classroom-activity-skill` + `teaching-assessment-skill` |
| 教学文档撰写 | “生成说课稿/评价表/培训讲义/教研总结” | `teacher-prep-agent` + `teaching-document-writing-skill` + `officecli-skills` |
| 联网查教学资料 | “帮我找课标/素材/案例/时事导入” | `teacher-prep-agent` + `teaching-resource-research-skill` |
| 课堂执行困难 | “这个班基础差/两极分化/课堂不好控” | `teacher-prep-agent` + `classroom-management-differentiation-skill` |

## 未来增强方向

### 1. 物理可视化 Skill

目标：帮助用户理解力学、电学、光学、波动等抽象过程。

典型场景：

- 受力分析、摩擦力、斜面、滑块、弹簧、圆周运动。
- 电路等效、电流方向、电压变化、RC 充放电。
- 光学成像、透镜、反射折射。
- 波动叠加、驻波、干涉。

建议形态：

- `edu-physics-visualization`
- 输出 HTML 交互页。
- 2D Canvas 为主，必要时 Three.js。
- 可选接入 `matter-js` 或轻量自研物理演示，不建议一开始做完整物理仿真平台。

优先级：高。物理是学习教育里可视化收益很高的场景。

### 2. 化学可视化 Skill

目标：把化学结构、反应过程和实验步骤变成可理解的视觉材料。

典型场景：

- 分子结构、空间构型、价键、杂化轨道。
- 氧化还原、离子反应、电子转移。
- 有机反应路径。
- 实验装置图、操作步骤、现象解释。

建议形态：

- `edu-chemistry-visualization`
- 初期先做 2D 结构图、反应流程、实验流程。
- 后续再考虑 3D 分子模型。

依赖建议：

- 初期避免强依赖大型化学库。
- 未来可评估 RDKit.js、3Dmol.js、Mol* 等。

优先级：中高。适合高中/大学基础化学，但依赖和准确性要求更高。

### 3. 生物可视化 Skill

目标：解释细胞结构、遗传过程、生理系统和生态关系。

典型场景：

- 细胞结构、细胞器功能。
- DNA 复制、转录、翻译。
- 遗传规律、减数分裂。
- 神经传导、激素调节。
- 食物链、生态系统。

建议形态：

- `edu-biology-visualization`
- 以分层图、流程动画、结构标注为主。
- 适合输出学习卡片、复习图谱、交互解释页。

优先级：中。内容覆盖广，宜先做模板化可视化。

### 4. 编程与算法可视化 Skill

目标：帮助用户理解算法执行过程、数据结构变化和程序运行状态。

典型场景：

- 排序、搜索、递归、动态规划。
- 栈、队列、链表、树、图。
- 图算法：BFS、DFS、Dijkstra、拓扑排序。
- 代码执行步骤、变量变化、调用栈。

建议形态：

- `code-algorithm-visualization`
- 输出 HTML 动画页。
- 支持用户粘贴代码或描述算法。
- 后续可和代码解释 agent 结合。

优先级：高。对计算机学习、刷题、技术面试很有价值。

### 5. 通用 3D 可视化能力

当前 `edu-solid-geometry` 已覆盖立体几何题，不需要重复新增“立体图形可视化” Skill。但未来可以扩展一个更通用的 3D 解释能力。

目标：

- 不局限于数学题。
- 支持空间结构、坐标变换、机械结构、建筑/场景示意、三维关系讲解。

建议形态：

- 不急于新建。
- 先增强 `edu-solid-geometry` 的几何体、截面、投影、旋转体能力。
- 如果需求明显超出数学题，再独立成 `general-3d-visualization`。

优先级：中。先用现有立体几何 Skill 承接。

### 6. 错题到知识图谱

目标：把用户错题、练习结果和薄弱点自动转成知识缺口图。

典型场景：

- 用户上传错题本。
- 用户做完模拟卷。
- 用户反复错同一类题。

输出：

- 错因分类。
- 涉及知识点。
- 前置知识缺口。
- 推荐复习顺序。
- 对应练习题和闪卡。

建议能力：

- 增强 `error-analysis`。
- 和 `knowledge-organize`、`flashcard-generator`、`practice-quiz` 联动。
- 可用 `learning-visualization-skill` 输出知识缺口图。

优先级：高。直接服务复习效率。

### 7. 文档到学习包

目标：用户上传课件、讲义、教材片段、论文或笔记后，自动生成完整学习包。

输入来源：

- PDF、DOCX、PPTX、Markdown、网页、图片。
- 知识库/Wiki 中的资料。

输出组合：

- 知识框架。
- 重点笔记。
- 可视化讲解页。
- 闪卡。
- 练习题。
- 考前速记页。
- PPT/Word 资料。

建议编排：

1. `file_read` / `office_read` / `kb_search`
2. `knowledge-organize`
3. `concept-explainer`
4. `learning-visualization-skill`
5. `note-skill`
6. `flashcard-generator`
7. `practice-quiz`
8. `officecli-skills`

优先级：高。这是 Reviva 的核心学习闭环。

### 8. 视频资料到学习资产

目标：将课程视频、B 站视频、会议录屏、公开课等转成可检索、可复习、可对话的学习资产。

注意：这部分属于独立视频解析模块，不应和 PPT 生成混在一起。

关键能力：

- 视频元数据提取。
- 音频转写。
- 字幕读取。
- 关键帧抽取。
- 章节切分。
- 视觉内容理解。
- 对话问答引用到时间戳。

输出：

- 视频摘要。
- 章节大纲。
- 重点知识点。
- 可视化笔记。
- 闪卡/测验。
- 时间戳引用。

依赖：

- `ffmpeg` 用于抽音频和关键帧。
- ASR 可选，不自动大模型下载；如用户已有模型或服务则使用。
- 多模态 LLM 可直接理解关键帧/视频片段时，优先走轻量方案。

优先级：中高。价值大，但模块复杂，需要单独设计。

### 9. 轻办公资料助手

目标：把学习资料、研究材料和工作内容转成可交付文档。

典型场景：

- 整理会议纪要。
- 生成周报/月报。
- 生成项目复盘。
- 整理培训材料。
- 把调研资料做成 Word/PPT。
- 将表格数据做成图表说明。

建议增强：

- `officecli-skills` 与 `pptx-deck-skill` 继续完善。
- 增强 DOCX 模板能力：报告、纪要、学习资料、复习包。
- 增强 PPTX 模板能力：教育课件、办公汇报、研究分享。
- 与 `technical-diagram-skill` 配合生成架构/流程配图。

优先级：高。轻办公是学习场景的自然延伸。

## Agent 编排建议

### concept-agent

定位：讲懂概念，必要时产出可视化。

建议绑定：

- `concept-explainer`
- `note-skill`
- `learning-visualization-skill`
- `network-protocol-viz`
- `edu-solid-geometry`
- `edu-analytic-geometry`

后续可加入：

- `edu-physics-visualization`
- `code-algorithm-visualization`

### final-review-agent

定位：复习闭环和考试训练。

建议绑定：

- 复习计划、知识整理、测验、模拟卷、错题分析。
- `learning-visualization-skill`
- `note-skill`
- `flashcard-generator`
- `edu-solid-geometry`
- `edu-analytic-geometry`

后续增强：

- 错题到知识图谱。
- 文档到学习包。
- 视频到复习包。

### presentation-agent

定位：演示材料、课件和汇报。

建议绑定：

- `html-ppt-skill`
- `ai-animation-skill`
- `pptx-deck-skill`
- `technical-diagram-skill`
- `officecli-skills`

后续增强：

- 教育课件模板。
- 轻办公汇报模板。
- 研究分享模板。

### future video-agent

定位：视频解析、转写、理解和学习资产生成。

建议能力：

- 视频/音频处理。
- 字幕/ASR。
- 关键帧理解。
- 时间戳问答。
- 输出到笔记、闪卡、测验、知识库。

## 依赖策略

### 可以自动安装的轻量依赖

适用于内置学习技能的必要轻量 Python 依赖，例如：

- `sympy`：数学精确计算。

前提：

- 安装行为只发生在 Skill 明确需要运行脚本时。
- 安装失败要降级说明，不阻塞普通文本讲解。

### 不建议自动安装的重依赖

默认不要自动安装：

- 本地 ASR 大模型。
- 大型视觉模型。
- 大型三维/科学计算包。
- 需要系统级配置的工具链。

处理方式：

- 先检测是否存在。
- 存在则使用。
- 不存在则降级或提示用户可选安装。

### 系统工具

- `ffmpeg`：视频/音频处理建议作为可选依赖。
- OfficeCLI：Office 文档处理核心依赖。
- 浏览器/Three.js/CDN：HTML 可视化需要考虑离线降级。

## 优先级路线图

### P0：把现有能力跑顺

- 确保学习类 agent 正确绑定几何、可视化、笔记、复习技能。
- 确保 Skill 的 `config.json`、frontmatter、权限声明一致。
- 确保依赖策略清晰：轻量依赖可自动安装，重模型不自动装。
- 统一输出目录策略，避免写入 Skill 自身目录。

### P1：补强高价值学习场景

- 物理可视化。
- 编程/算法可视化。
- 错题到知识图谱。
- 文档到学习包。

### P2：扩展多学科

- 化学可视化。
- 生物可视化。
- 通用 3D 可视化。

### P3：视频学习模块

- 视频解析。
- 字幕/转写。
- 关键帧理解。
- 时间戳问答。
- 视频到学习包。

## 风险与注意事项

- 不要让 Skill 数量过多导致 agent 路由混乱。新增 Skill 必须有清晰边界。
- 同一类能力优先增强现有 Skill，不要重复新建。
- 生成网页类产物要重视移动端和桌面端可读性。
- 学科类内容必须优先保证正确性，尤其数学、物理、化学。
- 对安全、网络、仿站类素材要保持教育边界，避免生成可滥用内容。
- 对视频和 ASR 相关能力要控制存储、模型体积和用户等待时间。

## 推荐下一步

短期先不新增太多 Skill。更合理的顺序是：

1. 继续打磨现有学习类 Agent 的路由。
2. 做一套“文档到学习包”的标准编排。
3. 新增 `edu-physics-visualization`。
4. 新增 `code-algorithm-visualization`。
5. 等真实需求稳定后，再做化学、生物和通用 3D。
