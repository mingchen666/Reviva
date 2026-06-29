# Quantified Rubric

Detailed standards for [SKILL.md](../SKILL.md) Self-Check. Load only when self-validating.

## 1. Surface vs. Hidden Intent

| Term               | Definition                                   | Example                                         |
| ------------------ | -------------------------------------------- | ----------------------------------------------- |
| **Surface**  | Verb (and object) in stem                    | "Solve 2x² - 5x + 3 = 0" →*solve quadratic* |
| **Hidden**   | Underlying concept/method; Bloom L1–L6 verb | *apply quadratic formula (L3)*                |
| **"Deeper"** | Surface ≠ Hidden verb/level                 | "prove" + "apply induction" → ✅               |

**Failure:** surface = hidden = "solve" → rewrite to expose method layer.

## 2. Tier Scoring

Order by **exam frequency**, not textbook.

| Tier        | Marker    | Meaning                       | Slot               |
| ----------- | --------- | ----------------------------- | ------------------ |
| Must-Master | `[***]` | ≥40% papers, 5+ pts loss     | 1–3               |
| Frequent    | `[**]`  | 15–40% papers, 2–4 pts loss | 2–4               |
| Optional    | `[*]`   | <15%, niche/extension         | 0–2 (omit if N/A) |

**Rule:** 1–3 `[***]` per question. Omit `[*]` if it dilutes focus.

## 3. ≥80% Template Coverage

A template is "good" if steps apply unchanged to ≥80% of variants. **Test:** enumerate 5 variants → apply literally → count.

| Pass  | Verdict   | Action              |
| ----- | --------- | ------------------- |
| 5/5   | Excellent | Keep                |
| 4/5   | Pass      | Mark edge case      |
| 3/5   | Fail      | Generalize one step |
| ≤2/5 | Hard fail | Re-architect        |

## 4. 3D Error Scoring

Top 3 by `A + B + C` (each 1–3, max 9).

| Dim                         | 1 (low)       | 2 (mid)                | 3 (high)                                          |
| --------------------------- | ------------- | ---------------------- | ------------------------------------------------- |
| **A. Frequency**      | Rare          | Occasional             | Dominant trap                                     |
| **B. Severity**       | 1–2 pts      | 3–5 pts               | Full Q / cascade                                  |
| **C. Preventability** | Needs insight | Partially templateable | Fully templateable (checklist → 100% prevention) |

**Tie-break:** C > A. **Output:** `symptom → cause → prevention` — prevention = **concrete checklist item**, not advice.

## 5. Self-Check Thresholds

| Fails | Action                     |
| ----- | -------------------------- |
| 0     | Ship                       |
| 1–2  | Fix inline, re-run         |
| ≥3   | Regenerate section, re-run |

**No skip:** run before delivery.
