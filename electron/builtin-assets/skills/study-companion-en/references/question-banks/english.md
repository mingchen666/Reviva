# 英语出题指南

## 学科-考试矩阵

| 考试 | 词汇量要求 | 重点技能 | 出题侧重点 |
|------|-----------|---------|-----------|
| CET-4 | ~4500 | 听力+阅读+写作+翻译 | 词汇辨析、语法结构、阅读细节理解 |
| CET-6 | ~6000 | 听力+阅读+写作+翻译 | 近义辨析、长难句理解、推断能力 |
| 考研英语(一) | ~5500 | 阅读+翻译+写作 | 长难句分析、作者态度推断、学术翻译 |
| 考研英语(二) | ~5500 | 阅读+翻译+写作 | 商业/社会话题阅读、应用文写作 |

### 考试交叉覆盖策略

- 词汇题：CET-4 基础词 → CET-6 进阶词 → 考研高频词，逐级覆盖
- 阅读题：四级偏细节定位 → 六级偏推断综合 → 考研偏学术分析
- 翻译题：四级简单句 → 六级复合句 → 考研学术长难句

## 知识点-题型对照表

### 词汇

| 知识点 | 推荐题型 | 难度 | 考频 | 常见错误 |
|-------|---------|------|------|---------|
| 近义词辨析 | choice | ⭐⭐ | ★★★ | 混淆词义细微差别（affect/effect） |
| 词形变化 | fill | ⭐ | ★★★ | 动词-名词-形容词变形错误 |
| 词汇搭配 | choice/fill | ⭐⭐ | ★★★ | 母语负迁移导致搭配错误（make a decision vs take a decision） |
| 熟词生义 | choice | ⭐⭐⭐ | ★★ | 只记常用义，忽略语境特殊含义 |
| 词根词缀 | fill | ⭐ | ★★ | 词缀含义推导错误 |

### 语法

| 知识点 | 推荐题型 | 难度 | 考频 | 常见错误 |
|-------|---------|------|------|---------|
| 时态语态 | fill/cloze | ⭐⭐ | ★★★ | 完成时与一般时混淆 |
| 虚拟语气 | choice/cloze | ⭐⭐⭐ | ★★★ | 条件句类型混用 |
| 从句(定语/名词/状语) | fill/cloze | ⭐⭐⭐ | ★★★ | 关系词选择错误 |
| 非谓语动词 | choice/cloze | ⭐⭐⭐ | ★★★ | doing/done/to do 误用 |
| 倒装强调 | cloze | ⭐⭐⭐ | ★★ | 部分倒装vs完全倒装混淆 |
| 主谓一致 | fill | ⭐⭐ | ★★ | 集合名词/就近原则误判 |

### 阅读理解

| 知识点 | 推荐题型 | 难度 | 考频 | 常见错误 |
|-------|---------|------|------|---------|
| 主旨大意 | choice(阅读) | ⭐⭐ | ★★★ | 以偏概全，用细节替代主旨 |
| 细节理解 | choice(阅读) | ⭐ | ★★★ | 定位错误或偷换概念 |
| 推断判断 | choice(阅读) | ⭐⭐⭐ | ★★★ | 过度推断或推断不足 |
| 词义猜测 | choice(阅读) | ⭐⭐ | ★★ | 脱离语境猜测 |
| 作者态度 | choice(阅读) | ⭐⭐⭐ | ★★★ | 混淆客观叙述和主观评价 |

### 翻译与写作

| 知识点 | 推荐题型 | 难度 | 考频 | 常见错误 |
|-------|---------|------|------|---------|
| 中译英句子 | fill | ⭐⭐ | ★★★ | 中式英语表达 |
| 长难句翻译 | fill | ⭐⭐⭐ | ★★★ | 句法结构理解错误 |
| 语法改错 | choice(tf) | ⭐⭐ | ★★ | 对错误不敏感，无法定位错误类型 |

## 出题模板

### 模板1：Cloze 填空题（多空填空）

适用于：语法综合、完形填空类题目。在一段文本中设置多个填空，考查语境中的语法和词汇运用。

