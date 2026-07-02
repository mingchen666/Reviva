---
name: classroom-activity-skill
description: Design purposeful classroom activities, inquiry tasks, discussion prompts, questioning chains, group work, experiments, demos, warm-ups, exit tickets, peer instruction, and interactive learning checkpoints. Use this skill whenever the user asks for 课堂活动, 互动环节, 小组讨论, 探究任务, 提问链, 导入活动, 实验活动, 课堂游戏, 公开课活动, 出门条, or ways to make a lesson more engaging while staying aligned to teaching goals.
allowed-tools: file_read, file_write
---

# Classroom Activity Skill

Design activities that make student thinking visible and help the teacher collect evidence during class. Do not create entertaining activities that are disconnected from the lesson objective.

## Load References When Needed

- Read `references/activity-library.md` to choose activity patterns by lesson stage and subject.
- Read `references/questioning.md` when the user asks for 提问链, discussion, Socratic questioning, misconception handling, or public lesson polish.

## Use When

Use this skill for:

- lesson introductions, hooks, warm-ups;
- inquiry tasks, experiments, demonstrations, simulations;
- group discussion, peer instruction, debate, gallery walk;
- questioning chains and teacher prompts;
- class games used for learning;
- checks for understanding and exit tickets;
- improving an existing lesson to be more interactive.

For a full lesson plan, coordinate with `lesson-plan-skill`. For printable activity sheets, coordinate with `worksheet-skill`. For rubrics or observation forms, coordinate with `teaching-assessment-skill`.

## Activity Design Workflow

1. Identify the learning point.
   - What should students notice, explain, practice, or produce?
2. Choose the activity type.
   - Match the activity to lesson stage, subject, grade, time, materials, and class size.
3. Script the teacher and student moves.
   - Give exact teacher instructions, group setup, student task, time limit, and expected product.
4. Add the thinking path.
   - Include key questions, expected answers, likely misconceptions, and follow-up prompts.
5. Add evidence and management.
   - Define what the teacher observes or collects, how to respond, and how to transition.

## Activity Card Format

Use this format by default:

1. 活动名称
2. 适用环节
3. 活动目标
4. 时间建议
5. 材料准备
6. 组织方式
7. 教师指令
8. 学生任务
9. 过程步骤
10. 预期回答/作品
11. 常见困难与追问
12. 评价证据
13. 课堂管理与安全注意

## Quality Rules

- Activities must serve a specific objective and produce visible evidence.
- Keep teacher instructions concise and executable.
- Include exact questions instead of vague "引导学生思考".
- Respect grade level: younger learners need concrete, shorter, more visual tasks; older learners can handle debate, abstraction, and open-ended inquiry.
- Include classroom management: grouping, roles, noise level, material distribution, timing, transition.
- For experiments, PE, maker, chemistry, electricity, cutting tools, heat, outdoor, or online safety, include safety rules and teacher supervision.
- For public lessons, reduce activity count and improve depth; make student thinking visible.

## Output Modes

- Single activity card.
- Full activity sequence for one lesson.
- Questioning chain with expected answers and follow-ups.
- Public lesson interaction polish.
- Printable activity/task sheet through `worksheet-skill`.
- Evaluation/observation sheet through `teaching-assessment-skill`.
