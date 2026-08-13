// electron/GenerationTaskService.js
// IPC and lifecycle orchestration for async generation jobs.

import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { BuiltinModuleLoader } from './generation/BuiltinModuleLoader.js'
import {
  GenerationModuleRegistry,
  generationTaskName,
} from './generation/GenerationModuleRegistry.js'
import { hasGenerationSource, normalizeGenerationSourceScope } from './generation/GenerationSourceScope.js'

export class GenerationTaskService {
  constructor(dbService, getWin, workDirService, agentService = null) {
    this._db = dbService
    this._getWin = getWin
    this._workDir = workDirService
    this._agentService = agentService
    this._activeRuns = new Map()
    this._cloudPollTimers = new Map()
    this._moduleLoader = new BuiltinModuleLoader({ db: dbService })
    this._moduleRegistry = new GenerationModuleRegistry({
      db: dbService,
      workDirService,
      agentService,
      emitProgress: (taskId, progress, message) => this._emitProgress(taskId, progress, message),
      send: (channel, payload) => this._send(channel, payload),
    })
  }

  init() {
    ipcMain.handle('genTask:create', (_, req) => this.handleCreate(req))
    ipcMain.handle('genTask:cancel', (_, taskId) => this.handleCancel(taskId))
    ipcMain.handle('genTask:pollCloud', (_, taskId) => this._pollCloudOnce(taskId))
  }

