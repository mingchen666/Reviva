---
name: classroom-management-differentiation-skill
description: Design classroom management and differentiated support plans for real teaching constraints. Use this skill whenever the user mentions 学情复杂, 基础薄弱, 两极分化, 分层教学, 培优补差, 注意力不集中, 课堂纪律, 大班教学, 小组分工, 课堂管理, 过渡衔接, 特殊需要, 公开课风险, 线上课堂, or asks how to make a lesson workable for a specific class.
allowed-tools: file_read, file_write, document_read
---

# Classroom Management and Differentiation Skill

Design practical classroom execution and student support plans. A lesson is not complete if it only has content; it also needs grouping, routines, transitions, scaffolds, behavior prevention, and contingency moves.

## Load References When Needed

- Read `references/classroom-management.md` when the issue is attention, discipline, transitions, grouping, time, classroom routines, online/offline execution, or large class constraints.
- Read `references/differentiation-and-inclusion.md` when the issue is mixed ability, weak foundation, gifted students, special support, language support, or access barriers.
- Read `references/scenario-playbooks.md` when the user describes a concrete classroom problem and needs a fast plan.

## Use When

Use this skill for:

- class profile analysis and student support planning;
- differentiated instruction, tiered tasks, remediation, extension, and support scaffolds;
- classroom management: grouping, transitions, attention, noise, roles, time, routines;
- public lesson risk plans and fallback moves;
- online/hybrid classroom participation and monitoring;
- converting a lesson plan into a realistic execution plan for a specific class.

For activity design, coordinate with `classroom-activity-skill`. For worksheet tiers, coordinate with `worksheet-skill`. For assessment evidence, coordinate with `teaching-assessment-skill`.

## Input Handling

Gather only missing information:

- grade, subject, topic, class size, duration;
- student profile: foundation, motivation, attention, language level, special needs, behavior patterns;
- classroom environment: seating, devices, online/offline, lab/tools, group norms;
- teacher goal: keep order, improve participation, support weak students, challenge advanced students, prepare public lesson;
- constraints: school rules, safety, exam pressure, parent sensitivity.

Do not diagnose students medically. Use respectful, behavior-based language and avoid labels.

## Design Workflow

1. Identify the classroom risk.
   - Is the problem cognitive, behavioral, motivational, language/access, time, grouping, or material complexity?
2. Prevent before correcting.
   - Adjust task design, instructions, grouping, roles, time boxes, visible success criteria, and checks.
3. Add differentiation.
   - Provide baseline support, core task, extension challenge, and alternative expression when useful.
4. Plan teacher moves.
   - Include exact teacher prompts, monitoring points, transition commands, and intervention options.
5. Connect to learning evidence.
   - Management exists to protect learning time and make student thinking visible.
6. Produce a practical plan.
   - Keep it short enough for a teacher to use during class.

## Output Format

Use this format by default:

```markdown
## 班级执行判断

## 风险与原因
| 风险 | 可能原因 | 预防设计 | 课堂中处理 |
| --- | --- | --- | --- |

## 分层支持
| 学生群体 | 支持方式 | 任务要求 | 教师关注点 |
| --- | --- | --- | --- |

## 课堂管理脚本
- 进入活动：
- 小组合作：
- 过渡收束：
- 学生卡住时：
- 提前完成时：

## 课后跟进
```

## Quality Rules

- Use respectful language; avoid blaming students or teachers.
- Prefer proactive design over punishment.
- Keep interventions classroom-realistic and time-aware.
- Include what the teacher says and what students do.
- For mixed ability, provide tiers without publicly labeling students.
- For special support, offer accessibility and scaffold options, not diagnosis.
- For public lessons, include fallback questions, time compression plan, and backup activity.
- For safety-sensitive tasks, include supervision, material control, and emergency stop rules.
