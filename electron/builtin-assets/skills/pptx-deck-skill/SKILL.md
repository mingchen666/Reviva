---
name: pptx-deck-skill
description: OfficeCLI native PPTX deck design layer. Use when the user wants a polished, editable .pptx presentation for education, learning, office reporting, training, research briefs, proposals, courseware, review decks, or a custom creative deck. This skill does not replace officecli-skills; it chooses scene templates, visual systems, layouts, QA rules, and then uses officecli-skills with office_write to create the native PPTX.
allowed-tools: office_read, office_write, file_read
---

# PPTX Deck Skill

This skill is the design and template layer for **native editable PPTX** decks in Reviva.

It does not teach every OfficeCLI command. For Office operations, inherit `officecli-skills` and its `references/pptx.md`. This skill decides:

- which presentation scene fits the user request;
- which slide arc, theme, and layout recipes to use;
- how to combine education, learning, office, and custom creative scenarios;
- when to route to `ai-animation-skill` instead of PPTX;
- what quality checks must pass before delivery.

## Relationship To Other Skills

Use the smallest set that satisfies the user:

| User need | Skill route |
| --- | --- |
| Editable PowerPoint file, native PPTX, can keep editing in Office/WPS | `pptx-deck-skill` + `officecli-skills` + `office_write` |
| HTML slides, browser presentation, speaker mode, rich themes | `html-ppt-skill` |
| Science/teaching/technical animation, flow animation, video-friendly demonstration | `ai-animation-skill` |
| Both editable PPTX and animation page | Create PPTX with this skill; create the animated companion with `ai-animation-skill` |
| Existing PPTX cleanup or template update | `officecli-skills`, optionally this skill for redesign guidance |

Do not convert HTML by renaming it to PPTX. If both formats are requested, build them as two deliberate outputs.

## Required References

Read only what the task needs:

- `references/routing.md` - scene selection and AI creative branch.
- `references/themes.md` - native PPTX theme tokens.
- `references/layouts.md` - reusable layout recipes.
- `references/qa.md` - delivery checklist.
- `references/templates/*.md` - scene-specific deck arcs.

For all low-level PPTX actions, also use:

- `../officecli-skills/SKILL.md`
- `../officecli-skills/references/pptx.md`
- `../officecli-skills/references/pitch-deck.md` only for real fundraising decks.

## Default Workflow

1. Classify the request with `references/routing.md`.
2. If the user did not specify format and says only "PPT", ask once whether they want editable PPTX or HTML. If the user wants Office/PowerPoint/editability, continue here.
3. Pick one scene template from `references/templates/`.
4. Pick one theme from `references/themes.md`, adapting colors to user brand or subject if provided.
5. Create a slide-title list first. If the title list alone does not tell a coherent story, fix the arc before creating the file.
6. Choose layout recipes from `references/layouts.md`; vary the geometry across adjacent slides.
7. Use `office_write(operation="create", format="pptx")` and prefer `useBatch=true` for stable multi-slide creation.
8. Add speaker notes for every content slide.
9. Inspect with `office_read` and apply `references/qa.md`.
10. Return the output path and a short summary. Do not paste the whole deck content into chat.

## Hard Rules

- Native PPTX means `office_write`, not HTML export and not `pptx_export_local`.
- Every slide has one primary idea.
- Titles are content-bearing, not generic labels like "Overview" or "Background" unless the scene requires them.
- Body text should normally be at least 18pt; slide titles normally at least 36pt.
- Every content slide needs an informing visual: chart, process, comparison, diagram, image, table, stat callout, or structured layout.
- Avoid AI-slide tells: decorative title underline, colored left-border cards, emoji icons, fake dramatic copy, and excessive rounded cards.
- For education and learning decks, prioritize clarity over decoration: definitions, examples, worked steps, retrieval prompts, and recap slides.
- For office decks, prioritize scanning: executive summary, risks, next actions, owners, dates, numbers, and decision points.
- For custom creative decks, AI may combine templates and motifs, but must still obey the grid, type hierarchy, contrast, and QA rules.

## Dual Output With AI Animation

When the user asks for a teaching, science, process, architecture, or technical explanation that would benefit from motion:

1. Build the editable PPTX with this skill if the user needs a file for Office/WPS.
2. Build an HTML animation companion with `ai-animation-skill` if the user needs explanation, video recording, or classroom demonstration.
3. Keep the visual language related, but do not force identical layouts. PPTX should be editable; HTML animation should be explanatory and motion-first.

Example final delivery:

- `lesson-network-layers.pptx` - editable classroom slides.
- `lesson-network-layers-animation.html` - animated process explanation for live demo/video.

