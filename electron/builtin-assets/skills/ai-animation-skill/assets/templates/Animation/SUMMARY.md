# Animation 模板总结

> 本文件供 AI 在**模式二 Step 1** 选择模板时参考。
> 共 14 个模板，均为**单页全量展示**（无翻页导航，内容一次性呈现，靠 CSS 动画 + Canvas 粒子驱动视觉层次）。
> **选择原则**：根据科普内容的类型（概念解释 / 流程步骤 / 问题分析 / 架构图 / 缺陷警示等）匹配对应模板。

---

## 快速选择指南

| 内容类型 | 推荐模板 | 原因 |
|---------|---------|------|
| RNN/LSTM/循环网络 | RNN-3（隐藏态）> RNN-4（标准流程）> RNN-2（原理） | RNN 系列专属，深绿主题 |
| 梯度消失/爆炸问题 | RNN-6（梯度爆炸警示）> RNN-7（双问题对比） | 红色警示风格 + explode 动画 |
| 架构/系统/多模块 | Comprehension（理解架构）> Cross-modal（多模态） | 架构卡片 + 模块连线动画 |
| Word2Vec/词向量 | word2vec-1 | 语义身份证概念 |
| One-hot 编码 | onehot（编码介绍）> onehot-drawback（缺陷） | 一热向量可视化 |
| GPU/计算硬件 | GPU | 计算节点连接动画 |
| DNN/深度学习缺陷 | The fatal flaw of DNN | 紫色警示风格 |
| 通用概念/步骤展示 | LSTM-1 | 三阶段流程 |

---

## 模板详情

---

### Comprehension.html
- **标题：** AI 理解语言的技术架构
- **页数：** 单页（不分屏，全量展示）
- **主色调：** `#0d2818` / `#1a3d25` 深绿背景 + `#8b5cf6` 紫色
- **背景特效：** 深绿径向渐变 + 噪点纹理（SVG feTurbulence）
- **粒子效果：** Canvas 紫色粒子漂浮（14个）
- **动画数量：** 5 种（noiseMove / fadeInUp / fadeIn / archFadeIn / fadeInLeft）
- **SVG 图表：** 11 个（输入层、隐藏层、输出层、连接线等架构图）
- **代码量：** 707 行
- **适用场景：** AI 整体理解架构 · 多层神经网络结构 · 输入输出映射关系

---

### Cross-modal disentanglement - 2.html
- **标题：** 多模态融合缺失问题 - 系统架构图
- **页数：** 单页
- **主色调：** 深色背景 + 紫/青渐变
- **背景特效：** 深色网格 + 噪点 + 渐变色移
- **粒子效果：** Canvas 粒子漂浮（18个）
- **动画数量：** 9 种（gradientShift / noiseMove / fadeInUp / fadeInLeft / fadeInRight / fadeInScale / drawLine / fadeInDown）
- **SVG 图表：** 2 个
- **代码量：** 918 行
- **适用场景：** 多模态系统架构 · 跨模态融合问题 · 模块卡片布局

---

### GPU.html
- **标题：** 2013年：RNN 迎来时代
- **页数：** 单页
- **主色调：** `#0a0a0f` 极深黑 + `#8b5cf6` 紫色 + `#ec4899` 粉红
- **背景特效：** 极简深色背景
- **粒子效果：** 无
- **动画数量：** 3 种（pulse-ring / fadeIn / lineFadeIn）
- **SVG 图表：** 6 个（GPU计算节点连接示意）
- **代码量：** 570 行（最轻量之一）
- **适用场景：** GPU计算架构 · 2013年技术背景 · 简洁历史叙事

---

### LSTM-1.html
- **标题：** LSTM 三阶段工作流程
- **页数：** 单页
- **主色调：** 深绿背景 + `#8b5cf6` 紫色 + `#ec4899` 粉红
- **背景特效：** 深绿径向渐变 + 噪点纹理
- **粒子效果：** Canvas 粒子漂浮（14个）
- **动画数量：** 3 种（noiseMove / fadeInUp / dashFlow）
- **SVG 图表：** 15 个（最丰富之一！LSTM三阶段门控结构图）
- **代码量：** 667 行
- **适用场景：** LSTM门控机制 · 遗忘门/输入门/输出门 · 三阶段工作流

---

