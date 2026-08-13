// Current supported/default model catalog entries are generally 128k or
// larger. Keep the fallback aligned with that reality while still honoring a
// provider's explicit ctx/context_window metadata when available.
import { stableEvidenceKey } from './EvidenceBudget.js'

const DEFAULT_CONTEXT_WINDOW = 128 * 1024
const MIN_CONTEXT_WINDOW = 4 * 1024
const MAX_CONTEXT_WINDOW = 4 * 1024 * 1024

function positiveInt(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0
}

function parseTokenBudget(value, fallback = 8192) {
  if (typeof value === 'number') return positiveInt(value) || fallback
  const raw = String(value || '').trim().toLowerCase().replace(/,/g, '')
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/i)
  if (!match) return fallback
  const multiplier = match[2] === 'm' ? 1024 * 1024 : match[2] === 'k' ? 1024 : 1
  return positiveInt(Number(match[1]) * multiplier) || fallback
}

/** Parse model metadata such as 128k, 1m, or 200000 tokens. */
export function parseContextWindow(value, fallback = DEFAULT_CONTEXT_WINDOW) {
  if (typeof value === 'number') {
    const number = positiveInt(value)
    return number ? Math.min(MAX_CONTEXT_WINDOW, Math.max(MIN_CONTEXT_WINDOW, number)) : fallback
  }

  const raw = String(value || '').trim().toLowerCase().replace(/,/g, '')
  if (!raw || raw === '?' || raw === 'unknown' || raw === 'auto') return fallback
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(k|m|g)?(?:\s*(?:tokens?|上下文|context).*)?$/i)
  if (!match) return fallback
  const amount = Number(match[1])
  const multiplier = match[2] === 'g' ? 1024 * 1024 * 1024 : match[2] === 'm' ? 1024 * 1024 : match[2] === 'k' ? 1024 : 1
  const parsed = positiveInt(amount * multiplier)
  return parsed ? Math.min(MAX_CONTEXT_WINDOW, Math.max(MIN_CONTEXT_WINDOW, parsed)) : fallback
}

/** Conservative mixed-language token estimate used before sending a request. */
export function estimateTokens(value) {
  const text = String(value || '')
  if (!text) return 0
  let ascii = 0
  let nonAscii = 0
  for (const char of text) {
    if (char.charCodeAt(0) < 128) ascii += 1
    else nonAscii += 1
  }
  // Chinese and other CJK characters are often close to one token each. The
  // estimate intentionally rounds up so the prompt stays below the provider
  // limit even when the tokenizer is unknown.
  return Math.ceil(ascii / 3.5 + nonAscii / 1.25)
}

function clipByTokens(value, tokenBudget) {
  const text = String(value || '')
  const budget = positiveInt(tokenBudget)
  if (!text || budget <= 0) return { text: '', truncated: Boolean(text) }
  if (estimateTokens(text) <= budget) return { text, truncated: false }

  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (estimateTokens(text.slice(0, mid)) <= budget) low = mid
    else high = mid - 1
  }
  const clipped = text.slice(0, low).trimEnd()
  return { text: clipped, truncated: clipped.length < text.length }
}

function compact(value, max = 420) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sourcePriority(kind) {
  if (kind === 'local' || kind === 'text' || kind === 'pdf' || kind === 'office' || kind === 'media') return 400
  if (kind === 'kb') return 300
  if (kind === 'wiki') return 200
  return 100
}

function blockKind(key) {
  if (key === 'fileBlocks') return 'local'
  if (key === 'kbBlocks') return 'kb'
  if (key === 'wikiBlocks') return 'wiki'
  return 'web'
}

function blockRange(block) {
  return block?.range && typeof block.range === 'object' ? block.range : null
}

