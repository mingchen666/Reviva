# 间隔重复记忆详细指南

## 核心理念

**在最佳时间点复习，用最少时间获得最长记忆。** 艾宾浩斯遗忘曲线告诉我们：记忆会随时间衰退，但在即将遗忘时复习，能大幅延长记忆保持时间。

间隔重复不是"多背几遍"，而是"在对的时间背"。

## 艾宾浩斯遗忘曲线

```
记忆保持率 %
100│★
   │ ★
   │  ★
80 │   ★
   │    ★
   │     ★
60 │      ★
   │       ★
   │        ★
40 │         ★
   │          ★  ← 不复习的记忆衰减
   │           ★★★ ← 间隔复习后
20 │              ★★★★
   │                  ★★★★★
   │                     ★★★★★★
 0 └──────────────────────────── 时间
   0  1h  1d  2d  4d  7d  15d 30d
```

## 复习间隔设计

### 自适应间隔（替代固定间隔）

不使用固定的时间间隔表，而是根据学生的回忆难度动态调整间隔。核心原则：**回忆越困难，间隔缩短越多；回忆越流畅，间隔延长越多。**

#### 间隔调整算法（简化SM-2）

```
回忆质量评估：
5 - 完美回忆（<2秒，无需思考）
4 - 轻松回忆（2-5秒，略加思考）
3 - 困难回忆（>5秒，但最终想起）
2 - 需要提示才想起
1 - 完全忘记

间隔计算：
- 质量 ≥ 3：间隔 = 上次间隔 × EF（易度因子）
- 质量 < 3：间隔重置为基础间隔，EF降低
- EF初始值 = 2.5，范围 [1.3, 3.0]
- EF更新：EF = EF + (0.1 - (5-质量) × (0.08 + (5-质量) × 0.02))
```

#### 实际操作规则

| 回忆表现 | 间隔调整 | 说明 |
|---------|---------|------|
| 完美回忆（<2秒） | 间隔 × 2.5 | 记忆巩固，大胆延长 |
| 轻松回忆（2-5秒） | 间隔 × 2.0 | 正常推进 |
| 困难回忆（>5秒） | 间隔 × 1.2 | 记忆脆弱，小幅延长 |
| 需要提示 | 间隔重置为最短 | 重新学习，从最短间隔开始 |
| 完全忘记 | 重新学习 | 回到学习阶段，而非复习 |

### 会话内最优间隔

在单次会话中模拟间隔重复时，测试的最优时机：

- **第1次检验**：学习后立即（0-2分钟内）
- **第2次检验**：在3-5个其他项目之后
- **第3次检验**：在8-12个其他项目之后
- **终测**：会话结束前

关键：间隔的"项目数"比"时间"更重要——中间插入的项目提供了必要的干扰。

## 交错练习（Interleaving）

**核心原则**：混合不同类型的题目进行练习，而非集中练习同一类型。

### 证据

交错练习的效果量 d=0.42-0.83，显著优于集中练习（blocked practice）。来源：Rohrer et al., 2015; Taylor & Rohrer, 2010。

### 为什么交错练习更有效

1. **辨识训练**：学生不仅需要知道"怎么做"，还需要知道"什么时候用哪种方法"
2. **对比效应**：不同类型交替出现，凸显了它们之间的差异
3. **检索难度**：每次切换都需要重新检索策略，增加提取强度
4. **远迁移**：交错练习在远迁移任务上优势更大

### 执行方式

```
集中练习（不推荐）：
题1: 加法 → 题2: 加法 → 题3: 加法 → 题4: 乘法 → 题5: 乘法

交错练习（推荐）：
题1: 加法 → 题2: 乘法 → 题3: 减法 → 题4: 加法 → 题5: 除法
```

### 交错的比例

- **新学阶段**：60%当前内容 + 40%已学内容（交错）
- **复习阶段**：均匀混合不同主题
- **考前冲刺**：模拟真实考试的题型分布

### 注意事项

- 交错练习会让即时正确率下降（约15%），这是正常的——长期保持更好
- 不要过早交错：学生连一种类型都没掌握时就交错，会增加困惑
- 明确告诉学生"交错练习一开始会感觉更难，但效果更好"

## 精化回忆（Elaborative Retrieval）

**核心原则**：不只问"X是什么"，而是问"X和Y有什么关系"。连接知识的回忆比孤立回忆更有效。

### 为什么精化回忆更强

- 孤立回忆只建立一条检索路径
- 关联回忆建立多条检索路径，形成知识网络
- 精化回忆迫使学生激活相关知识，强化知识间的连接

### 提问方式对比

| 类型 | 示例 | 效果 |
|------|------|------|
| 孤立回忆 | "什么是牛顿第二定律？" | 单一检索路径 |
| 精化回忆 | "牛顿第二定律和动量守恒有什么关系？" | 多条检索路径 |
| 对比回忆 | "牛顿第二定律和第三定律的区别是什么？" | 边界更清晰 |
| 应用回忆 | "什么情况下牛顿第二定律会失效？" | 条件和限制 |

