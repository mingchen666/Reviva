---
name: research-brief-skill
description: "Lightweight source-backed research and synthesis for normal Reviva agents. Use when the user asks to summarize materials, compare sources, verify claims, collect evidence, create a short research brief, prepare slide/document inputs, or produce a Markdown/HTML brief without running the full deep-researcher pipeline."
allowed-tools: file_read, file_write, document_read, kb_search, web_search_bing, mcp:exa
---

# Research Brief Skill

Use this skill to produce a reliable, compact research brief from local files, knowledge base hits, and optional web search. It is for normal chat agents and task agents that need evidence-backed synthesis without the cost of the full `deep-research` workflow.

## When To Use

Use this skill for:

- summarizing uploaded documents into a cited brief;
- comparing several sources, documents, policies, products, papers, notes, or lesson materials;
- checking whether a claim, number, requirement, exam detail, curriculum point, or public fact has enough support;
- preparing source-backed content for PPT, lesson plans, review notes, office documents, reports, or HTML pages;
- creating a concise Markdown report and optional HTML display page.

Do not use this skill when the user explicitly asks for a long-form deep research report, multi-round investigation, full literature review, or exhaustive market/industry research. Route those tasks to the built-in `deep-researcher` agent with `deep-research`.

## Core Principle

Prefer trustworthy evidence over volume. A short answer with clear source boundaries is better than a long report that hides uncertainty.

Always distinguish:

- **User materials**: files or attachments supplied in the current task.
- **Knowledge base**: cloud KB search results selected by the user.
- **Web sources**: search results from `web_search_bing`, `mcp:exa`, or another available search tool.
- **Model knowledge**: general background that is not directly sourced; mark it as such when used.

## Source Intake

Handle files by type:

| Type | Tool | Rule |
| --- | --- | --- |
| `.md`, `.txt`, `.csv`, `.json`, source snippets | `file_read` | Read directly, in chunks when large. |
| `.docx`, `.pptx`, `.xlsx` | `document_read` | Use overview first, then text/targeted reads. Never use `file_read` on Office binaries. |
| `.pdf` | `document_read` | Use overview first, then page chunks. If unavailable, mark the PDF as not parsed; do not install dependencies. |
| Cloud KB docs | `kb_search` | Search the KB; do not pretend cloud KB docs have local paths. |
| Web pages/search results | `web_search_bing` / `mcp:exa` | Optional. Use only available tools and respect the parent agent's web-search setting. |

Do not auto-install Python packages, ASR models, browsers, scraping tools, or MCP servers.

## Workflow

1. **Clarify target briefly**
   - Identify the topic, output purpose, audience, deadline/currentness needs, and whether web search is allowed.
   - If the task is understandable, proceed without asking extra questions.

2. **Build an evidence map**
   - Read local/user materials first.
   - Search the selected knowledge base when the user has selected KB materials or asks to use workspace knowledge.
   - Use web search only when the user asks for current/public verification, the task requires facts not present in local materials, or the parent agent has already chosen web research.
   - Keep search light: normally 2-5 focused queries; stop when 3-6 useful sources cover the question.

3. **Assess source quality**
   - Prefer official, primary, recent, specific, and reproducible sources.
   - Treat blogs, forums, social posts, AI-generated pages, and unsourced summaries as weak evidence unless the task is about public opinion.
   - Mark outdated, inaccessible, paywalled, conflicting, or low-specificity sources.

4. **Synthesize**
   - Extract claims, facts, examples, definitions, numbers, and caveats.
   - Compare sources instead of merging conflicts silently.
   - Explain what is well-supported, what is uncertain, and what still needs user confirmation.

5. **Choose output**
   - Default: reply inline with a concise brief and source table.
   - If the user asks to save, share, hand off to PPT/DOCX, or says "报告/简报/展示页/HTML/Markdown/文件", write files.
   - For file output, generate Markdown first, then an HTML display page when useful.

## Markdown Brief

Use this structure unless the parent agent needs a different format:

```markdown
# [简报标题]

## 结论摘要
- [核心结论 1] [来源/资料标记]
- [核心结论 2] [来源/资料标记]

## 依据梳理
| 要点 | 依据 | 来源类型 | 可靠性 | 注意事项 |
| --- | --- | --- | --- | --- |

## 分析

## 不确定点与建议补充

## 来源表
| 编号 | 标题/文件 | 机构/作者 | 日期 | 类型 | 链接/路径 |
| --- | --- | --- | --- | --- | --- |
```

For education and learning tasks, add grade/subject/curriculum assumptions when relevant. For office tasks, add action-oriented recommendations and next steps.

## HTML Display Page

Generate HTML when:

- the user explicitly asks for HTML, webpage, visualization, display, shareable brief, or preview;
- the parent task is preparing a presentation, teaching material, briefing page, or report artifact;
- a compact visual summary would materially help the user review the evidence.

HTML is a display layer, not the full research archive. Keep it concise and self-contained.

HTML requirements:

- Single `.html` file, all CSS/JS inline.
- No CDN, external fonts, remote images, external scripts, trackers, or network requests.
- System font stack only.
- Responsive layout with no horizontal overflow on mobile.
- Include: title, 3-6 key findings, evidence matrix, limitations, and source table.
- Use simple CSS cards/tables; add inline SVG or CSS charts only when the data is real and sourced.
- Do not hide uncertainty behind polished visuals.

Suggested HTML sections:

```text
Header: title, purpose, date, source scope
Key findings: 3-6 cards with source marks
Evidence matrix: claim / evidence / reliability / caveat
Implications or next steps
Limitations
Sources
```

## Reliability Rules

- Do not fabricate URLs, document titles, page numbers, official wording, dates, authors, or statistics.
- If search is unavailable or GitHub/official sites are inaccessible, say so and continue with local materials, KB, or clearly marked general knowledge.
- If local documents and web sources conflict, surface the conflict and recommend which source should be treated as authoritative.
- If the task needs current facts but web search is unavailable, label the answer as "未联网核验".
- Avoid over-searching. For normal agents, this skill should stay lightweight.

## Handoff Rules

- For PPT or lesson slides: hand the synthesized source notes to `pptx-deck-skill`, `html-ppt-skill`, `ai-animation-skill`, or `officecli-skills`.
- For teacher-specific resource gathering, coordinate with `teaching-resource-research-skill` when the task is about curriculum standards, teaching cases, public classroom resources, or educational media.
- For final review/exam tasks, hand concepts, source-backed scope, and uncertain exam claims back to `review-plan`, `knowledge-organize`, `practice-quiz`, or `exam-prep`.
- For long, high-stakes research, escalate to `deep-researcher`.

## Final Response

When files are produced, list:

- Markdown path
- HTML path, if generated
- 2-4 sentence summary
- important limitations or sources that could not be verified

Do not include temporary paths.
