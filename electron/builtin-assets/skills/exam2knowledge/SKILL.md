---
name: exam2knowledge
version: 1.0.0
description: 'Reverse-engineers exam questions into high-frequency test points and reusable solving patterns. Use for past papers, practice questions, mock exams, 归纳考点, 错题整理, 冲刺计划, 考点分析. Triggers: 刷题, 模考, past paper, mock exam, 考点, 高频题, 冲刺, 备考, 题库, 归纳, 错题本. STEM-first.'
---
# Exam2Knowledge

**Role:** Exam Knowledge Reverse-Engineer. Classify and structure — do NOT solve.

**Input:** `single_question` | `batch_questions` | `weak_spot`
**Output:** Follow [output-template.md](./assets/output-template.md).

## Pipeline (5 steps)

1. **Pattern Recognition** — subject · type · L1–L6 · hidden intent · signal words
2. **Tier Knowledge** — `[***]` Must-Master ≥40% / `[**]` Frequent 15-40% / `[*]` Optional <15%
3. **Build Template** — universal steps + `When X → do Y` rules (≥80% coverage)
4. **Error Library** — Top 3 pitfalls: `symptom → cause → prevention`
5. **Batch Intelligence** — (batch only) frequency + clusters + plan

## Load-on-Demand

| Input           | SKILL | Template | References             |
| --------------- | ----- | -------- | ---------------------- |
| Quick Q (<50 w) | full  | ✓       | if error/level unclear |
| Standard Q      | full  | ✓       | if error/level unclear |
| Batch (≥5)     | full  | ✓       | both required          |
| Weak spot       | full  | ✓       | diagnostic-rubric      |

## Decision Rules (priority: batch > type)

| Condition  | Action                                  |
| ---------- | --------------------------------------- |
| Single Q   | 5 steps                                 |
| ≥5 Qs     | + batch statistics                      |
| weak_spot  | Strengthen error analysis               |
| Image/OCR  | Verify OCR first                        |


## Self-Check (1-2 fails → fix inline · 3+ → regenerate)

| Check    | Rule                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| Filled   | All fields or "N/A"                                                                 |
| Tiers    | `[***]/[**]/[*]` (no ★)                                                          |
| Time     | 1-2 min recall, 3-5 min apply                                                       |
| Depth    | Surface verb ≠ Hidden verb (see[blooms-taxonomy.md](./references/blooms-taxonomy.md)) |
| Order    | High-frequency first, not textbook                                                  |
| Coverage | Template ≥80% of 5 variants (4/5 pass)                                             |
| Errors   | `symptom → cause → prevention`, concrete checklist                              |
| Truth    | No fabrication; mark "approx."                                                      |

## Top 3 Errors (3D: A frequency + B severity + C preventability, 1-3 each)

| Dim         | 1       | 2          | 3                  |
| ----------- | ------- | ---------- | ------------------ |
| **A** | Rare    | Occasional | Dominant           |
| **B** | 1-2 pts | 3-5 pts    | Full Q / cascade   |
| **C** | Insight | Partial    | Fully templateable |

Tie-break: C > A. Pick top 3. Output: `symptom → cause → prevention` (concrete checklist).

## Positive Directives

- Order by **exam frequency**, not textbook
- `[***] / [**] / [*]` consistent · `→` for cause-effect
- Hidden intent **deeper** than surface
- Template ≥80% · Errors **actionable** · Time budget mandatory
- Bullets/tables > prose · **Supplement** study, not replace · No fabrication

## Limitations (do NOT use)

- Open-ended essays / writing prompts
- Live exam proctoring
- Subjects outside STEM + basic humanities
- Source images with unclear OCR
- Single factual lookup · User wants the actual answer

**Caveat:** Tiers reflect common patterns, not guaranteed outcomes. Cross-check with official syllabus.

## File Map

| File                                                   | Purpose              | Load                   |
| ------------------------------------------------------ | -------------------- | ---------------------- |
| [SKILL.md](./SKILL.md)                                    | Pipeline + rules     | Always                 |
| [output-template.md](./assets/output-template.md)         | Output structure     | When generating        |
| [blooms-taxonomy.md](./references/blooms-taxonomy.md)     | L1-L6 levels         | When classifying level |
| [diagnostic-rubric.md](./references/diagnostic-rubric.md) | 5 error categories   | When building errors   |
| [quantified-rubric.md](./references/quantified-rubric.md) | Quantified standards | When self-checking     |
