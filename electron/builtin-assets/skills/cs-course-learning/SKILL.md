---
name: cs-course-learning
description: Use this skill whenever the user is learning computer science core courses, 408, data structures, computer organization, operating systems, computer networks, algorithms, course finals, chapter review, CS exam practice, concept explanation, lab understanding, or wants a study plan for CS professional courses.
allowed-tools: file_read, file_write, office_read, pdf_read, kb_search, web_search_bing, mcp:exa
---

# Computer Science Course Learning Skill

Use this as the unified entry point for computer science core course learning. Keep the main workflow compact, then load only the relevant reference file for the subject.

## Subject References

Read only the files needed for the user's task:

| Need | Reference |
|---|---|
| Overall CS/408 study planning | `references/overview.md` |
| Data structures and algorithms | `references/data-structures.md` |
| Computer organization | `references/computer-organization.md` |
| Operating systems | `references/operating-systems.md` |
| Computer networks | `references/computer-networks.md` |
| 408 / postgraduate exam review | `references/exam-408.md` |
| 408 visual explanations and artifacts | `references/visualization-408.md` |

## When To Use

Use this skill for:

- 计算机专业课学习、期末复习、408/考研复习;
- 数据结构、组成原理、操作系统、计算机网络的概念、题目、实验、错题;
- turning slides, notes, PDFs, assignments, or wrong answers into study plans, chapter maps, quizzes, flashcards, notes, or review documents;
- deciding which specialist skill to use next.

For detailed visualization, route to the subject-specific visual skill first: data structures -> `data-structure-visualization`, computer organization -> `computer-organization-visualization`, operating systems -> `operating-system-visualization`, computer networks -> existing network-specific skills.

## First Step

Identify:

1. subject: data structures / organization / OS / networking / mixed 408;
2. task type: learn, review, solve a problem, generate practice, analyze mistakes, prepare a document;
3. source material: user files, syllabus, notes, screenshots, or no material;
4. deadline and target level if this is exam preparation.

Ask only for missing information that blocks progress.

## Core Workflow

1. **Locate the topic.** Name the course, chapter, prerequisites, and where it appears in exams.
2. **Explain the mechanism.** Use state changes, data movement, tables, algorithms, diagrams, or examples.
3. **Practice.** Generate or solve representative questions.
4. **Diagnose.** Mark likely mistakes and missing prerequisites.
5. **Consolidate.** Produce notes, flashcards, a checklist, a visual page, or a document if useful.

## Output Patterns

### Concept Explanation

```markdown
# [Topic]

## What Problem It Solves

## Where It Fits
- Course:
- Chapter:
- Prerequisites:

## Mechanism
1. ...

## Example

## Common Mistakes

## Exam Angle

## Quick Check
```

### Review Plan

```markdown
# [Subject/Exam] Review Plan

## Scope
- Must know:
- Common question types:
- Weak areas:

## Schedule
| Day | Task | Output |
|---|---|---|

## Practice Strategy

## Review Artifacts
```

## Coordination Rules

- Use `computer-network-learning`, `network-protocol-viz`, `network-packet-lab`, and `network-exam-practice` for networking-specific work.
- Use `data-structure-visualization` for trees, graphs, sorting, searching, hashing, recursion, DP, and algorithm hand simulation.
- Use `computer-organization-visualization` for data representation, Cache, CPU data path, instruction execution, pipeline, bus, interrupt, and DMA.
- Use `operating-system-visualization` for process states, scheduling, PV, deadlock, address translation, page replacement, file systems, and disk scheduling.
- Use `learning-visualization-skill` as a general fallback for mixed-topic HTML review pages, concept maps, timelines, or when no subject-specific visual skill fits.
- Use `technical-diagram-skill` for precise technical diagrams: CPU data paths, cache address split, page table translation, resource allocation graphs, routing/switching tables, algorithm workflows, state machines, and sequence diagrams.
- Use `practice-quiz`, `mock-exam`, and `exam-prep` for drill, simulation, and sprint review.
- Use `knowledge-organize` before planning if the user provides long materials.
- Use `research-brief-skill` or web tools when current syllabus, public course information, or official requirements must be checked.

## Accuracy Rules

- Prefer user-provided materials over generic claims.
- Do not fabricate official exam scope, high-frequency rankings, or past-paper claims.
- For 408 or school-specific exams, clearly separate “based on your material” from “general exam pattern”.
- For security/network/system topics, keep examples educational and defensive.
