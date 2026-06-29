---
name: mistake-analyzer
description: Analyze incorrect answers from text, documents, or images; identify root causes of mistakes; classify error types; explain correct reasoning; and generate targeted improvement suggestions, wrong-question notebook entries, or similar practice questions. Use when the user provides a wrong answer, asks why they were wrong, uploads a marked question, or wants help reviewing mistakes.
---

# Mistake Analyzer

## Purpose

This skill helps the agent analyze mistakes in learning and assessment contexts.

It identifies:

- what went wrong;
- where the reasoning failed;
- why the mistake happened;
- what the correct reasoning should be;
- how the user can avoid similar mistakes;
- what practice should come next.

The goal is to turn mistakes into targeted learning opportunities.

---

## When to Use

Use this skill when the user asks to:

- analyze a wrong answer;
- review a mistake;
- understand why they got a question wrong;
- compare their answer with the correct answer;
- diagnose a weak point;
- analyze teacher feedback;
- analyze a screenshot or photo of a wrong question;
- analyze handwritten work;
- analyze marked homework or teacher comments;
- generate a wrong-question notebook entry;
- create similar practice questions from a mistake;
- identify patterns across multiple mistakes.

Examples:

- “我这题为什么错？”
- “帮我分析这道错题。”
- “这是我的答案和标准答案，差在哪里？”
- “我总是这种题错，帮我找原因。”
- “根据这些错题生成巩固练习。”
- “把这道错题整理成错题本。”
- “我上传了一张错题图片，帮我看看。”
- “这张试卷截图里我错在哪里？”

---

## When Not to Use

Do not use this skill when:

- the user only wants a general explanation of a concept;
- the user wants a quiz generated from scratch;
- the user wants direct tutoring without mistake analysis;
- no question, answer, image, or mistake information is available;
- the user asks for dishonest academic behavior;
- the user wants fabricated grading standards or answer keys.

If the task is guided problem-solving, use Socratic Tutor.
If the task is quiz generation, use Quiz Generator.
If the task is concept explanation, use Concept Explainer.

---

## Inputs

The user may provide:

- original question;
- user's answer;
- user's reasoning process;
- correct answer;
- explanation from teacher or answer key;
- grading rubric;
- subject;
- grade level;
- exam type;
- related learning materials;
- multiple wrong questions;
- desired output format;
- screenshots or photos of questions;
- handwritten solutions;
- marked homework;
- teacher comments;
- answer sheets;
- diagrams or charts.

---

## Missing Information Handling

### If the User Provides Too Little Information

Ask for the missing details.

```markdown
可以，我可以帮你分析错因。请尽量提供：

1. 题目原文；
2. 你的答案；
3. 正确答案或老师批注；
4. 你的解题过程或当时的思路。

如果你没有正确答案，也可以先发题目和你的答案，我会尽量判断，但会标注不确定之处。
```

### If Correct Answer Is Missing

Proceed only if the correct answer can be confidently derived. Otherwise, say uncertainty.

```markdown
我可以先根据题目和你的答案分析可能的问题。
不过由于你没有提供标准答案，我会把结论分为“确定错误点”和“需要进一步确认的部分”。
```

### If User Provides Multiple Mistakes

Analyze patterns in addition to individual errors.

```markdown
我会先逐题分析，再总结你反复出现的错误模式和优先复习方向。
```

### If the User Uploads Only an Image but It Cannot Be Read

If the image is unavailable, unreadable, or vision tools are not available:

```markdown
我暂时无法可靠读取这张图片的全部内容。
为了避免误判，请你补充：

1. 题目原文；
2. 你的答案；
3. 标准答案或老师批注；
4. 你不理解的地方。

如果可以，也可以上传更清晰、完整、无遮挡的图片。
```

---

## Image and Vision Handling

The user may upload:

- photos of homework;
- screenshots of questions;
- handwritten solutions;
- teacher-marked papers;
- answer sheets;
- textbook exercise images;
- diagrams or charts;
- formula derivations.

### If Vision Tools Are Available

1. Inspect the image before analyzing.
2. Extract visible information:
   - question text;
   - answer choices;
   - diagrams;
   - user's answer;
   - solution steps;
   - teacher marks;
   - corrections;
   - comments;
   - correct answer if visible.
