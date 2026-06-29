import { createDeepAgent, FilesystemBackend } from 'deepagents'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

function numberValue(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function emptyUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingTokens: 0,
  }
}

function usageFromMetadata(meta = {}) {
  return {
    inputTokens: numberValue(meta.input_tokens ?? meta.inputTokens ?? meta.prompt_tokens ?? meta.promptTokens, 0),
    outputTokens: numberValue(meta.output_tokens ?? meta.outputTokens ?? meta.completion_tokens ?? meta.completionTokens, 0),
    cacheReadTokens: numberValue(
      meta.input_token_details?.cache_read ??
      meta.inputTokenDetails?.cacheRead ??
      meta.cache_read_tokens ??
      meta.cacheReadTokens,
      0,
    ),
    cacheWriteTokens: numberValue(
      meta.input_token_details?.cache_creation ??
      meta.inputTokenDetails?.cacheCreation ??
      meta.cache_write_tokens ??
      meta.cacheWriteTokens,
      0,
    ),
    thinkingTokens: numberValue(
      meta.output_token_details?.reasoning ??
      meta.outputTokenDetails?.reasoning ??
      meta.reasoning_tokens ??
      meta.thinking_tokens ??
      meta.thinkingTokens,
      0,
    ),
  }
}

function addUsage(target, usage) {
  target.inputTokens += usage.inputTokens || 0
  target.outputTokens += usage.outputTokens || 0
  target.cacheReadTokens += usage.cacheReadTokens || 0
  target.cacheWriteTokens += usage.cacheWriteTokens || 0
  target.thinkingTokens += usage.thinkingTokens || 0
}

function collectUsage(messages = []) {
  const total = emptyUsage()
  for (const message of messages || []) {
    if (message?.usage_metadata) addUsage(total, usageFromMetadata(message.usage_metadata))
    if (message?.response_metadata?.tokenUsage) addUsage(total, usageFromMetadata(message.response_metadata.tokenUsage))
    if (message?.response_metadata?.usage) addUsage(total, usageFromMetadata(message.response_metadata.usage))
  }
  return total
}

function hasUsage(usage) {
  return !!usage && (
    usage.inputTokens ||
    usage.outputTokens ||
    usage.cacheReadTokens ||
    usage.cacheWriteTokens ||
    usage.thinkingTokens
  )
}

function calcUsageCost(usage, pricing = {}) {
  const input = numberValue(pricing.costInput ?? pricing.input, 0)
  const output = numberValue(pricing.costOutput ?? pricing.output, 0)
  const cacheRead = numberValue(pricing.costCacheRead ?? pricing.cacheRead, 0)
  const cacheWrite = numberValue(pricing.costCacheWrite ?? pricing.cacheWrite, cacheRead)
  return (
    ((usage.inputTokens || 0) * input +
      (usage.outputTokens || 0) * output +
      (usage.cacheReadTokens || 0) * cacheRead +
      (usage.cacheWriteTokens || 0) * cacheWrite) / 1_000_000
  )
}

class WikiScopedBackend extends FilesystemBackend {
  constructor(options, wikiVirtualPath) {
    super(options)
    this._wikiPrefix = this._normalize(wikiVirtualPath || '/wiki')
    this._agentCachePrefix = `${this._wikiPrefix}/.cache/agent/`
  }

  _normalize(virtPath = '/') {
    const normalized = String(virtPath || '/').replace(/\\/g, '/')
    return ('/' + normalized.replace(/^\/+/, '')).replace(/\/+/g, '/').toLowerCase()
  }

  _canRead(virtPath) {
    const path = this._normalize(virtPath)
    return path === this._wikiPrefix || path.startsWith(this._wikiPrefix + '/')
  }

  _canWrite(virtPath) {
    const path = this._normalize(virtPath)
    return path.startsWith(this._agentCachePrefix)
  }

  async ls(dirPath = '/') {
    if (!this._canRead(dirPath)) return { files: [] }
    return super.ls(dirPath)
  }

  async read(filePath, offset, limit) {
    if (!this._canRead(filePath)) return { error: `Access denied outside current Wiki: ${filePath}` }
    return super.read(filePath, offset, limit)
  }

  async glob(pattern, searchPath) {
    if (!this._canRead(searchPath || this._wikiPrefix)) return { files: [] }
    const result = await super.glob(pattern, searchPath)
    if (result.files) result.files = result.files.filter(f => this._canRead(f.path))
    return result
  }