function rangeLabel(range) {
  if (!range) return '范围未知'
  if (range.startPage !== undefined) return `第 ${range.startPage}-${Number(range.startPage) + Math.max(0, Number(range.maxPages || 1) - 1)} 页`
  if (range.start !== undefined) return `第 ${range.start}-${Number(range.start) + Math.max(0, Number(range.maxLines || 1) - 1)} 行/段`
  if (range.startByte !== undefined) return `字节 ${range.startByte}-${Number(range.startByte) + Math.max(0, Number(range.maxBytes || 0))}`
  return compact(JSON.stringify(range), 120) || '范围未知'
}

function sourceKey(kind, block, index) {
  if (kind === 'local') return String(block?.sourceId || block?.name || `local_${index + 1}`)
  // Remote search blocks do not consistently expose a stable document ID.
  // Use a compact per-pack ID and keep the long query/URL in block metadata;
  // otherwise the source directory itself can consume a surprising amount of
  // a small model's input window.
  return String(block?.sourceId || `${kind}_${String(index + 1).padStart(2, '0')}`)
}

function createGroups(evidence = {}) {
  const groups = new Map()
  const localSources = Array.isArray(evidence.localSources) ? evidence.localSources : []

  for (const source of localSources) {
    const key = String(source?.sourceId || source?.name || `local_${groups.size + 1}`)
    groups.set(key, {
      key,
      kind: 'local',
      name: source?.name || key,
      sourceId: key,
      sourceKind: source?.kind || 'local',
      overview: compact(source?.overview, 700),
      blocks: [],
      priority: sourcePriority(source?.kind || 'local'),
      sourceOrder: groups.size,
      exhausted: source?.exhausted === true || !source?.next,
      readRanges: Array.isArray(source?.readRanges) ? source.readRanges : [],
    })
  }

  for (const [field, rawBlocks] of Object.entries({
    fileBlocks: evidence.fileBlocks,
    kbBlocks: evidence.kbBlocks,
    wikiBlocks: evidence.wikiBlocks,
    webBlocks: evidence.webBlocks,
  })) {
    const kind = blockKind(field)
    for (const [index, block] of (Array.isArray(rawBlocks) ? rawBlocks : []).entries()) {
      const key = sourceKey(kind, block, index)
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          kind,
          name: block?.name || block?.query || block?.url || `${kind} ${index + 1}`,
          sourceId: block?.sourceId || key,
          sourceKind: block?.sourceType || kind,
          overview: '',
          blocks: [],
          priority: sourcePriority(kind),
          sourceOrder: groups.size,
          exhausted: true,
          readRanges: [],
        }
        groups.set(key, group)
      }
      group.blocks.push({
        ...block,
        content: String(block?.content || '').trim(),
        range: blockRange(block),
        field,
      })
      if (blockRange(block)) group.readRanges.push(blockRange(block))
    }
  }

  return [...groups.values()].filter(group => group.name || group.blocks.length)
}

function sourceCard(group, { compactMode = false } = {}) {
  const ranges = group.readRanges.length
    ? compact(group.readRanges.map(rangeLabel).join('、'), compactMode ? 120 : 360)
    : '无正文区段'
  const state = group.blocks.length ? (group.exhausted ? '已读到可用末端/当前无 continuation' : '仍有未读 continuation') : '未读到可用正文'
  if (compactMode) {
    return `- ${group.sourceId} · ${compact(group.name, 72)} · ${state}; 已读=${ranges}`
  }
  return `- ${group.sourceId} · ${compact(group.name, 160)} · 类型=${group.sourceKind}; ${state}; 已读取=${ranges}${group.overview ? `; 概览=${compact(group.overview, 360)}` : ''}`
}

function fitLines(header, lines, tokenBudget) {
  const normalizedLines = (Array.isArray(lines) ? lines : []).filter(Boolean)
  if (!normalizedLines.length || tokenBudget <= 0) return ''
  const full = `${header}\n${normalizedLines.join('\n')}`
  if (estimateTokens(full) <= tokenBudget) return full

  const headerTokens = estimateTokens(header) + 2
  const available = Math.max(0, tokenBudget - headerTokens)
  if (!available) return clipByTokens(header, tokenBudget).text
  const perLine = Math.max(1, Math.floor(available / normalizedLines.length))
  const clippedLines = normalizedLines.map(line => clipByTokens(line, perLine).text).filter(Boolean)
  return clipByTokens(`${header}\n${clippedLines.join('\n')}`, tokenBudget).text
}

