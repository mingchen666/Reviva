# Bloom's Taxonomy

6-level hierarchy. Load when classifying L1–L6 or checking "hidden intent" depth.

## Levels

| L  | Name       | Verbs                                                     | Example                                |
| -- | ---------- | --------------------------------------------------------- | -------------------------------------- |
| L1 | Remember   | recall, identify, list, name, state, define               | "State the quadratic formula."         |
| L2 | Understand | explain, describe, summarize, paraphrase, classify        | "Why is division by zero undefined?"   |
| L3 | Apply      | compute, solve, apply, execute, demonstrate, use          | "Solve 2x² - 5x + 3 = 0."             |
| L4 | Analyze    | analyze, compare, contrast, distinguish, examine          | "Is f(x) increasing on (-1, 2)?"       |
| L5 | Evaluate   | evaluate, critique, justify, argue, defend, assess        | "Evaluate this regression's validity." |
| L6 | Create     | design, propose, create, construct, formulate, synthesize | "Design an experiment to measure g."   |

**Default:** L3. **Tie:** higher.

## Fuzzy Tie-Breakers

| Stem                       | Default | Why               |
| -------------------------- | ------- | ----------------- |
| "Show that" / "证明"       | L4      | Logical chain     |
| "Determine" (method given) | L3      | Prescribed        |
| "Determine" (no method)    | L4      | Choose method     |
| "Find" (single)            | L3      | Direct compute    |
| "Find all" / "求所有"      | L4      | Enumerate + edges |
| "Compare … and …"        | L4      | Multi-attribute   |
| "Which is better"          | L5      | Needs criteria    |
| "Prove or disprove"        | L5      | Defend claim      |
| "Use … to solve"          | L3      | Tool prescribed   |
| "If …, then …" (predict) | L4      | Conditional       |
| "Why" (open)               | L5      | Argument          |
| "How" (procedure)          | L3      | Procedural        |
| "How" (mechanism)          | L2      | Explanation       |

**Trap:** "Discuss" / "论述" sounds L4 but often masks L5 (take a side).

## Chinese Verbs

| Verb                               | Level |
| ---------------------------------- | ----- |
| 记住、列举、写出、复述             | L1    |
| 解释、说明、描述、概括             | L2    |
| 计算、求解、应用、证明(方法已知)   | L3    |
| 分析、比较、讨论(无立场)           | L4    |
| 评价、批判、论证、证明(需自选方法) | L5    |
| 设计、构造、提出、推广             | L6    |

**Rules:** translate first → "说明"=L2 not L3. Bilingual stems: use majority-language list; translated Qs often simplify verbs upward — re-elevate one level. Multi-part: per part; dominant level drives `[***]/[**]`.

## Decision Tree

`verb → Quick Picker → Tie? → Fuzzy Rules → Still tied? → Higher → Bilingual? → Final L1-L6`

**Output:** record both surface verb and hidden level. They must differ for "deeper" check.
