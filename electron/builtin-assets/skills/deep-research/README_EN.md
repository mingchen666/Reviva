# deep-research Skill for Reviva

This is the dedicated core skill for Reviva's built-in `deep-researcher` agent. It is adapted from the hoolulu/deep-research methodology for Reviva's built-in agent runtime. At runtime, `SKILL.md`, `RULES.md`, `TYPES.md`, `profiles.json`, `prompts/`, and the built-in agent configuration are authoritative.

## Purpose

Use this skill for longer research tasks such as learning and education research, teacher preparation, document-based synthesis, office research, policy interpretation, industry analysis, and competitor scans. It is not the lightweight lookup path for normal chat agents; normal agents should use `research-brief-skill` for compact source checking and brief generation.

## Sources

- User-provided local files and attachments.
- Markdown, TXT, CSV, JSON, and similar text files via `file_read`.
- DOCX, PPTX, and XLSX via `office_read`.
- PDF via `pdf_read`; if unavailable, mark the PDF as not parsed and do not install dependencies.
- Cloud knowledge base content via `kb_search`.
- Optional web search through whatever tools are actually available, such as `web_search_bing`, `mcp:exa`, or `mcp:jina-mcp-server`. No single provider is required.

## Outputs

Default output directory:

```text
/agents/deep-researcher/outputs/{today}/
```

Default artifacts:

- `research-report.md`: full Markdown research report with structure, citations, source table, and limitations.
- `research-report.html`: self-contained HTML display page for quick review and presentation preview. It does not replace the full Markdown report.

Intermediate files are kept under the workspace-authorized virtual directory `/tmp/deep-researcher/{today}/deep-research-{timestamp}/`. Reviva scans the output directory with artifact rules. Do not write reports or temporary files into the skill directory, and do not generate or refresh `reports-browser`.

## Runtime Rules

- `/skills/deep-research/` is read-only.
- Do not run `git pull`, `git clone`, or overwrite the built-in skill at runtime.
- Do not auto-install Python packages, Scrapling, SearXNG, browsers, ASR models, or other external dependencies.
- If external search, webpage reading, MCP tools, or helper scripts are unavailable, degrade gracefully instead of failing.
- Prefer local materials when supplied. Clearly state source gaps, search failures, and conflicting evidence.
- Do not fabricate sources, URLs, page numbers, official wording, dates, authors, or statistics.

## Maintenance

This directory ships with the Reviva application. Updates should be made by developers in `electron/builtin-assets/skills/deep-research/` and released with the app, not pulled by an agent on the user's machine.

## Source

Adapted from [hoolulu/deep-research](https://github.com/hoolulu/deep-research), MIT License.
