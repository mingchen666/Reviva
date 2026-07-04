# Concept Visualization Generator Skill Design

## Purpose

Create a new built-in skill, `concept-visualization-generator`, that turns an abstract concept into the most useful learning artifact or artifact set.

This skill should not be "another Manim skill". It should be a learning-product orchestrator that decides whether the learner needs a concept card, diagram, interactive HTML page, Manim video, matplotlib scientific plot, concept map, self-check quiz, or a combination.

The short-term goal is better concept understanding. The long-term product direction is to feed structured learning traces into a personalized learner memory/profile module.

## Research Basis

The design is grounded in several learning-science findings:

- Multimedia learning works best when words and visuals are coordinated, because learners process verbal and visual information through limited-capacity channels. Sources: Mayer's cognitive theory of multimedia learning and related dual-coding research.
- Retrieval practice and spacing improve durable learning more reliably than rereading alone. Sources: Nature Reviews Psychology on spacing and retrieval practice; meta-analyses on practice testing.
- Concept maps and graphic organizers help learners represent relations between concepts and can support monitoring of understanding. Sources: Nesbit & Adesope concept-map meta-analysis; concept mapping/metacomprehension research.
- Adaptive learning depends on a learner model, a domain model, and a pedagogical strategy. This skill should produce structured events for future learner modeling, but not implement long-term personalization by itself.

## Existing Capability Gap

Current adjacent skills:

- `concept-explainer`: clear text explanations, analogies, examples, misconceptions.
- `learning-visualization-skill`: single-file HTML visual explanations and diagrams.
- `math-explainer`: Manim video + interactive HTML for math/physics concepts.
- `manim-animation-maker`: Manim MP4 workflow.
- `flashcard-generator`: memory cards.
- `practice-quiz`: practice questions.
- `socratic-tutor` and `feynman-learning-coach`: guided explanation and recall.

Gap:

No skill owns the decision "what learning artifact should this concept become?" Existing skills produce specific artifact types, but none plans the learning loop across card, visual, interaction, retrieval, misconception correction, and follow-up.

## Skill Identity

Name:

`concept-visualization-generator`

Proposed description:

> Design and generate concept-first learning artifacts: concept cards, visual explanations, diagrams, interactive HTML demos, Manim/math visualizations, matplotlib scientific plots, misconception checks, and short retrieval practice. Use this skill whenever the user wants to understand, teach, review, visualize, make a knowledge card for, or interactively explore a concept, especially when the best output format is not obvious. This skill should choose and orchestrate the right learning artifact instead of defaulting to plain text, video, or HTML.

Category:

`学习`

Allowed tools:

- `file_read`
- `file_write`
- `exec_command`
- `manim:*`
- `ffmpeg:*`

Potential companion skills/tools:

- `concept-explainer`
- `learning-visualization-skill`
- `math-explainer`
- `manim-animation-maker`
- `flashcard-generator`
- `practice-quiz`
- `socratic-tutor`
- `feynman-learning-coach`
- `office_read`
- `pdf_read`
- `kb_search`

## Trigger Scope

Use when the user asks for:

- "讲懂这个概念"
- "做成知识卡片"
- "可视化解释"
- "用图/动画/交互解释"
- "这个知识点怎么理解"
- "帮我做学习卡片/复习卡片"
- "做一个概念可视化生成器"
- "把这个概念变成可学习的材料"
- "这个公式/原理/机制能不能看出来"
- "给学生讲这个知识点"

Do not use when:

- The user only wants a direct short answer.
- The user explicitly asks for only a slide deck, PPTX, document, or exam paper.
- The task is pure code debugging or office editing.
- A specialized skill clearly owns the domain and output, such as network protocol animation or solid geometry.

## Core Workflow

### 1. Diagnose The Learning Job

Identify:

- Subject/domain: math, physics, chemistry, biology, CS, humanities, general.
- Concept type: definition, process, mechanism, relation, proof, formula, model, misconception-prone idea.
- Learner level: beginner, middle/high school, undergraduate, exam prep, professional.
- Learning objective: understand intuition, memorize facts, solve problems, explain to others, review for exam.
- Output constraint: quick card, HTML, video, static plot, worksheet, or mixed package.

If not specified, assume:

- Chinese output.
- High-school to early undergraduate level.
- Start with a compact concept card plus one visual artifact and a short retrieval check.

### 2. Choose Artifact Mode

Decision table:

| Learning need | Primary artifact | Companion |
| --- | --- | --- |
| Quick understanding | Concept card | analogy + misconception |
| Remember/review | Interactive or static knowledge card | retrieval prompt |
| Relationship between ideas | Concept map | self-explanation prompt |
| Step/process/mechanism | HTML process diagram | checkpoint quiz |
| Math/physics reasoning | Manim or interactive HTML | static plot/card |
| Scientific/statistical plot | matplotlib SVG/PNG | Manim import if needed |
| Parameter exploration | Interactive HTML | short card |
| Exam readiness | card + worked example + quiz | error-pattern note |
| User uploaded material | source-grounded card set | citations/paths |

### 3. Build The Concept Card

Every output should have a concept card unless the user explicitly says not to.

Card fields:

- `title`
- `one_sentence`
- `core_intuition`
- `definition_or_formula`
- `visual_anchor`
- `worked_example`
- `common_misconception`
- `self_check`
- `related_concepts`
- `next_step`

This card becomes the anchor for any HTML, Manim, or practice output.

### 4. Generate Visual Or Interactive Artifact

Use the smallest useful artifact:

- Use a diagram/card first when that is enough.
- Use interactive HTML when learners need to vary a parameter, step through a process, or explore a relationship.
- Use Manim when motion is essential for reasoning: limits, transformations, changing slopes, accumulated area, physical movement, formula transformations.
- Use matplotlib when the main artifact is a scientific plot: distributions, sampled data, heatmaps, contours, vector fields, regression, simulation.

HTML design guidance:

- The first screen should be the learning artifact, not a marketing intro.
- Use compact, study-oriented layout.
- Include controls only when they change understanding.
- Keep the card and visual side by side or stacked responsively.
- Avoid decorative gradients/orbs and generic dashboard styling.
- Include a replay/step/reset control for sequential explanations.

### 5. Add Retrieval Practice

Every substantial artifact should include 2-5 short checks:

- one recall question;
- one misconception question;
- one transfer/apply question;
- optional "explain in your own words" prompt;
- optional mini-problem.

This follows retrieval-practice evidence and prepares structured learning traces.

### 6. Emit Learning Trace

At the end, include a machine-readable learning trace block that future personalization can store.

Suggested shape:

```json
{
  "concept": "",
  "domain": "",
  "level": "",
  "learning_objective": "",
  "artifacts": ["concept_card", "interactive_html", "quiz"],
  "prerequisites": [],
  "related_concepts": [],
  "misconceptions": [],
  "self_checks": [],
  "recommended_next_step": "",
  "confidence": "low|medium|high"
}
```

This skill should not write long-term memory by itself unless the product provides a specific API. It should make the trace easy for a future learner-profile module to consume.

## Output Packages

### Lightweight Package

Use for quick user requests.

- Concept card in Markdown.
- One simple diagram or textual visual anchor.
- 2-3 self-checks.
- Learning trace block.

### Standard Package

Default for "可视化解释/知识卡片/讲懂".

- Concept card.
- HTML visual/interactive card or diagram.
- 3-5 self-checks.
- Common mistake note.
- Learning trace block.

### Deep Visual Package

Use when the concept benefits from motion or scientific plotting.

- Concept card.
- Manim video or matplotlib plot asset.
- Interactive HTML companion if parameter exploration matters.
- Quiz and misconception checks.
- Learning trace block.

## Relationship To Long-Term Personalized Learning

This skill is the content-generation front end. The long-term personalized learning module should be a separate product system.

The future module should own:

- learner profile: goals, subjects, exam, level, preferences;
- learning history: learned concepts and artifacts consumed;
- mastery estimates: per concept or knowledge component;
- error memory: misconceptions, calculation mistakes, strategy mistakes;
- review schedule: spaced repetition and retrieval intervals;
- recommendation engine: next concept, next practice, next review.

The concept visualization skill should support that module by emitting structured traces and consistent concept metadata.

## File Structure

Proposed new folder:

```text
electron/builtin-assets/skills/concept-visualization-generator/
├── SKILL.md
├── config.json
├── templates/
│   ├── concept-card.md
│   ├── interactive-card.html
│   └── learning-trace.json
└── references/
    ├── artifact-selection.md
    ├── card-patterns.md
    └── html-visual-standards.md
```

Keep `SKILL.md` under 500 lines. Put detailed patterns in references.

## Initial SKILL.md Outline

1. Identity and purpose.
2. When to use / when not to use.
3. Learning diagnosis workflow.
4. Artifact selection table.
5. Concept card schema.
6. Visual generation guidance.
7. Retrieval checks.
8. Learning trace output.
9. Quality checklist.

## Quality Checklist

Before delivering:

- The artifact has one clear learning objective.
- A concept card exists unless user explicitly opted out.
- The visual is explanatory, not decorative.
- The output format matches the learning need.
- Misconceptions are addressed.
- Self-check questions require retrieval, not just rereading.
- If HTML is generated, text does not overlap and controls work.
- If Manim/matplotlib is used, dependency caveats are stated.
- A learning trace block is included for future personalization.

## Test Prompts

Use these for first-pass evaluation:

1. "帮我把导数这个概念做成学生能看懂的知识卡片，最好有图和自测。"
   Expected: card + visual strategy + self-checks; likely interactive/diagram, not only text.

2. "我总是搞不懂条件概率和贝叶斯公式，能不能可视化解释一下？"
   Expected: misconception-aware concept card, visual probability representation, transfer question.

3. "给初中生讲浮力，做一个能交互的概念解释页面。"
   Expected: HTML interaction plan/output, learner-level language, simple self-checks.

4. "解释 Transformer 的 attention，不要太抽象，最好能变成复习卡。"
   Expected: concept card + process diagram/interactive artifact, no unnecessary Manim unless useful.

5. "把这份课件里的核心概念做成一组可复习的可视化卡片。"
   Expected: source-grounded card set using file/office/pdf reading when available.

## Implementation Notes

Do not make this skill overproduce by default. A frequent failure mode would be generating a video, an HTML page, a plot, and a quiz for every concept. The skill should start with the smallest artifact that makes the concept easier to learn, then add heavier artifacts only when they materially help.

For HTML output, borrow the discipline of `huashu-design`: the artifact should embody the learning medium, not look like a generic web page. A knowledge card should feel like a study object; a process demo should feel like a controllable explanation; a math visual should foreground the equation/graph relationship.

## Acceptance Criteria

- The skill clearly differentiates itself from `concept-explainer`, `learning-visualization-skill`, and `math-explainer`.
- It can select artifact modes based on learning need.
- It always supports concept cards and retrieval practice as defaults.
- It emits structured learning traces for future personalization.
- It is ready to be implemented as a built-in skill without changing core app architecture.