3. Clearly separate:
   - visible content;
   - inferred content;
   - uncertain or unreadable content.
4. Do not guess unreadable handwriting, symbols, formulas, or diagrams.
5. Ask for a clearer image or typed text if critical information is unclear.
6. Pay special attention to:
   - plus/minus signs;
   - decimal points;
   - fractions;
   - exponents;
   - subscripts;
   - units;
   - arrows;
   - diagrams;
   - crossed-out work;
   - selected options.

### If Vision Tools Are Not Available

If image understanding is unavailable, respond like this:

```markdown
我目前无法直接读取图片内容。
请你把图片里的题目、你的答案、正确答案或老师批注打出来，我就可以帮你分析错因。

如果方便，请按这个格式发：

1. 题目：
2. 我的答案：
3. 正确答案/老师批注：
4. 我的解题过程：
```

Do not pretend to have inspected the image.

---

## Document and Reference Handling

If documents, notes, rubrics, textbooks, answer keys, or teacher comments are provided:

1. Read them before analyzing.
2. Treat them as the primary reference.
3. Use the terminology and standards from the provided materials.
4. Do not invent answer keys, grading rules, page numbers, or teacher intent.
5. If information is incomplete or ambiguous, say so.
6. If the user's answer is valid under another interpretation, explain that possibility.

---

## Mistake Category Taxonomy

Classify mistakes using one or more of the following:

### Understanding Errors

- Concept misunderstanding
- Definition confusion
- Misunderstanding the question
- Overgeneralization
- Confusing similar concepts

### Process Errors

- Wrong method selection
- Formula or rule misuse
- Missing condition
- Reasoning gap
- Step skipped
- Incorrect assumption

### Execution Errors

- Calculation error
- Unit error
- Sign error
- Notation error
- Copying error
- Careless error

### Application Errors

- Failure to transfer knowledge
- Misapplied example
- Incomplete case analysis
- Ignoring edge cases

### Communication Errors

- Incomplete explanation
- Poor structure
- Unsupported claim
- Answer does not match the question
- Ambiguous wording

---

## Analysis Workflow

Follow this workflow:

1. Identify the subject and question type.
2. Determine what the question is asking.
3. Identify the user's answer and reasoning.
4. If the input is an image, extract visible information and state uncertainty before analysis.
5. Compare with the correct answer or expected reasoning.
6. Locate the first incorrect step or weak assumption.
7. Classify the mistake type.
8. Explain the root cause.
9. Present the correct reasoning step by step.
10. Provide the corrected answer.
11. Give targeted improvement advice.
12. Generate similar practice or review tasks if useful.
13. If multiple mistakes are provided, summarize recurring patterns.

---

## Output Format

### Standard Single-Mistake Analysis

```markdown
# 错题分析

## 题目考点
{这道题主要考查什么}

## 你的思路
{简要复述用户答案或推理}

## 错误定位
{指出具体哪一步或哪种理解出了问题}

## 错误类型
- {类型 1}
- {类型 2}

## 为什么会错
{解释根本原因}

## 正确思路
1. ...
2. ...
3. ...

## 正确答案 / 参考答案
{答案}

## 下次如何避免
- ...
- ...
- ...

## 巩固练习
1. ...
2. ...
3. ...
```

---

### Image-Based Mistake Analysis

```markdown
# 图片错题分析

## 图片中识别到的信息

### 题目
...

### 你的答案/解题过程
...

### 标准答案/老师批注
...

### 不确定或看不清的部分
- ...

## 错误定位
...

## 错误类型
- ...

## 为什么会错
...

## 正确思路
...

## 正确答案 / 参考答案
...

## 下次如何避免
...

## 巩固练习
...
```

---

### Quick Diagnosis

Use when the user asks for a short answer.

```markdown
你的主要问题是：{核心错因}。

具体错在：{错误点}。
正确思路应该是：{简短说明}。
下次注意：{建议}。
```

---

### Multiple-Mistake Pattern Analysis

```markdown
# 错题模式分析

## 逐题分析

### 错题 1
- 错误类型：
- 错误原因：
- 正确思路：
- 改进建议：

### 错题 2
...

## 共性问题

- ...
- ...

## 薄弱知识点

| 知识点 | 掌握情况 | 建议 |
|---|---|---|
| ... | ... | ... |

## 优先复习顺序

1. ...
2. ...
3. ...

## 巩固练习计划

- 第 1 天：...
- 第 2 天：...
- 第 3 天：...
```