```json
{
  "type": "fill",
  "difficulty": 2,
  "subject": "英语",
  "topic": "虚拟语气",
  "tags": ["虚拟语气", "条件句", "CET-6"],
  "exam": "CET-6",
  "cognitiveLevel": 3,
  "question": "If I ______ (be) you, I would accept the offer without hesitation. He suggested that she ______ (attend) the meeting on time.",
  "answer": ["were", "attend"],
  "explanation": "第一空：虚拟条件句中，与现在事实相反，if从句用过去式，be动词统一用were。第二空：suggest后的宾语从句使用虚拟语气，谓语用(should+)动词原形。",
  "pitfall": "注意suggest有两种用法：suggest doing sth（建议做某事）不用虚拟；suggest that sb (should) do sth（建议某人做某事）用虚拟。另外insist也有类似区分。",
  "hints": [
    "想想这是哪种虚拟语气——条件句还是名词性从句？",
    "第一空是与现在事实相反的条件句，第二空是suggest后的宾语从句",
    "条件句if I were you中be用were；suggest that sb (should) do中动词用原形"
  ],
  "commonErrors": [
    {"answer": ["was", "attends"], "reason": "第一空误用was（口语中可接受但考试应用were）；第二空未识别suggest后的虚拟语气，用了第三人称单数"},
    {"answer": ["were", "would attend"], "reason": "第二空多加了would，虚拟语气中should可省略但不可用would替代"}
  ],
  "id": "eng-subjunctive-cloze-001"
}
```

**Cloze出题规范**：
- 每段文本2-4个空，每个空考查独立知识点
- 空格用 `______` 标注，括号内给出原形提示（如需）
- answer为数组，按空格顺序排列
- 解析逐空说明，分别讲清每个空的语法依据

### 模板2：阅读理解题（passage + questions）

适用于：综合阅读能力考查。先给一段文章，再出2-4道理解题。

```json
{
  "type": "choice",
  "difficulty": 3,
  "subject": "英语",
  "topic": "阅读理解-推断判断",
  "tags": ["阅读理解", "推断题", "考研英语"],
  "exam": "考研英语",
  "cognitiveLevel": 4,
  "question": "Passage:\nThe rise of remote work has been hailed as a revolution in employee flexibility. However, a growing body of research suggests that the absence of face-to-face interaction may erode the subtle social bonds that hold organizations together. A 2023 study by Stanford's Institute for Economic Policy Research found that fully remote workers were 10% less productive than their in-office counterparts, and reported higher levels of isolation and disconnection from company culture.\n\nQ: What can be inferred about the author's view on remote work?",
  "options": [
    "The author believes remote work should be completely abandoned.",
    "The author acknowledges the benefits of remote work but warns of its hidden costs.",
    "The author considers remote work a failed experiment.",
    "The author thinks productivity loss is the only problem with remote work."
  ],
  "answer": 1,
  "explanation": "作者用'hailed as a revolution'承认远程工作的积极面，但用'However'转折，指出其隐藏代价（erode social bonds, less productive, isolation）。选项B准确概括了这种'肯定+警示'的态度。A和C过于极端，D以偏概全（不只是生产力问题）。",
  "pitfall": "推断题切忌过度推断。'completely abandoned'和'failed experiment'都是极端表述，学术文章作者很少持有如此绝对的态度。'only problem'也是常见干扰，文章提到了isolation和disconnection等多个问题。",
  "hints": [
    "注意文章的转折词——However前后分别表达了什么？",
    "作者先肯定了什么，又指出了什么问题？",
    "hailed as a revolution（积极）+ However + erode/less productive/isolation（消极），整体态度是balanced caution"
  ],
  "commonErrors": [
    {"answer": 0, "reason": "过度推断——作者指出问题不等于主张完全放弃，'completely abandoned'过于极端"},
    {"answer": 2, "reason": "误解作者态度——'failed experiment'意味着全盘否定，但作者承认了flexibility的好处"},
    {"answer": 3, "reason": "以偏概全——文章还提到social bonds erosion和isolation，不仅是生产力问题"}
  ],
  "id": "eng-reading-inference-001"
}
```