  async write(filePath, content) {
    if (!this._canWrite(filePath)) return { error: `Wiki Agent writes Wiki pages through wiki_tool write_page: ${filePath}` }
    return super.write(filePath, content)
  }

  async edit(filePath, oldString, newString, replaceAll) {
    if (!this._canWrite(filePath)) return { error: `Wiki Agent edits Wiki pages through wiki_tool write_page: ${filePath}` }
    return super.edit(filePath, oldString, newString, replaceAll)
  }
}

export class WikiAgentService {
  constructor({ workDirService, wikiService, agentService }) {
    this._workDir = workDirService
    this._wikiService = wikiService
    this._agentService = agentService
  }

  buildTools(wikiId) {
    return [
      tool(
        async (input = {}) => JSON.stringify(await this._wikiService.wikiTool({ ...(input || {}), wikiId, allowWrite: true })),
        {
          name: 'wiki_tool',
          description: 'Single tool for the current LLM-Wiki. Use it to search, read, write official pages, read parsed sources, append log notes, and inspect recent changes.',
          schema: z.object({
            action: z.enum([
              'search',
              'list_pages',
              'read_page',
              'list_sources',
              'read_source',
              'list_assets',
              'write_page',
              'append_log',
              'recent_changes',
            ]),
            query: z.string().optional().describe('Search query for action=search.'),
            scope: z.enum(['all', 'pages', 'sources', 'wiki', 'source']).optional().describe('Search scope for action=search.'),
            limit: z.number().optional().describe('Optional result limit.'),
            pagePath: z.string().optional().describe('Relative Markdown path, for example index.md or pages/concepts/topic.md.'),
            sourceId: z.string().optional().describe('Source id for action=read_source.'),
            kind: z.string().optional().describe('Optional asset kind filter for action=list_assets, for example ocr_image or source_image.'),
            title: z.string().optional().describe('Page title for action=write_page.'),
            content: z.string().optional().describe('Markdown content for action=write_page or log message for action=append_log.'),
            reason: z.string().optional().describe('Short reason for a page write.'),
            sourceIds: z.array(z.string()).optional().describe('Source ids cited by a page write.'),
          }),
        },
      ),
    ]
  }

  systemPrompt(wiki) {
    return `You are the built-in Wiki Agent for "${wiki.name}".

Maintain this local Markdown Wiki from registered sources. This is a maintenance workflow, not a chat answer.

Core contract:
- Treat registered sources, parsed extracts, OCR/layout extracts, existing pages, and asset vision summaries as evidence.
- Operate only inside the current Wiki. Source ids are local to this Wiki; the same original document may be added to another Wiki with a different source id and must not be treated as shared state.
- Never modify source extracts. Maintain official Wiki pages only through wiki_tool action=write_page.
- Every write_page call creates history, log, and job records automatically.
- Preserve user-written structure where possible. Merge updates instead of replacing pages with unrelated rewrites.

Recommended workflow:
1. Call wiki_tool recent_changes, list_sources, and list_pages to understand current state.
2. Read only sources whose parser_status is complete, or existing extracts explicitly available through read_source.
3. Search/read existing pages before writing. Update relevant pages rather than creating duplicates.
4. Use list_assets when a source or page references images. Use existing image paths and vision summaries if present.
5. For every complete source that is not represented yet, maintain one concise source summary under pages/summaries/. Then create or update concept/entity/question/comparison pages only when the source contains reusable knowledge worth linking.
6. Write concise pages with stable headings, source citations, and useful navigation. Update index.md and overview.md when navigation changes.
7. Append a short log note only for important skipped work, uncertainty, or follow-up needs.

Source state rules:
- parser_status=complete: safe to use as evidence.
- parser_status=needs_ocr, ocr_queued, or ocr_running: do not infer missing PDF/image content. You may note that OCR/layout parsing is pending.
- parser_status=ocr_failed or failed: do not rely on missing content. Record a short uncertainty/follow-up note if needed.
- PDF parse_stats may include pdfTextMode, textCoverageRatio, ocrCandidateRatio, and ocrCandidatePages. Use these to distinguish text PDFs from scanned or mixed PDFs.

Writing rules:
- Source summaries are the default durable output for ingested documents: use pages/summaries/<stable-source-or-title>.md.
- If an existing source summary has frontmatter status: fallback, treat it as a placeholder created by the system. Replace it with a concise human-readable summary that synthesizes the source instead of leaving raw extract preview as the main content.
- pages/concepts is not mandatory for every document. Use it only for durable reusable concepts, definitions, mechanisms, formulas, or domain terms.
- Prefer page paths under pages/summaries, pages/concepts, pages/entities, pages/questions, or pages/comparisons when useful.
- Do not dump raw extracts into pages. Distill durable knowledge, relationships, definitions, decisions, and reusable explanations.
- Keep pages readable: clear title, short sections, bullet lists only when they improve scanning.
- Important claims need human-readable citations, for example: "（来源：Report.pdf, source_id: src_xxx, page 12）".
- Do not use bare markers like "[src: src_xxx]" as standalone prose.
- Do not invent citations, page numbers, image descriptions, or facts.

Navigation rules:
- Treat index.md as the primary routing table for query agents. It should contain concise topic sections, source summary links, concept/entity/question/comparison links, and one-line descriptions that help an agent choose what page to read next.
- Treat overview.md as a human-readable high-level map of the Wiki. It should summarize the main areas and point to important pages.
- Use normal Markdown relative links, for example [Topic](pages/concepts/topic.md). Do not leave important pages only discoverable by filename search.
- When adding, removing, renaming, or substantially changing pages, update index.md or overview.md in the same maintenance run whenever practical.

Image rules:
- Use standard Markdown image syntax for registered images. Prefer the asset.path returned by list_assets, for example: "![caption](assets/images/src_xxx/page-001-image-001.png)"; write_page will normalize Wiki asset paths for the target page.
- If you copy an image reference from a source extract, verify it points to the same registered asset before using it in an official page.
- Never use source ids as image placeholders.
- Do not perform OCR or visual interpretation from raw PDF pages yourself. Treat OCR/layout extracts and asset vision summaries as evidence.
- If an image has no OCR text, caption, nearby source text, or vision summary, you may reference its path but must not invent what the image contains.
- Preserve meaningful Markdown tables from parsed sources when they carry facts, comparisons, numeric values, or structure. Summarize very large tables instead of dumping them wholesale, and cite the source.
`
  }

