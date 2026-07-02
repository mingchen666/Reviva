---
name: ai-animation-skill
description: 将科普内容文本转换为可视化PPT风格网页的完整工作流。当用户输入科普内容并希望生成演示页面时触发。支持两种模式：(1) 默认模式：将科普内容生成为仿PPT轮播的单页HTML动画网页；(2) 流程图模式：使用Animation模板将已生成的AI_Animation.html按平面UI样式重构。模板已内置于Skill中。触发词包括"生成PPT"、"生成演示网页"、"生成流程图"等。
---

# Science Content PPT Skill

将科普内容文本转换为可视化PPT风格网页的完整工作流。

---

## 真实案例（OSI 七层网络模型）

**用户输入文本：**
> 为了使不同计算机厂家生产的计算机能够相互通信，以便在更大的范围内建立计算机网络，国际标准化组织（ISO）在1978年提出了"开放系统互联参考模型"……七层自下而上依次为：物理层、数据链路层、网络层、传输层、会话层、表示层、应用层。其中第四层完成数据传送服务，上面三层面向用户。除了标准的OSI七层模型以外，常见的网络层次划分还有TCP/IP四层协议以及TCP/IP五层协议。

**执行流程：**
1. 用下方「Step 1 提示词模板」生成 PPT 提示词
2. 模型直接生成完整 HTML（或用 Step 3 模板重构）
3. 用户说"生成流程图"时，用模式二将内容转为平面 UI 风格

**输出结果：**
- PPT模式：13页轮播，含封面、简介、七层详情、层级分工、协议对比
- 流程图模式：横向七层流程卡片，绿色平面UI风格

---

## 模板文件（内置于Skill）

调用时使用相对于 Skill 根目录的路径：

**PPT轮播模板（模式一，默认，Step 3 使用）：**
```
# 优先使用 level2 模板（由当前对话模型根据内容选择最合适的）
assets/templates/PPT Template-level2/   ← 优先选用
assets/templates/PPT/PPT-Generate-3.html
assets/templates/PPT/PPT-Generate-1.html
assets/templates/PPT/PPT-Generate-2.html
assets/templates/PPT/PPT-Generate-4.html
assets/templates/PPT/PPT-Generate-5.html
assets/templates/PPT/PPT-Generate-6.html
assets/templates/PPT/PPT-Generate-7.html
```

**Animation平面UI模板（模式二，默认）：**
```
assets/templates/Animation/RNN-3.html  ← 默认
assets/templates/Animation/RNN-2.html
assets/templates/Animation/RNN-4.html
assets/templates/Animation/RNN-5.html
assets/templates/Animation/RNN-6.html
assets/templates/Animation/RNN-7.html
assets/templates/Animation/LSTM-1.html
assets/templates/Animation/Comprehension.html
assets/templates/Animation/GPU.html
assets/templates/Animation/word2vec-1.html
assets/templates/Animation/onehot.html
assets/templates/Animation/onehot-drawback.html
assets/templates/Animation/The fatal flaw of DNN.html
assets/templates/Animation/Cross-modal disentanglement - 2.html
```

---

## 模式一：生成PPT演示网页（默认）

当用户提供科普文本希望生成演示页面时，执行以下步骤：

### Step 1 — 生成PPT提示词

将以下提示词模板应用到用户输入的科普文本内容：

```
根据以下内容生成基于纯前端页面单页布局仿PPT换页轮播进行直观图形化可视化的介绍，加大文字大小，并运用加粗、下划线、斜体、文字颜色、文字背景等强调方式方便进行视频演示。添加每次切换页面时页面中的各个元素依次"缓入"出现的动画效果(细化到每行文字)。

---
{用户输入的科普内容文本}
---
```

### Step 2 — 生成AI_Animation.html

使用Step 1生成的提示词，调用当前对话模型生成完整的HTML页面代码。

**⚠️ 关键：必须追加以下两条约束到生成提示词中：**

```
将emoji图标换成平面ui库的图标（如Font Awesome或Lucide图标库）。添加完成后检查页面中是否还有残留的emoji字符，如有则全部替换为对应的ui图标。
```

```
所有动画元素的class名统一使用 an 或 anim-item，以便后续动画重置逻辑能正确识别并处理。
```

**⚠️ 关键：动画重置修复**
AI模型直接生成的HTML存在动画只播放一次、切换页面后动画不复发的bug。必须在生成后插入以下修复JS到页面底部（确保在 `</body>` 前）：

```javascript
(function() {
    // 克隆节点强制重置CSS动画，确保每次切换页面动画重新触发
    document.querySelectorAll('.slide').forEach(function(s) {
        s.querySelectorAll('.an, .anim-item, [style*="animation"]').forEach(function(item) {
            var clone = item.cloneNode(true);
            item.parentNode.replaceChild(clone, item);
        });
    });
})();
```

**输出路径**：由用户决定，用户未指定时默认输出到桌面 `/home/mt/桌面/AI_Animation.html`

### Step 3 — 重构为PPT模板风格（可选）

以PPT模板对生成的网页进行重构。

**模板选择规则：**
1. **优先从 `assets/templates/PPT Template-level2/` 目录中选择**（共20+个模板）
2. 由**当前对话的模型**根据科普文案的内容特点（主题、结构、复杂度）自行判断，选出最合适的一个PPT模板
3. 若 level2 中没有合适选项，则回退到 `assets/templates/PPT/` 目录

提示词模板：

```
以页面 {模板相对路径} 为模板重构 {用户指定的输出路径}。

请将AI_Animation.html的内容按照指定PPT模板的布局、样式和轮播机制进行重构，保持科普内容不变，优化视觉效果使其更适合视频演示。
```