function sourceDirectory(groups, tokenBudget) {
  const fullLines = groups.map(group => sourceCard(group))
  const fullRaw = `[资料覆盖目录]\n${fullLines.join('\n')}`
  if (estimateTokens(fullRaw) <= tokenBudget) return `\n${fullRaw}`

  const conciseLines = groups.map(group => sourceCard(group, { compactMode: true }))
  const conciseRaw = `[资料覆盖目录]\n${conciseLines.join('\n')}`
  const concise = estimateTokens(conciseRaw) <= tokenBudget
    ? conciseRaw
    : fitLines('[资料覆盖目录]', conciseLines, tokenBudget)
  return concise ? `\n${concise}` : ''
}

function coverageNotice(groups, tokenBudget) {
  const omitted = groups.filter(group => group.omittedRanges.length
    || (group.omittedBlockCount || 0) > 0
    || group.status === 'unreadable_or_unavailable'
    || group.status === 'not_included')
  if (!omitted.length) return ''
  const lines = omitted.map(group => {
    const ranges = group.omittedRanges.length
      ? compact(group.omittedRanges.map(rangeLabel).join('、'), 180)
      : group.status === 'unreadable_or_unavailable'
        ? '无可用正文'
        : group.status === 'not_included'
          ? '未分配正文预算'
          : '部分区段未完整纳入'
    return `- ${group.sourceId} · ${compact(group.name, 100)}：未完整纳入（${ranges}）。不要假装已读完整来源。`
  })
  return fitLines('[资料覆盖限制]', lines, tokenBudget)
}

function basePromptParts(topic, params) {
  const parts = [`[主题]\n${topic || '请基于参考资料推断主题'}`]
  if (params && Object.keys(params).length) parts.push(`[用户配置]\n${JSON.stringify(params, null, 2)}`)
  return parts
}

function groupHeader(group) {
  const fieldLabel = group.kind === 'local' ? '本地资料' : group.kind === 'kb' ? '知识库检索' : group.kind === 'wiki' ? '本地 Wiki' : '联网搜索'
  return `\n--- ${group.sourceId} · ${compact(group.name, 180)} · ${fieldLabel} ---`
}

function blockMetadata(block) {
  const metadata = [
    block?.query ? `查询=${compact(block.query, 160)}` : '',
    block?.url ? `来源=${compact(block.url, 260)}` : '',
    block?.range ? `范围=${rangeLabel(block.range)}` : '',
    block?.isFollowUp ? '续读' : '初读',
  ].filter(Boolean).join('；')
  return metadata ? `[${metadata}]` : ''
}

function blockText(block, clipped) {
  const metadata = blockMetadata(block)
  return `${metadata ? `${metadata}\n` : ''}${clipped}`.trim()
}

function packBlock(block, tokenBudget) {
  const content = String(block?.content || '').trim()
  const full = blockText(block, content)
  if (!full || tokenBudget <= 0) return { text: '', truncated: Boolean(full), hasContent: false }
  if (estimateTokens(full) <= tokenBudget) return { text: full, truncated: false, hasContent: Boolean(content) }

  const metadata = blockMetadata(block)
  const prefix = metadata ? `${metadata}\n` : ''
  const truncationNote = '\n...(该连续区段仍有未纳入内容)'
  const contentBudget = tokenBudget - estimateTokens(prefix) - estimateTokens(truncationNote)
  if (contentBudget <= 0) {
    return {
      text: clipByTokens(metadata || content, tokenBudget).text,
      truncated: true,
      hasContent: false,
    }
  }
  const clipped = clipByTokens(content, contentBudget)
  return {
    text: `${blockText(block, clipped.text)}${truncationNote}`,
    truncated: true,
    hasContent: Boolean(clipped.text),
  }
}

