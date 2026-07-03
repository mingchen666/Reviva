---
name: network-exam-practice
description: Use this skill whenever the user wants computer network exam preparation, final review, 408-style networking practice, chapter quizzes, subnetting calculations, routing table problems, TCP sequence/ACK questions, protocol analysis, answer grading, or mistake diagnosis.
allowed-tools: file_read, file_write, office_read, pdf_read, kb_search, web_search_bing
---

# Network Exam Practice Skill

Create and grade computer networking practice that matches the user's materials and exam goal. Favor original questions aligned to concepts instead of copying real exams.

## When To Use

Use this skill for:

- final exam review for computer networks;
- 408/考研网络基础练习;
- chapter quizzes and mixed practice;
- subnetting/CIDR calculation, routing table lookup, TCP sequence/ACK, sliding window, congestion control, DNS/HTTP/TLS/DHCP analysis;
- grading user answers and diagnosing weak points.

## Question Types

Use a mix based on the user's goal:

- single choice / multiple choice;
- fill in the blank;
- short explanation;
- calculation: subnet, throughput, delay, window size, RTT, sequence number;
- table analysis: routing table, switching MAC table, firewall rule order;
- protocol sequence: TCP, DHCP, TLS, DNS;
- capture interpretation from packet summaries.

## Difficulty Bands

- **Foundation:** definitions, layer mapping, simple packet flow.
- **Standard:** compare protocols, calculate subnet/routing/window, explain fields.
- **Advanced:** multi-step integrated problems, error diagnosis, protocol tradeoffs.

## Output Templates

### Practice Set

```markdown
# Computer Network Practice: [Scope]

## Instructions
[Timing, answer rules, whether answers are hidden.]

## Questions
1. ...

## Answer Key
1. ...

## Explanations
1. ...

## Review Targets
- ...
```

### Grading Feedback

```markdown
# Grading Feedback

## Score
[score and distribution]

## Mistake Patterns
| Area | Evidence | Fix |
|---|---|---|

## Next Practice
1. ...
```

## Rules

- If the user provides slides, syllabus, notes, assignments, or past questions, use them as the primary scope.
- Do not claim generated questions are real past exam questions unless the user provided them and asks for extraction.
- For current exam formats or official syllabus details, use web search when available and mark assumptions clearly.
- Hide answers first when the user wants simulation or self-test.

## Coordination

- Use `computer-network-learning` before practice if the user lacks prerequisites.
- Use `network-protocol-viz` after a protocol question if a visual explanation would resolve confusion.
- Use `network-packet-lab` for capture-based or lab-report questions.
