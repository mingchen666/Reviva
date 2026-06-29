# Built-in Assets — Agents

This directory holds **built-in conversational agents** that ship with the application. On Electron startup, every subfolder is synced into the `agents` table (`builtin=1`) through a template + user-overrides model.

> **Note**: The special "creation center" agents (`ppt-generator` / `deep-researcher` / `mindmap-generator` / `graph-generator` / `flashcard-generator` / `quiz-generator` / `chart-generator`) live in `electron/agents/builtin/` and follow a different schema (`single_shot`, `orchestrator.md`, `subagents/`, `artifact-rules.json`). They are run by `GenerationTaskService` or `AgentService` directly and are **not** loaded from this folder.
>
> This folder is for **regular chat-type agents** that show up in the agent list and run via the normal conversation flow.

## Folder Layout

```
electron/builtin-assets/agents/
├── debate-coach/
│   ├── config.json   (REQUIRED — metadata)
│   └── PROMPT.md     (REQUIRED — system prompt)
└── feynman-tutor/
    └── ...
```

The folder name **must equal** `config.id`.

## config.json Schema

```json
{
  "id": "debate-coach",
  "name": "辩论",
  "english_name": "DebateCoach",
  "description": "通过正反方辩论训练批判性思维",
  "icon": "ri-chat-quote-line",
  "color": "#6C8AFF",

  "architecture": "react",
  "model": "",
  "temperature": 0.7,
  "top_p": 1.0,
  "max_tokens": 4096,
  "max_iterations": 10,
  "tool_call_limit": 0,
  "model_call_limit": 0,
  "thinking_mode": "auto",
  "thinking_intensity": "medium",

  "tools": ["web_search_tavily"],
  "skills": ["summary", "outline"],
  "sub_agents": [],
  "permissions": {}
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Must match folder name |
| `name` | yes | Display name (Chinese ok) |
| `english_name` | no | Used for log/agent routing |
| `description` | yes | One-line summary shown in agent list |
| `icon` | yes | Remix Icon class (`ri-*`) — **not** Phosphor |
| `color` | yes | Hex string |
| `architecture` | yes | `react` \| `plan_exec` \| `hybrid` |
| `model` | no | Empty = use global default model |
| `tools` | no | Array of built-in tool IDs (see `BUILTIN_TOOLS` in `stores/agents.js`) and/or MCP bindings such as `mcp:exa` |
| `skills` | no | Array of skill IDs from `builtin-assets/skills/` or custom |
| `sub_agents` | no | Array of sub-agent IDs |
| `temperature` / `top_p` / `max_tokens` | no | Sampling params |
| `max_iterations` | no | ReAct iteration limit |
| `tool_call_limit` | no | Per-run tool call limit. `0` means unlimited |
| `model_call_limit` | no | Per-run model call limit. `0` means unlimited |
| `thinking_mode` / `thinking_intensity` | no | Thinking config |
| `permissions` | no | Permission object (default `{}`) |

## PROMPT.md

The full system prompt. Written in Markdown. Loaded into the `prompt` column on DB upsert.

```markdown
# 辩论教练 Agent

你是一个辩论训练教练，目标是帮助学习者通过正反方辩论训练批判性思维。

## 工作方式
...
```

## How Installation Works

1. **On Electron startup**, `AgentService.installAllBuiltinAgents()` scans this directory
2. For each subfolder, the official template is read from `config.json` + `PROMPT.md`
3. If the agent does not exist, a new `builtin=1` row is inserted
4. If the agent already exists, official template fields are synced while user-edited fields in `user_overrides` are preserved
5. New built-in agents are visible immediately in the agent list

## Adding a New Built-in Agent

1. Create a folder under this directory with the agent ID as the name
2. Add `config.json` + `PROMPT.md`
3. Restart the app — the agent appears in the list

No code changes needed. No re-build in dev.

## Updating an Existing Built-in Agent

Edit `config.json` or `PROMPT.md` and restart the app. Fields that the user has not customized will follow the official template. Fields the user has customized, such as `prompt`, `tools`, `skills`, model settings, permissions, and runtime limits, are preserved in `user_overrides`.

Use `version` or `builtin_version` in `config.json` when the official template changes. A template hash is also stored, so content changes are still detected even if the version is not bumped, but explicit versions make debugging and support easier.