function allocateGroupBlocks(group, tokenBudget) {
  const blocks = group.blocks.filter(block => block.content)
  if (!blocks.length || tokenBudget <= 0) {
    return {
      text: '',
      included: [],
      omitted: blocks.map(block => block.range).filter(Boolean),
      omittedBlockCount: blocks.length,
      partial: blocks.length > 0,
    }
  }
  const total = blocks.reduce((sum, block) => sum + estimateTokens(blockText(block, block.content)), 0)
  if (total <= tokenBudget) {
    return {
      text: blocks.map(block => blockText(block, block.content)).join('\n'),
      included: blocks.map(block => block.range).filter(Boolean),
      omitted: [],
      omittedBlockCount: 0,
      partial: false,
    }
  }

  // Preserve a piece of every already-read range, then spend leftover budget
  // in reading order. This avoids the old policy where only three blocks could
  // survive and later continuations disappeared completely.
  const perBlock = Math.max(1, Math.floor(tokenBudget / blocks.length))
  let remaining = tokenBudget
  const selected = []
  for (const block of blocks) {
    if (remaining <= 0) break
    const allowance = Math.min(perBlock, remaining)
    const packed = packBlock(block, allowance)
    if (packed.text) {
      selected.push({ block, ...packed })
      remaining -= estimateTokens(packed.text)
    }
  }
  for (const item of selected) {
    if (remaining <= 8 || !item.truncated) continue
    const previousTokens = estimateTokens(item.text)
    const expanded = packBlock(item.block, previousTokens + remaining)
    const additionalTokens = Math.max(0, estimateTokens(expanded.text) - previousTokens)
    if (additionalTokens > 0) {
      item.text = expanded.text
      item.truncated = expanded.truncated
      item.hasContent = expanded.hasContent
      remaining -= additionalTokens
    }
  }
  const selectedByBlock = new Map(selected.map(item => [item.block, item]))
  const included = selected.filter(item => item.hasContent).map(item => item.block.range).filter(Boolean)
  const omitted = []
  const omittedKeys = new Set()
  let omittedBlockCount = 0
  for (const block of blocks) {
    const item = selectedByBlock.get(block)
    if (item?.hasContent && !item.truncated) continue
    omittedBlockCount += 1
    if (block.range) {
      const key = stableEvidenceKey(block.range)
      if (!omittedKeys.has(key)) {
        omittedKeys.add(key)
        omitted.push(block.range)
      }
    }
  }
  return {
    text: selected.map(item => item.text).join('\n'),
    included,
    omitted,
    omittedBlockCount,
    partial: omittedBlockCount > 0,
  }
}

function compactCoverage(groups) {
  return groups.map(group => ({
    sourceId: group.sourceId,
    name: group.name,
    kind: group.kind,
    includedRanges: group.includedRanges || [],
    omittedRanges: group.omittedRanges || [],
    omittedBlockCount: group.omittedBlockCount || 0,
    status: group.status || 'not_included',
  }))
}

export function resolveModelContextWindow({ db = null, providerId = '', model = '', modelCtx = '', contextWindow = '', fallback = DEFAULT_CONTEXT_WINDOW } = {}) {
  const explicitValues = [contextWindow, modelCtx]
  let value = explicitValues.find(candidate => parseContextWindow(candidate, 0) > 0) || ''
  // The renderer can legitimately send '?' for a model whose catalog has not
  // been refreshed yet. Treat unusable metadata exactly like missing metadata
  // and look up the persisted model profile before using the fallback.
  if (parseContextWindow(value, 0) <= 0 && db?.getSetting) {
    try {
      const providers = db.getSetting('providers')
      const provider = Array.isArray(providers) ? providers.find(item => item?.id === providerId) : null
      const found = provider?.models?.find(item => item?.id === model)
      value = found?.ctx || found?.context_window || found?.contextWindow || ''
    } catch (_) {}
  }
  return parseContextWindow(value, fallback)
}

