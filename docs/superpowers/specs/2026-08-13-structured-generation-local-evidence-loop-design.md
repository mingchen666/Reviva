# Structured Generation Local Evidence Loop

## Goal

Give every structured creation tool a bounded, evidence-driven local-document reading loop. The system must be able to revisit selected local documents through `document_read` when the initial overview and excerpt do not support a reliable artifact.

This applies to mind maps, graphs, flashcards, quizzes, charts, Q&A, glossaries, and cheatsheets. PPT and deep research keep their existing DeepAgent flows and are out of scope.

## Current Gap

`FileContextReader` reads selected local documents once at task start. Office and PDF files receive an overview plus an initial text slice; plain-text files receive a leading byte slice. The existing evidence planner can request more knowledge-base, Wiki, or web evidence, but cannot request a deeper local-document read.

Consequently, relevant material later in a long PDF, Word document, spreadsheet, or presentation can be missed even though the user selected it as the primary source.

## Design

### Evidence Budget

Each structured generation task receives a shared follow-up evidence-tool budget of 20 calls after its mandatory initial local-document catalog/overview pass. The mandatory pass remains bounded by the existing selected-file limit and per-read content limits; it is not silently expanded by this feature. A follow-up call is one targeted read or retrieval operation, not one model reasoning turn.

The evidence planner may run at most five decision cycles. It stops early when the evidence is sufficient, a request would duplicate an already read range or query, no source can provide new evidence, the task is cancelled, or the normal task timeout is reached.

The collector retains the existing per-source limits and prompt compaction. It must not concatenate full documents into the final model prompt.

### Local Document Source

The initial pass builds a local-source catalog for every readable selected file. Each catalog entry includes a stable source identifier, display name, virtual/local path, source kind, initial overview, `document_read` continuation metadata where available, and a record of previously read ranges.

For PDF and Office files, local deep reads use `document_read`:

- Begin with the continuation returned by `document_read(..., mode="overview")` whenever it is relevant.
- Use returned `next` metadata to read bounded page, line, sheet, or slide ranges.
- Request images or OCR only when the overview explicitly indicates that they are needed and the existing confirmation rules permit it.

For plain-text files, deep reads use bounded byte/line windows from the selected path. For media, the existing `media_read` query/transcript behavior remains the local evidence mechanism; this change must not attempt to read media binaries.

### Planner Contract

The evidence decision planner gains `local` as a valid source. A local-search decision contains up to two concise evidence needs and the target source IDs. It may request a continuation range returned by the prior read, or a query-driven local read when the source type supports it.

The planner sees a compact local-source catalog rather than complete document bodies: names, kinds, short overviews, unread continuations, prior reads, and compact evidence excerpts. It cannot request arbitrary filesystem paths; targets must be selected sources from the catalog.

The collector validates every decision before execution:

- target source belongs to the user-selected context;
- range is valid and has not already been read;
- the per-file consecutive-read cap and global 20-call budget allow it;
- the requested mode is supported by that source type.

Invalid or repeated decisions are discarded and recorded as an unavailable attempt so the next planner call cannot loop on them.

### Loop Order

1. Read selected local sources once and collect compact initial evidence plus the local-source catalog.
2. Retrieve initial knowledge-base/Wiki evidence as currently configured; web remains supplementary and is not searched by default when grounded local evidence exists.
3. Ask the planner whether the current evidence is sufficient or which source needs a targeted follow-up.
4. Perform only the approved follow-up reads/retrievals, append compact evidence, and record the call and range.
5. Repeat through at most five decisions and 20 total follow-up evidence calls, then generate and validate the structured artifact using compacted evidence.

Local sources have priority: when a factual gap can be answered from a selected local document, local deep read precedes KB, Wiki, or web retrieval. External sources remain useful for material not present in the selected documents.

## Failure Handling

- An unreadable file, failed `document_read`, or unsupported range produces a warning and leaves other sources usable.
- A planner failure falls back to one conservative, non-duplicate local continuation only when initial evidence is materially insufficient and a safe continuation exists; otherwise the current evidence is used.
- OCR confirmation is never bypassed.
- The artifact prompt records skipped media and uses only successfully retrieved evidence.

## Observability

Task progress reports distinguish initial document reading, local document follow-up, KB/Wiki/web retrieval, evidence evaluation, and artifact generation. The task result parameters retain a compact evidence audit: source type, source name/ID, query or range, call number, and outcome, without retaining full document contents.

## Tests

- A long selected PDF/Office document causes a follow-up `document_read` only when the planner selects an unvisited continuation.
- The collector rejects a path outside selected context and duplicate page/line ranges.
- Five decision cycles and 20 evidence calls are hard caps; early `finish` prevents further calls.
- Local deep reading is prioritized over external retrieval for a local-only fact gap.
- Plain text and media retain their supported bounded reading paths.
- Existing structured generation behavior works when no local documents are selected.
