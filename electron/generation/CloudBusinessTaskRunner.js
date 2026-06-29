import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { artifactType } from './cloud/common.js'
import { getCloudBusinessProfile } from './cloud/index.js'

const API_PREFIX = '/api/v1/app'
const POLL_INTERVAL_MS = 10_000
const MAX_UPLOAD_FILES = 10
const UPLOAD_EXTS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'md', 'markdown', 'txt', 'csv', 'json', 'html', 'htm',
])

export class CloudBusinessTaskRunner {
  constructor({ db, workDirService, emitProgress }) {
    this._db = db
    this._workDir = workDirService
    this._emitProgress = emitProgress
  }

  canRun() {
    return typeof fetch === 'function'
  }

  async run({ task, toolId, moduleConfig, topic, params = {}, ctxItems = [], cloudContext = {}, abortController }) {
    if (!this._workDir?.getRootPath?.()) throw new Error('请先在设置中配置授权根目录')

    const profile = this._profile(toolId)
    const baseUrl = this._normalizeBaseUrl(cloudContext.baseUrl)
    const token = String(cloudContext.token || '').trim()
    if (!token) throw new Error('请先登录~')

    this._emitProgress(task.id, 8, '准备上传资料...')
    const localFiles = this._collectLocalFiles(ctxItems)
    const knowledgeBase = this._buildKnowledgeBase(ctxItems, cloudContext)
    const requestPayload = profile.buildRequest({ topic, params, localFiles, knowledgeBase })

    this._emitProgress(task.id, 12, '提交任务...')
    const cloudTask = await this._createCloudTask({
      baseUrl,
      token,
      profile,
      requestPayload,
      localFiles,
      signal: abortController.signal,
    })

    this._updateTaskParams(task.id, {
      cloudTaskId: cloudTask.id,
      cloudProductCode: cloudTask.product_code,
      outputFormat: requestPayload.output_format || null,
    })
    this._db.updateTask(task.id, { cloud_task_id: cloudTask.id })

    const completedTask = await this._pollUntilDone({
      task,
      profile,
      baseUrl,
      token,
      cloudTaskId: cloudTask.id,
      signal: abortController.signal,
    })

    if (abortController.signal.aborted) return

    this._emitProgress(task.id, 92, '下载云端产物...')
    const artifactList = await this._fetchJson({
      baseUrl,
      token,
      pathName: `/business/tasks/${cloudTask.id}/artifacts`,
      signal: abortController.signal,
    })

    const createdArtifacts = await this._persistArtifacts({
      task,
      profile,
      moduleConfig,
      baseUrl,
      token,
      cloudTask: completedTask,
      cloudArtifacts: artifactList?.items || [],
      signal: abortController.signal,
    })

    if (!createdArtifacts.length) throw new Error('云端任务完成但未返回可预览产物')

    const artifactIds = createdArtifacts.map(a => a.id).filter(Boolean)
    this._db.updateTask(task.id, {
      status: 'completed',
      progress: 100,
      artifact_id: artifactIds[0] || '',
      completed_at: new Date().toISOString(),
      result: `已生成 ${createdArtifacts.length} 个云端产物`,
      params: {
        ...(this._db.getTask(task.id)?.params || {}),
        artifactIds,
        cloudTaskId: cloudTask.id,
      },
    })

    return {
      taskId: task.id,
      artifactId: artifactIds[0] || '',
      artifactIds,
      groupId: task.group_id,
    }
  }

  async _createCloudTask({ baseUrl, token, profile, requestPayload, localFiles, signal }) {
    const form = new FormData()
    form.append('request', JSON.stringify(requestPayload))

    for (const file of localFiles) {
      const buffer = await fs.promises.readFile(file.path)
      form.append('files', new Blob([buffer], { type: 'application/octet-stream' }), file.name)
    }

    return await this._fetchJson({
      baseUrl,
      token,
      pathName: profile.taskPath,
      init: { method: 'POST', body: form },
      signal,
    })
  }

