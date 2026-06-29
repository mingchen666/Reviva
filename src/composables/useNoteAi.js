/**
 * useNoteAi — Lightweight wrapper around the chat IPC for one-shot
 * AI tasks in the notes editor (slash commands, selection ops, completion).
 *
 * Each call returns a Promise<string> with the full generated text. Streaming
 * tokens are forwarded via an optional `onChunk` callback so callers can stream
 * directly into the editor.
 *
 * NOT used for multi-turn conversations — that goes through ChatEngine.
 */
import { useSettingsStore } from '@/stores/settings'
import { parseModelRef } from '@/utils/modelRef'

export const NOTE_AI_COMMANDS = {
  continue: { icon: 'ri-edit-2-line', label: '续写', desc: '结合上下文自然续写当前内容', color: 'brand' },
  polish: { icon: 'ri-magic-line', label: '润色', desc: '让内容更流畅自然，保留原意', color: 'agent' },
  expand: { icon: 'ri-expand-horizontal-line', label: '扩写', desc: '补充细节，让内容更完整', color: 'emerald' },
  shorten: { icon: 'ri-contract-horizontal-line', label: '缩写', desc: '压缩篇幅，保留核心意思', color: 'amber' },
  translate: { icon: 'ri-translate-2', label: '译为英文', desc: '只输出英文译文', color: 'blue' },
  'translate-zh': { icon: 'ri-translate', label: '译为中文', desc: '只输出中文译文', color: 'blue' },
  summarize: { icon: 'ri-list-check-2', label: '总结要点', desc: '提炼整篇内容的核心要点', color: 'emerald' },
  outline: { icon: 'ri-mind-map', label: '生成大纲', desc: '根据全文整理结构化大纲', color: 'agent' },
  explain: { icon: 'ri-question-answer-line', label: '解释', desc: '通俗说明一段内容的含义', color: 'rose' },
  formula: { icon: 'ri-function-line', label: '生成公式', desc: '根据描述生成对应公式', color: 'amber' },
}

function pickProviderAndModel(settingsStore, opts = {}) {
  const providers = settingsStore.providers || []
  const providerConfigured = p => settingsStore.providerConfigured
    ? settingsStore.providerConfigured(p)
    : !!(p?.baseUrl && p.apiKey)
  let providerId = opts.providerId
  let model = opts.model
  const parsedModel = parseModelRef(model)

  if (parsedModel.modelId) {
    if (parsedModel.scoped) providerId = parsedModel.providerId
    model = parsedModel.modelId
  }

  if (model && !providerId) {
    const p = providers.find(p => p.enabled && providerConfigured(p) && p.models?.some(m => m.id === model && m.tier !== 'embedding' && m.enabled))
    if (p) providerId = p.id
  }

  if (providerId && !model) {
    const p = providers.find(p => p.id === providerId && p.enabled && providerConfigured(p))
    model = p?.models?.find(m => m.tier !== 'embedding' && m.enabled)?.id || ''
  }

  if (!providerId || !model) {
    const defaultModelRef = settingsStore.defaultModels?.skill || settingsStore.defaultModels?.chat || ''
    const parsedDefault = parseModelRef(defaultModelRef)

    if (parsedDefault.scoped) {
      const p = providers.find(p => p.id === parsedDefault.providerId && p.enabled && providerConfigured(p))
      const m = p?.models?.find(m => m.id === parsedDefault.modelId && m.tier !== 'embedding' && m.enabled)
      if (p && m) {
        providerId = providerId || p.id
        model = model || m.id
      }
    } else if (parsedDefault.modelId) {
      for (const p of providers) {
        if (!p.enabled || !providerConfigured(p)) continue
        const m = p.models?.find(m => m.id === parsedDefault.modelId && m.tier !== 'embedding' && m.enabled)
        if (m) {
          providerId = providerId || p.id
          model = model || m.id
          break
        }
      }
    }
  }

  if (!providerId || !model) {
    const p = providers.find(p => p.enabled && providerConfigured(p))
    if (p) {
      providerId = providerId || p.id
      const m = p.models?.find(m => m.tier !== 'embedding' && m.enabled)
      model = model || m?.id
    }
  }

  const provider = providers.find(p => p.id === providerId)
  if (!provider) throw new Error('未找到可用的模型服务商')
  if (!providerConfigured(provider)) throw new Error('服务商未完成模型配置')
  if (!model) throw new Error('未指定模型')
  if (!provider.models?.some(m => m.id === model && m.enabled && m.tier !== 'embedding')) {
    throw new Error('所选模型不可用，请重新选择')
  }

  return { provider, model }
}