### onehot-drawback.html
- **标题：** One-hot 编码的致命缺陷
- **页数：** 单页
- **主色调：** 深绿背景 + `#8b5cf6` 紫色 + `#f97316` 橙色警示
- **背景特效：** 深绿渐变 + 噪点纹理
- **粒子效果：** Canvas 粒子漂浮（14个）
- **动画数量：** 4 种（noiseMove / fadeInUp / fade / archFadeIn）
- **SVG 图表：** 8 个（One-hot向量稀疏性问题可视化）
- **代码量：** 715 行
- **适用场景：** One-hot 缺陷警示 · 高维稀疏向量问题 · 内存浪费可视化

---

### onehot.html
- **标题：** One-hot 编码：早期的笨方法
- **页数：** 单页
- **主色调：** 深绿背景 + `#8b5cf6` 紫色 + `#ec4899` 粉红
- **背景特效：** 深绿渐变 + 噪点纹理
- **粒子效果：** Canvas 粒子漂浮（14个）
- **动画数量：** 4 种（noiseMove / fadeInUp / fade / archFadeIn）
- **SVG 图表：** 12 个（One-hot向量组成示意图）
- **代码量：** 832 行
- **适用场景：** One-hot 编码基础介绍 · 词表编码方式 · 早期NLP方法

---

### RNN-2.html
- **标题：** RNN 循环神经网络工作原理
- **页数：** 单页
- **主色调：** 深绿背景 + `#8b5cf6` 紫色 + `#ec4899` 粉红
- **背景特效：** 深绿渐变 + 噪点纹理
- **粒子效果：** Canvas 粒子漂浮（14个）
- **动画数量：** 5 种（noiseMove / fadeInDown / fadeIn / fadeInUp / rotate）
- **SVG 图表：** 10 个（RNN循环结构、时序展开图）
- **代码量：** 914 行
- **适用场景：** RNN基本原理 · 循环结构解释 · 时序数据处理

---

### RNN-3.html
- **标题：** RNN 隐藏状态与循环机制
- **页数：** 单页
- **主色调：** 深绿背景 `#0a0f0d` + `#8b5cf6` 紫色
- **背景特效：** 深绿渐变 + 噪点纹理 + Canvas粒子（14个）
- **粒子效果：** 紫色 Canvas 粒子漂浮
- **动画数量：** 5 种（noiseMove / fadeInDown / fadeIn / fadeInUp / rotate）
- **SVG 图表：** 7 个（隐藏态传递、循环回路可视化）
- **代码量：** 842 行
- **适用场景：** RNN隐藏状态机制 · 状态传递 · 循环回路 — **模式二默认模板**

---

### RNN-4.html
- **标题：** RNN 标准化工作流程
- **页数：** 单页
- **主色调：** 深绿背景 + `#8b5cf6` 紫色 + `#ec4899` 粉红
- **背景特效：** 深绿渐变 + 噪点纹理 + Canvas粒子（16个）
- **粒子效果：** 16 个 Canvas 粒子（最丰富之一）
- **动画数量：** **22 种（最丰富！）**（noiseMove / fadeInDown / fadeIn / fadeInUp / fadeInScale / slideInLeft / slideInRight / pulse / glow / float / drawLine / bounceIn / typewriter / blink / shimmer / dashFlow / arrowAppearThenPulse / arrowPulseLoop / labelAppearThenFade / labelFadeLoop / rotate）
- **SVG 图表：** 9 个
- **代码量：** 1156 行
- **适用场景：** RNN完整工作流程 · 标准化步骤展示 · 打字机效果 + 箭头脉冲 · **最强动画密度模板**

---

### RNN-5.html
- **标题：** RNN 的致命缺陷与解决方案
- **页数：** 单页
- **主色调：** 深绿背景 + `#8b5cf6` 紫色 + `#ec4899` 粉红（警告色）
- **背景特效：** 深绿渐变 + 噪点纹理 + Canvas粒子（15个）
- **粒子效果：** 15 个 Canvas 粒子
- **动画数量：** **18 种**（noiseMove / fadeInDown / fadeIn / fadeInUp / fadeInScale / slideInLeft / slideInRight / bounceIn / pulse / glow / float / shimmer / dashFlow / arrowPulse / heartbeat / colorPulse / drawLine / rotate）
- **SVG 图表：** 8 个（问题卡片 + 解决方案对照）
- **代码量：** 1264 行
- **适用场景：** RNN缺陷 + 解决方案对比 · 问题/解决双卡片布局 · 心跳脉冲动画

---

