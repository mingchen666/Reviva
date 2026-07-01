<div align="center">

# Reviva

**AI learning workspace — ask, note, review, and create, all around your own materials.**

Desktop · Knowledge Q&A · Creation Workspace

<p>
  <a href="./README.md">中文</a>
  ·
  English
</p>

<p>
  <a href="https://github.com/mingchen666/Reviva/releases">
    <img src="https://img.shields.io/github/v/release/mingchen666/Reviva?include_prereleases&label=release&color=4A6CFF" alt="Release" />
  </a>
  <a href="https://github.com/mingchen666/Reviva/stargazers">
    <img src="https://img.shields.io/github/stars/mingchen666/Reviva?style=flat&color=F59E0B" alt="GitHub Stars" />
  </a>
  <a href="#license-and-commercial-use">
    <img src="https://img.shields.io/badge/license-AGPL--3.0%20%2B%20Commercial-111827" alt="License AGPL-3.0 + Commercial" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/status-beta-FFB020" alt="Status Beta" />
  <img src="https://img.shields.io/badge/version-0.0.2--beta-4A6CFF" alt="Version 0.0.2-beta" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-2E2E3A" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-30-47848F?logo=electron&logoColor=white" alt="Electron 30" />
  <img src="https://img.shields.io/badge/Vue-3-42B883?logo=vuedotjs&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/SQLite-local--first-003B57?logo=sqlite&logoColor=white" alt="SQLite Local First" />
</p>

<p>
  <a href="#download-and-installation">Download</a>
  ·
  <a href="#key-features">Features</a>
  ·
  <a href="#use-cases">Use Cases</a>
  ·
  <a href="#license-and-commercial-use">License</a>
  ·
  <a href="#contact">Contact</a>
</p>

</div>

Reviva = local document library + Wiki knowledge base + AI Agent + knowledge retrieval + note & document management + Skills capability system + creation tools.

For anyone who wants AI woven into a real learning and knowledge workflow — not a blank chat box you start from scratch every time.

## Download and Installation

Most users should just download a packaged installer. No development setup needed.

