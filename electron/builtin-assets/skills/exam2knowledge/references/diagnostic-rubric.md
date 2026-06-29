# Error Diagnostic Rubric

5-category mistake classification. Load when building error library or picking Top 3.

## Decision Flow

```
Wrong answer?
  → Misread what's asked?           → C1 Reading
  → Wrong concept/definition?       → C2 Conceptual
  → Wrong method/sequence?          → C3 Procedural
  → Mechanical slip (sign, math)?   → C4 Execution
  → Missed constraint/edge case?    → C5 Edge Case
```

**Tie:** pick upstream (C2 conceptual usually shows as C4 — fix concept, not sign).
**Multi-tag:** tag all, score with 3D (see [quantified-rubric.md](./quantified-rubric.md)).

## Categories

| ID | Type       | Signal                 | Prevention                                      |
| -- | ---------- | ---------------------- | ----------------------------------------------- |
| C1 | Reading    | "Misread the question" | Re-read 30s; highlight NOT, EXCEPT, 除非        |
| C2 | Conceptual | "Wrong idea/model"     | Verify definition + preconditions               |
| C3 | Procedural | "Wrong method"         | Checklist steps; verify preconditions           |
| C4 | Execution  | "Calculation mistake"  | Scan signs; re-do from error point              |
| C5 | Edge Case  | "Missed special case"  | Substitute answer; check domain, boundary, unit |

## Domain Patterns

All subjects share the same 5-category framework. Differences live in **dominant C-tag** and **typical traps**.

| Domain                                                  | Dominant | Typical trap (illustrative)                         |
| ------------------------------------------------------- | -------- | --------------------------------------------------- |
| **STEM** (math, physics, chem, bio, CS, stats)    | C2 / C4  | Wrong method (C3), sign slip (C4), missed edge (C5) |
| **Humanities** (history, geo, politics, language) | C1 / C2  | Off-topic (C1), anachronism (C2), no evidence (C3)  |

**Usage:** Identify domain → pick dominant C-tag → list 1–3 traps specific to the current question. 3D scoring (A+B+C) ranks Top 3.

**Hypothesize, don't lookup:** generate traps from the question itself. If a trap is unclear, the analysis isn't deep enough — rewrite it.
