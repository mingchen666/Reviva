---
name: quiz-generator
description: Generate educational quizzes from topics, learning goals, or provided documents. Supports multiple question types, difficulty levels, answer keys, explanations, and study-focused assessment. Use when the user wants practice questions, review quizzes, mock tests, self-checks, or exam prep.
---

# Quiz Generator

## Purpose

This skill helps the agent create accurate, useful, and pedagogically appropriate quizzes for learning and assessment.

It can generate questions from:
- a topic,
- a learning goal,
- a chapter or section,
- notes or lecture slides,
- textbooks,
- articles,
- pasted reference text,
- or uploaded documents.

The goal is not just to test recall, but to support learning, review, diagnosis, and reinforcement.

## When to Use

Use this skill when the user asks to:

- generate quiz questions,
- create practice tests,
- make review exercises,
- build mock exams,
- produce self-check questions,
- test understanding of a topic,
- create questions from a document or chapter,
- prepare for an exam,
- turn notes into questions,
- create answer keys and explanations.

## When Not to Use

Do not use this skill when:

- the user only wants an explanation rather than a quiz,
- the user wants a summary instead of questions,
- the task is not educational,
- the input is too vague and the user has not given any topic or material,
- the user wants harmful, misleading, or fabricated questions.

If the topic is missing or too broad, ask a concise clarification question before generating the quiz.

## Inputs

The user may provide:

- topic,
- learning objective,
- source document,
- chapter or section,
- difficulty level,
- grade or audience,
- question count,
- question types,
- whether answers should be shown immediately,
- whether explanations are required,
- whether the quiz should be mixed-format,
- whether the quiz should be for practice or assessment.

## Missing Information Handling

If the user provides no topic, no document, and no learning goal, ask them to specify what the quiz should cover.

Example:

```markdown
当然可以。请告诉我你想测验的内容，比如：

- 一个知识点
- 一章教材
- 一份讲义
- 一段文档
- 一个考试范围

如果你愿意，也可以一起告诉我：
1. 题目数量；
2. 难度；
3. 题型；
4. 是否需要答案和解析。
```

If the topic is too broad, ask for a narrower scope.

Example:

```markdown
可以，但“生物学”范围太大了。
你想测验哪个部分？

- 细胞
- 遗传
- 生态
- 人体
- 其他具体章节
```

## Document and Reference Handling

If the user provides documents, notes, slides, or pasted text:

1. Read them before generating questions.
2. Treat them as the primary source for quiz content.
3. Prefer the terminology and scope used in the source.
4. Do not invent facts, formulas, definitions, or examples not supported by the material.
5. If the material is incomplete or ambiguous, say so clearly.
6. If the user requests a quiz from a specific section, stay within that section.

## Workflow

1. Identify the quiz topic, source, and learning goal.
2. Determine the intended difficulty and audience.
3. Check whether the user wants:
   - answers shown immediately,
   - answers hidden until after attempt,
   - explanations,
   - scoring guidance,
   - mixed or single question type.
4. If critical information is missing, ask a concise clarification question.
5. Generate the quiz.
6. Verify that questions match the material and difficulty.
7. Provide answers and explanations if requested.
8. If the user wants to attempt the quiz first, show questions only and hide the answer key until asked.

## Supported Question Types

You may generate:

- multiple choice,
- true/false,
- fill in the blank,
- short answer,
- matching,
- scenario-based,
- open-ended reflection,
- mixed-format quizzes.

## Question Design Principles

A good quiz should:

- match the requested topic and scope,
- align with the user's level,
- test understanding, not just memorization unless requested,
- use clear and unambiguous wording,
- avoid trick questions unless explicitly requested,
- include plausible distractors for multiple choice,
- stay faithful to the source material,
- support learning and review,
- be neither too easy nor unnecessarily difficult.

## Output Format

Unless the user requests otherwise, use this structure:

```markdown
# Quiz: {Topic}

## Instructions
{How to take the quiz}

## Questions
1. ...
2. ...
3. ...

## Answer Key
1. ...
2. ...
3. ...

## Explanations
1. ...
2. ...
3. ...
```

If the user wants to answer first, output:

```markdown
# Quiz: {Topic}

## Instructions
Please answer the questions first. I will provide the answer key after you finish.

## Questions
1. ...
2. ...
3. ...
```

## Quality Criteria

The quiz must:

- be factually correct,
- fit the requested difficulty,
- match the source material or topic,
- use clear instructions,
- include correct answers when requested,
- include explanations when requested,
- avoid unsupported claims,
- avoid confusing or misleading wording,
- serve a learning purpose.

## Constraints

- Do not fabricate facts, formulas, definitions, references, or sources.
- Do not include content outside the provided scope when the user asked for a bounded quiz.
- Do not pretend to have read documents you have not actually accessed.
- Do not overuse trick questions.
- Do not make the quiz harder than requested without reason.
- Do not present uncertain answers as certain.
- If web search is needed for recent facts or standards and tools are available, use them before generating factual questions.
- If search is unavailable, say so clearly rather than guessing.

## Style Guidelines

Default style:
- clear,
- structured,
- educational,
- accurate,
- practical,
- friendly.

Prefer:
- concise instructions,
- well-labeled sections,
- answer keys that are easy to review,
- explanations that reinforce learning.

Your goal is to help the user learn, practice, and assess understanding effectively.

