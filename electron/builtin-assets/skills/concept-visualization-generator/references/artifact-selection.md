# Artifact Selection Guide

Choose the artifact based on the learning bottleneck, not on which tool is more impressive.

Before choosing the tool, choose the discipline representation. Use `references/discipline-patterns.md` to decide whether the concept needs axes, a force diagram, a particle model, a pathway, a state machine, a timeline, an argument map, or another subject-native visual form. Tool choice comes after that.

## Fast Decision

| Bottleneck | Use | Why |
| --- | --- | --- |
| Learner needs a first intuition | Concept card | Reduces complexity and names the core idea |
| Learner needs to remember | Concept card + retrieval checks | Retrieval practice strengthens memory |
| Learner confuses related ideas | Comparison card or concept map | Makes boundaries visible |
| Learner cannot see a process | Step HTML or process diagram | Segmentation lowers cognitive load |
| Learner needs parameter exploration | Interactive HTML | Lets the learner manipulate and observe |
| Learner needs motion to understand | Manim | Motion explains transformation or causality |
| Learner needs scientific plotting | matplotlib | Better for dense, statistical, numerical plots |
| Learner needs exam readiness | Worked example + quiz | Connects concept to application |
| Learner provides material | Source-grounded card set | Preserves terminology and avoids invention |

## When To Stop At A Card

Stop at a concept card if:

- the concept is mostly definitional;
- no parameter or process needs exploration;
- the user asked for a quick review object;
- the visual anchor can be described in one small diagram or analogy.

A good card is not a lesser output. For many concepts, it is the best first artifact.

## When To Use Interactive HTML

Use HTML when:

- the learner should drag a parameter;
- the concept has steps that should be learner-paced;
- comparing states side by side helps;
- a browser-openable artifact is more useful than a video;
- the result should be reusable as a study card.

Keep the page compact. The first screen should be the learning object, not an introduction page.
Treat `templates/interactive-card.html` as a layout shell. Replace its default graph with the discipline-specific stage: vectors for physics, particles for chemistry, pathways for biology, state diagrams for CS, timelines or argument maps for humanities, parse/highlight views for language, and so on.

## When To Use Manim

Use Manim when:

- motion is the explanation;
- a proof or derivation benefits from transformation;
- geometry, vectors, limits, slopes, area accumulation, or physics motion are central;
- the user explicitly wants a video or animation.

Avoid Manim for static charts that matplotlib can produce more accurately.

## When To Use Matplotlib

Use matplotlib when:

- the visual is a probability distribution, regression, heatmap, contour, vector field, sampled simulation, or dense data plot;
- exact axes, ticks, legends, and publication-like styling matter;
- a static image can become a source asset for Manim or HTML.

Export SVG for vector clarity and PNG for raster-heavy plots.

## When To Add Quiz/Practice

Add retrieval checks for every non-trivial concept. Add a full quiz only when the user asks to practice, prepare for an exam, or diagnose mastery.

Questions should match the objective:

- Facts: recall.
- Concepts: explain in own words.
- Mechanisms: order or causality.
- Procedures: solve a mini-problem.
- Misconceptions: choose and correct the tempting wrong statement.
