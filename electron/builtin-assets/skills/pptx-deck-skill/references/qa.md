# PPTX Delivery QA

Run this before claiming the PPTX is finished.

## Structural Checks

- The output is a real `.pptx` created or edited with `office_write`.
- Slide count matches the planned arc.
- Title list alone tells a coherent story.
- Every content slide has speaker notes.
- No slide is a bullet-only document page unless it is a deliberate summary table.

## Visual Checks

- Titles are normally at least 36pt.
- Body text is normally at least 18pt.
- No text overflows, clips, or runs off slide.
- Margins and gaps are consistent.
- No low-contrast text on dark or saturated fills.
- Visual motif is consistent across the deck.
- Adjacent slides do not feel like duplicated templates.

## Content Checks

- One idea per slide.
- No placeholder tokens: `TODO`, `TBD`, `{{name}}`, `lorem`, `xxxx`.
- No fake citations, page numbers, metrics, or sources.
- User-provided facts are preserved.
- Added general knowledge is marked or phrased cautiously.

## Scene Checks

Education/learning:

- Clear learning objective or orientation.
- Includes examples, practice/checkpoint, or recap when appropriate.
- Avoids over-dense textbook pages.

Office:

- Includes decision, status, risk, owner, or next action where relevant.
- Numbers include period/context.
- Tables are scan-friendly.

Custom creative:

- Creative style does not break editability.
- Visual impact comes from composition and motif, not clutter.

## Tool Checks

- If OfficeCLI behavior or property names are uncertain, call `office_write(operation="help", format="pptx")`.
- After creation, inspect with `office_read` enough to summarize the result.
- If `office_write` fails, do not claim the PPTX was created. Offer HTML or Markdown fallback only with clear wording.

