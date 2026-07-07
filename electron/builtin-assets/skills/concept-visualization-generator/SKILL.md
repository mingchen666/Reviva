---
name: concept-visualization-generator
description: Design and generate concept-first learning artifacts: concept cards, visual explanations, diagrams, interactive HTML demos, Manim/math visualizations, matplotlib scientific plots, misconception checks, and short retrieval practice. Use this skill whenever the user wants to understand, teach, review, visualize, make a knowledge card for, or interactively explore a concept, especially when the best output format is not obvious. This skill should choose and orchestrate the right learning artifact instead of defaulting to plain text, video, or HTML.
---

# Concept Visualization Generator

Turn an abstract concept into a useful learning object. This skill is an orchestrator: choose the right artifact, then use the appropriate underlying capability.

It does not replace `concept-explainer`, `learning-visualization-skill`, `math-explainer`, `manim-animation-maker`, `flashcard-generator`, or `practice-quiz`. It decides which of those modes should be used, and makes the result feel like one coherent learning experience.

## Core Promise

For any concept, produce the smallest artifact set that helps the learner understand, remember, and check themselves.

Default package:

1. a concept card;
2. one visual anchor or interactive artifact;
3. 2-5 retrieval checks;
4. a machine-readable learning trace for future personalization.

## When To Use

Use this skill when the user asks to:

- explain a concept visually;
- make a knowledge card or review card;
- turn a concept into an interactive learning artifact;
- teach a difficult concept to a student;
- create a visual explanation for a formula, mechanism, model, proof, or process;
- decide whether a concept needs a card, diagram, HTML demo, Manim video, matplotlib plot, or quiz;
- build a study package from a topic, notes, document, lecture slide, or exam scope.

Do not use this skill for:

- a direct one-sentence answer;
- a full slide deck or PPTX unless the user explicitly wants a concept card embedded into a deck;
- pure flashcard decks with no visual explanation, where `flashcard-generator` is enough;
- specialized domain visualizations that already have a stronger skill, such as solid geometry, analytic geometry, network protocol animation, or technical architecture diagrams.

## Learning Science Principles

Apply these principles lightly but consistently:

- Use words and visuals together, but remove decorative noise. Learners have limited visual/verbal processing capacity.
- Segment complex explanations into learner-paced steps.
- Put labels near the visual parts they describe.
- Use concept cards for pretraining: name the important terms before asking the learner to reason.
- Include retrieval practice. A learner should answer something, not only reread.
- Include misconceptions. Durable understanding often comes from correcting the tempting wrong idea.

## Workflow

### 1. Diagnose The Learning Job

Identify:

- domain: math, physics, chemistry, biology, CS, statistics/data, language/literature, history/social science, general, or cross-disciplinary;
- concept type: definition, relation, process, mechanism, proof, formula, model, misconception;
- learner level: beginner, middle school, high school, undergraduate, exam prep, professional;
- goal: understand intuition, memorize, solve problems, teach others, review for exam;
- constraints: quick answer, HTML file, Manim video, static plot, document-grounded output.

If the user is vague, assume Chinese output, high-school to early-undergraduate level, and create a concept card plus one visual anchor and short self-checks.

After identifying the domain, use `references/discipline-patterns.md` to choose the discipline-specific representation. A concept card can share the same structure across subjects, but the visual should not. Math may need axes or proof diagrams; physics may need forces, fields, or energy bars; chemistry may need particle or reaction-coordinate views; humanities may need timelines, argument maps, source cards, or comparison matrices.

### 2. Choose Artifact Mode

Use `references/artifact-selection.md` when the choice is not obvious.
Use `references/discipline-patterns.md` when the discipline or visual grammar is not obvious.

| Need | Prefer | Add if useful |
| --- | --- | --- |
| Quick understanding | concept card | analogy, misconception |
| Remember/review | knowledge card | retrieval prompt |
| Relationship map | concept map | self-explanation prompt |
| Process or mechanism | interactive HTML / step diagram | checkpoint quiz |
| Math or physics reasoning | Manim / interactive HTML | static plot, card |
| Scientific/statistical visual | matplotlib SVG/PNG | Manim import |
| Parameter exploration | interactive HTML | reset/replay controls |
| Exam readiness | card + worked example | quiz, error-pattern note |
| Source materials | source-grounded card set | citations and paths |

Prefer the smallest artifact that works. Do not generate video, HTML, plot, and quiz for every concept by default.

### 2.1 Discipline Modes

| Domain | Typical visual grammar | Preferred tools |
| --- | --- | --- |
| Math | axes, number lines, geometric construction, area/slope, proof diagrams | HTML, Manim, matplotlib |
| Physics | free-body diagrams, vectors, motion traces, fields, energy bars, circuits, waves | HTML, Manim, matplotlib |
| Chemistry | particle models, Lewis/VSEPR, reaction coordinate, equilibrium, lab apparatus | HTML, Manim, matplotlib |
| Biology | structure-function diagrams, pathways, feedback loops, inheritance, trees, ecology networks | HTML, Manim, matplotlib |
| CS | state machines, data-structure mutation, call stack, timelines, graphs, memory layout | HTML, Manim, matplotlib |
| Statistics/data | distributions, sampling simulations, regression, residuals, confusion matrices, uncertainty | matplotlib, HTML |
| Humanities/history | timelines, cause-effect maps, argument maps, comparison matrices, source/context cards | HTML, Markdown |
| Language/literature | parse trees, sentence highlighting, morphology maps, rhetorical maps, text-evidence cards | HTML, Markdown |

