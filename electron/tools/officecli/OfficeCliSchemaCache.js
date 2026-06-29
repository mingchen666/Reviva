import { clipText, runOfficeCli } from './OfficeCliRunner.js'

const MAX_CACHE_ENTRIES = 80
const schemaCache = new Map()

function cacheKey({ format = '', element = '', verb = '', json = true } = {}) {
  return [format, element, verb, json !== false ? 'json' : 'text'].map(v => String(v || '').trim().toLowerCase()).join(':')
}

function remember(key, value) {
  if (schemaCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = schemaCache.keys().next().value
    if (firstKey) schemaCache.delete(firstKey)
  }
  schemaCache.set(key, value)
  return value
}

export async function readOfficeCliSchema({ format, element, verb, json = true } = {}) {
  const key = cacheKey({ format, element, verb, json })
  const cached = schemaCache.get(key)
  if (cached) return { ...cached, cached: true }

  const args = ['help']
  const fmt = String(format || '').trim().toLowerCase().replace(/^\./, '')
  const cleanVerb = String(verb || '').trim()
  const cleanElement = String(element || '').trim()
  if (fmt) args.push(fmt)
  if (cleanVerb && cleanElement) args.push(cleanVerb, cleanElement)
  else if (cleanElement) args.push(cleanElement)
  if (json !== false) args.push('--json')

  const result = await runOfficeCli(args, { timeoutMs: 30000, maxBuffer: 1024 * 1024 })
  if (result.code !== 0) {
    return {
      success: false,
      code: result.code === 124 ? 'OFFICECLI_TIMEOUT' : 'OFFICECLI_HELP_FAILED',
      message: '读取 OfficeCLI 帮助失败。',
      detail: clipText(result.stderr || result.stdout, 3000),
      via: result.via,
    }
  }

  return remember(key, {
    success: true,
    operation: 'help',
    format: fmt,
    element: cleanElement,
    verb: cleanVerb,
    content: clipText(result.stdout || result.stderr, 60000),
    via: result.via,
  })
}
