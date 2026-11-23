// wiki/WikiPageTemplates.js — extracted from WikiService.js
// Default page templates for new wikis.

import { nowIso } from './wikiUtils.js'

function schemaTemplate(title) {
  return `# ${title} Schema\n\n## Layers\n\n- sources: immutable raw files and parsed extracts. The Wiki Agent may read them but must not modify them.\n- pages: LLM-maintained Markdown knowledge pages.\n- assets: local images and other attachments referenced from Markdown by relative paths.\n- history: automatic snapshots created before page writes.\n\n## Page Types\n\n- summaries: source-level summaries.\n- concepts: reusable concept pages.\n- entities: people, organizations, products, projects, and named objects.\n- questions: reusable Q&A pages.\n- comparisons: structured comparisons.\n\n## Write Policy\n\nThe built-in Wiki Agent submits official page changes only through wiki_tool propose_update, with sourceIds and passageIds from evidence it has read. The application may auto-apply low/medium risk proposals; high-risk proposals require human review. The Agent cannot write pages, confirm or apply proposals. Update both index.md and overview.md when maintaining knowledge pages. History snapshots and log.md preserve traceability. Fallback summaries are placeholders and never count as complete maintenance.\n\n## Citation Policy\n\nImportant claims must cite real passages with their source path and locators. Uncertain or inferred claims must be marked explicitly.\n`
}

function indexTemplate(title) {
  return `---\nid: index\nstatus: active\nupdated_at: ${nowIso()}\n---\n\n# ${title}\n\nThis Wiki is ready. Add sources to let the Wiki Agent build and maintain Markdown knowledge pages.\n\n## Entry\n\n- [Overview](overview.md)\n`
}

function overviewTemplate(title) {
  return `---\nid: overview\nstatus: active\nupdated_at: ${nowIso()}\n---\n\n# ${title} Overview\n\nNo sources have been ingested yet.\n`
}

export { schemaTemplate, indexTemplate, overviewTemplate }