For cross-disciplinary concepts, pick the learner's current subject as the primary mode and add a small bridge note rather than creating several full visualizations.

### 3. Build The Concept Card

Every substantial output should include a card unless the user opts out.

Use `templates/concept-card.md` or follow this schema:

- title;
- one-sentence definition;
- core intuition;
- definition/formula/mechanism;
- visual anchor;
- worked example;
- common misconception;
- self-check;
- related concepts;
- next step.

The card is the anchor for any HTML, Manim, plot, or quiz.

### 4. Generate The Visual Artifact

Choose deliberately:

- Use a Markdown card if the concept is simple.
- Use single-file HTML when the learner should step, drag, compare, or replay.
- Use Manim when motion carries the reasoning: limits, transformations, changing slopes, accumulated area, physical motion, formula transformations.
- Use matplotlib when the visual is a scientific plot: distributions, sampled data, heatmaps, contours, vector fields, regression, simulation.
- Use concept maps when the main issue is relation among ideas.

Do not reuse the default graph in `templates/interactive-card.html` unless a graph is the right discipline representation. Treat the template as a layout shell: keep the concept card, visual stage, controls, self-checks, and trace, but replace the stage marks with the selected discipline pattern.

For HTML output, use `templates/interactive-card.html` as a starting point and `references/html-visual-standards.md` for visual rules.

For matplotlib + Manim, generate SVG for vector plots and PNG for raster-heavy plots. Import into Manim with `SVGMobject("plot.svg")` or `ImageMobject("plot.png")`.

### 5. Add Retrieval Checks

Include 2-5 short checks:

- recall: "What is the core idea?"
- misconception: "Which statement is wrong, and why?"
- transfer: "Apply it to a slightly new case."
- self-explanation: "Explain it in your own words."
- mini-problem if the domain is procedural.

Make the checks match the learning goal. Flashcard-style recall is not enough for proofs, mechanisms, or problem solving.

### 6. Emit Learning Trace

At the end, include a machine-readable trace. Use `templates/learning-trace.json`.

The trace prepares future personalized learning:

- concept;
- domain;
- level;
- artifacts created;
- prerequisites;
- related concepts;
- misconceptions;
- self-checks;
- recommended next step;
- confidence.

Do not claim this was saved to long-term memory unless the product explicitly provides a memory API. Present it as structured output ready to store.

## Output Patterns

### Lightweight

Use when the user wants quick help:

- concept card in Markdown;
- one visual anchor;
- 2-3 self-checks;
- learning trace.

### Standard

Use for "可视化解释", "知识卡片", "讲懂":

- concept card;
- single-file HTML card or diagram;
- misconception note;
- 3-5 self-checks;
- learning trace.

### Deep Visual

Use when motion or scientific plotting is clearly valuable:

- concept card;
- Manim video or matplotlib plot;
- interactive HTML companion if parameter exploration matters;
- retrieval checks;
- learning trace.

## Source-Grounded Materials

If the user provides documents, slides, notes, PDFs, or wiki materials:

1. Read the source first.
2. Preserve source terminology.
3. Label uncertain points.
4. Do not invent facts not present in the source.
5. Put source paths or document names on cards when possible.

## File Placement

Generated files should go under the current agent output directory when available:

```text
/agents/{agent_name}/outputs/{YYYY-MM-DD}/
```

Suggested package layout:

```text
concept-visualization/
├── concept-card.md
├── index.html
├── assets/
│   ├── plot.svg
│   └── preview.png
└── learning-trace.json
```

## Quality Checklist

Before delivering:

- The output has one clear learning objective.
- A concept card exists unless the user opted out.
- The visual explains, not decorates.
- The visual grammar matches the discipline and concept type.
- The chosen artifact fits the learning need.
- Misconceptions are addressed.
- Self-checks require retrieval or transfer.
- If HTML is generated, controls work and text does not overlap.
- If Manim/matplotlib is used, dependency caveats are stated.
- The learning trace is included.

## References

- `references/artifact-selection.md` - how to choose card, diagram, HTML, Manim, matplotlib, or quiz.
- `references/discipline-patterns.md` - domain-specific visual grammars for math, physics, chemistry, biology, CS, statistics, humanities, and language.
- `references/card-patterns.md` - concept card and retrieval-check patterns.
- `references/html-visual-standards.md` - visual rules for polished, study-oriented HTML UI.
- `references/evaluation-prompts.md` - cross-discipline prompts for testing whether the skill selects the right representation.
- `templates/concept-card.md` - Markdown card template.
- `templates/interactive-card.html` - polished single-file HTML template.
- `templates/learning-trace.json` - structured personalization trace template.