### RNN-6.html
- **标题：** 梯度爆炸 - 梯度消失的孪生问题
- **页数：** 单页
- **主色调：** 深绿背景 + `#ec4899` 粉红（红色警示）
- **背景特效：** 深绿渐变 + 噪点纹理 + Canvas粒子（15个）
- **粒子效果：** 15 个 Canvas 粒子
- **动画数量：** **20 种**（noiseMove / fadeInDown / fadeIn / fadeInUp / fadeInScale / slideInLeft / slideInRight / bounceIn / pulse / glow / float / shimmer / dashFlow / arrowPulse / heartbeat / colorPulse / **explode** / **shake** / drawLine / rotate）
- **SVG 图表：** 8 个
- **代码量：** 1320 行
- **适用场景：** 梯度爆炸警示 · 红色explode动画 · 爆炸效果展示 · 孪生问题

---

### RNN-7.html
- **标题：** RNN 的致命缺陷 - 梯度消失与梯度爆炸
- **页数：** 单页
- **主色调：** 深绿背景 + `#ec4899` 粉红（警示）
- **背景特效：** 深绿渐变 + 噪点纹理 + Canvas粒子（15个）
- **粒子效果：** 15 个 Canvas 粒子
- **动画数量：** **22 种**（noiseMove / fadeInDown / fadeIn / fadeInUp / fadeInScale / slideInLeft / slideInRight / bounceIn / pulse / glow / float / shimmer / dashFlow / arrowPulse / heartbeat / colorPulse / **explode** / **shake** / drawLine / **arrowAppear / arrowFlow** / rotate）
- **SVG 图表：** 12 个（最丰富之一）
- **代码量：** 1336 行
- **适用场景：** 梯度消失+爆炸双问题 · 红色箭头流 · 完整问题体系 · RNN最终缺陷总结

---

### The fatal flaw of DNN.html
- **标题：** DNN 的致命缺陷
- **页数：** 单页
- **主色调：** 深绿背景 + `#8b5cf6` 紫色
- **背景特效：** 深绿渐变 + 噪点纹理 + Canvas粒子（14个）
- **粒子效果：** 14 个 Canvas 粒子
- **动画数量：** 6 种（noiseMove / fadeInUp / archFadeIn / box-glow / fadeIn / fadeInLeft）
- **SVG 图表：** 7 个（DNN层次结构缺陷可视化）
- **代码量：** 734 行
- **适用场景：** DNN缺陷 · 紫色box-glow动画 · 深度学习局限性问题

---

### word2vec-1.html
- **标题：** Word2Vec：给每个词一张"语义身份证"
- **页数：** 单页
- **主色调：** 深绿背景 + `#8b5cf6` 紫色 + `#ec4899` 粉红
- **背景特效：** 深绿渐变 + 噪点纹理 + Canvas粒子（14个）
- **粒子效果：** 14 个 Canvas 粒子
- **动画数量：** 4 种（noiseMove / fadeInUp / fadeIn / archFadeIn）
- **SVG 图表：** 11 个（词向量空间、语义距离可视化）
- **代码量：** 977 行（最长之一）
- **适用场景：** Word2Vec语义向量 · 词嵌入原理 · 语义身份证比喻

---

## 背景特效索引

所有 Animation 模板共享的视觉基础：

| 特效 | 说明 |
|------|------|
| 噪点纹理 | SVG feTurbulence + noiseMove 动画，全局覆盖 |
| 深绿渐变背景 | `radial-gradient(#0d2818, #1a3d25, #0a0f0d)` |
| Canvas 粒子 | requestAnimationFrame 驱动的漂浮粒子系统 |
| fadeIn/fadeInUp | 所有内容区域的入场动画 |

---

## 配色主题索引

| 主配色 | 模板 |
|-------|------|
| 深绿+紫 | RNN-2/3/4/5/6/7, LSTM-1, onehot/onehot-drawback, Comprehension, DNN, word2vec |
| 深绿+紫+粉红(警示) | RNN-5/6/7, onehot-drawback |
| 极深黑+紫+粉红 | GPU.html |
| 紫+青渐变 | Cross-modal |

---

## 特殊动画索引

| 动画名 | 模板文件 | 效果 |
|--------|---------|------|
| explode | RNN-6, RNN-7 | 爆炸效果，警示类内容 |
| shake | RNN-6, RNN-7 | 抖动效果 |
| heartbeat | RNN-5, RNN-6, RNN-7 | 心跳脉冲 |
| typewriter | RNN-4 | 打字机效果 |
| arrowFlow / arrowPulse | RNN-4, RNN-5, RNN-6, RNN-7 | 箭头流脉冲 |
| gradientShift | Cross-modal | 渐变位移 |
| drawLine | RNN-3/4/5/6/7, Cross-modal | 连线绘制动画 |
| pulse-ring | GPU | 环形脉冲 |
