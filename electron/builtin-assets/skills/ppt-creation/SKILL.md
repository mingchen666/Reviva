---
name: ppt-creation
description: Create polished presentations from notes, documents, research, or rough requirements. Plans slide structure, reduces text density, chooses visual patterns, and produces HTML-first decks with optional PPTX export.
---

# PPT Creation

Use this skill when the user asks to create, improve, or export a presentation.

## Workflow

1. Clarify the presentation goal, audience, scenario, page count, and output format from the user request.
2. Read attached files or knowledge-base context before planning slides.
3. Use Exa MCP for online research when external facts are needed. Use Bing search as a fallback when Exa is unavailable or insufficient.
4. Create a concise slide outline before generating slides. Each slide should have one primary idea.
5. Build an HTML presentation first. Keep CSS and JavaScript inline so the deck is portable.
6. Export PPTX only when the requested format is `pptx-local`.
7. Review the final file for layout overflow, contrast, hierarchy, and text density.

## Slide Rules

- Use Chinese for user-facing content unless the user asks otherwise.
- Keep each slide focused. Avoid dense paragraphs and long bullet lists.
- Prefer charts, comparison layouts, timelines, process diagrams, and key-number layouts over plain text.
- Make titles specific and useful, not generic.
- Keep visual style consistent across the deck.
- Write outputs under `/agents/ppt-generator/outputs/{date}/`.

## HTML Requirements

- Generate a single self-contained HTML file.
- Use a stable slide root such as `<div class="slide slide-{type}" data-type="{type}">`.
- Support keyboard navigation with left and right arrow keys.
- Include page indicators.
- Use responsive sizing for 16:9 desktop presentation viewports.

## PPTX Export

When the user requests `pptx-local`, read the generated HTML path and use `pptx_export_local`. Keep the PPTX in the same output directory as the HTML file.
