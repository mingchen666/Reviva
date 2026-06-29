import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { FileContextReader } from './FileContextReader.js'
import { KnowledgeContextSearcher } from './KnowledgeContextSearcher.js'

export class JsonArtifactRunner {
  constructor({ db, workDirService, emitProgress, send }) {
    this._db = db
    this._emitProgress = emitProgress
    this._send = send
    this._fileReader = new FileContextReader({ db, workDirService })
    this._knowledgeSearcher = new KnowledgeContextSearcher({ emitProgress })
  }

  async run({ task, toolId, moduleConfig, topic, params, ctxItems, providerId, apiFormat, apiKey, baseUrl, model, cloudContext, abortController, validateResult }) {
    this._emitProgress(task.id, 20, '读取参考资料...')
    const fileBlocks = await this._fileReader.read(ctxItems)

    this._emitProgress(task.id, 36, '检索知识库...')
    const kbBlocks = await this._knowledgeSearcher.search({
      taskId: task.id,
      toolId,
      moduleConfig,
      topic,
      ctxItems,
      cloudContext,
      abortSignal: abortController.signal,
    })

    this._emitProgress(task.id, 46, '组装提示词...')
    const userPrompt = this._buildUserPrompt(topic, params, fileBlocks, kbBlocks)

    this._emitProgress(task.id, 55, '正在生成结构化内容...')
    const llm = this._createModel(providerId, apiKey, baseUrl, model, {
      temperature: moduleConfig.temperature ?? 0.4,
      maxTokens: moduleConfig.max_tokens ?? 8192,
      apiFormat,
    })

    const response = await llm.invoke(
      [
        { role: 'system', content: moduleConfig.prompt || '' },
        new HumanMessage(userPrompt),
      ],
      { signal: abortController.signal },
    )

    if (abortController.signal.aborted) return

    const text = this._extractText(response)
    this._emitProgress(task.id, 80, '解析 JSON 响应...')

    const parsed = this._extractJson(text)
    if (!parsed) throw new Error('模型未返回合法 JSON，请重试或更换模型')

    const validated = typeof validateResult === 'function' ? validateResult(parsed) : { ok: true }
    if (validated.error) throw new Error(validated.error)

    this._emitProgress(task.id, 92, '保存成果...')
    const rules = moduleConfig.artifact_rules || {}
    const artifact = this._db.createArtifact({
      group_id: task.group_id || 'default',
      conversation_id: task.conversation_id || '',
      title: parsed.title || task.name,
      type: rules.artifact_type || toolId,
      icon: rules.icon || moduleConfig.icon || 'ri-file-line',
      color: rules.color || 'brand',
      storage_type: 'data',
      content: JSON.stringify(parsed),
      agent_name: moduleConfig.name || moduleConfig.english_name,
      skill_name: '',
    })

    this._db.updateTask(task.id, {
      status: 'completed',
      progress: 100,
      artifact_id: artifact.id,
      completed_at: new Date().toISOString(),
      result: '',
    })

    this._send('genTask:completed', { taskId: task.id, artifactId: artifact.id, groupId: task.group_id })
    this._send('agent:artifactsCreated', { groupId: task.group_id || 'default', agentEnglishName: moduleConfig.english_name })
  }

  _buildUserPrompt(topic, params, fileBlocks, kbBlocks = []) {
    const parts = []
    parts.push('[主题]\n' + (topic || '请基于参考资料推断主题'))
    if (params && Object.keys(params).length) {
      parts.push('\n[用户配置]\n' + JSON.stringify(params, null, 2))
    }
    if (fileBlocks.length) {
      parts.push('\n[参考资料]')
      for (const b of fileBlocks) {
        parts.push(`\n--- ${b.name} ---\n${b.content}`)
      }
    }
    if (kbBlocks.length) {
      parts.push('\n[知识库检索]')
      for (const b of kbBlocks) {
        parts.push(`\n--- 查询: ${b.query} ---\n${b.content}`)
      }
    }
    if (fileBlocks.length || kbBlocks.length) {
      parts.push('\n请优先依据用户选中的本地文档和知识库检索结果生成，避免引入未给出的无关信息。')
    }
    parts.push('\n请严格按系统提示规定的 JSON 结构输出，不要任何前后缀。')
    return parts.join('\n')
  }

  _extractText(response) {
    if (!response) return ''
    if (typeof response === 'string') return response
    if (typeof response.content === 'string') return response.content
    if (Array.isArray(response.content)) {
      return response.content.map(c => (typeof c === 'string' ? c : c?.text || '')).join('')
    }
    return String(response.content || '')
  }

  _extractJson(text) {
    if (!text) return null
    let cleaned = text.trim()
    const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
    if (fence) cleaned = fence[1].trim()
    try { return JSON.parse(cleaned) } catch (_) {}
    const first = cleaned.indexOf('{')
    const last = cleaned.lastIndexOf('}')
    if (first >= 0 && last > first) {
      try { return JSON.parse(cleaned.slice(first, last + 1)) } catch (_) {}
    }
    return null
  }

  _createModel(providerId, apiKey, baseUrl, modelName, options = {}) {
    const common = { apiKey, model: modelName, maxRetries: 1 }
    if (options.temperature !== undefined) common.temperature = options.temperature
    if (options.maxTokens) common.maxTokens = options.maxTokens

    if ((options.apiFormat || '').toLowerCase() === 'anthropic' || (providerId || '').toLowerCase() === 'anthropic') {
      const baseURL = (baseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '') || undefined
      const opts = { ...common, timeout: 180000 }
      if (baseURL) opts.baseURL = baseURL
      return new ChatAnthropic(opts)
    }

    const opts = { ...common, timeout: 180000, streaming: false }
    if (baseUrl) {
      opts.configuration = { baseURL: baseUrl }
      opts.useResponsesApi = false
    }
    return new ChatOpenAI(opts)
  }
}