function buildPromptContext({
  title = '',
  scope = 'selection',
  selection = '',
  segment = '',
  fullDocument = '',
  prefix = '',
  suffix = '',
}) {
  const parts = []
  if (title) parts.push(`笔记标题：${title}`)
  parts.push(`操作范围：${scope === 'selection' ? '选中内容' : '文档内容'}`)
  if (selection) parts.push(`<选中内容>\n${selection}\n</选中内容>`)
  if (segment) parts.push(`<当前目标片段>\n${segment}\n</当前目标片段>`)
  if (fullDocument) parts.push(`<完整笔记>\n${fullDocument}\n</完整笔记>`)
  if (prefix || suffix) {
    parts.push(`<光标前上下文>\n${prefix}\n</光标前上下文>`)
    parts.push(`<光标后上下文>\n${suffix}\n</光标后上下文>`)
  }
  return parts.join('\n\n')
}

/**
 * Run a single AI request and resolve with the full response text.
 *
 * @param {Object} opts
 * @param {string} opts.systemPrompt
 * @param {string} opts.userPrompt
 * @param {string} [opts.providerId]
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens=800]
 * @param {number} [opts.temperature=0.6]
 * @param {AbortSignal} [opts.signal]
 * @param {(chunk:string, full:string)=>void} [opts.onChunk]
 * @returns {Promise<string>}
 */
export async function runNoteAiTask(opts) {
  const settingsStore = useSettingsStore()
  const { provider, model } = pickProviderAndModel(settingsStore, opts)
  const api = window.electronAPI?.chat
  if (!api?.start) throw new Error('Chat IPC 不可用')

  const requestId = 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2)
  const request = {
    requestId,
    msgId: requestId,
    conversationId: 'note_oneshot',
    providerId: provider.id,
    apiFormat: provider.apiFormat || (provider.id === 'anthropic' ? 'anthropic' : 'openai'),
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    model,
    systemPrompt: opts.systemPrompt || '',
    messages: [{ role: 'user', content: opts.userPrompt || '' }],
    temperature: opts.temperature ?? 0.6,
    maxTokens: opts.maxTokens ?? 800,
    contextItems: [],
  }

  return new Promise((resolve, reject) => {
    let full = ''
    let settled = false
    const cleanup = () => { try { api.removeListeners?.() } catch {} }
    const onChunk = (d) => {
      if (d.requestId !== requestId) return
      const chunk = d.chunk || d
      const piece = chunk?.type === 'content'
        ? (chunk.text || '')
        : (chunk?.content ?? chunk?.delta ?? chunk?.text ?? '')
      if (!piece) return
      full += piece
      try { opts.onChunk?.(piece, full) } catch {}
    }
    const onDone = (d) => {
      if (d.requestId !== requestId) return
      if (!full && d.content) {
        full = d.content
        try { opts.onChunk?.(d.content, full) } catch {}
      }
      if (settled) return
      settled = true
      cleanup()
      resolve(full)
    }
    const onError = (d) => {
      if (d.requestId !== requestId) return
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(d.error || 'AI 请求失败'))
    }
    const onCancelled = (d) => {
      if (d?.requestId && d.requestId !== requestId) return
      if (settled) return
      settled = true
      cleanup()
      resolve(full)
    }
    api.onChunk(onChunk)
    api.onDone(onDone)
    api.onError(onError)
    api.onCancelled(onCancelled)

    opts.signal?.addEventListener('abort', () => {
      if (settled) return
      try { api.cancel?.(requestId) } catch {}
    })

    api.start(request).catch((err) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    })
  })
}

