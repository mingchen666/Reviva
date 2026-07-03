# deep-research Skill

<p align="center"><a href="README.md">中文</a> · <b>English</b></p>

**Deep Research Report Generation Skill — One command, ten minutes, institutional-grade deep research report**

Multi-agent autonomous search, scrape, write, and QA — feed it a topic, get a citable, browsable, exportable research report in Chinese or 19 other languages.

Benchmarked against institutional research structure: conclusions-first, traceable sources, counter-arguments, scenario forecasting. Supports quick / standard / deep tiers, with automatic language detection across 19 languages.

Built for industry research, trend foresight, competitive scanning, policy analysis, technology deep-dives, and investment memos — not a handful of search summaries, but a report you can actually use.

> **Current version:** [View updates](https://github.com/hoolulu/deep-research/commits/main)
>
> 📂 **Browse all sample reports →** [H33研报· 深度调研报告集](https://www.h33.top)
> — filter, sort, and browse by language and depth.

---

### ✨ At a Glance

<table width="100%">
<tr><td style="white-space: nowrap; width: 1%;"><b>🎯 One command</b></td><td><code>/research &lt;topic&gt;</code> → fully automated research, zero manual intervention</td></tr>
<tr><td style="white-space: nowrap;"><b>⏱ Report in ~10 min</b></td><td>quick mode ~8–12 min, standard ~10–15 min</td></tr>
<tr><td style="white-space: nowrap;"><b>🌍 19 languages</b></td><td>Auto-detects topic language, generates report in the same language</td></tr>
<tr><td style="white-space: nowrap;"><b>🔧 Not OpenCode-exclusive</b></td><td>Adaptable for Claude Code, Cursor, Codex CLI, Windsurf, Cline and more</td></tr>
<tr><td style="white-space: nowrap;"><b>📁 Local file research</b></td><td>Also supports PDF/DOCX/TXT/MD, no internet needed, auto-parsed</td></tr>
<tr><td style="white-space: nowrap;"><b>🖥️ Local report browser</b></td><td>Auto-refreshed as a local browser page after each run<br><code>reports-browser/index.html</code> — search, filter, sort, preview</td></tr>
<tr><td style="white-space: nowrap;"><b>📄 PDF/DOCX export</b></td><td>Export reports as PDF or DOCX from the preview modal — fully client-side, no server required</td></tr>
</table>

<table width="100%">
<tr><th>Command</th><th>Result</th></tr>
<tr><td style="white-space: nowrap;"><code>/research 中国新能源汽车产业发展现状</code></td><td>中文报告</td></tr>
<tr><td><code>/research Competitive landscape of AI cloud computing</code></td><td>English report</td></tr>
<tr><td><code>/research Анализ рынка нефти и газа в России</code></td><td>Отчёт на русском</td></tr>
<tr><td><code>/research 日本のアニメ産業のグローバル市場戦略</code></td><td>日本語レポート</td></tr>
<tr><td><code>/research 한국 반도체 산업의 글로벌 경쟁력 분석</code></td><td>한국어 보고서</td></tr>
<tr><td><code>local file research, see FAQ for prompts</code></td><td>offline mode, read local files</td></tr>
</table>

> It interacts with you entirely in the language you set and searches for materials in that target language — not a simple translation pipeline.

---

## 1. Why You Need This

If you've ever asked AI to do research, you've likely hit these walls:

- Search + summarize → too shallow, just a few bullet points
- Industry reports at $50–500+ each → too expensive for individuals
- Overseas tools → can't search Chinese sources like Baidu Baike, Zhihu, 199IT, iResearch
- AI fabricates numbers → looks reasonable but has no traceable source

This skill follows a **4-stage pipeline** before delivering a report. Not search-and-dump — it's analyze → search+verify → write → verify.

## 2. Who It's For

**Indie developers**, **independent researchers**, **small teams**.
People who need professional-grade research capabilities without relying on paid databases or research institutions.

## 3. Typical Output (Standard Mode)

| Metric | Data (standard mode example) |
|--------|------------------------------|
| Report length | 500-700 lines / ~12,000-20,000 chars (varies by language) |
| Data tables | 15-25, covering market size, competitive landscape, technical specs |
| Analysis paragraphs | 80-120 (each with conclusion + data + causation + judgment) |
| Unique sources cited | 15-25 (Chinese and international institutions) |
| Opposing viewpoints | 3-8, at least one controversy per chapter |
| Data collection | ~1-3 min |
| Report generation | ~8-15 min |
| Total time | ~10-20 min |

> Above ranges for standard mode. Actual times vary by topic complexity and data availability.

### 📖 Featured Reports

| Report | Tags |
|--------|------|
| <a href="reports/en/Global AI Chip Market Landscape and Competitive Dynamics 2026-20260609-170008.md" target="_blank">Global AI Chip Market Landscape and Competitive Dynamics 2026</a> | AI · Semiconductors |
| <a href="reports/en/The Feasibility of Mars Colonization- Radiation, Water Ice, Terraforming, and Global Mission Plans-20260612-163636.md" target="_blank">The Feasibility of Mars Colonization</a> | Space · Technology |
| <a href="reports/en/Electric Vehicle Battery Supply Chain and Raw Material Geopolitics 2026-20260609-171947.md" target="_blank">Electric Vehicle Battery Supply Chain and Raw Material Geopolitics 2026</a> | Energy · Geopolitics |
| <a href="reports/en/GenAI Enterprise Adoption Trends & ROI Measurement in 2026-20260609-174525.md" target="_blank">GenAI Enterprise Adoption Trends & ROI Measurement in 2026</a> | AI · Enterprise |
| <a href="reports/en/Cross-border E-commerce Logistics Trends in Southeast Asia 2026-20260609-165623.md" target="_blank">Cross-border E-commerce Logistics Trends in Southeast Asia 2026</a> | E-commerce · Logistics |

Click a report title to open and read it in a new window.

## 4. Cost

| Component | Cost |
|-----------|------|
| **LLM (already using)** | **DeepSeek v4 Flash** baseline: quick ~100–150k tokens / < $0.03, standard ~150–300k / < $0.06, deep ~300–500k / < $0.10 |
| **SearXNG search (author-deployed)** | Deployed on VPS, zero cost, unlimited usage |
| **Scrapling fetching** | Runs locally, zero cost |
| **Domestic sources** | Direct connection, zero cost, no proxy needed |
| **OpenCode runtime** | MIT open source, zero cost |

> Estimates based on DeepSeek v4 Flash ($0.14/1M input, $0.28/1M output, source: `https://api-docs.deepseek.com/quick_start/pricing`). Actual costs vary by cache hit rate and topic complexity.

## 5. How It Works

The pipeline runs in 4 automated stages:

```
① Analyze outline — Analyze topic, generate research framework and search plan
         ↓
② Collect data — ╭─ Online: SearXNG + sources.json parallel search → quality-triggered reinforcement → Scrapling batch fetch → data pool
                  ╰─ Offline: read local files directly (PDF/DOCX/TXT/MD) → data pool
         ↓
③ Serial writing — One chapter at a time synchronously, facts embedded directly in prompts, no tool calls
         ↓
④ Validate & assemble — Batch validate → assemble-report → convert-citations → escape-currency → qa-report
```


## 6. Search Pipeline & Built-in Resources

All tools are built-in, no additional purchase needed. The system uses a **CLI built-in engine + SearXNG + quality-triggered reinforcement** strategy: CLI built-in search (Layer 0, auto-detected at runtime, e.g., OpenCode's Exa websearch) runs as primary along with SearXNG (Layer 1, author-deployed, 70+ engines incl. Baidu/Google/Brave) and sources.json (Layer 2, 30+ curated quality sources) — all searched in **parallel** — results are merged and deduplicated. Free source reinforcement (Layer 3) is triggered only when search result quality is insufficient (< 3 URLs per sub-question / outdated results / too few sources).

```
Layer 0 — CLI built-in engine (auto-detected at runtime, e.g., OpenCode Exa websearch)
  + SearXNG (Layer 1, author-deployed primary, 70+ engines, ready out of the box)
  + sources.json (Layer 2, 30+ curated sources)
  ∥ parallel search, results merged & deduplicated
  ↓ triggered when search quality is insufficient
Layer 3 — Free source reinforcement (fallback)
  ├─ Search line          │  Known-source line
  ├─ DuckDuckGo           │  Baidu Baike / Wikipedia
  ├─ Bing (China)         │  Zhihu / 36Kr / The Paper
  ├─ Brave / Mojeek       │  199IT / iResearch / East Money
  ├─ Semantic Scholar     │  National Bureau of Statistics / Weibo / CSDN
  └─ GDELT / arXiv        │  Douban / Huxiu
```

> The search reinforcement line can **dynamically discover** any website, not limited to the list above. All source URLs are ultimately batch-fetched by Scrapling.

## 7. Report Highlights

| Dimension | Description |
|-----------|-------------|
| **Multilingual native writing** | Auto-detects topic language, writes directly in 19 languages, no translation pipeline |
| **Every number has a source** | `(N)` clickable citations in text, full reference list at end. No source = no number |
| **Pros and cons coexist** | Every chapter presents controversies and opposing views |
| **Confidence grading** | Final summary table (high/medium/low) shows what's reliable vs. disputed |
| **Data anti-pitfall** | Auto-detects common data errors — wrong units, fabricated trends, misattributed sources |
| **Paragraphs over padding** | 8-12 substantive paragraphs per chapter as core, tables can't pad the length |

## 8. Three Depth Modes

| Command | Purpose | Min chapters | Min paragraphs/chapter | Target chars | Est. time |
|---------|---------|-------------|----------------------|--------------|-----------|
| `/research <topic>` | standard (default) | 8 | ≥ 5 | ≈ 25,000 | ~10–15 min |
| `/research <topic> -quick` | Quick insight | 5 | ≥ 4 | ≈ 15,000 | ~8–12 min |
| `/research <topic> -deep` | Maximum depth | 10 | ≥ 6 | ≈ 45,000 | ~15–25 min |

> Parameters in `profiles.json`, restart to apply. Char count excludes whitespace and Markdown syntax.

## 9. Installation

### 🧠 Method 1: AI Auto-Install (Recommended)

Copy this prompt into OpenCode chat, the AI will do everything automatically:

```text
Please read the https://github.com/hoolulu/deep-research project and follow the documentation to:
1. Install prerequisites (determine method based on Scrapling docs and your OS)
2. Register the Scrapling MCP Server, verify it works after CLI restart
3. Register the /research and /research-update commands
Confirm each step, then read VERSION and summarize the installation status.
```

The AI reads the docs → understands your system → installs step by step → verifies. No manual commands needed.

### 🔧 Method 2: Non-OpenCode Users (Claude Code / Codex CLI / Cursor etc.)

Paste this into your AI coding tool:

```text
Please read the https://github.com/hoolulu/deep-research project, auto-install prerequisites and adapt for the current CLI tool:
1. Install Python and Scrapling (refer to Scrapling docs and your system)
2. Register Scrapling MCP Server, verify after restart
3. Register equivalent entry points for /research and /research-update based on the current tool's capabilities:
   - **Codex CLI** → Register as a skill (the `command/` directory already contains command files; registration activates them)
   - **Claude Code** → Register as a slash command (Hook)
   - **Cursor** → Adapt per platform (custom commands / Agent rules)
   - Other tools: check for skill/command mechanisms first, then pick the best fit
4. Translate the multi-agent chain architecture (outline → data collection → parallel writing → assembly+QA) to the current tool's equivalent
5. If multiple CLI tools are installed, only configure the current tool — do not affect other CLI tools on this machine.

Confirm each step, then read VERSION and summarize.
```

Adaptation notes: Multi-agent orchestration needs to map to each platform's native mechanisms (Claude Code's sub-agent, Codex CLI's agent/skill mode, Cursor's agent mode, etc.). Entry point registration also varies by tool (OpenCode/Codex CLI use skills, Claude Code uses Hooks/commands, Cursor uses custom instructions). Search and scraping logic (python-scrapling + search API) can be reused as-is.

### Prerequisites

| Component | Online mode | Offline mode | How to get |
|-----------|:-----------:|:------------:|------------|
| **LLM runtime** (OpenCode / Claude Code / Codex CLI / Cursor etc.) | ✅ Required | ✅ Required | Pick your preferred tool |
| **Scrapling** | ✅ Required | ❌ Not needed | For web scraping; offline mode doesn't need it |
| **SearXNG** (author-deployed, 70+ engines) | ✅ Used | ❌ Not needed | Built-in endpoint, ready out of the box |

> **Platform note**: OpenCode has native multi-agent orchestration (Task 1-4 architecture) — no additional plugins needed. Other tools (Claude Code, Cursor, Codex CLI) have their own native multi-agent frameworks and can adapt this skill's workflow directly. Offline mode only needs the LLM's file-reading capability — no search/scraping components required.

## 10. Usage

After installation and restart, type in the chat:

| Command | Description | Est. time |
|---------|-------------|-----------|
| `/research <topic>` | standard mode (online search) | ~10-15 min |
| `/research <topic> -quick` | quick mode (online search) | ~8-12 min |
| `/research <topic> -deep` | deep mode (online search) | ~15-25 min |
| `local file research` | offline mode (local files) | depends on file size |
| `/research-update` | Check for updates | — |

> Local file research: see FAQ §2 "How to use local materials for report generation?" for exact prompts.

### What Happens After You Send It

The entire pipeline runs automatically — you don't need to do anything:

```
① Analyze outline — Analyze topic, generate framework and search plan
② Collect data — SearXNG + sources.json parallel search → quality-triggered reinforcement → Scrapling batch fetch → data pool → quality check
③ Parallel writing — All chapters simultaneously, facts embedded in prompts
④ Validate & assemble — Batch validate → assemble → citations → QA
```

> Total ~10-20 minutes. Complex topics may take longer, simple ones may be faster.

### Output Files

Reports are saved as Markdown files in the skill's `reports/` directory, with date-timestamped filenames:

```
~/.opencode/skills/deep-research/reports/
```

Open with any Markdown reader (Typora / Obsidian / VS Code etc.).

You can also specify a custom output path — ask AI to configure it.

**Local report browser page**: After each research run, AI auto-refreshes `reports-browser/index.html`. Open it directly in your browser (file:// protocol works) — all reports displayed in a searchable, filterable table with click-to-preview modal.

## 11. FAQ

**1. Search quotas? How to ensure uninterrupted searching?**

The system uses a **CLI built-in engine + SearXNG + free source fallback** search architecture, each layer independent, auto-degrades on failure:

- **Layer 0 — CLI built-in engine (new)**: Auto-detects the CLI tool's built-in search engine at runtime (e.g., OpenCode's Exa websearch). If available, used as primary, runs in parallel with subsequent layers. No additional configuration needed.
- **Layer 1 — SearXNG (author-deployed)**: Meta-search engine aggregating 70+ engines (Baidu/Google/Brave), full coverage of Chinese and English. Built-in endpoint, ready out of the box, unlimited, no rate limits.
- **Layer 2 — sources.json quality sources**: 30+ curated sources (Semantic Scholar / arXiv / Nature / World Bank / IMF / Reuters / BBC / Baidu Baike / Zhihu / 36Kr / iResearch / East Money etc.). Auto health check on startup, dead sources skipped.
- **Layer 3 — Free source reinforcement (final fallback)**: DuckDuckGo / Bing / Brave / Mojeek / Semantic Scholar / GDELT / arXiv + 20+ Chinese sources. No API keys required, always available.

**2. How to use local materials for report generation?**

The skill has a built-in offline mode that generates fully-formatted reports (TOC, citations, metadata) from local files. Supported formats: **MD / TXT** (native read), **PDF** (AI auto-installs PyPDF2 for text extraction), **DOCX** (AI auto-installs python-docx).

Choose your scenario:

**Scenario 1: Local materials + online supplement** (recommended for most complete research)
```
Use the deep-research skill with my local files in D:\notes\projectA to generate a research report on XX (quick mode). Prioritize local content, search online for anything missing.
```

**Scenario 2: Local materials only, no internet** (when you have sufficient data and don't want online distractions)
```
Use the deep-research skill with my local files in D:\notes\projectA to generate a research report on XX (quick mode). Use only local materials, do not search online.
```
The system skips the search/scraping pipeline and reads local files directly. Task 3 (chapter writing) and Task 4 (assembly/QA) run normally. The final output includes metadata, `[N]` citations, and TOC.

**Scenario 3: Pure local, no skill** (lightweight, no professional format needed)
```
Help me organize the materials in D:\notes\projectA into a structured research report with table of contents and chapter headings.
```

> **Scenario guide**: Incomplete materials → Scenario 1 (online supplement); Sufficient materials + need professional format → Scenario 2 (offline mode); Quick summary only → Scenario 3 (lightweight).

**3. How to update to the latest version?**

**Version strategy**: `main` branch always has the latest code. GitHub Releases are only for milestone markers.

OpenCode users:
- **Auto**: Type `/research-update`, AI auto-runs `git pull`
- **Manual**: `cd ~/.opencode/skills/deep-research && git pull`

Check version: `cat ~/.opencode/skills/deep-research/VERSION`

**4. Can non-OpenCode users auto-update?**

Yes — ask your AI to do a version comparison and apply updates:

```text
Compare the latest https://github.com/hoolulu/deep-research with your local version,
identify new features and fixes,
apply them one by one to your local adapted version,
preserving platform-specific changes.
If multiple CLI tools are installed, only configure the current tool — do not affect other CLI tools on this machine.
```

**5. Is my data safe?**

All processing is done locally. No data is collected or uploaded.

**6. How do I view my generated reports?**

After each research run, the AI outputs both the report file path and the local report browser page path.

- **Report file**: `{SKILLDIR}/reports/{LANG}/xxx.md` — open with any Markdown reader
- **Local report browser page**: `{SKILLDIR}/reports-browser/index.html` — **open directly in your browser** (works with file:// protocol). All reports are displayed in a table with search, language/depth filtering, sorting, and click-to-preview in a modal

You can also manually refresh the browser page anytime by running `python tools/generate_pages.py --local` in the skill directory.

## 12. Screenshot

<img width="1532" height="836" alt="Screenshot 2026-06-09 at 11-28-17" src="https://github.com/user-attachments/assets/736b0113-f054-4dba-b018-e656a51a9fb4" />

<img width="1532" height="932" alt="Screenshot 2026-06-09 at 11-30-13" src="https://github.com/user-attachments/assets/a88cbf27-7b6c-4ea3-8b51-424f48bf9906" />

<img width="1524" height="846" alt="Screenshot 2026-06-09 at 11-30-55" src="https://github.com/user-attachments/assets/ef10865d-3a72-4658-ac9c-28b2221e77f5" />

<img width="1528" height="840" alt="Screenshot 2026-06-09 at 11-32-13" src="https://github.com/user-attachments/assets/506e91eb-1d5d-4312-aceb-9280d357e264" />

<img width="1438" height="842" alt="Screenshot 2026-06-09 at 11-35-03" src="https://github.com/user-attachments/assets/75acd450-9349-4024-923d-f9b14ea601dd" />

## License

MIT

This project uses MIT instead of GPL/CC because its core value is a portable methodology and pipeline design, not a copyrighted product. MIT maximizes reuse and adaptation across different platforms and toolchains, consistent with the "not platform-exclusive" positioning.

---

**Created by [hoolulu](https://github.com/hoolulu)** · Repo: [github.com/hoolulu/deep-research](https://github.com/hoolulu/deep-research)

> Community discussion: [LINUX DO](https://linux.do/t/topic/2312664)