  _send(channel, payload) {
    const win = this._getWin?.()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  async handleCreate(request) {
    const {
      toolId, mode = 'local', topic = '', groupId = 'default', conversationId = '',
      params = {}, ctxItems = [],
      providerId, apiFormat, apiKey, baseUrl, model, modelCtx = '', contextWindow = '', modelHasVision = false, visionModel = null, toolProviderConfigs = {}, cloudContext = {}, sourceScope = {}, wikiContext = {},
    } = request || {}

    const module = this._moduleRegistry.get(toolId)
    if (!module) return { success: false, error: `不支持的工具类型: ${toolId}` }
    if (!module.supports.includes(mode)) return { success: false, error: `${toolId} 不支持 ${mode} 模式` }

    if (!module.canRun(mode)) {
      return { success: false, error: mode === 'cloud' ? '云端生成服务未就绪，请重启应用' : '内置智能体运行服务未就绪，请重启应用' }
    }

    let moduleConfig = this._moduleLoader.load(module.agentEnglishName)
    if (!moduleConfig && mode === 'cloud') {
      moduleConfig = {
        id: `cloud_${toolId}`,
        name: module.label || toolId,
        english_name: module.agentEnglishName || toolId,
        architecture: 'cloud',
      }
    }
    if (!moduleConfig) return { success: false, error: `内置 agent 未就绪: ${module.agentEnglishName}` }
    if (mode === 'local' && (!providerId || !apiKey || !model)) {
      return { success: false, error: '请先在设置中配置可用的模型 Provider' }
    }

    const referenceCtxItems = this._toReferenceCtxItems(ctxItems)
    const normalizedSourceScope = normalizeGenerationSourceScope({
      ctxItems: referenceCtxItems,
      sourceScope,
      wikiContext,
      params,
    })
    if (module.requiresTopicOrContext && !String(topic || '').trim() && !hasGenerationSource(normalizedSourceScope)) {
      return { success: false, error: '请填写主题，或选择具体文件、知识库或 Wiki' }
    }
    const taskStartedAt = new Date().toISOString()
    const task = this._db.createTask({
      name: generationTaskName(module, topic),
      type: 'generation',
      status: 'running',
      progress: 5,
      architecture: moduleConfig.architecture || '',
      agent_id: moduleConfig.id || '',
      tool_id: toolId,
      mode,
      conversation_id: conversationId,
      group_id: groupId,
      created_at: taskStartedAt,
      params: {
        topic,
        ...params,
        ctxItems: referenceCtxItems,
        ctxNames: referenceCtxItems.map(c => c.name).filter(Boolean).slice(0, 8),
        sourceScope: normalizedSourceScope,
      },
    })

    const abortController = new AbortController()
    this._activeRuns.set(task.id, abortController)
    const hardTimeoutMs = Number(moduleConfig.hard_timeout_ms)
    let timeoutHandle = null
    const timeoutPromise = Number.isFinite(hardTimeoutMs) && hardTimeoutMs > 0
      ? new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          const error = new Error('任务执行超时')
          if (!abortController.signal.aborted) abortController.abort(error)
          reject(error)
        }, hardTimeoutMs)
      })
      : null

    const runner = module.run({
      task,
      mode,
      moduleConfig,
      topic,
      params,
      ctxItems,
      providerId,
      apiFormat,
      apiKey,
      baseUrl,
      model,
      modelCtx,
      contextWindow,
      modelHasVision,
      visionModel,
      toolProviderConfigs,
      cloudContext,
      sourceScope: normalizedSourceScope,
      wikiContext: { enabled: normalizedSourceScope.wikiIds.length > 0, mode: 'selected', wikiIds: normalizedSourceScope.wikiIds },
      abortController,
    })

    this._runTask(task, abortController, timeoutPromise ? Promise.race([runner, timeoutPromise]) : runner, timeoutHandle)
    return { success: true, task }
  }

  async handleCancel(taskId) {
    const ctrl = this._activeRuns.get(taskId)
    if (ctrl) {
      try { ctrl.abort() } catch (_) {}
      this._activeRuns.delete(taskId)
    }
    const t = this._db.getTask(taskId)
    if (t && t.status === 'running') {
      this._db.updateTask(taskId, {
        status: 'cancelled',
        error: '用户取消',
        progress: 0,
        completed_at: new Date().toISOString(),
      })
      this._send('genTask:failed', { taskId, error: '用户取消' })
    }
    return { success: true }
  }

  _runTask(task, abortController, runnerPromise, timeoutHandle = null) {
    runnerPromise
      .then(result => {
        if (result && !abortController.signal.aborted) this._send('genTask:completed', result)
      })
      .catch(err => {
        console.error('[GenerationTaskService] generation task failed:', err)
        if (abortController.signal.aborted) {
          const latest = this._db.getTask(task.id)
          if (latest?.status === 'running') {
            const reason = abortController.signal.reason?.message || '任务已中断或超时'
            this._markFailed(task.id, reason)
          }
          return
        }
        this._markFailed(task.id, this._formatRunError(err))
      })
      .finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle)
        this._activeRuns.delete(task.id)
      })
  }

  _emitProgress(taskId, progress, message) {
    this._db.updateTask(taskId, { progress, result: message || '' })
    this._send('genTask:progress', { taskId, progress, message })
  }

  _markFailed(taskId, error) {
    this._db.updateTask(taskId, {
      status: 'failed',
      error,
      progress: 0,
      completed_at: new Date().toISOString(),
    })
    this._send('genTask:failed', { taskId, error })
  }

  _formatRunError(err) {
    const raw = err?.message || String(err || '')
    const msg = String(raw)
    const isModelAuth = /MODEL_AUTHENTICATION|401|authentication|unauthorized|invalid api key|invalid x-api-key|令牌已过期|验证不正确/i.test(msg)
    if (!isModelAuth) return msg
    const detail = msg.length > 500 ? `${msg.slice(0, 500)}...` : msg
    return `模型服务认证失败：API Key 已过期或不正确，请检查设置中的默认模型 Provider。${detail ? `\n${detail}` : ''}`
  }

  _toReferenceCtxItems(ctxItems = []) {
    return (Array.isArray(ctxItems) ? ctxItems : []).map((item) => {
      const type = item?.type || (item?.isDirectory ? 'folder' : 'file')
      const ref = {
        type,
        id: item?.id || '',
        name: item?.name || item?.path || '',
        icon: item?.icon || '',
      }
      if (item?.path) ref.path = item.path
      if (item?.kbId) ref.kbId = item.kbId
      if (item?.docId) ref.docId = item.docId
      if (item?.mediaId || item?.media_id) ref.mediaId = item.mediaId || item.media_id
      if (item?.mediaType || item?.media_type) ref.mediaType = item.mediaType || item.media_type
      if (item?.mime || item?.mimeType || item?.mime_type) ref.mime = item.mime || item.mimeType || item.mime_type
      if (item?.isDirectory !== undefined) ref.isDirectory = !!item.isDirectory
      return ref
    }).filter(item => item.name || item.path || item.kbId || item.docId)
  }

  async _pollCloudOnce(taskId) {
    const t = this._db.getTask(taskId)
    if (!t || t.mode !== 'cloud') return { success: false, error: 'task not found or not cloud' }
    return { success: false, error: '云端任务已由后台轮询处理' }
  }

  // Reserved for future cloud mode: download remote artifacts into the workspace.
  async _downloadArtifact(url, suggestedName) {
    const root = this._workDir?.getRootPath?.()
    if (!root) throw new Error('未初始化工作目录')
    const date = new Date().toISOString().slice(0, 10)
    const dir = path.join(root, 'artifacts', date)
    await fs.promises.mkdir(dir, { recursive: true })
    const safe = (suggestedName || `artifact-${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
    const filePath = path.join(dir, safe)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
    const arr = new Uint8Array(await res.arrayBuffer())
    await fs.promises.writeFile(filePath, arr)
    return filePath
  }
}