### 实际应用

在间隔重复的回忆阶段，优先使用精化回忆型问题：

```
❌ "拉格朗日中值定理的内容是什么？"
✅ "拉格朗日中值定理和罗尔定理有什么关系？"
✅ "在什么情况下你会用拉格朗日而非罗尔？"
✅ "拉格朗日中值定理的几何直觉是什么？"
```

## 在单次会话中的模拟

由于间隔重复需要跨天执行，在单次会话中我们用"隔几题回顾"来模拟：

### 实现方式

1. **学习阶段**：讲解新知识，确保理解
2. **即时检验**：讲完后立即出1-2题检验
3. **间隔检验1**：在3-5个其他问题后，回来检验
4. **间隔检验2**：在会话后段，再次检验
5. **终测**：会话结束前，最终检验

### 检验方式

- **回忆型**：直接问"XX的定义是什么？"
- **应用型**：出题考查该知识点的应用
- **辨析型**：与其他相似知识点对比提问

## 记忆卡片设计

### 卡片格式

```
┌─────────────────────────────┐
│ 正面（问题/提示）            │
│                             │
│ 什么是拉格朗日中值定理？     │
│                             │
├─────────────────────────────┤
│ 背面（答案）                 │
│                             │
│ 若f(x)在[a,b]连续，(a,b)可导│
│ 则存在ξ∈(a,b)，使            │
│ f'(ξ) = [f(b)-f(a)]/(b-a)  │
│                             │
│ 💡 直觉：连线斜率 = 某点切线 │
│ 🔗 关联：罗尔定理(特例)     │
└─────────────────────────────┘
```

### 设计原则

1. **一个问题一张卡**：不要把多个知识点挤在一张卡上
2. **正面要具体**：避免模糊的提示
3. **背面要简洁**：核心答案+关键理解线索
4. **添加助记**：口诀、联想、图像等记忆钩子

## 记忆技巧

### 1. 联想记忆法
将新知识与已知信息关联：

- **相似联想**：新概念像什么已知的？
- **对比联想**：新概念和什么已知的相反？
- **场景联想**：在什么场景下会用到？

### 2. 口诀/顺口溜
将信息编码为韵律文本：

- 化学价态口诀
- 历史朝代歌
- 数学公式助记词

### 3. 故事法
将需要记忆的信息编入一个故事：

- 历史事件的叙事化
- 生物分类的故事化
- 英语单词的情境化

### 4. 位置记忆法
将信息与熟悉的空间位置关联：

- 将知识点"放"在房间的不同位置
- 回忆时在脑中"走过"房间
- 特别适合有序列表的记忆

### 5. 图像法
为抽象概念创造心理图像：

- 物理概念的夸张画面
- 数学公式的几何图像
- 化学反应的动态画面

## 各学科记忆应用

### 数学
重点记忆：
- 核心公式及其推导线索
- 定理的条件（容易被忽略）
- 常见等价变形

### 英语
重点记忆：
- 高频词汇及其搭配
- 不规则动词表
- 常用句型和语法规则

### 化学
重点记忆：
- 元素符号和化合价
- 关键反应方程式
- 官能团特征反应

### 历史
重点记忆：
- 关键事件和时间
- 因果关系链
- 重要人物和贡献

### 计算机
重点记忆：
- 算法时间复杂度对比
- 核心数据结构操作
- 重要协议和标准

## 记忆效果评估

### 即时评估
- 能否不看书回忆出答案
- 回忆速度如何（秒/分钟）
- 是否需要提示才能想起

### 延迟评估
- 间隔一段时间后能否回忆
- 在不同上下文中能否识别
- 能否在解题时自然应用

### 评估标准
- **流利回忆**（<3秒）：记忆巩固，可延长间隔
- **需要思考**（3-10秒）：记忆存在但不牢固，维持当前间隔
- **需要提示**：记忆脆弱，缩短间隔
- **无法回忆**：重新学习

## Anki TSV 导出格式

AI可以生成TSV格式的闪卡数据，学生可直接导入Anki。

### 格式规范

```
front\tback\ttags
```

- 字段之间用制表符（`\t`）分隔
- 第一行可以是表头（Anki会忽略无法识别的列）
- HTML标签在字段中可用：`<b>`, `<i>`, `<br>`, `<code>`, `<img>` 等
- 标签用空格分隔

### 示例

```
什么是拉格朗日中值定理？	若f(x)在[a,b]连续，(a,b)可导，则存在ξ∈(a,b)，使f'(ξ)=[f(b)-f(a)]/(b-a)<br><br><b>直觉</b>：连线斜率=某点切线	math calculus mvt
罗尔定理和拉格朗日中值定理的关系？	罗尔定理是拉格朗日的<b>特例</b>（f(a)=f(b)时）<br><br>拉格朗日是罗尔的<b>推广</b>	math calculus mvt relation
```

### 导入步骤

