import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024
const DEFAULT_MINERU_HOST = 'https://mineru.net'
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff'])

function parseJson(value) {
  if (!value) return null
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return null }
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function flattenBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map(block => {
      if (typeof block === 'string') return block
      if (!block || typeof block !== 'object') return ''
      return block.markdown || block.text || block.content || block.value || ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function firstArray(...values) {
  return values.find(Array.isArray) || []
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(text)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(text)) return false
  return fallback
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function cleanHost(value) {
  return String(value || DEFAULT_MINERU_HOST).replace(/\/+$/g, '')
}

function joinUrl(baseUrl, endpoint) {
  const base = cleanHost(baseUrl)
  const suffix = String(endpoint || '').trim()
  if (!suffix) return base
  if (/^https?:\/\//i.test(suffix)) return suffix
  return `${base}/${suffix.replace(/^\/+/g, '')}`
}

function apiKey(provider, config) {
  return provider?.api_key_ref || config.apiKey || config.api_key || config.token || ''
}

function fileTypeFromPath(inputPath) {
  const ext = path.extname(inputPath || '').toLowerCase()
  return IMAGE_EXTENSIONS.has(ext) ? 1 : 0
}

function usageMetrics(payload) {
  const data = asObject(payload?.data)
  const result = asObject(payload?.result)
  const usage = asObject(firstValue(payload?.usage, data.usage, result.usage, payload?.metrics, data.metrics, result.metrics))
  return {
    input_tokens: numberValue(firstValue(usage.input_tokens, usage.inputTokens, usage.prompt_tokens, usage.promptTokens), 0),
    output_tokens: numberValue(firstValue(usage.output_tokens, usage.outputTokens, usage.completion_tokens, usage.completionTokens), 0),
    cache_read_tokens: numberValue(firstValue(usage.cache_read_tokens, usage.cacheReadTokens), 0),
    cache_write_tokens: numberValue(firstValue(usage.cache_write_tokens, usage.cacheWriteTokens), 0),
    thinking_tokens: numberValue(firstValue(usage.thinking_tokens, usage.thinkingTokens, usage.reasoning_tokens, usage.reasoningTokens), 0),
    cost: numberValue(firstValue(usage.cost, usage.total_cost, usage.totalCost), 0),
    latency_ms: numberValue(firstValue(usage.latency_ms, usage.latencyMs), 0),
  }
}

function normalizePages(payload) {
  const data = asObject(payload?.data)
  const result = asObject(payload?.result)
  const pages = firstArray(
    payload?.pages,
    data.pages,
    result.pages,
    payload?.ocr_pages,
    data.ocr_pages,
    result.ocr_pages,
  )

  if (pages.length) {
    return pages.map((page, index) => {
      const item = asObject(page)
      const blocks = firstArray(item.blocks, item.lines, item.paragraphs)
      const text = item.markdown || item.text || item.content || flattenBlocks(blocks)
      return {
        page: Number(item.page || item.page_no || item.pageNumber || index + 1),
        text: String(text || '').trim(),
        blocks,
        images: asObject(firstValue(item.images, item.markdown_images, item.markdownImages)),
        confidence: Number(item.confidence || item.score || 0) || 0,
      }
    })
  }

  const markdown = payload?.markdown || data.markdown || result.markdown
  const text = markdown || payload?.text || data.text || result.text || payload?.content || data.content || result.content
  return text ? [{ page: 1, text: String(text).trim(), blocks: [], confidence: 0 }] : []
}

function spawnBuffered(command, args, { cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, maxBuffer = DEFAULT_MAX_BUFFER } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...(env || {}) },
      windowsHide: true,
      shell: false,
    })
    const stdoutChunks = []
    const stderrChunks = []
    let collected = 0
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }

    const append = (chunks, data) => {
      collected += data.length
      if (collected <= maxBuffer) chunks.push(data)
    }

    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ code: 124, stdout: '', stderr: 'OCR command timeout' })
    }, timeoutMs)

    child.stdout.on('data', d => append(stdoutChunks, d))
    child.stderr.on('data', d => append(stderrChunks, d))
    child.on('error', err => finish({ code: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: err.message }))
    child.on('close', code => finish({
      code: code ?? 0,
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
    }))
  })
}