**阅读理解出题规范**：
- passage长度：四级80-150词，六级120-200词，考研200-350词
- 每篇2-4题，覆盖不同题型（主旨/细节/推断/词义/态度）
- 选项长度大致相当，避免因长度暗示答案
- 干扰项必须基于文本，不能无中生有

### 模板3：改错题

适用于：语法错误识别与修正，考查语法敏感度。

```json
{
  "type": "choice",
  "difficulty": 2,
  "subject": "英语",
  "topic": "语法改错-主谓一致",
  "tags": ["改错题", "主谓一致", "CET-6"],
  "exam": "CET-6",
  "cognitiveLevel": 3,
  "question": "以下句子中有一处语法错误，请找出并选择正确的修改方式：\n\nThe number of students who have passed the exam are surprisingly low this year.",
  "options": [
    "have passed → has passed",
    "are → is",
    "The number of → A number of",
    "low → lower"
  ],
  "answer": 1,
  "explanation": "主语是'The number of students'（学生的数量），中心词是number，为单数，谓语应用is。注意区分：The number of + 名词复数 + 单数谓语（……的数量）；A number of + 名词复数 + 复数谓语（许多……）。",
  "pitfall": "这是最高频的改错考点之一。学生常被students误导选A，但定语从句who have passed修饰students（复数），have没错。错误在主句的主谓一致。",
  "hints": [
    "找出句子的主语和谓语，看它们是否一致",
    "主语是'The number of students'还是'students'？中心词是谁？",
    "The number of + 复数名词 + 单数谓语；A number of + 复数名词 + 复数谓语"
  ],
  "commonErrors": [
    {"answer": 0, "reason": "误判错误位置——who引导的定语从句修饰students（复数），have passed是正确的"},
    {"answer": 2, "reason": "混淆The number of和A number of——改成A number of改变了句意，从'数量'变成'许多'"}
  ],
  "id": "eng-error-correction-sva-001"
}
```

## 考试特化出题规则

### CET-4 出题规则

1. **词汇范围**：不超过四级大纲词汇，超纲词给中文注释
2. **句子长度**：平均15-20词/句，避免嵌套3层以上从句
3. **阅读题材**：日常生活、校园、社会文化为主
4. **翻译方向**：中译英，句子结构简单，重点考查基础语法和常用表达
5. **难度控制**：基础题60% + 应用题30% + 综合题10%

### CET-6 出题规则

1. **词汇范围**：六级大纲词汇，允许少量超纲学术词汇（附注释）
2. **句子长度**：平均20-30词/句，可包含2层从句嵌套
3. **阅读题材**：科技、经济、社会问题为主，增加学术性
4. **翻译方向**：中译英，涉及复合句、被动语态、长句翻译
5. **难度控制**：基础题40% + 应用题40% + 综合题20%

### 考研英语出题规则

1. **词汇范围**：考研大纲词汇，学术词汇不注释（默认应掌握）
2. **句子长度**：30-50词/句的长难句是重点，3层以上嵌套常见
3. **阅读题材**：学术论文、社科评论为主，强调逻辑分析
4. **翻译方向**：英译中为主（英语一），考查长难句的准确理解和中文表达
5. **难度控制**：基础题20% + 应用题40% + 综合题30% + 挑战题10%
6. **特殊要求**：必须训练"作者态度"和"论证结构"类题目

## 学科特有题型

### 1. Cloze 填空题（多空填空）

**题型定义**：在一段完整文本中设置多个空白，要求根据语法和语境填写正确形式。

**与普通fill的区别**：
- 普通fill：单空，考查孤立知识点
- Cloze：多空（2-4空），考查语境中的综合运用

**出题要求**：
- 文本必须语义完整、逻辑连贯
- 每个空考查不同知识点（避免重复考查）
- 括号内给出原形词，要求变形（如给出be → 需填were）
- 不要求变形的空，用 `______` 直接标注

**适用场景**：时态语态综合、虚拟语气、非谓语动词、从句连词选择

### 2. 阅读理解题（passage + questions）

**题型定义**：给定一篇英语文章，基于文章内容出2-4道选择题。

**实现方式**：使用choice题型，question字段中先写Passage，再写具体问题。