**模板路径示例：**
- Level2 示例：`assets/templates/PPT Template-level2/3-1.html`
- 默认回退：`assets/templates/PPT/PPT-Generate-3.html`
- 用户可指定其他内置模板

**模板目录清单：**
- `PPT Template-level2/`（优先）：1.html ~ 9-3.html 共 25 个模板，见下方 SUMMARY 参考
- `PPT/`（回退）：PPT-Generate-1.html ~ PPT-Generate-7.html

**AI 选模板参考文档：** `assets/templates/PPT Template-level2/SUMMARY.md`

> Step 3 重构前，AI 必须先阅读 `SUMMARY.md`，根据科普内容类型从 25 个模板中选择最合适的一个，再进行重构。选模板的核心依据：
> - **对比/辩论类** → 8-1（12组VS）、8-3（30组VS）、6-2（架构对比）
> - **步骤/流程类** → 3-2（SVG流程图）、6-1/6-3/6-4（步骤动画）
> - **案例/实验类** → 4-2、4-3（代码雨动画）
> - **警示/危险类** → 5-4（13页+15种动画）、7-3（红色脉冲）
> - **轻量/快速** → 3-3（331行）、4-1（315行）、9-3（5页）
> - **最强视觉冲击** → 2（13种动画）、6-2（15种动画+红绿VS对比）

**注意**：重构完成后需检查目标模板是否内置了动画重置修复JS，如没有需手动添加。

---

## 模式二：生成流程图（需用户明确触发）

当用户说"生成流程图"时，执行以下步骤：

### Step 1 — 确定模板 + 阅读 SUMMARY 参考

**AI 必须先阅读：** `assets/templates/Animation/SUMMARY.md`

根据科普内容类型，从 14 个 Animation 模板中选择最合适的一个：

| 内容类型 | 推荐模板 | 原因 |
|---------|---------|------|
| RNN/LSTM 循环网络 | RNN-3（隐藏态，默认）> RNN-4（标准流程） | 深绿主题，RNN 系列 |
| 梯度消失/爆炸 | RNN-6（爆炸警示）> RNN-7（双问题） | explode + shake 动画 |
| 架构/系统/多模块 | Comprehension > Cross-modal | 架构卡片 + 连线动画 |
| Word2Vec/词向量 | word2vec-1 | 语义向量可视化 |
| One-hot 编码 | onehot（介绍）> onehot-drawback（缺陷） | 向量稀疏性可视化 |
| DNN/深度学习缺陷 | The fatal flaw of DNN | 紫色警示风格 |
| GPU/计算硬件 | GPU | 计算节点连接动画 |
| LSTM 三阶段 | LSTM-1 | 门控结构三阶段 |

**默认模板：** `assets/templates/Animation/RNN-3.html`
**用户可指定其他 Animation 模板。**

### Step 2 — 重构为平面UI样式

提示词模板：
```
将 {用户指定的输出路径} 网页的每相邻的两页的内容合并后按照指定网页的平面UI样式进行视觉重构，保持现有颜色方案不变。

具体实施要求包括：
1. 精确还原模板中的布局结构、元素间距、字体样式、图标设计和视觉层次
2. 确保所有交互元素（按钮、表单、导航等）的视觉表现与参考网页一致
3. 维持原有的颜色值和配色方案
4. 保证修改后的页面在不同设备和浏览器上具有良好的响应式表现
5. 优化DOM结构以匹配UI设计，同时保持原有功能完整性和交互逻辑不变

完成后需进行视觉一致性检查，确保实现效果与参考网页达到95%以上的相似度。

模板路径：{模板相对路径，默认 assets/templates/Animation/RNN-3.html}
```

---

## 已知问题与解决方案（实操总结）

### Q1: 切换页面后动画不重触发
**原因**：CSS `animation-fill-mode: forwards` 使动画只执行一次，display:none 也无法重置动画状态。
**解决方案**：切换页面时克隆 DOM 节点（`cloneNode(true)` + `replaceChild`），强制浏览器重新渲染动画。这是**跨浏览器最可靠**的方案。
**代码**：
```javascript
document.querySelectorAll('.slide').forEach(function(s) {
    s.querySelectorAll('.an, .anim-item').forEach(function(item) {
        var clone = item.cloneNode(true);
        item.parentNode.replaceChild(clone, item);
    });
});
```

### Q2: AI直接生成的HTML代码量不足
**现象**：模型生成的HTML有时只有200-400行，内容单薄。
**解决**：在提示词中明确要求"代码1000行以上"，或分多步生成后拼接内容。

### Q3: 流程图模式不生成新内容
**说明**：流程图模式**不生成新内容**，仅将已生成的 AI_Animation.html 的页面内容按模板样式重新视觉呈现。需先有 PPT 版内容再说"生成流程图"。

---

## 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| PPT模板路径 | `assets/templates/PPT Template-level2/`（模型自选） | 模式一使用的模板，模型根据内容特点选择最合适的 level2 模板 |
| 流程图模板路径 | `assets/templates/Animation/RNN-3.html` | 模式二使用的模板 |
| 输出路径 | `/home/mt/桌面/AI_Animation.html` | 生成的网页文件，用户未指定时使用默认值 |
| 动画修复JS | 内置于模板 | 切换页面时克隆节点重置CSS动画 |

---

## 使用方式

**模式一（默认PPT流程）：**
> 用户输入科普内容 → Skill自动完成提示词生成、网页生成、动画修复全流程

**模式二（流程图）：**
> 用户输入科普内容后再说"生成流程图" → 将已生成的AI_Animation.html按Animation模板重构为平面UI风格

**模板替换：**
> 用户可通过"以xxx.html为模板"指定其他内置模板进行重构
