---
name: officecli-skills
description: Unified OfficeCLI skill for creating, reading, and editing Office files. Use for any .docx, .pptx, or .xlsx task, including Word documents, PowerPoint decks, Excel workbooks, academic papers, pitch decks, financial models, dashboards, and fillable Word forms. This is the only top-level OfficeCLI skill; route to the specific reference files under references/ as needed.
allowed-tools: office_read, office_write
---

# OfficeCLI

OfficeCLI is the unified Office skill for `.docx`, `.pptx`, and `.xlsx` work. It covers reading, creating, and editing Office files through Reviva's controlled tools and the local `officecli` runtime.

This is the top-level router skill. Do not load every reference file by default. Load only the reference files needed for the current task.

## Runtime Setup

Use the shared Reviva OfficeCLI runtime:

- Reviva on Windows prefers the bundled `officecli` binary.
- If the bundled binary is missing or unavailable, Reviva falls back to system `officecli` from PATH.
- Check availability in `设置 > 环境检测 > OfficeCLI`.
- Do not run install commands automatically unless the user explicitly asks.
- When a property, path, enum, or element name is uncertain, ask `officecli help <format> <element> --json` before guessing.

Reference files may contain legacy standalone Setup sections copied from their original skills. Treat this section as authoritative inside Reviva.

Reference files may also keep their original YAML frontmatter names, such as `officecli-docx` or `officecli-xlsx`. Treat those names as source metadata only. The recommended top-level skill to bind is this unified `officecli-skills` skill.

## Tool Pairing

Office work is a Skill + Tool pairing:

- Skill: decides how to plan and structure the Office artifact.
- Tool: decides whether the Agent may actually read, create, or edit files.

Expected tool pairing:

- `office_read`: read `.docx`, `.pptx`, `.xlsx`; safe enough to be a default system tool.
- `office_write`: create and edit `.docx`, `.pptx`, `.xlsx`; write capability and should be explicitly enabled.

If `office_write` is unavailable, plan the work and explain what would be changed, but do not claim the file was created or edited.

## Routing

Choose the smallest set of references that covers the request.

| User intent | References |
| --- | --- |
| General Word document, report, memo, letter, proposal, docx editing | `references/docx.md` |
| Academic paper, thesis, citation style, bibliography, footnotes/endnotes, equations, cross-references | `references/docx.md` + `references/academic-paper.md` |
| Fillable Word form, content controls, form fields, mail merge, protected form, contract/SOW template | `references/word-form.md` |
| General PowerPoint deck, slides, presentation, template, speaker notes, comments | `references/pptx.md` |
| Fundraising deck, investor deck, seed/Series A/B/C pitch | `references/pptx.md` + `references/pitch-deck.md` |
| General Excel workbook, spreadsheet, tracker, CSV import, formulas, charts, pivot tables | `references/xlsx.md` |
| Financial model, 3-statement, DCF, LBO, SaaS unit economics, sensitivity/scenario analysis | `references/xlsx.md` + `references/financial-model.md` |
| Excel dashboard, KPI dashboard, executive dashboard, CSV to dashboard, analytics dashboard | `references/xlsx.md` + `references/data-dashboard.md` |

Reverse routing rules:

- Do not use `pitch-deck` for a generic board review, sales deck, all-hands, or product launch. Use `pptx`.
- Do not use `financial-model` for a simple budget tracker, CSV dump, or operational KPI sheet. Use `xlsx`.
- Do not use `data-dashboard` for a one-chart weekly report or simple formatted table. Use `xlsx`.
- Do not use `academic-paper` for ordinary reports or memos. Use `docx`.
- Do not use `word-form` for non-fillable documents. Use `docx`.

## Standard Workflow

### Existing Files

1. Identify the file format from extension.
2. Load only the necessary references.
3. Read the file first with `office_read(mode="overview")`; do not edit blind.
4. Read relevant text, outline, stats, issues, or images as needed.
5. Plan the edits as structured actions.
6. Execute through `office_write` only when write access is available.
7. Re-read or inspect the result enough to summarize what changed.

### New Files

1. Identify target format and output path.
2. Load the necessary references.
3. Build a concise artifact plan: structure, layout, data model, or slide/page list.
4. Execute creation through `office_write(operation="create")`.
5. Inspect the result with `office_read` or relevant OfficeCLI views.
6. Return the output path and a short creation summary.

## Safety

- Default to creating a new output file instead of overwriting the source.
- Never claim an edit happened unless `office_write` returned success.
- Do not expose arbitrary `officecli` command execution as the product interface.
- Prefer typed actions over raw XML.
- `raw-set` is a last-resort bridge and should remain disabled unless the product explicitly enables a narrow, template-backed action.
- For destructive actions like `remove`, require precise paths and keep the scope narrow.
- Do not write outside authorized workspace paths.
- Do not use cloud knowledge-base documents as local files; use `kb_search` for cloud knowledge.

## Action Layers

Prefer these layers in order:

1. High-level structured actions: `add_heading`, `add_table`, `add_picture`, `add_chart`, `set_cell`, `set_range`, `add_slide`, `replace_text`.
2. Typed OfficeCLI primitives: `add`, `clone`, `set`, `remove`, `query`, `get`.
3. Dotted properties inside typed primitives, such as `font.color`, `pbdr.bottom`, `calc.fullCalcOnLoad`.
4. `batch` through `office_write(useBatch=true)` for many stable actions.
5. `raw_set` through explicit `allowRawXml=true` and per-action `confirm=true` when typed actions cannot express the required OpenXML change.

Inside Reviva, `office_write` exposes common actions plus format shortcuts:

- Word: paragraphs, headings, tables, pictures, comments, fields, headers, footers, form controls.
- PowerPoint: slides, shapes, text boxes, pictures, charts, speaker notes, connectors.
- Excel: sheets, cells, ranges, formulas, tables, charts, defined names.

For uncommon elements or uncertain props, call `office_write(operation="help", format, element, verb)` before creating actions.

Use `useBatch=true` when applying many stable actions, especially Excel formulas/ranges, PPT layout construction, and form field batches. The Agent may decide this per task. Avoid batch for exploratory edits where individual warning output is important.

Use `raw_set` only for documented OfficeCLI fallback cases such as SDT dropdown items, date formats, field cache patches, workbook activeTab, or targeted XML cleanup. The Agent may decide this when typed actions cannot express the change, but must set `allowRawXml=true` and `confirm=true` on each raw action. Prefer typed `set` when a dotted property exists. Reviva forces post-write issues/validate checks for batch and raw_set.

## QA Expectations

Do not treat `validate` as proof of quality. Each format has different failure modes:

- Word: heading hierarchy, TOC/footer fields, placeholder leakage, layout rhythm.
- PowerPoint: overflow, dark-on-dark text, misalignment, missing alt text, missing speaker notes in pitch decks.
- Excel: formula errors, stale cached values, `###` overflow, chart title/series placeholders, cross-sheet formula quoting.
- Word forms: missing SDT alias/tag, unlocked protected regions, broken field names, placeholder leakage.

Use the relevant reference file's QA section for format-specific checks.

## Reference Files

The long-form rules live under `references/`:

- `references/docx.md`
- `references/pptx.md`
- `references/xlsx.md`
- `references/academic-paper.md`
- `references/pitch-deck.md`
- `references/financial-model.md`
- `references/data-dashboard.md`
- `references/word-form.md`

Read only what the task requires.