**子题型与出题模板**：

| 子题型 | 问法模板 | 干扰项设计 |
|--------|---------|-----------|
| 主旨题 | "What is the main idea/purpose of the passage?" | 片面细节、过度宽泛、与文章相反 |
| 细节题 | "According to the passage, which of the following is true about X?" | 偷换概念、张冠李戴、无中生有 |
| 推断题 | "What can be inferred/implied from the passage?" | 过度推断、直接复述（非推断）、反向推断 |
| 态度题 | "What is the author's attitude toward X?" | 混淆客观与主观、极端化 |
| 词义题 | "The word 'X' in line Y most probably means ___" | 只取常用义、取字面义、取反义 |

### 3. 改错题

**题型定义**：给出含一处（或多处）语法错误的句子，要求识别并修正。

**实现方式**：使用choice题型，选项为不同修改方案。

**常见错误类型频次**：

| 错误类型 | 考频 | 典型例子 |
|---------|------|---------|
| 主谓一致 | ★★★ | The number of students are... |
| 时态错误 | ★★★ | Last year he goes... |
| 词性误用 | ★★★ | She speaks English fluent. |
| 冠词误用 | ★★ | He is a honest man. |
| 介词搭配 | ★★ | depend in → depend on |
| 代词指代 | ★★ | Everyone should do their best（正式语体中应为his/her） |
| 非谓语误用 | ★★ | I enjoy to play → playing |
| 比较级错误 | ★ | more better → better |

### 4. 翻译题

**题型定义**：给出中文/英文句子，要求翻译为另一种语言。

**实现方式**：使用fill题型，answer接受多种可接受译法。

**出题分级**：
- 四级：简单句，1个从句，常用词汇
- 六级：复合句，2个从句，中等词汇
- 考研：长难句，3层嵌套，学术词汇，要求精确翻译

**评分关键点**：
- 语法结构是否正确
- 关键词是否翻译准确
- 语义是否完整传达
- 中文翻译是否通顺（英译中时）

## 干扰项设计指南

### 英语选择题干扰项设计

#### 1. 词汇辨析题干扰项

| 干扰策略 | 示例 | 说明 |
|---------|------|------|
| 形近干扰 | respectable / respectful / respective | 形似但义不同 |
| 近义干扰 | affect / effect / influence | 语义相近但用法/词性不同 |
| 搭配干扰 | make a decision / take a decision / do a decision | 混淆常见搭配 |
| 词性干扰 | economic / economical / economics | 同源不同词性 |

#### 2. 阅读理解题干扰项设计

| 干扰策略 | 示例 | 说明 |
|---------|------|------|
| 偷换概念 | 文章说"most students"，选项用"all students" | 量词/程度词替换 |
| 张冠李戴 | A的优点说成B的优点 | 主体对象替换 |
| 无中生有 | 选项内容看似合理但文中未提及 | 编造看似相关的信息 |
| 过度推断 | 文章暗示X可能有问题 → 选项说X已被证明有害 | 推断程度超出文本 |
| 反向干扰 | 文章说"not necessarily bad" → 选项说"definitely bad" | 与文章立场相反 |
| 以偏概全 | 文章讨论多方面影响，选项只提一方面 | 用细节替代整体 |

#### 3. 语法题干扰项设计

| 干扰策略 | 示例 | 说明 |
|---------|------|------|
| 规则过度推广 | 所有名词复数都加s（忽略了不规则变化） | 把一般规则错误用于例外情况 |
| 近期规则干扰 | 刚学虚拟语气，把所有suggest都当虚拟 | 新学知识过度应用 |
| 视觉相似 | who's / whose; it's / its | 缩写与所有格混淆 |
| 语法陷阱 | between you and I（应为me） | 介词后用宾格，但受主格习惯影响 |

#### 4. 通用原则

- 每道题至少1个干扰项来自真实学生高频错误
- 干扰项不能太明显（如语法完全错误的句子），也不能太隐蔽（与正确答案无法区分）
- 四级干扰项区分度大一些，考研干扰项区分度小一些
- 避免使用"以上都对""以上都不对"（除非明确设计）