1. AI生成TSV内容
2. 学生复制保存为 `.txt` 文件（UTF-8编码）
3. Anki → 文件 → 导入
4. 选择分隔符为制表符
5. 映射字段：字段1→正面，字段2→背面，字段3→标签

### 填空删除卡片

Anki支持填空删除（cloze deletion）格式：

```
拉格朗日中值定理：若f(x)在{{c1::[a,b]}}连续，{{c2::(a,b)}}可导，则存在ξ∈(a,b)，使f'(ξ)=[f(b)-f(a)]/(b-a)	math calculus mvt
```

注意：填空删除卡片需要使用Anki的"Cloze"笔记类型，而非"Basic"。

## HTML闪卡生成

AI可以生成自包含的HTML闪卡文件，内置CSS翻转效果、SM-2算法和localStorage持久化。

### 基本结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>闪卡 - [主题]</title>
<style>
  .card-container { perspective: 1000px; width: 400px; height: 250px; margin: 20px auto; }
  .card { position: relative; width: 100%; height: 100%; transition: transform 0.6s; transform-style: preserve-3d; cursor: pointer; }
  .card.flipped { transform: rotateY(180deg); }
  .card-front, .card-back { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 12px; padding: 20px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  .card-front { background: #fff; border: 2px solid #e0e0e0; }
  .card-back { background: #f0f7ff; border: 2px solid #90caf9; transform: rotateY(180deg); }
  .controls { text-align: center; margin: 20px; }
  .controls button { margin: 0 8px; padding: 8px 20px; font-size: 16px; cursor: pointer; }
  .progress { text-align: center; color: #666; margin: 10px; }
</style>
</head>
<body>
<div class="progress" id="progress"></div>
<div class="card-container" onclick="flipCard()">
  <div class="card" id="card">
    <div class="card-front" id="front"></div>
    <div class="card-back" id="back"></div>
  </div>
</div>
<div class="controls" id="controls" style="display:none">
  <button onclick="rate(1)">😵 忘了</button>
  <button onclick="rate(2)">🤔 困难</button>
  <button onclick="rate(3)">😊 一般</button>
  <button onclick="rate(4)">😄 轻松</button>
  <button onclick="rate(5)">🧠 完美</button>
</div>
<script>
// 卡片数据
const CARDS = [
  { front: "什么是拉格朗日中值定理？", back: "若f(x)在[a,b]连续，(a,b)可导<br>则存在ξ∈(a,b)<br>f'(ξ)=[f(b)-f(a)]/(b-a)<br><b>直觉：连线斜率=某点切线</b>", tags: ["math","mvt"] },
  // 更多卡片...
];

// SM-2 算法实现
function sm2(card, quality) {
  if (quality < 3) { card.interval = 1; card.ef = Math.max(1.3, card.ef - 0.2); card.reps = 0; }
  else { card.reps++; card.interval = card.reps === 1 ? 1 : card.reps === 2 ? 6 : Math.round(card.interval * card.ef); card.ef = Math.max(1.3, card.ef + (0.1 - (5-quality)*(0.08+(5-quality)*0.02))); }
  card.due = Date.now() + card.interval * 60000; // 会话内用分钟模拟
}

// 初始化卡片状态
CARDS.forEach(c => { c.ef = 2.5; c.interval = 0; c.reps = 0; c.due = 0; });

// 从localStorage恢复状态
const saved = localStorage.getItem('flashcard-state');
if (saved) { const s = JSON.parse(saved); s.forEach((v,i) => { if(CARDS[i]) Object.assign(CARDS[i], v); }); }

function saveState() { localStorage.setItem('flashcard-state', JSON.stringify(CARDS.map(c=>({ef:c.ef,interval:c.interval,reps:c.reps,due:c.due})))); }

let current = CARDS.findIndex(c => c.due <= Date.now()) || 0;
function showCard() {
  if (current >= CARDS.length || current < 0) current = 0;
  document.getElementById('front').innerHTML = CARDS[current].front;
  document.getElementById('back').innerHTML = CARDS[current].back;
  document.getElementById('card').classList.remove('flipped');
  document.getElementById('controls').style.display = 'none';
  document.getElementById('progress').textContent = `卡片 ${current+1}/${CARDS.length}`;
}
function flipCard() {
  document.getElementById('card').classList.toggle('flipped');
  document.getElementById('controls').style.display = 'flex';
  document.getElementById('controls').style.justifyContent = 'center';
}
function rate(quality) {
  sm2(CARDS[current], quality);
  saveState();
  current = CARDS.findIndex(c => c.due <= Date.now());
  if (current === -1) { document.getElementById('progress').textContent = '🎉 全部复习完成！'; return; }
  showCard();
}
showCard();
</script>
</body>
</html>
```

### 使用说明

- 点击卡片翻转查看答案
- 根据回忆难度评分（1-5）
- SM-2算法自动安排下次复习时间
- 进度保存在浏览器localStorage中
- 可直接在浏览器中打开使用，无需服务器