function applyTemplate(value, vars) {
  return String(value || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => vars[key] ?? '')
}

function providerConfig(provider) {
  return asObject(provider?.config || parseJson(provider?.config_json))
}

function authHeaders(provider, config) {
  const headers = { ...(config.headers || {}) }
  const key = apiKey(provider, config)
  if (!key) return headers
  if (config.authHeader) {
    headers[config.authHeader] = applyTemplate(config.authValue || '{{apiKey}}', { apiKey: key })
  } else if (config.authType === 'api-key') {
    headers[config.apiKeyHeader || 'X-API-Key'] = key
  } else {
    headers.Authorization = `Bearer ${key}`
  }
  return headers
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (typeof fetch !== 'function') {
    throw new Error('Current runtime does not support fetch for OCR HTTP providers')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readResponsePayload(response) {
  const rawText = await response.text()
  let payload = parseJson(rawText)
  if (!payload) payload = { text: rawText }
  return { rawText, payload }
}

function ensureSuccessPayload(response, payload, rawText, label) {
  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.msg || rawText.slice(0, 500) || `HTTP ${response.status}`
    throw new Error(`${label} failed: ${message}`)
  }
}

function stripMarkdownImagesFromPaddleResult(item) {
  const markdown = asObject(item?.markdown)
  if (!markdown.images) return item
  return {
    ...item,
    markdown: {
      ...markdown,
      images: Object.fromEntries(Object.keys(markdown.images || {}).map(key => [key, '[image omitted]'])),
    },
  }
}

function mineruState(payload) {
  const data = asObject(payload?.data)
  const results = firstArray(data.extract_result, data.extract_results, payload?.extract_result, payload?.extract_results)
  const item = asObject(results[0] || data.extract_result || data)
  return {
    item,
    state: item.state || data.state || payload?.state || '',
    fullZipUrl: item.full_zip_url || data.full_zip_url || payload?.full_zip_url || '',
    errorMessage: item.err_msg || data.err_msg || payload?.err_msg || item.error || data.error || payload?.error || '',
    progress: item.extract_progress || data.extract_progress || {},
  }
}

async function loadJsZip() {
  try {
    const mod = await import('jszip')
    return mod.default || mod
  } catch (err) {
    throw new Error(`MinerU OCR requires JSZip to read result archives: ${err.message}`)
  }
}

function zipEntryNames(zip) {
  return Object.keys(zip.files || {}).map(name => name.replace(/\\/g, '/'))
}

function dirnamePosix(value) {
  const normalized = String(value || '').replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index) : ''
}

function relativeZipRef(fileName, baseDir) {
  const normalized = String(fileName || '').replace(/\\/g, '/').replace(/^\/+/g, '')
  if (!baseDir) return normalized
  const rel = path.posix.relative(baseDir, normalized)
  return rel && !rel.startsWith('..') ? rel : normalized
}

export class OcrProviderRunner {
  async run({ provider, inputPath, outputDir, cacheDir, source }) {
    if (!provider) throw new Error('OCR provider is required')
    const config = providerConfig(provider)
    const mode = provider.mode || config.mode || 'remote'
    const startedAt = Date.now()
    let result
    if (mode === 'local') {
      result = await this._runLocal({ provider, config, inputPath, outputDir, cacheDir, source })
    } else if ((provider.type || '').toLowerCase() === 'paddleocr') {
      result = await this._runPaddleOcr({ provider, config, inputPath, source })
    } else if ((provider.type || '').toLowerCase() === 'mineru') {
      result = await this._runMineru({ provider, config, inputPath, cacheDir, source })
    } else {
      result = await this._runRemote({ provider, config, inputPath, outputDir, cacheDir, source })
    }
    return {
      ...result,
      metrics: {
        ...usageMetrics(result.raw || {}),
        ...(result.metrics || {}),
        latency_ms: result.metrics?.latency_ms || Date.now() - startedAt,
      },
    }
  }