## 完整JSON题目示例

### 示例1：CET-4 词汇辨析（难度1）

```json
{
  "type": "choice",
  "difficulty": 1,
  "subject": "英语",
  "topic": "词汇辨析-affect/effect",
  "tags": ["词汇辨析", "affect", "effect", "CET-4"],
  "exam": "CET-4",
  "cognitiveLevel": 2,
  "question": "The new policy will ______ the way companies operate in this industry.",
  "options": [
    "affect",
    "effect",
    "afford",
    "effort"
  ],
  "answer": 0,
  "explanation": "affect是动词，意为'影响'；effect作动词时意为'促成/实现'（effect a change），作名词时意为'效果/影响'。此处需要一个动词表示'影响'，应选affect。",
  "pitfall": "affect vs effect是最常考的形近词对之一。口诀：affect是动词（a开头的action），effect是名词（e开头的end result）。",
  "hints": [
    "空格处需要什么词性？动词还是名词？",
    "affect和effect的词性有什么区别？",
    "a-ffect = action(动词), e-ffect = end result(名词)。此处需要动词'影响'，选affect"
  ],
  "commonErrors": [
    {"answer": 1, "reason": "把effect当动词用——effect作动词意为'促成/实现'，不是'影响'的意思"},
    {"answer": 3, "reason": "形近词干扰——effort意为'努力'，与句意无关"}
  ],
  "id": "eng-vocab-affect-effect-001"
}
```

### 示例2：考研英语 长难句翻译（难度3）

```json
{
  "type": "fill",
  "difficulty": 3,
  "subject": "英语",
  "topic": "翻译-长难句",
  "tags": ["翻译", "长难句", "定语从句", "考研英语"],
  "exam": "考研英语",
  "cognitiveLevel": 4,
  "question": "将以下英文句子翻译为中文：\n\nThe assumption that technology alone can solve the environmental crisis, which has been embraced by many policymakers, overlooks the fundamental role that individual behavioral change must play in achieving sustainable development.",
  "answer": [
    "许多政策制定者所信奉的'仅靠技术就能解决环境危机'这一假设，忽视了个人行为改变在实现可持续发展中必须发挥的根本作用。",
    "那种认为仅凭技术就能解决环境危机的假设已被许多政策制定者所接受，但它忽视了个人行为改变在实现可持续发展中必须扮演的根本角色。",
    "许多决策者抱有这样一种假设：仅靠技术就能解决环境危机，但这忽视了个人行为改变在实现可持续发展中必须发挥的根本作用。"
  ],
  "explanation": "这是一个三层嵌套的复杂句：(1) 主干The assumption overlooks the fundamental role；(2) that从句作assumption的同位语；(3) which引导非限制性定语从句修饰assumption；(4) that引导定语从句修饰role。翻译策略：先拆分各层从句，理清修饰关系，再按中文语序重组。同位语从句可前置为修饰语，非限制性定语从句可单独成句。",
  "pitfall": "考研翻译最忌逐词翻译。此句的难点在于：1) 同位语从句的中文处理（可前置也可独立成句）；2) which从句的衔接；3) must play的准确翻译（必须发挥/扮演）。",
  "hints": [
    "先找出句子的主干：The assumption overlooks the role",
    "that从句修饰什么？which从句修饰什么？第二个that从句修饰什么？",
    "同位语从句→前置修饰'假设'，which从句→单独翻译或前置，定语从句→'在……中必须发挥的作用'"
  ],
  "commonErrors": [
    {"answer": "假设技术能解决环境危机被政策制定者拥抱，忽视了个人行为改变必须发挥的根本作用。", "reason": "1)'拥抱'是embrace的直译，应为'信奉/接受'；2)同位语从句处理生硬；3)语序不符合中文表达习惯"},
    {"answer": "单独靠技术能解决环境危机的假设被许多政策制定者所接受，忽视了个人行为改变在实现可持续发展中必须发挥的根本作用。", "reason": "主语'假设'被which从句割裂后丢失，导致'忽视了'缺少主语，逻辑关系断裂"}
  ],
  "id": "eng-translation-complex-001"
}
```
