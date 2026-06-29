export const MAX_ACTIONS = 100
export const MAX_ACTION_PATH_LENGTH = 600
export const MAX_PROP_VALUE_LENGTH = 20000

const PROP_KEY_RE = /^[A-Za-z0-9_.:-]+$/
const TYPE_RE = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/

export function fail(code, message, actionIndex = -1) {
  const err = new Error(message)
  err.code = code
  err.actionIndex = actionIndex
  throw err
}

export function commandOf(action) {
  return String(action?.command || action?.action || '').trim()
}

export function formatOf(filePath) {
  return String(filePath || '').split('.').pop()?.toLowerCase() || ''
}

export function assertPath(value, fallback, actionIndex) {
  const target = String(value || fallback || '').trim()
  if (!target) fail('OFFICE_ACTION_INVALID_PATH', 'Office action 缺少 path。', actionIndex)
  if (target.length > MAX_ACTION_PATH_LENGTH || /[\x00]/.test(target)) {
    fail('OFFICE_ACTION_INVALID_PATH', 'Office action path 非法或过长。', actionIndex)
  }
  return target
}

export function assertElementType(value, actionIndex) {
  const type = String(value || '').trim()
  if (!TYPE_RE.test(type)) {
    fail('OFFICE_ACTION_INVALID_TYPE', 'add 操作缺少合法的元素 type。', actionIndex)
  }
  return type
}

function normalizePropValue(value, key, actionIndex) {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('OFFICE_ACTION_INVALID_PROP', `属性 ${key} 不是有限数字。`, actionIndex)
    return String(value)
  }
  if (Array.isArray(value) || (typeof value === 'object' && value)) {
    return JSON.stringify(value)
  }
  const text = String(value)
  if (text.length > MAX_PROP_VALUE_LENGTH || /[\x00]/.test(text)) {
    fail('OFFICE_ACTION_INVALID_PROP', `属性 ${key} 的值非法或过长。`, actionIndex)
  }
  return text
}

export function appendProps(args, props, actionIndex) {
  for (const [key, value] of Object.entries(props || {})) {
    if (!PROP_KEY_RE.test(key)) {
      fail('OFFICE_ACTION_INVALID_PROP', `属性名 ${key} 不合法。`, actionIndex)
    }
    const normalized = normalizePropValue(value, key, actionIndex)
    if (normalized === null) continue
    args.push('--prop', `${key}=${normalized}`)
  }
}

export function scalarPropsFrom(action, keys, base = {}) {
  const props = { ...base, ...(action.props || {}) }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(action, key) && action[key] !== undefined) {
      props[key] = action[key]
    }
  }
  return props
}

function appendAddPosition(args, action, actionIndex) {
  const flags = [
    action.after !== undefined ? 'after' : '',
    action.before !== undefined ? 'before' : '',
    action.index !== undefined ? 'index' : '',
  ].filter(Boolean)
  if (flags.length > 1) {
    fail('OFFICE_ACTION_INVALID_POSITION', 'add 操作的 after、before、index 只能选择一个。', actionIndex)
  }
  if (action.after !== undefined) args.push('--after', assertPath(action.after, '', actionIndex))
  if (action.before !== undefined) args.push('--before', assertPath(action.before, '', actionIndex))
  if (action.index !== undefined) {
    const index = Number(action.index)
    if (!Number.isInteger(index) || index < 0) fail('OFFICE_ACTION_INVALID_INDEX', 'add 操作 index 必须是非负整数。', actionIndex)
    args.push('--index', String(index))
  }
}

export function compileAdd(filePath, action, actionIndex, defaults = {}) {
  const targetPath = assertPath(action.path || action.targetPath, defaults.path || '/', actionIndex)
  const from = action.from || action.cloneFrom
  if (from) {
    const args = ['add', filePath, targetPath, '--from', assertPath(from, '', actionIndex)]
    appendAddPosition(args, action, actionIndex)
    return args
  }

  const elementType = assertElementType(action.elementType || action.officeType || action.addType || action.type || defaults.elementType, actionIndex)
  const args = ['add', filePath, targetPath, '--type', elementType]
  appendAddPosition(args, action, actionIndex)
  appendProps(args, { ...(defaults.props || {}), ...(action.props || {}) }, actionIndex)
  if (action.json === true) args.push('--json')
  return args
}

export function compileSet(filePath, action, actionIndex, defaults = {}) {
  const targetPath = assertPath(action.path || action.targetPath || action.selector, defaults.path, actionIndex)
  const args = ['set', filePath, targetPath]
  if (action.find !== undefined) args.push('--find', String(action.find))
  if (action.replace !== undefined) args.push('--replace', String(action.replace))
  appendProps(args, { ...(defaults.props || {}), ...(action.props || {}) }, actionIndex)
  if (action.json === true) args.push('--json')
  if (args.length <= 3 && action.find === undefined && action.replace === undefined) {
    fail('OFFICE_ACTION_EMPTY_SET', 'set 操作至少需要 props、find 或 replace。', actionIndex)
  }
  return args
}

export function compileRemove(filePath, action, actionIndex) {
  if (action.confirm !== true) {
    fail('OFFICE_ACTION_REMOVE_UNCONFIRMED', 'remove 是破坏性操作，必须显式传 confirm=true。', actionIndex)
  }
  const args = ['remove', filePath, assertPath(action.path || action.targetPath || action.selector, '', actionIndex)]
  if (action.json === true) args.push('--json')
  return args
}