  async _runRemote({ provider, config, inputPath, source }) {
    const url = provider.base_url || config.url || config.endpoint
    if (!url) throw new Error('OCR provider base_url is required')

    const method = config.method || 'POST'
    const bodyMode = config.bodyMode || config.body_mode || 'multipart'
    const headers = authHeaders(provider, config)
    let body

    if (bodyMode === 'json_base64') {
      const buffer = await fs.promises.readFile(inputPath)
      headers['Content-Type'] = headers['Content-Type'] || 'application/json'
      body = JSON.stringify({
        ...(config.body || {}),
        filename: path.basename(inputPath),
        source_id: source?.id || '',
        file_base64: buffer.toString('base64'),
      })
    } else if (bodyMode === 'binary') {
      headers['Content-Type'] = headers['Content-Type'] || config.contentType || 'application/pdf'
      body = await fs.promises.readFile(inputPath)
    } else {
      const form = new FormData()
      const buffer = await fs.promises.readFile(inputPath)
      const blob = new Blob([buffer], { type: config.contentType || 'application/pdf' })
      form.append(config.fileField || config.file_field || 'file', blob, path.basename(inputPath))
      const fields = asObject(config.fields)
      for (const [key, value] of Object.entries(fields)) {
        form.append(key, applyTemplate(value, { sourceId: source?.id || '', title: source?.title || '' }))
      }
      body = form
    }

    const response = await fetchWithTimeout(url, { method, headers, body }, Number(config.timeoutMs || config.timeout_ms || DEFAULT_TIMEOUT_MS))
    const { rawText, payload } = await readResponsePayload(response)
    ensureSuccessPayload(response, payload, rawText, 'OCR HTTP provider')
    return this._normalize({ payload, rawText, provider })
  }