/** Pre-built prompt builders for the note editor's common operations. */
export const NOTE_AI_PROMPTS = {
  continue: ({ title = '', prefix = '', suffix = '' }) => ({
    system: '你是一个 Markdown 笔记续写助手。请结合光标前后的上下文，继续写出接下来最自然的 2-4 句。要求：1) 延续原文语气、节奏、视角与 Markdown 风格；2) 只继续推进当前内容，不要总结、不要下结论、不要另起标题；3) 不要重复已有句子；4) 不要解释任务；5) 只输出应插入的新内容。',
    user: buildPromptContext({ title, scope: 'document', prefix, suffix }),
  }),
  polish: ({ title = '', scope = 'selection', text = '', fullDocument = '' }) => ({
    system: '你是一个文本润色助手。请仅改进目标内容的表达方式，让它更自然、清晰、流畅。要求：1) 不改变原意，不新增信息，不改写成立场不同的新内容；2) 尽量保留原有段落结构、Markdown 标记、列表、链接、代码块和原语言；3) 不要输出说明、前缀、引号或版本对比；4) 只输出润色后的结果。',
    user: buildPromptContext({ title, scope, selection: scope === 'selection' ? text : '', segment: text, fullDocument: scope === 'document' ? fullDocument : '' }),
  }),
  expand: ({ title = '', scope = 'selection', text = '', fullDocument = '' }) => ({
    system: '你是一个写作扩写助手。请在原意不变的前提下，把目标内容扩写得更完整、更具体。要求：1) 可以补充必要的细节、例子或解释，但不要偏题，不要改变核心观点；2) 保留原有 Markdown 结构与语言；3) 不要解释任务，不要写导语或总结；4) 只输出扩写后的结果。',
    user: buildPromptContext({ title, scope, selection: scope === 'selection' ? text : '', segment: text, fullDocument: scope === 'document' ? fullDocument : '' }),
  }),
  shorten: ({ title = '', scope = 'selection', text = '', fullDocument = '' }) => ({
    system: '你是一个文本压缩助手。请在保留核心意思的前提下，把目标内容压缩得更简洁。要求：1) 删除重复、赘述和可省略细节，但不要新增观点，不要改变原意；2) 尽量保留原有 Markdown 结构与语言；3) 不要解释任务，不要输出前缀或备注；4) 只输出缩写后的结果。',
    user: buildPromptContext({ title, scope, selection: scope === 'selection' ? text : '', segment: text, fullDocument: scope === 'document' ? fullDocument : '' }),
  }),
  translate: ({ title = '', scope = 'selection', text = '', fullDocument = '', target = '英文' }) => ({
    system: `你是一个专业翻译助手。请把目标内容准确翻译成${target}。要求：1) 保留 Markdown 标记、链接、列表、代码块、术语和专有名词格式；2) 只输出译文，不要保留原文；3) 不要加解释、前缀、引号、总结或注释；4) 如果原文里有中英混合内容，只翻译需要翻译的部分并保持整体自然。`,
    user: buildPromptContext({ title, scope, selection: scope === 'selection' ? text : '', segment: text, fullDocument: scope === 'document' ? fullDocument : '' }),
  }),
  summarize: ({ title = '', fullDocument = '' }) => ({
    system: '你是一个总结助手。请基于整篇笔记提炼 3-6 个最重要的要点，并使用 Markdown 无序列表输出。要求：1) 每条尽量简洁，但保留关键信息；2) 不要写导语、结语、标题或额外说明；3) 不要照抄大段原文；4) 只输出要点列表。',
    user: buildPromptContext({ title, scope: 'document', fullDocument }),
  }),
  outline: ({ title = '', fullDocument = '' }) => ({
    system: '你是一个大纲整理助手。请根据整篇笔记内容整理出层次清晰的 Markdown 大纲。要求：1) 优先使用 ## 和 ### 标题组织结构，必要时补充列表项；2) 反映原文主题与层级，不要把全文改写成摘要；3) 不要输出前言、说明或解释；4) 只输出大纲。',
    user: buildPromptContext({ title, scope: 'document', fullDocument }),
  }),
  explain: ({ title = '', scope = 'selection', text = '', fullDocument = '' }) => ({
    system: '你是一个解释助手。请用通俗、准确的语言解释目标内容的含义、背景或用途。要求：1) 优先直接解释内容本身，必要时可给一个很短的例子；2) 不要复述任务，不要自我介绍；3) 输出 Markdown 格式；4) 只输出解释内容。',
    user: buildPromptContext({ title, scope, selection: scope === 'selection' ? text : '', segment: text, fullDocument: scope === 'document' ? fullDocument : '' }),
  }),
  formula: ({ title = '', scope = 'selection', text = '', fullDocument = '' }) => ({
    system: '你是一个数学公式助手。请根据目标内容生成最合适的 LaTeX 公式。要求：1) 优先输出 $$...$$ 块级公式；2) 只有在确有必要时，才补充一句极简说明；3) 不要输出多余解释、推导过程或前缀；4) 只给出最贴切的公式表达。',
    user: buildPromptContext({ title, scope, selection: scope === 'selection' ? text : '', segment: text, fullDocument: scope === 'document' ? fullDocument : '' }),
  }),
  completion: (prefix, suffix) => ({
    system: '你是一个智能补全引擎。基于光标前后的笔记内容，预测用户接下来要写的 1 句话（最多 25 字）。要求：(1) 与原文风格连贯；(2) 不要重复光标前的内容；(3) 仅输出补全的文本，不要任何解释、引号、Markdown 标记；(4) 如果无法合理预测则输出空字符串。',
    user: `<光标前>\n${prefix}\n</光标前>\n<光标后>\n${suffix}\n</光标后>`,
  }),
}
