---
name: lesson-plan-skill
description: Create teacher-ready lesson plans and instructional designs for real classroom preparation. Use this skill whenever a teacher asks for 教案, 备课, 教学设计, 教学目标, 重难点, 课堂流程, 单元教学设计, 公开课, 说课稿, 板书设计, 作业设计, 教学反思, or wants to turn教材、课件、讲义、课程标准、考试要求、知识点 into a structured teachable lesson for different grade bands.
allowed-tools: file_read, file_write, document_read
---

# Lesson Plan Skill

Create practical lesson plans that a teacher can use in class. The plan should not only look complete on paper; it should contain realistic timing, student actions, checks for understanding, and materials that can be handed to students or turned into PPT/DOCX.

## Load References When Needed

- Read `references/lesson-design-frameworks.md` when the task needs deeper instructional design,公开课/赛课, unit design, competency goals, or unclear objectives.
- Read `references/grade-bands.md` when grade, age, student ability, or differentiation matters.
- Read `references/document-templates.md` when the user asks for 教案、说课稿、单元设计、学案、教学反思 or Word/PPT package output.

## Use When

Use this skill for:

- 教案、备课、教学设计、单元教学设计;
- lesson objectives, key/difficult points, teaching flow, board design, homework, reflection;
- adapting one lesson for a different grade, learner level, time length, or class type;
- converting教材、课件、讲义、课程标准、考试要求、笔记 into a teachable lesson;
- preparing public lessons, demo lessons, competition lessons, school-based training, or light office teaching documents.

If the user wants slides, first create the lesson structure, then route to `pptx-deck-skill`, `html-ppt-skill`, `ai-animation-skill`, or `officecli-skills`. If the user wants student materials or exercises, coordinate with `worksheet-skill`. If the user wants evaluation evidence, coordinate with `teaching-assessment-skill`.

## Input Handling

Gather only missing information:

- subject, grade band, lesson topic, class duration, and number of periods;
- textbook version, unit/chapter, curriculum standard, exam scope, or school template if relevant;
- student profile: baseline, class size, common difficulties, special needs, technology constraints;
- desired outputs: chat outline, Markdown, DOCX教案, PPTX课件, 学案, 练习, 评价表, 完整备课包;
- provided materials:教材截图、课件、讲义、题库、教研要求、学校模板.

If documents are provided, read them before designing. Office/PDF files must be read via `document_read`. Treat user materials as the primary source. Do not invent textbook pages, standards, policy wording, school requirements, or exam claims.

## Design Workflow

1. Clarify the teaching target.
   - Identify grade, subject, topic, period length, and class type.
   - If the prompt is vague, ask at most 3 necessary questions. If the user wants speed, proceed with explicit assumptions.
2. Extract source material.
   - Summarize key knowledge, prerequisite knowledge, examples, exercises, and any existing teacher intent.
   - Mark gaps as "基于通用教学经验补充".
3. Design backward from evidence.
   - Desired results: what students should know, do, explain, create, or transfer.
   - Acceptable evidence: question, task, performance, discussion, worksheet, exit ticket, rubric.
   - Learning experiences: sequence activities so evidence can appear during class.
4. Adapt to grade band and subject.
   - Use concrete, visual, and short-step tasks for younger students.
   - Use inquiry, reasoning, error analysis, transfer, or project context for older students.
   - Adjust language, cognitive load, reading amount, and independence level.
5. Produce the lesson plan and related outputs.
   - Keep objectives measurable.
   - Tie every activity to objectives and checks.
   - Include teacher prompts, student actions, timing, materials, and expected responses.
6. If file output is requested, hand off to the parent agent for `officecli-skills` or `file_write`.

## Default Lesson Plan Structure

Use this structure unless the user or school template says otherwise:

1. 基本信息
   - 学科、年级、课题、课时、课型、教材/单元来源。
2. 教材与内容分析
   - 本课内容地位、知识联系、核心概念、可能误区。
3. 学情分析
   - 已有基础、认知特点、学习困难、差异化支持。
4. 教学目标
   - Use observable verbs.
   - For Chinese K12 tasks, include core competency language when appropriate.
   - For training/higher education, use outcome-based wording.
5. 教学重点与难点
   - State the reason and breakthrough strategy for each point.
6. 教学准备
   - Materials, tools, experiments, handouts, courseware, visualizations, group setup.
7. 教学过程
   - 导入/情境创设。
   - 新知探究/讲解/示范。
   - 例题、案例、实验 or activity.
   - 课堂练习 and formative checks.
   - 总结提升 and transfer.
   - 作业布置.
   - Include timing estimates, teacher actions, student actions, expected responses, and contingencies.
8. 板书设计
   - Provide a concise board layout or slide structure.
9. 课堂评价
   - Include quick checks, evidence criteria, exit ticket, or rubric pointers.
10. 教学反思
   - Include pre-class risk notes and post-class reflection prompts.

## Quality Rules

- Make the plan teachable, not only formally complete.
- Avoid generic objectives like "培养兴趣" unless tied to observable classroom behavior.
- Avoid activities that are fun but not connected to learning evidence.
- Keep timing realistic for the stated class duration.
- Include common misconceptions and teacher follow-up questions for difficult content.
- When internet/current standards are needed, ask the parent agent to use web search and cite the basis; do not fabricate standard names or policy details.
- For safety-sensitive experiments, PE, chemistry, electricity, maker activities, or outdoor tasks, include safety and supervision notes.
- For copyrighted教材 or exam content, summarize and transform; do not reproduce large copyrighted passages unless the user provided them and asks for internal use.

## Output Modes

- 快速备课: concise lesson flow, objectives, key points, activities, homework.
- 标准教案: full structure with analysis, process, assessment, board design, reflection.
- 完整备课包: lesson plan + worksheet + exercises + PPT outline/PPTX + assessment table.
- 公开课/赛课: stronger learning problem, visible student activity, evidence chain, polished teacher language, risk plan.
- 培训/轻办公: agenda, facilitator guide, participant handout, slides, evaluation form.

When generating files:

- Markdown: use `file_write`.
- DOCX教案/说课稿/学案: route through `officecli-skills`.
- PPTX课件: route through `pptx-deck-skill` and `officecli-skills`.
- HTML animation or interactive visual: route through visualization skills.
