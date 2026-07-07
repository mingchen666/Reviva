---
name: teaching-assessment-skill
description: Design classroom assessment, formative checks, rubrics, exit tickets, homework grading standards, diagnostic feedback, classroom observation forms, student self/peer assessment, and teaching reflection. Use this skill whenever the user asks for 评价量规, 课堂评价, 作业批改标准, 学习诊断, 形成性评价, 总结性评价, 出门条, 课堂观察表, 评分表, 教学反思, or how to assess whether students learned.
allowed-tools: file_read, file_write, document_read
---

# Teaching Assessment Skill

Design assessment and feedback materials that help teachers know whether students achieved the learning goals. Assessment should be usable in real classroom time and aligned to objectives, activities, and student products.

## Load References When Needed

- Read `references/assessment-patterns.md` for formative assessment, exit tickets, diagnostic checks, homework grading, and reflection.
- Read `references/rubrics.md` when the user asks for rubric, scoring table, performance task, public lesson observation, project work, writing, presentation, experiment, or group work.

## Use When

Use this skill for:

- formative assessment and checks for understanding;
- exit tickets, classroom observation forms, learning diagnosis;
- rubrics and scoring guides;
- homework grading standards and feedback language;
- student self-assessment and peer assessment;
- teaching reflection based on learning evidence.

For full lesson design, coordinate with `lesson-plan-skill`. For printable student tasks, coordinate with `worksheet-skill`. For XLSX/DOCX forms, route through `officecli-skills`.

## Assessment Workflow

1. Identify objectives.
   - Extract learning goals from the lesson, user prompt, or provided materials.
2. Define evidence.
   - What student response, product, behavior, solution, explanation, or performance will show learning?
3. Select assessment form.
   - Quick check, exit ticket, rubric, grading guide, observation table, diagnostic task, reflection form.
4. Write criteria.
   - Criteria must be observable and aligned to objectives.
5. Add feedback use.
   - Include how teacher interprets results and what to do next.
6. Prepare a file-ready table when needed.

## Common Outputs

### Exit Ticket

Include:

- one core concept or recall question;
- one application/explanation question;
- one self-rating or "still confused about" prompt;
- teacher interpretation notes.

### Formative Check

Include:

- timing in lesson;
- prompt/task;
- expected evidence;
- common wrong answer;
- teacher response.

### Rubric

Use 3-5 criteria and 3-4 performance levels. See `references/rubrics.md` for detailed patterns.

### Homework Grading Standard

Include:

- point distribution;
- required steps;
- partial-credit rules;
- common mistakes;
- feedback sentence bank;
- remediation suggestions.

### Classroom Observation Form

Include:

- student engagement evidence;
- learning evidence;
- collaboration/communication evidence;
- teacher moves;
- notes and next actions.

### Teaching Reflection

Base reflection on evidence:

- objective achievement;
- evidence from student performance;
- what worked;
- what did not;
- cause analysis;
- next lesson remediation or extension.

## Quality Rules

- Assess the stated objectives, not unrelated performance.
- Prefer observable evidence over vague impressions.
- Keep rubrics short enough to use in class.
- Include teacher action after assessment; assessment without follow-up is incomplete.
- For younger students, use visual/self-rating options and short prompts.
- For older students, include reasoning quality, evidence use, transfer, and metacognition.
- For group work, distinguish individual accountability and group product.
- For writing, presentation, experiment, project, or performance tasks, include task-specific criteria.

## Output Modes

- Chat table: quick classroom use.
- Markdown form: use `file_write` when requested.
- DOCX: observation sheet, rubric, reflection form via `officecli-skills`.
- XLSX: scoring table, rubric, record sheet via `officecli-skills`.