  async _pollUntilDone({ task, profile, baseUrl, token, cloudTaskId, signal }) {
    while (!signal.aborted) {
      const cloudTask = await this._fetchJson({
        baseUrl,
        token,
        pathName: `/business/tasks/${cloudTaskId}`,
        signal,
      })

      const status = String(cloudTask.status || '').toUpperCase()
      const progress = this._normalizeProgress(cloudTask.progress_percent, status)
      const message = profile.stepLabel(cloudTask.current_step) || this._statusLabel(status)
      this._emitProgress(task.id, progress, message)

      if (status === 'SUCCEEDED') return cloudTask
      if (status === 'FAILED' || status === 'CANCELLED') {
        throw new Error(this._formatCloudFailure(cloudTask))
      }

      await this._delay(POLL_INTERVAL_MS, signal)
    }
    return null
  }

  async _persistArtifacts({ task, profile, moduleConfig, baseUrl, token, cloudTask, cloudArtifacts, signal }) {
    const selected = this._selectArtifacts(profile, cloudTask, cloudArtifacts)
    const outputDir = await this._ensureOutputDir(moduleConfig?.english_name || profile.defaultAgentEnglishName)
    const created = []

    for (const artifact of selected) {
      if (signal.aborted) break
      let filePath = ''
      const type = artifactType(artifact)
      if (type === 'FILE' && artifact.download_url) {
        filePath = await this._downloadFileArtifact({ baseUrl, token, artifact, outputDir, signal, toolId: profile.toolId })
      } else if (type === 'TEXT' && artifact.content_text != null) {
        filePath = await this._saveTextArtifact(outputDir, artifact, profile.toolId)
      } else if (type === 'JSON') {
        if (artifact.download_url) {
          filePath = await this._downloadFileArtifact({ baseUrl, token, artifact, outputDir, signal, toolId: profile.toolId })
        } else {
          filePath = await this._saveJsonArtifact(outputDir, artifact, profile.toolId)
        }
      } else if (artifact.download_url) {
        filePath = await this._downloadFileArtifact({ baseUrl, token, artifact, outputDir, signal, toolId: profile.toolId })
      }

      if (!filePath) continue
      const localArtifact = this._db.createArtifact({
        id: `art_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        group_id: task.group_id || 'default',
        conversation_id: task.conversation_id || '',
        title: this._titleFromFile(filePath, artifact.name),
        type: profile.artifactType,
        icon: this._iconForFile(filePath),
        color: profile.artifactColor,
        storage_type: 'file',
        file_path: filePath,
        content: '',
        agent_name: moduleConfig?.name || profile.label,
        skill_name: '',
      })
      created.push(localArtifact)
    }

    return created
  }

  _selectArtifacts(profile, cloudTask, cloudArtifacts) {
    const active = (cloudArtifacts || [])
      .filter(a => a && (!a.status || String(a.status).toUpperCase() === 'ACTIVE'))
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))

    return profile.selectArtifacts({ cloudTask, activeArtifacts: active })
  }

  _buildKnowledgeBase(ctxItems, cloudContext) {
    const collectionIds = new Set(cloudContext.defaultKbIds || [])
    const documentIds = new Set(cloudContext.defaultDocIds || [])
    for (const item of ctxItems || []) {
      if (item?.type === 'cloud_kb' && item.kbId) collectionIds.add(item.kbId)
      if (item?.type === 'cloud_doc') {
        if (item.kbId) collectionIds.add(item.kbId)
        if (item.docId) documentIds.add(item.docId)
      }
    }
    return {
      collection_ids: [...collectionIds],
      document_ids: [...documentIds],
    }
  }

  _collectLocalFiles(ctxItems) {
    const files = []
    const seen = new Set()
    const visitFile = (inputPath, meta = {}) => {
      if (files.length >= MAX_UPLOAD_FILES || !inputPath) return
      let resolved
      try {
        resolved = this._workDir.resolveAndValidate(inputPath, 'any')
        if (seen.has(resolved)) return
        const stat = fs.statSync(resolved)
        if (!stat.isFile()) return
      } catch (_) {
        return
      }
      const ext = path.extname(resolved).replace('.', '').toLowerCase()
      if (!UPLOAD_EXTS.has(ext)) return
      seen.add(resolved)
      files.push({
        id: meta.id || '',
        path: resolved,
        name: meta.name || path.basename(resolved),
        description: meta.description || '',
      })
    }

    const visitDir = (dirPath, depth = 0) => {
      if (files.length >= MAX_UPLOAD_FILES || depth > 2) return
      let resolved
      try {
        resolved = this._workDir.resolveAndValidate(dirPath, 'any')
        const stat = fs.statSync(resolved)
        if (!stat.isDirectory()) return
      } catch (_) {
        return
      }
      let entries = []
      try { entries = fs.readdirSync(resolved, { withFileTypes: true }) } catch (_) { return }
      for (const entry of entries) {
        if (files.length >= MAX_UPLOAD_FILES || entry.name.startsWith('.')) break
        const nextPath = path.join(resolved, entry.name)
        if (entry.isDirectory()) visitDir(nextPath, depth + 1)
        else if (entry.isFile()) visitFile(nextPath, { name: entry.name })
      }
    }

    for (const item of ctxItems || []) {
      if (files.length >= MAX_UPLOAD_FILES) break
      if (item?.type === 'cloud_kb' || item?.type === 'cloud_doc') continue
      if (item?.isDirectory || item?.type === 'folder' || item?.type === 'local_folder') visitDir(item.path)
      else visitFile(item?.path, { id: item?.id, name: item?.name, description: item?.description })
    }
    return files
  }

  async _downloadFileArtifact({ baseUrl, token, artifact, outputDir, signal, toolId }) {
    let current = artifact
    const initialName = this._safeFileName(this._fileArtifactName(current, toolId))
    const existing = await this._existingFileWithSize(outputDir, initialName, current.size_bytes)
    if (existing) return existing

    let response = await this._fetchBinaryResponse(baseUrl, token, current.download_url, signal)
    if (response.status === 403 && current.id) {
      current = await this._fetchJson({
        baseUrl,
        token,
        pathName: `/business/artifacts/${current.id}`,
        signal,
      })
      const refreshedName = this._safeFileName(this._fileArtifactName(current, toolId))
      const refreshedExisting = await this._existingFileWithSize(outputDir, refreshedName, current.size_bytes)
      if (refreshedExisting) return refreshedExisting
      response = await this._fetchBinaryResponse(baseUrl, token, current.download_url, signal)
    }
    if (!response.ok) throw new Error(`下载云端产物失败 HTTP ${response.status}`)

    const buffer = Buffer.from(await response.arrayBuffer())
    const responseFileName = this._fileNameFromContentDisposition(response.headers.get('content-disposition'))
    const fileName = this._safeFileName(this._fileArtifactName(current, toolId, responseFileName))
    const filePath = await this._targetPath(outputDir, fileName, current.size_bytes)
    if (fs.existsSync(filePath)) return filePath
    await fs.promises.writeFile(filePath, buffer)
    return filePath
  }

  async _existingFileWithSize(outputDir, fileName, expectedSize = 0) {
    const size = Number(expectedSize)
    if (!Number.isFinite(size) || size <= 0) return ''
    const filePath = path.join(outputDir, fileName)
    try {
      const stat = await fs.promises.stat(filePath)
      return stat.isFile() && stat.size === size ? filePath : ''
    } catch (_) {
      return ''
    }
  }

  async _saveTextArtifact(outputDir, artifact, toolId) {
    const fileName = this._safeFileName(this._ensureTextArtifactExt(
      this._fileArtifactName(artifact, toolId),
      artifact.mime_type,
      this._fallbackArtifactBaseName(toolId, artifact)
    ))
    const directPath = path.join(outputDir, fileName)
    if (fs.existsSync(directPath)) {
      const existing = await fs.promises.readFile(directPath, 'utf-8').catch(() => null)
      if (existing === artifact.content_text) return directPath
    }
    const filePath = await this._targetPath(outputDir, fileName)
    await fs.promises.writeFile(filePath, artifact.content_text, 'utf-8')
    return filePath
  }

  async _saveJsonArtifact(outputDir, artifact, toolId) {
    const fileName = this._safeFileName(this._ensureJsonArtifactExt(
      this._fileArtifactName(artifact, toolId),
      this._fallbackArtifactBaseName(toolId, artifact)
    ))
    const source = artifact.content_json ?? artifact.content ?? artifact.data ?? artifact.payload ?? artifact.content_text ?? {}
    const content = typeof source === 'string' ? source : JSON.stringify(source, null, 2)
    const directPath = path.join(outputDir, fileName)
    if (fs.existsSync(directPath)) {
      const existing = await fs.promises.readFile(directPath, 'utf-8').catch(() => null)
      if (existing === content) return directPath
    }
    const filePath = await this._targetPath(outputDir, fileName)
    await fs.promises.writeFile(filePath, content, 'utf-8')
    return filePath
  }

  async _targetPath(outputDir, fileName, expectedSize = 0) {
    const parsed = path.parse(fileName)
    let candidate = path.join(outputDir, fileName)
    if (fs.existsSync(candidate)) {
      if (expectedSize) {
        try {
          const stat = await fs.promises.stat(candidate)
          if (stat.size === expectedSize) return candidate
        } catch (_) {}
      }
      for (let i = 1; i < 1000; i++) {
        candidate = path.join(outputDir, `${parsed.name}-${i}${parsed.ext}`)
        if (!fs.existsSync(candidate)) break
      }
    }
    return candidate
  }

  async _ensureOutputDir(agentEnglishName) {
    const root = this._workDir.getRootPath()
    const date = new Date().toISOString().slice(0, 10)
    const dir = path.join(root, 'agents', agentEnglishName || '_shared', 'outputs', date)
    await fs.promises.mkdir(dir, { recursive: true })
    this._workDir.resolveAndValidate(dir, 'any')
    return dir
  }

  async _fetchJson({ baseUrl, token, pathName, init = {}, signal }) {
    const res = await fetch(this._apiUrl(baseUrl, pathName), {
      ...init,
      signal,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    })
    if (!res.ok) throw new Error(await this._readError(res))
    return await res.json()
  }

  async _fetchBinaryResponse(baseUrl, token, downloadUrl, signal) {
    if (!downloadUrl) throw new Error('云端产物缺少 download_url')
    return await fetch(this._absoluteUrl(baseUrl, downloadUrl), {
      method: 'GET',
      signal,
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  async _readError(res) {
    let body = ''
    try { body = await res.text() } catch (_) {}
    if (!body) return `云端请求失败 HTTP ${res.status}`
    try {
      const json = JSON.parse(body)
      if (typeof json.detail === 'string') return json.detail
      if (Array.isArray(json.detail)) return json.detail.map(i => i.msg || i.type || JSON.stringify(i)).join('; ')
      if (json.detail && typeof json.detail === 'object') {
        if (json.detail.code === 'INSUFFICIENT_POINTS') {
          return `积分不足：需要 ${json.detail.required_points ?? '-'}，当前 ${json.detail.points_balance ?? '-'}`
        }
        return json.detail.message || json.detail.code || JSON.stringify(json.detail)
      }
      return JSON.stringify(json)
    } catch (_) {
      return body.slice(0, 500)
    }
  }

  _apiUrl(baseUrl, pathName) {
    return this._absoluteUrl(baseUrl, `${API_PREFIX}${pathName}`)
  }

  _profile(toolId) {
    const profile = getCloudBusinessProfile(toolId)
    if (!profile) throw new Error(`不支持的云端业务类型: ${toolId}`)
    return profile
  }

  _absoluteUrl(baseUrl, value) {
    return new URL(value, `${baseUrl}/`).toString()
  }

  _normalizeBaseUrl(baseUrl) {
    const fallback = process.env.VITE_CLOUD_BASE_URL || process.env.CLOUD_BASE_URL || 'http://localhost:8000'
    let clean = String(baseUrl || fallback || '').trim().replace(/\/+$/, '')
    clean = clean.replace(/\/api\/v1\/app$/i, '').replace(/\/api\/v1$/i, '')
    if (!/^https?:\/\//i.test(clean)) throw new Error('云端服务地址未配置')
    return clean
  }

  _normalizeProgress(progress, status) {
    if (status === 'SUCCEEDED') return 100
    const n = Number(progress)
    if (!Number.isFinite(n)) return status === 'PENDING' ? 10 : 20
    return Math.max(status === 'PENDING' ? 10 : 12, Math.min(99, Math.round(n)))
  }

  _statusLabel(status) {
    if (status === 'PENDING') return '云端排队中'
    if (status === 'RUNNING') return '云端生成中'
    return status || '云端处理中'
  }

  _formatCloudFailure(task) {
    const warnings = Array.isArray(task?.runtime_payload?.warnings)
      ? task.runtime_payload.warnings.map(w => w?.detail || w?.code).filter(Boolean).join('; ')
      : ''
    return [
      task?.error_message || task?.error_code || '云端任务失败',
      warnings ? `警告：${warnings}` : '',
    ].filter(Boolean).join('\n')
  }

  _updateTaskParams(taskId, extra) {
    const latest = this._db.getTask(taskId)
    this._db.updateTask(taskId, { params: { ...(latest?.params || {}), ...extra } })
  }

  _titleFromFile(filePath, fallbackName) {
    const name = path.basename(filePath || fallbackName || '云端产物')
    return name.replace(/\.[^.]+$/, '')
  }

  _fileArtifactName(artifact, toolId, responseFileName = '') {
    const artifactName = String(artifact?.name || '').trim()
    const urlName = this._fileNameFromUrl(artifact?.download_url) || this._fileNameFromUrl(artifact?.permanent_url)
    const preferredArtifactName = this._isGenericArtifactName(artifactName) ? '' : artifactName
    const preferredUrlName = this._isGenericArtifactName(urlName) ? '' : urlName
    const preferredResponseName = this._isGenericArtifactName(responseFileName) ? '' : responseFileName
    const base = preferredArtifactName
      || preferredUrlName
      || preferredResponseName
      || urlName
      || responseFileName
      || artifactName
      || this._fallbackArtifactBaseName(toolId, artifact)
    if (this._hasFileExtension(base)) return base
    const ext = this._extensionFromFileName(urlName)
      || this._extensionFromFileName(responseFileName)
      || this._extensionFromMime(artifact?.mime_type)
    return ext ? `${base}.${ext}` : base
  }

  _fileNameFromUrl(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''
    let parsed
    try {
      parsed = new URL(raw, 'http://mindspace.local')
    } catch (_) {
      return ''
    }

    for (const key of ['filename', 'file_name', 'name']) {
      const fromQuery = parsed.searchParams.get(key)
      if (fromQuery) return this._decodeFileName(fromQuery)
    }

    const queryDisposition = parsed.searchParams.get('response-content-disposition')
      || parsed.searchParams.get('content-disposition')
    const fromDisposition = this._fileNameFromContentDisposition(queryDisposition)
    if (fromDisposition) return fromDisposition

    const lastSegment = this._decodeFileName(path.posix.basename(parsed.pathname || ''))
    if (!lastSegment || ['download', 'outputs', 'artifacts'].includes(lastSegment.toLowerCase())) return ''
    return lastSegment
  }

  _fileNameFromContentDisposition(value) {
    const header = String(value || '').trim()
    if (!header) return ''
    const encoded = header.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)
    if (encoded?.[1]) return this._decodeFileName(encoded[1].trim().replace(/^["']|["']$/g, ''))

    const plain = header.match(/filename\s*=\s*("[^"]+"|[^;]+)/i)
    if (plain?.[1]) return this._decodeFileName(plain[1].trim().replace(/^["']|["']$/g, ''))
    return ''
  }

  _decodeFileName(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''
    try {
      return decodeURIComponent(raw.replace(/\+/g, ' '))
    } catch (_) {
      return raw
    }
  }

  _fallbackArtifactBaseName(toolId, artifact) {
    const rawId = String(artifact?.id || Date.now()).replace(/[^a-z0-9_-]/gi, '')
    const suffix = rawId.slice(-12) || Date.now()
    return `${toolId || 'artifact'}-${suffix}`
  }

  _isGenericArtifactName(name) {
    const raw = String(name || '').trim().toLowerCase()
    if (!raw) return false
    if (/^(artifact|download|output|result)([-_]\d+)?(\.[a-z0-9]{1,12})?$/.test(raw)) return true
    return (
      /^podcast(?:-(?:script|data))?\.(?:mp3|txt|json)$/i.test(raw)
      || /^research-report\.(?:md|html)$/i.test(raw)
      || /^presentation\.(?:pptx|html)$/i.test(raw)
    )
  }

  _ensureTextArtifactExt(name, mimeType, fallbackBase = 'artifact') {
    const raw = String(name || '').trim()
    if (/\.(md|markdown|html|htm|txt|json)$/i.test(raw)) return raw
    const mime = String(mimeType || '').toLowerCase()
    if (mime.includes('html')) return `${raw || fallbackBase}.html`
    if (mime.includes('markdown')) return `${raw || fallbackBase}.md`
    return `${raw || fallbackBase}.txt`
  }

  _ensureJsonArtifactExt(name, fallbackBase = 'artifact') {
    const raw = String(name || '').trim()
    if (/\.json$/i.test(raw)) return raw
    return `${raw || fallbackBase}.json`
  }

  _hasFileExtension(fileName) {
    return /\.[a-z0-9]{1,12}$/i.test(String(fileName || '').trim())
  }

  _extensionFromFileName(fileName) {
    const ext = path.extname(String(fileName || '').trim()).replace('.', '').toLowerCase()
    return /^[a-z0-9]{1,12}$/.test(ext) ? ext : ''
  }

  _extensionFromMime(mimeType) {
    const mime = String(mimeType || '').toLowerCase()
    if (mime.includes('audio/mpeg') || mime.includes('audio/mp3')) return 'mp3'
    if (mime.includes('audio/wav') || mime.includes('audio/x-wav')) return 'wav'
    if (mime.includes('audio/mp4') || mime.includes('audio/m4a')) return 'm4a'
    if (mime.includes('audio/aac')) return 'aac'
    if (mime.includes('audio/ogg')) return 'ogg'
    if (mime.includes('audio/flac')) return 'flac'
    if (mime.includes('html')) return 'html'
    if (mime.includes('markdown')) return 'md'
    if (mime.includes('json')) return 'json'
    if (mime.includes('text/plain')) return 'txt'
    return ''
  }

  _safeFileName(name) {
    const cleaned = String(name || `artifact-${Date.now()}`)
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
    return (cleaned || `artifact-${Date.now()}`).slice(0, 160)
  }

  _iconForFile(filePath) {
    const ext = path.extname(filePath || '').replace('.', '').toLowerCase()
    if (ext === 'pptx' || ext === 'ppt') return 'ri-file-ppt-line'
    if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'ri-music-2-line'
    if (ext === 'html' || ext === 'htm') return 'ri-html5-line'
    if (ext === 'md' || ext === 'markdown') return 'ri-markdown-line'
    if (ext === 'json') return 'ri-code-box-line'
    return 'ri-file-line'
  }

  _delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('任务已取消'))
        return
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      const onAbort = () => {
        clearTimeout(timer)
        reject(new Error('任务已取消'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}
