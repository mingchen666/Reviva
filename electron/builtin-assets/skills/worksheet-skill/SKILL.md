---
name: worksheet-skill
description: Create teacher-ready worksheets, guided learning sheets, preview sheets, class exercises, homework, layered assignments, remediation sheets, answer keys, and teacher notes. Use this skill whenever the user asks for 学案, 导学案, 任务单, 练习单, 课堂练习, 作业设计, 分层作业, 课后练习, 错题再练, 答案解析, 教师版, 学生版, or wants printable practice materials aligned to a lesson, grade, or uploaded document.
allowed-tools: file_read, file_write, document_read
---

# Worksheet Skill

Create student-facing and teacher-facing learning materials that support one lesson, one topic, or one review goal. A good worksheet should make students think, practice, and reveal learning evidence; it should not be a random list of questions.

## Load References When Needed

- Read `references/worksheet-patterns.md` for output structures and common worksheet types.
- Read `references/differentiation.md` when the user asks for different levels, mixed ability, remediation, enrichment, or special support.

## Use When

Use this skill for:

- 学案、导学案、任务单、实验记录单、阅读任务单;
- classroom exercises, homework, layered assignments, remediation, exam review;
- answer keys, explanations, grading points, teacher notes;
- converting lesson objectives, textbook content, PPT, notes, or wrong-question lists into practice materials.

For a standalone quiz or larger question bank, coordinate with `practice-quiz`. For formal lesson plans, use `lesson-plan-skill`. For DOCX output, route through `officecli-skills`.

## Input Handling

Gather only missing information:

- subject, grade, topic, lesson objective, and class stage;
- desired type: 学案、导学案、练习单、作业、分层作业、错题再练、实验记录、阅读任务;
- quantity, difficulty, expected completion time, and whether answers are needed;
- student level and common mistakes;
- output format: chat, Markdown, student DOCX, teacher DOCX, printable one-page.

If the user provides source materials, read them first. Use the source vocabulary, examples, and constraints where appropriate. Do not fabricate textbook page numbers, official standards, or exact exam claims.

## Design Workflow

1. Define the worksheet purpose.
   - Preview, guided learning, practice, homework, review, diagnosis, remediation, or extension.
2. Map each section to learning objectives.
   - Every task should have a reason and expected evidence.
3. Build a progression.
   - Start with accessible recall or observation.
   - Move to understanding/application.
   - End with transfer, explanation, creation, or reflection when suitable.
4. Add scaffolds.
   - Use hints, examples, vocabulary banks, diagrams, formula reminders, sentence starters, or partially completed steps.
5. Create teacher support.
   - Include answers, explanations, grading points, expected misconceptions, and time suggestions when requested.
6. Prepare file-ready structure.
   - Use clear headings and tables that convert cleanly to DOCX.

## Default Structures

### Student Worksheet

1. 标题与基本信息
2. 学习目标
3. 课前回顾/预习
4. 核心任务
5. 课堂探究或例题跟练
6. 分层练习
   - A 基础巩固
   - B 能力提升
   - C 拓展挑战
7. 自我检查
8. 今日困惑/学习反思

### Teacher Edition

Add:

- answers and explanations;
- difficulty tags;
- target objective for each task;
- common mistakes and correction prompts;
- suggested timing;
- grading or feedback notes.

## Quality Rules

- Align questions to objectives, not only chapter titles.
- Mix recall, understanding, application, analysis, and transfer according to grade level.
- Keep one worksheet focused; do not overload a handout with too many unrelated goals.
- Write short, visible instructions for primary school.
- Include enough blank space or table fields for student work when creating printable output.
- For math/science, include steps, units, diagrams, variables, or data tables when needed.
- For language/humanities, require evidence from text/source, not only opinions.
- For exam preparation, include grading points, common traps, and partial-credit rules.
- If the user asks for no answers, do not include answer keys in the student version.

## Output Modes

- 学生版: clean worksheet without teacher-only notes.
- 教师版: includes answers, explanations, misconceptions, timing, and grading points.
- 分层版: basic/standard/challenge or remediation/core/extension.
- 可打印 DOCX: route through `officecli-skills`.
- Markdown draft: use `file_write` when requested.