  async _runPaddleOcr({ provider, config, inputPath, source }) {
    const url = provider.base_url || config.url || config.endpoint
    if (!url) throw new Error('PaddleOCR provider URL is required')
    const key = apiKey(provider, config)
    if (!key) throw new Error('PaddleOCR provider API token is required')

    const buffer = await fs.promises.readFile(inputPath)
    const payload = {
      fileType: numberValue(firstValue(config.fileType, config.file_type), fileTypeFromPath(inputPath)),
      useDocOrientationClassify: boolValue(config.useDocOrientationClassify, false),
      useDocUnwarping: boolValue(config.useDocUnwarping, false),
      useChartRecognition: boolValue(config.useChartRecognition, false),
      prettifyMarkdown: boolValue(config.prettifyMarkdown, true),
      visualize: boolValue(config.visualize, false),
      ...(asObject(config.body)),
      ...(asObject(config.payload)),
      file: buffer.toString('base64'),
    }
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        ...(config.headers || {}),
        Authorization: `token ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, Number(config.timeoutMs || config.timeout_ms || DEFAULT_TIMEOUT_MS))

    const { rawText, payload: responsePayload } = await readResponsePayload(response)
    ensureSuccessPayload(response, responsePayload, rawText, 'PaddleOCR provider')
    if (responsePayload.errorCode !== undefined && Number(responsePayload.errorCode) !== 0) {
      throw new Error(`PaddleOCR provider failed: ${responsePayload.errorMsg || responsePayload.errorCode}`)
    }

    const result = asObject(responsePayload.result)
    const layoutResults = firstArray(result.layoutParsingResults)
    const pages = layoutResults.map((item, index) => {
      const markdown = asObject(item?.markdown)
      return {
        page: index + 1,
        text: String(markdown.text || '').trim(),
        blocks: [],
        images: asObject(markdown.images),
        confidence: 0,
      }
    })

    return this._buildResult({
      provider,
      payload: {
        ...responsePayload,
        result: {
          ...result,
          layoutParsingResults: layoutResults.map(stripMarkdownImagesFromPaddleResult),
        },
      },
      rawText,
      pages,
      extraMetrics: {
        provider_id: provider.id,
        provider_type: provider.type,
        page_count: pages.length,
        chars: pages.map(page => page.text).join('\n\n').length,
      },
    })
  }

  async _runMineru({ provider, config, inputPath, cacheDir, source }) {
    const key = apiKey(provider, config)
    if (!key) throw new Error('MinerU provider API token is required')
    const host = cleanHost(provider.base_url || config.baseUrl || config.base_url || DEFAULT_MINERU_HOST)
    const timeoutMs = Number(config.timeoutMs || config.timeout_ms || DEFAULT_TIMEOUT_MS)
    const headers = {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: '*/*',
      ...(config.headers || {}),
    }
    const fileName = path.basename(inputPath)
    const fileConfig = {
      name: fileName,
      is_ocr: boolValue(firstValue(config.is_ocr, config.isOcr), true),
      data_id: String(source?.id || fileName).slice(0, 128),
    }
    if (config.page_ranges || config.pageRanges) fileConfig.page_ranges = config.page_ranges || config.pageRanges

    const uploadPayload = {
      enable_formula: boolValue(firstValue(config.enable_formula, config.enableFormula), true),
      enable_table: boolValue(firstValue(config.enable_table, config.enableTable), true),
      language: config.language || 'ch',
      model_version: config.model_version || config.modelVersion || 'vlm',
      files: [fileConfig],
    }
    if (Array.isArray(config.extra_formats) || Array.isArray(config.extraFormats)) {
      uploadPayload.extra_formats = config.extra_formats || config.extraFormats
    }
    if (config.no_cache !== undefined || config.noCache !== undefined) {
      uploadPayload.no_cache = boolValue(firstValue(config.no_cache, config.noCache), false)
    }

    const raw = {
      upload: null,
      statuses: [],
      zip: null,
    }
    const createResponse = await fetchWithTimeout(joinUrl(host, config.fileUrlsEndpoint || '/api/v4/file-urls/batch'), {
      method: 'POST',
      headers,
      body: JSON.stringify(uploadPayload),
    }, timeoutMs)
    const { rawText: uploadRawText, payload: uploadResponse } = await readResponsePayload(createResponse)
    ensureSuccessPayload(createResponse, uploadResponse, uploadRawText, 'MinerU upload URL request')
    raw.upload = uploadResponse
    if (uploadResponse.code !== undefined && Number(uploadResponse.code) !== 0) {
      throw new Error(`MinerU upload URL request failed: ${uploadResponse.msg || uploadResponse.message || uploadResponse.code}`)
    }

    const uploadData = asObject(uploadResponse.data)
    const batchId = uploadData.batch_id
    const fileUrl = firstArray(uploadData.file_urls)[0]
    if (!batchId || !fileUrl) throw new Error('MinerU did not return batch_id or upload URL')

    const fileBuffer = await fs.promises.readFile(inputPath)
    const putResponse = await fetchWithTimeout(fileUrl, {
      method: 'PUT',
      body: fileBuffer,
    }, timeoutMs)
    if (!putResponse.ok) {
      const text = await putResponse.text().catch(() => '')
      throw new Error(`MinerU file upload failed: ${text.slice(0, 500) || `HTTP ${putResponse.status}`}`)
    }

    const pollIntervalMs = Math.max(Number(config.pollIntervalMs || config.poll_interval_ms || 5000), 1000)
    const maxPolls = Math.max(Number(config.maxPolls || config.max_polls || 120), 1)
    let completed = null
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      await sleep(pollIntervalMs)
      const statusResponse = await fetchWithTimeout(joinUrl(host, `${config.extractResultsEndpoint || '/api/v4/extract-results/batch'}/${batchId}`), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: '*/*',
        },
      }, timeoutMs)
      const { rawText: statusRawText, payload: statusPayload } = await readResponsePayload(statusResponse)
      ensureSuccessPayload(statusResponse, statusPayload, statusRawText, 'MinerU status request')
      raw.statuses.push(statusPayload)
      if (statusPayload.code !== undefined && Number(statusPayload.code) !== 0) continue
      const status = mineruState(statusPayload)
      if (status.state === 'done') {
        completed = status
        break
      }
      if (status.state === 'failed') {
        throw new Error(`MinerU parsing failed: ${status.errorMessage || 'unknown error'}`)
      }
    }
    if (!completed) throw new Error('MinerU parsing timed out')
    if (!completed.fullZipUrl) throw new Error('MinerU parsing completed without full_zip_url')

    const zipResult = await this._readMineruZip({
      zipUrl: completed.fullZipUrl,
      cacheDir,
      timeoutMs,
    })
    raw.zip = zipResult.meta
    const pages = [{
      page: 1,
      text: zipResult.markdown.trim(),
      blocks: [],
      images: zipResult.images,
      confidence: 0,
    }]

    return this._buildResult({
      provider,
      payload: raw,
      rawText: zipResult.markdown,
      pages,
      extraMetrics: {
        provider_id: provider.id,
        provider_type: provider.type,
        batch_id: batchId,
        page_count: pages.length,
        chars: zipResult.markdown.length,
        zip_entries: zipResult.meta.entries?.length || 0,
      },
    })
  }

  async _readMineruZip({ zipUrl, cacheDir, timeoutMs }) {
    const response = await fetchWithTimeout(zipUrl, { method: 'GET' }, timeoutMs)
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`MinerU result zip download failed: ${text.slice(0, 500) || `HTTP ${response.status}`}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (cacheDir) {
      const rawDir = path.join(cacheDir, 'raw')
      await fs.promises.mkdir(rawDir, { recursive: true })
      await fs.promises.writeFile(path.join(rawDir, 'mineru-result.zip'), buffer)
    }
    const JSZip = await loadJsZip()
    const zip = await JSZip.loadAsync(buffer)
    const entries = zipEntryNames(zip)
    const mdName = entries.find(name => /(^|\/)full\.md$/i.test(name))
      || entries.find(name => /\.md$/i.test(name))
    if (!mdName) throw new Error('MinerU result zip does not contain full.md')

    const fullMd = zip.files[mdName]
    const markdown = await fullMd.async('string')
    const baseDir = dirnamePosix(mdName)
    const images = {}
    for (const name of entries) {
      const file = zip.files[name]
      if (!file || file.dir || !IMAGE_EXTENSIONS.has(path.posix.extname(name).toLowerCase())) continue
      const ref = relativeZipRef(name, baseDir)
      images[ref] = Buffer.from(await file.async('uint8array'))
    }

    return {
      markdown,
      images,
      meta: {
        full_zip_url: zipUrl,
        full_md_path: mdName,
        entries,
        image_count: Object.keys(images).length,
      },
    }
  }

