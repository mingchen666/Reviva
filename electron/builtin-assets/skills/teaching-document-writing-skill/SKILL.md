---
name: teaching-document-writing-skill
description: Write and polish formal teaching documents for teachers, school offices,教研 and training contexts. Use this skill whenever the user asks for 说课稿, 教学反思, 教研总结, 听课记录, 评课稿, 教学案例, 培训方案, 家校沟通, 通知, 工作计划, 工作总结, 述职材料, 教研论文初稿, or wants a DOCX/PPTX-ready education document based on uploaded materials.
allowed-tools: file_read, file_write, document_read
---

# Teaching Document Writing Skill

Write practical, formal, and evidence-based teaching documents. The document should fit the user’s school context, audience, and purpose. Do not fabricate policies, school facts, awards, data, or curriculum requirements.

## Load References When Needed

- Read `references/document-types.md` when selecting a structure for a specific document type.
- Read `references/style-and-evidence.md` when the user asks for polish, official tone, evidence-based reflection, or public-facing text.

## Use When

Use this skill for:

- 说课稿、教学反思、教学案例、教研总结、听课记录、评课稿;
- 教师工作计划、工作总结、述职材料、培训方案、培训讲义;
- 家校沟通、班级通知、活动方案、会议纪要;
- 教研论文/经验文章初稿 and school-based research reports;
- converting rough notes, lesson plans, PPT, meeting notes, or school templates into formal DOCX-ready writing.

For lesson planning itself, coordinate with `lesson-plan-skill`. For assessment forms, coordinate with `teaching-assessment-skill`. For slides or training PPT, coordinate with `pptx-deck-skill` and `officecli-skills`.

## Input Handling

Gather only missing information:

- document type and audience;
- school/grade/subject/class context;
- required length and format;
- source materials or rough notes;
- tone: formal, warm, concise, public lesson, report style, parent-facing;
- whether the output should be Markdown, DOCX, or PPTX outline.

If files are provided, read them first. Office/PDF files must be read with `document_read`. If the user asks for current policy, curriculum standard, public facts, or school-specific wording, the parent agent should use web search or ask the user for the official source.

## Writing Workflow

1. Clarify purpose and audience.
   - Who will read it: students, parents, school leaders,教研组, judges, trainees?
2. Extract evidence.
   - Use lesson facts, student evidence, activity records, data, materials, and user notes.
3. Select structure.
   - Use the document type reference and adapt to the user’s template.
4. Draft with appropriate tone.
   - Keep formal documents clear, specific, and non-empty.
   - Keep parent-facing text warm, concise, and actionable.
5. Polish and verify.
   - Remove vague slogans.
   - Mark unsupported claims.
   - Keep names, dates, awards, school policies, and numbers only when provided.
6. Prepare file-ready output.
   - Use headings and tables that convert cleanly to DOCX.

## Quality Rules

- Prefer concrete classroom evidence over broad statements.
- Do not invent student data, awards, policy language, school requirements, or personal achievements.
- Avoid empty phrases such as "取得了良好效果" unless followed by evidence.
- Keep teacher voice professional and humane.
- For reflection, include problem, cause, evidence, adjustment, and next action.
- For public-facing text, avoid sensitive student privacy details.
- For official documents, keep structure stable and language concise.

## Output Modes

- Quick draft in chat.
- Markdown document through `file_write`.
- DOCX-ready formal document through `officecli-skills`.
- PPTX outline for training/reporting through `pptx-deck-skill`.