export function buildContextPack({
  topic = '',
  params = {},
  evidence = {},
  systemPrompt = '',
  moduleConfig = {},
  modelContextWindow,
  modelCtx,
  contextWindow,
  providerId = '',
  model = '',
  db,
} = {}) {
  const contextTokens = resolveModelContextWindow({ db, providerId, model, modelCtx, contextWindow: contextWindow || modelContextWindow })
  const outputTokens = Math.max(512, parseTokenBudget(moduleConfig.max_tokens || moduleConfig.maxOutput || 8192, 8192))
  // A malformed first response is replayed together with the original prompt
  // during the format-only repair call. Reserve a full output-sized input
  // cushion (plus a small instruction margin), rather than assuming the
  // repair response will be tiny and risking a second request over the model
  // window.
  const repairTokens = Math.min(16384, Math.max(1024, outputTokens + 512))
  const safetyTokens = Math.min(4096, Math.max(512, Math.ceil(contextTokens * 0.04)))
  const systemTokens = estimateTokens(systemPrompt)
  const header = basePromptParts(topic, params)
  const groups = createGroups(evidence)
  // Keep metadata itself bounded. A run can have 20 selected local files and
  // several retrieval blocks; source descriptions should not crowd out the
  // material they describe, especially for a small configured model.
  const hardInputBudget = Math.max(0, contextTokens - outputTokens - repairTokens - safetyTokens - systemTokens)
  const directoryBudget = Math.max(256, Math.min(4096, Math.floor(hardInputBudget * 0.08)))
  const cards = groups.length ? sourceDirectory(groups, directoryBudget) : ''
  const baseHeader = header.join('\n\n')
  const fixed = `${baseHeader}${cards}`
  const rawEvidenceBudget = contextTokens - outputTokens - repairTokens - safetyTokens - systemTokens - estimateTokens(fixed) - 512
  const evidenceBudget = Math.max(0, rawEvidenceBudget)

  const activeGroups = groups.filter(group => group.blocks.some(block => block.content))
  const minShare = activeGroups.length ? Math.floor(evidenceBudget / activeGroups.length) : 0
  const allocations = new Map(activeGroups.map(group => [group.key, minShare]))
  let allocated = [...allocations.values()].reduce((sum, value) => sum + value, 0)
  let remaining = Math.max(0, evidenceBudget - allocated)
  const ordered = [...activeGroups].sort((a, b) => b.priority - a.priority || a.sourceOrder - b.sourceOrder)
  while (remaining > 0 && ordered.length) {
    let progressed = false
    for (const group of ordered) {
      const total = group.blocks.reduce((sum, block) => sum + estimateTokens(blockText(block, block.content)), 0)
      const current = allocations.get(group.key) || 0
      if (total <= current) continue
      const add = Math.min(240, remaining, total - current)
      if (add <= 0) continue
      allocations.set(group.key, current + add)
      remaining -= add
      progressed = true
      if (!remaining) break
    }
    if (!progressed) break
  }

  const sections = { local: [], kb: [], wiki: [], web: [] }
  for (const group of groups) {
    const allocation = allocations.get(group.key) || 0
    const packed = allocateGroupBlocks(group, allocation)
    group.includedRanges = packed.included
    group.omittedRanges = packed.omitted
    group.omittedBlockCount = packed.omittedBlockCount || 0
    group.status = !group.blocks.length
      ? 'unreadable_or_unavailable'
      : packed.partial || packed.omittedBlockCount
        ? 'partial'
        : allocation
          ? 'included'
          : 'not_included'
    if (packed.text) sections[group.kind === 'local' ? 'local' : group.kind]?.push(`${groupHeader(group)}\n${packed.text}`)
  }

  const coverageBudget = Math.max(192, Math.min(3072, Math.floor(hardInputBudget * 0.06)))
  const coverage = coverageNotice(groups, coverageBudget)
  const evidenceParts = []
  if (sections.local.length) evidenceParts.push('\n[本地资料原文证据]\n' + sections.local.join('\n'))
  if (sections.kb.length) evidenceParts.push('\n[知识库检索证据]\n' + sections.kb.join('\n'))
  if (sections.wiki.length) evidenceParts.push('\n[本地 Wiki 证据]\n' + sections.wiki.join('\n'))
  if (sections.web.length) evidenceParts.push('\n[联网搜索证据]\n' + sections.web.join('\n'))
  const tailParts = [
    coverage ? `\n${coverage}` : '',
    '\n请优先依据用户选中的本地资料；知识库和 Wiki 仅在相关时补充，联网内容只作补充且必须标明不确定性。',
    '\n请严格按系统提示规定的 JSON 结构输出，不要任何前后缀。',
  ].filter(Boolean)
  const parts = [fixed, ...evidenceParts, ...tailParts]

  // Metadata and coverage notices add a small amount of text after evidence
  // allocation. Keep a final hard guard so provider-specific tokenization
  // differences cannot turn a carefully budgeted pack into an over-limit
  // request. Trim evidence first, then the optional coverage directory; keep
  // the topic/configuration and final JSON instructions intact whenever the
  // provider budget allows it.
  let prompt = parts.join('\n')
  if (estimateTokens(prompt) > hardInputBudget) {
    const instruction = tailParts[tailParts.length - 1] || ''
    const guidance = tailParts.length > 1 ? tailParts[tailParts.length - 2] : ''
    const optionalCoverage = tailParts.length > 2 ? tailParts.slice(0, -2).join('\n') : ''
    const immutableTail = `${guidance}\n${instruction}`.trim()
    const fixedTokens = estimateTokens(fixed)
    const tailTokens = estimateTokens(immutableTail)
    let fixedText = fixed
    let availableEvidence = hardInputBudget - fixedTokens - tailTokens - estimateTokens(optionalCoverage)

    // Source cards are useful metadata, but the user topic/configuration and
    // the output contract are more important when a very small window is used.
    if (availableEvidence < 0 && cards) {
      fixedText = baseHeader
      availableEvidence = hardInputBudget - estimateTokens(fixedText) - tailTokens - estimateTokens(optionalCoverage)
    }

    const coverageBudgetForGuard = Math.max(0, hardInputBudget - estimateTokens(fixedText) - tailTokens)
    const coverageText = optionalCoverage ? clipByTokens(optionalCoverage, coverageBudgetForGuard).text : ''
    availableEvidence = Math.max(0, hardInputBudget - estimateTokens(fixedText) - estimateTokens(coverageText) - tailTokens)
    const evidenceText = clipByTokens(evidenceParts.join('\n'), availableEvidence).text
    prompt = [fixedText, evidenceText, coverageText, immutableTail]
      .filter(Boolean)
      .join('\n')

    if (estimateTokens(prompt) > hardInputBudget) {
      // This only occurs when the topic/configuration itself is larger than
      // the provider budget. Preserve the JSON contract as the last line.
      const instructionBudget = Math.min(estimateTokens(instruction), hardInputBudget)
      const bodyBudget = Math.max(0, hardInputBudget - instructionBudget)
      prompt = `${clipByTokens(`${fixedText}\n${evidenceText}`, bodyBudget).text}\n${clipByTokens(instruction, instructionBudget).text}`.trim()
    }
  }

  return {
    prompt,
    contextWindow: contextTokens,
    estimatedPromptTokens: estimateTokens(prompt),
    evidenceBudget,
    coverage: compactCoverage(groups),
    sourceCount: groups.length,
    includedSourceCount: groups.filter(group => group.status === 'included' || group.status === 'partial').length,
  }
}

export const CONTEXT_PACK_DEFAULTS = {
  DEFAULT_CONTEXT_WINDOW,
  MIN_CONTEXT_WINDOW,
  MAX_CONTEXT_WINDOW,
}