export function compileReplaceText(filePath, action, actionIndex) {
  const find = String(action.find || '')
  if (!find) fail('OFFICE_ACTION_MISSING_FIND', 'replace_text 缺少 find。', actionIndex)
  return compileSet(filePath, {
    path: action.path || '/',
    find,
    replace: action.replace ?? '',
    props: action.props || {},
    json: action.json,
  }, actionIndex)
}

export function compileGet(filePath, action, actionIndex) {
  const args = ['get', filePath, assertPath(action.path || action.targetPath || 'selected', '', actionIndex)]
  if (action.depth !== undefined) {
    const depth = Number(action.depth)
    if (!Number.isInteger(depth) || depth < 0 || depth > 20) fail('OFFICE_ACTION_INVALID_DEPTH', 'get depth 必须是 0-20 的整数。', actionIndex)
    args.push('--depth', String(depth))
  }
  if (action.json !== false) args.push('--json')
  return args
}

export function compileQuery(filePath, action, actionIndex) {
  const selector = String(action.selector || action.query || '').trim()
  if (!selector) fail('OFFICE_ACTION_MISSING_SELECTOR', 'query 操作缺少 selector。', actionIndex)
  const args = ['query', filePath, selector]
  if (action.json !== false) args.push('--json')
  return args
}

export function compileRawSet(filePath, action, actionIndex) {
  if (action.confirm !== true) {
    fail('OFFICE_ACTION_RAW_XML_UNCONFIRMED', 'raw-set 必须显式传 confirm=true。', actionIndex)
  }
  const part = assertPath(action.part || action.path, '', actionIndex)
  const xpath = String(action.xpath || '').trim()
  const rawAction = String(action.rawAction || action.rawSetAction || '').trim().toLowerCase()
  const xml = String(action.xml || '')
  const allowed = new Set(['append', 'prepend', 'insertbefore', 'insertafter', 'replace', 'remove', 'setattr'])
  if (!xpath) fail('OFFICE_ACTION_RAW_XML_MISSING_XPATH', 'raw-set 缺少 xpath。', actionIndex)
  if (!allowed.has(rawAction)) fail('OFFICE_ACTION_RAW_XML_INVALID_ACTION', `raw-set action 不支持：${rawAction}`, actionIndex)
  if (rawAction !== 'remove' && !xml) fail('OFFICE_ACTION_RAW_XML_MISSING_XML', 'raw-set 缺少 xml。', actionIndex)
  const args = ['raw-set', filePath, part, '--xpath', xpath, '--action', rawAction]
  if (rawAction !== 'remove') args.push('--xml', xml)
  return args
}

function readFlagValue(args, flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function readProps(args) {
  const props = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--prop') continue
    const raw = String(args[i + 1] || '')
    const eq = raw.indexOf('=')
    if (eq > 0) props[raw.slice(0, eq)] = parseBatchPropValue(raw.slice(eq + 1))
  }
  return props
}

function parseBatchPropValue(value) {
  const text = String(value ?? '')
  const trimmed = text.trim()
  if (!trimmed) return text
  if (!['[', '{'].includes(trimmed[0])) return text
  try {
    return JSON.parse(trimmed)
  } catch {
    return text
  }
}

export function argsToBatchEntry(args) {
  const command = args[0]
  if (command === 'add') {
    const entry = { command: 'add', parent: args[2] }
    const type = readFlagValue(args, '--type')
    const from = readFlagValue(args, '--from')
    if (type) entry.type = type
    if (from) entry.from = from
    if (readFlagValue(args, '--after')) entry.after = readFlagValue(args, '--after')
    if (readFlagValue(args, '--before')) entry.before = readFlagValue(args, '--before')
    if (readFlagValue(args, '--index')) entry.index = Number(readFlagValue(args, '--index'))
    const props = readProps(args)
    if (Object.keys(props).length) entry.props = props
    return entry
  }
  if (command === 'set') {
    const entry = { command: 'set', path: args[2] }
    if (readFlagValue(args, '--find') !== undefined) entry.find = readFlagValue(args, '--find')
    if (readFlagValue(args, '--replace') !== undefined) entry.replace = readFlagValue(args, '--replace')
    const props = readProps(args)
    if (Object.keys(props).length) entry.props = props
    return entry
  }
  if (command === 'remove') return { command: 'remove', path: args[2] }
  if (command === 'get') {
    const entry = { command: 'get', path: args[2] }
    if (readFlagValue(args, '--depth') !== undefined) entry.depth = Number(readFlagValue(args, '--depth'))
    return entry
  }
  if (command === 'query') return { command: 'query', selector: args[2] }
  if (command === 'raw-set') {
    const entry = {
      command: 'raw-set',
      part: args[2],
      xpath: readFlagValue(args, '--xpath'),
      action: readFlagValue(args, '--action'),
    }
    const xml = readFlagValue(args, '--xml')
    if (xml !== undefined) entry.xml = xml
    return entry
  }
  return null
}

export function compileCommonAction(filePath, action, actionIndex, command) {
  switch (command) {
    case 'add':
    case 'clone':
      return compileAdd(filePath, action, actionIndex)
    case 'set':
      return compileSet(filePath, action, actionIndex)
    case 'remove':
      return compileRemove(filePath, action, actionIndex)
    case 'replace_text':
      return compileReplaceText(filePath, action, actionIndex)
    case 'get':
      return compileGet(filePath, action, actionIndex)
    case 'query':
      return compileQuery(filePath, action, actionIndex)
    case 'raw_set':
    case 'raw-set':
      return compileRawSet(filePath, action, actionIndex)
    default:
      return null
  }
}
