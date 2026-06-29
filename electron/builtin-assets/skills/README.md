# Built-in Assets — Skills

This directory holds **built-in skills** that ship with the application. On first launch (or whenever a workspace is initialized), every subfolder here is copied into `{workspace}/skills/{id}/`.

## Folder Layout

Each subfolder is one skill. The folder name is the skill ID:

```
electron/builtin-assets/skills/
├── my-skill-1/
│   ├── config.json       (REQUIRED — metadata for market listing)
│   ├── SKILL.md          (REQUIRED — main prompt agents read)
│   ├── scripts/          (optional — supporting scripts)
│   ├── examples/         (optional — example inputs/outputs)
│   └── ...               (any other files/folders)
└── my-skill-2/
    └── ...
```

## config.json Schema

```json
{
  "id": "my-skill-1",
  "name": "技能显示名",
  "description": "一句话描述，用于市场列表和 agent 渐进式披露",
  "icon": "ri-file-text-line",
  "color": "#6C8AFF",
  "category": "学习",
  "source": "platform",
  "allowedTools": ["kb_search", "file_read"],
  "outputTypes": ["Markdown", "TXT"],
  "version": "1.0",
  "author": "reviva",
  "license": "MIT"
}
```

- `id` MUST equal the folder name
- `SKILL.md` frontmatter `name` MUST equal the folder name
- `icon` uses Remix Icon classes (`ri-*`), never Phosphor
- `color` is the brand tone for the skill card (hex)

## SKILL.md Format

Standard Agent Skills format with YAML frontmatter:

```markdown
---
name: my-skill-1
description: 一句话描述（agent 用来判断是否启用此 skill）
allowed-tools: kb_search, file_read
---

# 技能标题

## 概述
...

## 使用场景
...

## 执行步骤
...
```

## How Installation Works

1. **On Electron startup**, `SkillService.installAllBuiltinSkills()` scans this directory
2. For each subfolder, if `{workspace}/skills/{id}/` does NOT exist yet, the entire folder tree is copied over
3. If the destination already exists, it is **left untouched** (preserves user modifications)
4. Skills are then visible in the Skill Market page; users toggle them on/off (writes to `custom_skills` DB row with `source='platform'`)

## Adding a New Built-in Skill

1. Create a new folder under this directory with the skill ID as the name
2. Add `config.json` and `SKILL.md` (plus any supporting files)
3. Restart the app — the new skill auto-appears in the market

No code changes needed. No re-build needed in dev.