  async _runLocal({ provider, config, inputPath, outputDir, cacheDir }) {
    const command = config.command
    if (!command) throw new Error('Local OCR provider requires config.command')
    await fs.promises.mkdir(outputDir, { recursive: true })
    await fs.promises.mkdir(cacheDir, { recursive: true })
    const vars = {
      input: inputPath,
      outputDir,
      cacheDir,
      filename: path.basename(inputPath),
    }
    const args = Array.isArray(config.args) ? config.args.map(arg => applyTemplate(arg, vars)) : []
    const result = await spawnBuffered(command, args, {
      cwd: config.cwd ? applyTemplate(config.cwd, vars) : undefined,
      env: config.env || {},
      timeoutMs: Number(config.timeoutMs || config.timeout_ms || DEFAULT_TIMEOUT_MS),
      maxBuffer: Number(config.maxBuffer || DEFAULT_MAX_BUFFER),
    })
    if (result.code !== 0) {
      throw new Error(`OCR command failed: ${(result.stderr || result.stdout || '').slice(0, 1000)}`)
    }

    let rawText = result.stdout || ''
    const outputFile = config.outputFile ? applyTemplate(config.outputFile, vars) : ''
    if (outputFile && fs.existsSync(outputFile)) {
      rawText = await fs.promises.readFile(outputFile, 'utf-8')
    }
    let payload = parseJson(rawText)
    if (!payload) payload = { markdown: rawText }
    return this._normalize({ payload, rawText, provider })
  }

  _buildResult({ provider, payload, rawText, pages, extraMetrics = {} }) {
    const text = pages.map(page => page.text).filter(Boolean).join('\n\n')
    return {
      provider_id: provider.id,
      provider_type: provider.type,
      pages,
      text,
      raw: payload,
      rawText,
      metrics: {
        ...usageMetrics(payload),
        provider_id: provider.id,
        provider_type: provider.type,
        page_count: pages.length,
        chars: text.length,
        ...extraMetrics,
      },
    }
  }

  _normalize({ payload, rawText, provider }) {
    const pages = normalizePages(payload)
    return this._buildResult({
      provider,
      pages,
      rawText,
      payload,
    })
  }
}