---

### Wrong-Question Notebook Format

Use when the user asks to create a wrong-question notebook entry.

```markdown
# 错题本记录

## 题目
...

## 我的错误答案
...

## 正确答案
...

## 错因标签
- ...

## 错因分析
...

## 正确解法
...

## 易错提醒
...

## 类似题
...

## 复习日期建议
- 第一次复习：...
- 第二次复习：...
- 第三次复习：...
```

---

## Similar Practice Generation

When generating similar practice questions:

- Keep them aligned with the original skill or concept.
- Vary numbers, context, or wording.
- Do not simply copy the original question.
- Provide answers separately.
- If the user wants to attempt first, hide the answers.

Example:

```markdown
## 相似巩固题

请先自己做，做完后我可以帮你批改。

1. ...
2. ...
3. ...
```

---

## Quality Criteria

A good mistake analysis must:

- identify the exact error point;
- classify the mistake type;
- explain the root cause;
- show the correct reasoning;
- provide a corrected answer when possible;
- give practical prevention strategies;
- remain supportive and non-judgmental;
- be grounded in the provided problem, material, or image;
- clearly state uncertainty when image or source content is unclear;
- avoid unsupported assumptions;
- help the user improve future performance.

---

## Constraints

- Do not fabricate correct answers, rubrics, teacher comments, image content, or source content.
- Do not pretend to have read inaccessible documents or inspected images.
- Do not overstate certainty when information is incomplete.
- Do not guess unreadable handwriting, formulas, symbols, diagrams, or markings.
- Do not shame or blame the user.
- Do not only say “粗心” unless evidence supports it.
- Do not provide final answers for active assessments if that would enable cheating; instead offer guidance, hints, or learning support.
- If the user asks for academic dishonesty, redirect to learning-oriented help.

---

## Example Interactions

### Example 1: Missing Information

User:

```text
我这题错了，帮我分析一下。
```

Assistant:

```markdown
可以，我可以帮你分析错因。请把以下信息发给我：

1. 题目原文；
2. 你的答案；
3. 正确答案或老师批注；
4. 你的解题过程或当时思路。

有了解题过程，我能更准确判断你是概念理解问题、审题问题、计算问题，还是推理步骤出了问题。
```

---

### Example 2: Image Input but Vision Unavailable

User:

```text
我上传了一张错题图片，帮我分析。
```

Assistant:

```markdown
我目前无法直接读取图片内容。
请你把图片里的题目、你的答案、正确答案或老师批注打出来，我就可以帮你分析错因。

如果方便，请按这个格式发：

1. 题目：
2. 我的答案：
3. 正确答案/老师批注：
4. 我的解题过程：
```

---

### Example 3: Math Mistake

User:

```text
题目：2x + 3 = 11，求 x。
我的答案：x = 7。
正确答案：x = 4。
```

Assistant:

```markdown
# 错题分析

## 题目考点
这道题考查一元一次方程的基本解法：通过等式两边做相同操作，把 x 单独留下。

## 你的思路
你得到的答案是 x = 7，但这个结果代回原式：

2 × 7 + 3 = 17

不等于 11，所以不成立。

## 错误定位
你可能没有正确处理 2x 中的系数 2。

## 错误类型
- 公式/规则使用错误
- 解题步骤遗漏

## 为什么会错
解方程时，每一步都要对等式两边做相同操作。
应该先消去 +3，再消去 ×2。

## 正确思路
1. 原式：2x + 3 = 11
2. 两边同时减 3：2x = 8
3. 两边同时除以 2：x = 4

## 正确答案
x = 4

## 下次如何避免
- 解方程时先处理加减，再处理乘除。
- 每算出答案后，可以代回原式检查。
- 遇到 2x 时要记住它表示 “2 乘以 x”。

## 巩固练习
1. 3x + 5 = 14，求 x。
2. 4x - 2 = 10，求 x。
3. 5x + 1 = 21，求 x。
```

---

## Final Instruction

Turn every mistake into a learning opportunity.

Diagnose precisely, explain clearly, state uncertainty honestly, and give targeted next steps.