  async draft(req) {
    return this.run(req)
  }

  async run({ wikiId, instruction, providerId, apiFormat, apiKey, baseUrl, model: modelName, pricing = {}, runId = '' }) {
    if (!this._agentService?._createModel) {
      return { success: false, error: 'Agent model factory is not available' }
    }
    const wikiResult = await this._wikiService.getWiki(wikiId)
    if (!wikiResult.success) return wikiResult

    const model = this._agentService._createModel(providerId, apiKey, baseUrl, modelName, { streaming: false, apiFormat })
    const root = this._workDir?.getRootPath?.()
    if (!root) return { success: false, error: 'Workspace is not initialized' }
    const wikiVirtualPath = this._wikiService.getWikiVirtualPath?.(wikiId) || `/wikis/${wikiId}`

    const agent = createDeepAgent({
      model,
      tools: this.buildTools(wikiId),
      systemPrompt: this.systemPrompt(wikiResult.data),
      backend: new WikiScopedBackend({ rootDir: root.replace(/\\/g, '/'), virtualMode: true }, wikiVirtualPath),
      permissions: [
        {
          operations: ['read'],
          paths: [`${wikiVirtualPath}/**`],
          mode: 'allow',
        },
        {
          operations: ['write'],
          paths: [`${wikiVirtualPath}/.cache/agent/**`],
          mode: 'allow',
        },
        {
          operations: ['read', 'write'],
          paths: ['/**'],
          mode: 'deny',
        },
      ],
      name: `wiki-agent-${wikiId}`,
    })

    const startedAt = Date.now()
    const result = await agent.invoke({
      messages: [{ role: 'user', content: instruction || 'Maintain this Wiki from current parsed sources. Search/read existing pages, update useful official pages, refresh index.md when needed, and preserve citations.' }],
    })
    const latencyMs = Date.now() - startedAt
    const usage = collectUsage(result?.messages || [])
    const cost = calcUsageCost(usage, pricing)
    usage.cost = cost
    if (hasUsage(usage)) {
      this._agentService?._tokenRecorder?.record?.({
        providerId,
        modelId: modelName,
        agentId: `wiki-agent:${wikiId}`,
        conversationId: '',
        usage,
        cost,
        latencyMs,
        runId,
        iteration: 1,
      })
    }
    const last = result?.messages?.[result.messages.length - 1]
    return {
      success: true,
      data: {
        content: last?.content || '',
        usage,
        cost,
        latencyMs,
      },
    }
  }
}
