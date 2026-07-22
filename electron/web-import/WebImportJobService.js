import { normalizeWebImportError, WEB_IMPORT_ERROR_CODES, WebImportError } from './WebImportErrors.js'

const STAGE_PROGRESS = { queued: 0, fetching: 20, processing: 60, writing: 85, completed: 100 }

export class WebImportJobService {
  constructor({ dbService, webImportService, docsWriter, wikiService, getWin, ipcMain } = {}) {
    this._db = dbService
    this._webImport = webImportService
    this._docsWriter = docsWriter
    this._wiki = wikiService
    this._getWin = getWin || (() => null)
    this._ipcMain = ipcMain || null
    this._queue = []
    this._queuedIds = new Set()
    this._runningByProvider = new Map()
    this._providerConcurrency = 2
  }

  init() {
    if (!this._ipcMain) throw new Error('WebImportJobService requires ipcMain')
    this._ipcMain.handle('webImport:getSettings', () => this._webImport.getSettings())
    this._ipcMain.handle('webImport:saveSettings', (_, patch) => this._webImport.setSettings(patch))
    this._ipcMain.handle('webImport:createJob', (_, data) => this.createJob(data))
    this._ipcMain.handle('webImport:listJobs', (_, filters) => ({ success: true, data: this.listJobs(filters) }))
    this._ipcMain.handle('webImport:getJob', (_, id) => ({ success: true, data: this.getJob(id) }))
    this._ipcMain.handle('webImport:retryJob', (_, id) => this.retryJob(id))
    this._ipcMain.handle('webImport:deleteJob', (_, id) => this.deleteJobRecord(id))
    this._ipcMain.handle('webImport:clearFinishedJobs', (_, filters) => this.clearFinishedJobs(filters))
  }

  async restorePendingJobs() {
    this._db.markRunningWebImportJobsInterrupted()
    for (const job of this._db.listPendingWebImportJobs()) this._enqueue(job.id)
    this._drain()
  }

  createJob(data = {}) {
    const targetType = String(data.targetType || '')
    const targetRef = String(data.targetRef ?? '')
    if (!['docs', 'wiki'].includes(targetType)) throw new WebImportError(WEB_IMPORT_ERROR_CODES.TARGET_MISSING, '网页导入目标无效。')
    if (targetType === 'wiki' && !targetRef) throw new WebImportError(WEB_IMPORT_ERROR_CODES.TARGET_MISSING, '未选择 Wiki。')
    const settings = this._webImport.getStoredSettings()
    if (!settings.selectedProvider) throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_NOT_SELECTED, '请先在文档解析设置中选择网页解析引擎。')
    const formats = targetType === 'wiki' ? ['markdown'] : (data.includeHtml ? ['markdown', 'html'] : ['markdown'])
    const job = this._db.createWebImportJob({
      targetType, targetRef, requestedUrl: String(data.url || '').trim(),
      provider: settings.selectedProvider, formats, fileName: String(data.fileName || '').trim(),
    })
    this._enqueue(job.id)
    this._drain()
    return { success: true, data: job }
  }

  listJobs(filters = {}) { return this._db.listWebImportJobs(filters) }
  getJob(id) { return this._db.getWebImportJob(id) }

  retryJob(id) {
    const original = this.getJob(id)
    if (!original) return { success: false, error: '任务不存在。' }
    if (!['failed', 'interrupted', 'partial'].includes(original.status)) return { success: false, error: '当前任务状态不能重新导入。' }
    const job = this._db.createWebImportJob({
      targetType: original.target_type,
      targetRef: original.target_ref,
      requestedUrl: original.requested_url,
      provider: this._webImport.getStoredSettings().selectedProvider || original.provider,
      formats: original.formats,
      fileName: original.file_name,
      retryOf: original.id,
    })
    this._enqueue(job.id)
    this._drain()
    return { success: true, data: job }
  }

  deleteJobRecord(id) {
    const job = this.getJob(id)
    if (!job) return { success: true, changes: 0 }
    if (['pending', 'running'].includes(job.status)) return { success: false, error: '运行中的任务不能移除记录。' }
    return this._db.deleteWebImportJob(id)
  }

  clearFinishedJobs(filters) { return this._db.clearFinishedWebImportJobs(filters || {}) }

  _enqueue(id) {
    if (!id || this._queuedIds.has(id)) return
    this._queuedIds.add(id)
    this._queue.push(id)
  }

  _drain() {
    for (let index = 0; index < this._queue.length;) {
      const id = this._queue[index]
      const job = this.getJob(id)
      if (!job || job.status !== 'pending') {
        this._queue.splice(index, 1)
        this._queuedIds.delete(id)
        continue
      }
      const running = this._runningByProvider.get(job.provider) || 0
      if (running >= this._providerConcurrency) { index += 1; continue }
      this._queue.splice(index, 1)
      this._queuedIds.delete(id)
      this._runningByProvider.set(job.provider, running + 1)
      void this._run(job).finally(() => {
        this._runningByProvider.set(job.provider, Math.max(0, (this._runningByProvider.get(job.provider) || 1) - 1))
        this._drain()
      })
    }
  }

  _update(id, patch) {
    const job = this._db.updateWebImportJob(id, patch)
    this._send('webImport:jobUpdated', job)
    return job
  }

  _stage(id, stage, patch = {}) {
    return this._update(id, { stage, progress: STAGE_PROGRESS[stage], ...patch })
  }

  _send(channel, payload) {
    const win = this._getWin?.()
    if (win && !win.isDestroyed?.()) win.webContents?.send?.(channel, payload)
  }

  async _run(job) {
    const startedAt = new Date().toISOString()
    this._stage(job.id, 'fetching', { status: 'running', started_at: startedAt, error_code: '', error_message: '' })
    try {
      const document = await this._webImport.extract(job.requested_url, { providerId: job.provider, formats: job.formats })
      this._stage(job.id, 'processing', { title: document.title, final_url: document.finalUrl, usage: document.metadata?.usage || {} })
      this._stage(job.id, 'writing')
      let result
      if (job.target_type === 'docs') {
        result = await this._docsWriter.write({ targetRef: job.target_ref, document, fileName: job.file_name, includeHtml: job.formats.includes('html') })
      } else {
        result = await this._wiki.registerWebImportDocument(job.target_ref, document, { requestedUrl: job.requested_url })
        if (result?.success === false) throw new WebImportError(WEB_IMPORT_ERROR_CODES.WRITE_FAILED, result.error || '写入 Wiki 来源失败。')
      }
      const partial = !!result.htmlError
      const completed = this._stage(job.id, 'completed', {
        status: partial ? 'partial' : 'succeeded',
        title: result.title || document.title,
        result_paths: result.resultPaths || [],
        source_id: result.data?.id || result.sourceId || '',
        error_code: partial ? WEB_IMPORT_ERROR_CODES.HTML_FAILED : '',
        error_message: partial ? 'Markdown 已保存，但 HTML 保存失败。' : '',
        completed_at: new Date().toISOString(),
      })
      this._send('webImport:notification', completed)
    } catch (error) {
      const normalized = normalizeWebImportError(error, job.provider)
      const failed = this._stage(job.id, 'completed', {
        status: 'failed', error_code: normalized.code, error_message: normalized.message,
        completed_at: new Date().toISOString(),
      })
      this._send('webImport:notification', failed)
    }
  }
}