| Channel | Link | Notes |
| --- | --- | --- |
| GitHub Releases | [Github Release](https://github.com/mingchen666/Reviva/releases) | Recommended — easy to check version updates |
| Baidu Netdisk | [Click to download](https://pan.quark.cn/s/9cbc820db4ef#/list/share) | Mirror for users in mainland China |
| Quark Netdisk | [Click to download](https://pan.quark.cn/s/9cbc820db4ef#/list/share) | Mirror for users in mainland China |

Currently focused on Windows desktop. macOS / Linux packaging will follow.

## Interface Demo

<table>
  <tr>
    <td align="center"><b>Learning Workspace</b> — chat with Agents, reference materials, trigger creation</td>
    <td align="center"><b>Agents</b> — independent roles, models, Skills, tools</td>
  </tr>
  <tr>
    <td><img src="docs/images/workbench.png" alt="Learning Workspace" /></td>
    <td><img src="docs/images/agents.png" alt="Agents" /></td>
  </tr>
  <tr>
    <td align="center"><b>Wiki Knowledge Base</b> — Wiki retrieval, material accumulation</td>
    <td align="center"><b>Settings</b> — model config, memory, usage stats, preferences</td>
  </tr>
  <tr>
    <td><img src="docs/images/wiki.png" alt="Wiki" /></td>
    <td><img src="docs/images/settings.png" alt="Settings" /></td>
  </tr>
</table>

## Why Reviva

Most AI tools out there are just a chat box — you start from zero every time. But real learning and research don't work like that. Materials pile up, notes need ongoing refinement, questions jump across documents, and different tasks need different AI roles.

Reviva pulls all of this into one desktop environment: drop in materials to build a knowledge base, let Agents answer questions grounded in your own stuff, save notes and outputs so you can pick up where you left off, and use creation tools to generate mind maps, flashcards, quizzes, PPTs, and deep research reports straight from your materials. Not a blank conversation every time — AI that actually participates in your full learning workflow.

## Project Status

Current version `0.0.2-beta`, features and UI still evolving rapidly. Primarily for Windows desktop; macOS / Linux support coming later. Data is local-first (SQLite + authorized workspace directory). AI supports multiple model providers, OpenAI-compatible APIs, and custom Agents.

This project was built primarily through Vibe Coding over about two months. There may be bugs — please report them via [GitHub Issues](https://github.com/mingchen666/Reviva/issues).

Back up important data before using Reviva for long-term knowledge management.

Most AI tools give you just a chat input. But real learning and research are not one-off conversations:

- Materials keep growing
- Notes need ongoing refinement
- Questions jump across documents and topics
- Different tasks need different AI roles
- Outputs should be saved, organized, and reused

Reviva is built to keep all these pieces in one desktop environment, so AI can participate in the full learning and knowledge workflow — not just answer isolated questions.

## Key Features

### Local-First, User-Controlled Data

Reviva stores notes, conversations, documents, Agent configs, and Skills primarily on your local disk and local SQLite database. You can back up, migrate, and manage your data without being locked into a cloud platform.

Local-first doesn't mean offline-only. You can choose cloud models, local models, or self-hosted OpenAI-compatible services. Whether AI requests leave your machine depends on the model and tools you configure.

### AI Agents, Not Just Chat

Reviva lets you create multiple dedicated AI Agents. Each Agent can have its own:

- System prompt
- Default model
- Skills capability modules
- Tool bindings
- Knowledge base configuration
- Runtime limits
- Reviewer model
- Output style

Build different Agents for different tasks:

- Paper reading assistant
- Exam review coach
- English learning partner
- Programming study assistant
- Product research analyst
- Document summarization assistant
- PPT / research report generation assistant

### Skills Capability Modules

Skills are attachable capability modules that enhance an Agent's performance in specific domains. Think of them as reusable sets of specialized prompts, rules, templates, and reference materials.

### Wiki Knowledge Base & Retrieval

Reviva supports Wiki-style knowledge bases — organize local materials, study topics, project documents, and long-term notes into searchable, accumulable, extensible knowledge collections. Agents retrieve from knowledge bases to answer questions, summarize, and analyze, reducing hallucinations and grounding responses in your real materials.

Good for:

- Course materials management
- Paper collections
- Final exam review materials
- Certification / postgraduate exam preparation
- Project knowledge bases
- Personal reading libraries

### Learning Workspace

The main work area in Reviva. Chat with Agents, reference materials, call tools, trigger creation tasks, and save outputs into notes, documents, or the output center.

### Creation Workspace

Reviva goes beyond Q&A — it generates structured artifacts from your materials, stored in the output center for review and reuse.

Currently supported creation types:

- Quiz · Flashcard · Mind map · Knowledge graph · Chart — local generation
- Deep research · PPT — local and cloud generation (cloud usage billed)
- Podcast — cloud generation (billed)

### Tool System & MCP

Agents can bind tools, letting AI participate in real task workflows. Supports built-in tools, custom tools, and MCP remote tool servers to expand Agent capabilities.

### Multiple Model Providers

Reviva supports multiple model providers and OpenAI-compatible APIs. Configure freely based on cost, speed, privacy, and capability needs.

## Product Modules

| Module | Description |
| --- | --- |
| Dashboard | Recent activity, quick entries, task status |
| Learning Workspace | Chat with Agents, reference materials, trigger creation tasks |
| Agents | Create, edit, and manage AI Agents |
| Skills | Manage built-in and custom capability modules |
| Tools | Manage built-in tools, custom tools, and MCP services |
| Knowledge Base / Wiki | Manage system and user knowledge bases — courses, papers, projects, review materials |
| Documents | Manage local files and folders |
| Notes | Markdown notes and folder management |
| Tasks | Track generation and learning tasks |
| Output Center | Manage Agent-generated artifacts |
| Recycle Bin | Unified restore or permanent delete for documents, notes, conversations, etc. |
| Settings | Models, appearance, data, environment, usage stats, and more |

## Use Cases

### Course Learning

1. Import slides, textbook excerpts, exercises, and personal notes.
2. Build a course knowledge base.
3. Use a study coach Agent for Q&A.
4. Generate flashcards, quizzes, and review plans.
5. Track progress through the dashboard and tasks module.

### Final Exam Review

1. Create a Wiki knowledge base per course, e.g. "Data Structures Final Review" or "Probability Theory Review".
2. Import slides, teacher highlights, past papers, mistakes, class notes, and textbook chapters.
3. Ask an Agent to organize chapter outlines, key concepts, formula lists, and high-frequency exam points.
4. Generate quizzes, flashcards, and mistake reviews for weak topics.
5. Save summaries as notes for the next review cycle.

### Personal Second Brain

1. Keep long-term reading, writing, and study materials in Reviva.
2. Use different Agents for different domains.
3. Reuse past understanding through knowledge bases and notes.
4. Turn AI outputs into personal knowledge assets.

## Basic Workflow

1. Download and install Reviva.
2. Choose a local workspace folder on first launch.
3. Configure model providers in settings.
4. Import documents, notes, or learning materials.
5. Create knowledge bases and add materials.
6. Create or select an Agent, attach Skills, tools, and knowledge bases.
7. Chat, analyze, and create in the learning workspace.
8. Save outputs into notes, documents, or the output center.

## Data and Privacy

- Local data is stored in the user-selected workspace folder and local database by default.
- Documents, notes, conversations, Agents, and Skills can be backed up and migrated by the user.
- File access is limited to the authorized workspace directory, reducing the risk of accessing sensitive system paths.
- Whether AI requests are sent to the cloud depends on the model provider you configure.
- When using cloud models, search tools, or remote MCP services, review the corresponding provider's data policies.

## License and Commercial Use

This project uses a **AGPL-3.0 + Commercial License** dual licensing model.

### Personal Users

- **Personal learning, research, and self-use are permanently free** — no payment or authorization needed.
- You may freely use, modify, and self-deploy Reviva under AGPL-3.0.
- Modified versions served over the network must disclose source code per AGPL-3.0 requirements.

### Commercial and Multi-User Use

The following scenarios require prior commercial authorization from the author:

- Enterprise, organization, or team internal multi-user use
- Integration into commercial products or paid services
- Secondary development for client projects, training delivery, or commercial solutions
- Use as part of a closed-source product, SaaS service, or private deployment
- Redistribution, white-label packaging, or embedding into other commercial software
- Removing, hiding, or modifying Reviva's copyright and license notices

If unsure whether your usage requires authorization, contact the author first.

## Roadmap

- [ ] Custom Skills
- [ ] More built-in Agents and Skills
- [ ] Better import/export and backup capabilities
- [ ] Agent memory and long-term learning ability
- [ ] Agent autonomous learning growth loop (accumulate user preferences, learning profiles, weak points over time; all growth results auditable, reversible, and evaluable)
- [ ] More...

## Disclaimer

AI-generated content may contain errors, omissions, or be unsuitable for direct use. Verify important outputs yourself in learning, research, commercial, legal, medical, or other high-stakes scenarios. Reviva does not guarantee the accuracy, completeness, or applicability of model outputs.

## Contact

- Bug reports: [GitHub Issues](https://github.com/mingchen666/Reviva/issues)
- Commercial authorization & collaboration: see WeChat below
- Project homepage: [GitHub](https://github.com/mingchen666/Reviva)

<table>
  <tr>
    <td align="center"><b>WeChat</b></td>
    <td align="center"><b>Community Group</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/my.jpg" alt="WeChat" width="200" /></td>
    <td align="center"><img src="docs/images/wx-group.jpg" alt="Community Group" width="200" /></td>
  </tr>
</table>

## Sponsor

Reviva took a lot of time and effort to build. If you find it useful, consider buying the author a coffee:

<img src="docs/images/sponsor.png" alt="Sponsor" width="300" />

## Other Projects

- [DocTranslator](https://github.com/mingchen666/DocTranslator) — AI-powered document translation platform

## Acknowledgments

- [Vue.js](https://vuejs.org/) · [Electron](https://www.electronjs.org/) · [Vite](https://vitejs.dev/)
- [DeepAgents](https://github.com/langchain-ai/deepagentsjs)
- [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI)
- [Linux Do](https://linux.do/)

Thanks to all open-source contributors and community users.
