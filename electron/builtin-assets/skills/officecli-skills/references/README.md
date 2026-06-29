# OfficeCLI References

This directory contains the detailed format and scene references used by the top-level `officecli` skill.

Files expected in this directory:

- `docx.md`
- `pptx.md`
- `xlsx.md`
- `academic-paper.md`
- `pitch-deck.md`
- `financial-model.md`
- `data-dashboard.md`
- `word-form.md`

The top-level `../SKILL.md` is the authoritative router and setup document. Load only the reference files needed for the current task.

These reference files are copied from the previous standalone OfficeCLI skills and may keep their original YAML frontmatter. Treat that frontmatter as source metadata, not as the preferred skill-binding surface. New Agent configurations should bind the unified `officecli-skills` skill and route internally to these references.
