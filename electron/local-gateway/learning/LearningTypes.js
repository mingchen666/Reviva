import path from 'node:path'
import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'

export const LEARNING_SOURCE_TYPES = Object.freeze(['document', 'media', 'wiki_page'])
export const LEARNING_MODES = Object.freeze(['generate_note', 'chat', 'selection_action'])
export const LEARNING_ACTIONS = Object.freeze(['explain', 'rewrite', 'example', 'supplement'])
export const LEARNING_SOURCE_STYLES = Object.freeze(['footnotes', 'inline', 'sources', 'none'])

export const LEARNING_LIMITS = Object.freeze({
  sourceRefs: 20,
  userInstruction: 12_000,
  noteTitle: 300,
  outlineItems: 80,
  outlineItem: 1_000,
  selection: 20_000,
  fullNote: 80_000,
  templateText: 40_000,
  pageLimit: 100,
})

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/

function invalid(message, { code = GATEWAY_ERROR_CODES.INVALID_REQUEST, status = 400, retryable = false } = {}) {
  throw new GatewayError(code, message, { status, retryable })
}

function string(value, field, max = Number.MAX_SAFE_INTEGER, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) invalid(`${field} is required`)
    return ''
  }
  if (typeof value !== 'string') invalid(`${field} must be a string`)
  if (value.length > max) invalid(`${field} is too long`)
  const result = value.trim()
  if (required && !result) invalid(`${field} is required`)
  return result
}

function safeId(value, field) {
  const id = string(value, field, 200, { required: true })
  if (!ID_PATTERN.test(id)) invalid(`${field} is invalid`, { code: 'SOURCE_INVALID' })
  return id
}

export function validateWikiRelativePath(value) {
  if (typeof value !== 'string') invalid('wiki page path must be a string', { code: 'SOURCE_INVALID' })
  const normalized = value.trim()
  const segments = normalized.split('/')
  if (!normalized || CONTROL_PATTERN.test(normalized) || normalized.includes('\\') || path.isAbsolute(normalized)
    || /^[A-Za-z]:/.test(normalized) || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    invalid('wiki page path must be a safe relative path', { code: 'SOURCE_INVALID' })
  }
  return normalized
}

export function canonicalSourceRef(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('source ref must be an object', { code: 'SOURCE_INVALID' })
  const type = string(input.type, 'source ref type', 30, { required: true })
  if (!LEARNING_SOURCE_TYPES.includes(type)) invalid('unsupported source ref', { code: 'SOURCE_INVALID' })
  const allowedKeys = type === 'wiki_page' ? new Set(['type', 'wikiId', 'path']) : new Set(['type', 'id'])
  if (Object.keys(input).some(key => !allowedKeys.has(key))) invalid('source ref has unsupported fields', { code: 'SOURCE_INVALID' })
  if (type === 'wiki_page') {
    return { type, wikiId: safeId(input.wikiId, 'wikiId'), path: validateWikiRelativePath(input.path) }
  }
  return { type, id: safeId(input.id, 'source id') }
}

export function sourceRefKey(ref) {
  const canonical = canonicalSourceRef(ref)
  return canonical.type === 'wiki_page'
    ? `wiki_page:${canonical.wikiId}:${canonical.path}`
    : `${canonical.type}:${canonical.id}`
}

export function normalizeSourceRefs(value) {
  if (!Array.isArray(value) || value.length === 0) invalid('sourceRefs is required')
  if (value.length > LEARNING_LIMITS.sourceRefs) invalid('too many source refs')
  const refs = value.map(canonicalSourceRef)
  const keys = new Set()
  for (const ref of refs) {
    const key = sourceRefKey(ref)
    if (keys.has(key)) invalid('duplicate source ref', { code: 'SOURCE_INVALID' })
    keys.add(key)
  }
  return refs
}

export function validateGenerationRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('request body must be an object')
  const agentId = safeId(input.agentId, 'agentId')
  const mode = string(input.mode, 'mode', 50, { required: true })
  if (!LEARNING_MODES.includes(mode)) invalid('unsupported learning mode')
  const sourceRefs = normalizeSourceRefs(input.sourceRefs)
  const templateInput = input.template
  if (!templateInput || typeof templateInput !== 'object' || Array.isArray(templateInput)) invalid('template is required')
  const template = {
    id: string(templateInput.id, 'template.id', 300, { required: true }),
    name: string(templateInput.name, 'template.name', 500, { required: true }),
    description: string(templateInput.description, 'template.description', 8_000),
    instructions: string(templateInput.instructions, 'template.instructions', LEARNING_LIMITS.templateText),
    outline: string(templateInput.outline, 'template.outline', LEARNING_LIMITS.templateText),
    sourceStyle: string(templateInput.sourceStyle, 'template.sourceStyle', 30, { required: true }),
    advancedInstructions: string(templateInput.advancedInstructions, 'template.advancedInstructions', LEARNING_LIMITS.templateText),
  }
  if (!LEARNING_SOURCE_STYLES.includes(template.sourceStyle)) invalid('unsupported source style')
  const templateTextLength = [template.description, template.instructions, template.outline, template.advancedInstructions]
    .reduce((total, value) => total + value.length, 0)
  if (templateTextLength > LEARNING_LIMITS.templateText) invalid('template text is too long')

  const noteInput = input.noteContext
  if (!noteInput || typeof noteInput !== 'object' || Array.isArray(noteInput)) invalid('noteContext is required')
  const title = string(noteInput.title, 'noteContext.title', LEARNING_LIMITS.noteTitle)
  if (!Array.isArray(noteInput.outline) || noteInput.outline.length > LEARNING_LIMITS.outlineItems) invalid('noteContext.outline is invalid')
  const outline = noteInput.outline.map((item, index) => string(item, `noteContext.outline[${index}]`, LEARNING_LIMITS.outlineItem))
  const selection = string(noteInput.selection, 'noteContext.selection', LEARNING_LIMITS.selection)
  const includeFullNote = noteInput.includeFullNote === true
  const fullNote = includeFullNote ? string(noteInput.fullNote, 'noteContext.fullNote', LEARNING_LIMITS.fullNote) : ''
  const userInstruction = string(input.userInstruction, 'userInstruction', LEARNING_LIMITS.userInstruction)
  const conversationId = input.conversationId === undefined || input.conversationId === null || input.conversationId === ''
    ? ''
    : safeId(input.conversationId, 'conversationId')
  const action = mode === 'selection_action' ? string(input.action, 'action', 30, { required: true }) : ''
  if (mode === 'selection_action' && (!LEARNING_ACTIONS.includes(action) || !selection)) invalid('selection_action requires a valid action and selection')

  return {
    agentId, sourceRefs, mode, template, userInstruction,
    noteContext: { title, outline, selection, includeFullNote, fullNote },
    conversationId, action,
  }
}

export function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset: Math.max(0, Math.trunc(Number(offset) || 0)) })).toString('base64url')
}

export function decodeCursor(value) {
  if (!value) return 0
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'))
    if (!Number.isInteger(parsed.offset) || parsed.offset < 0 || Object.keys(parsed).some(key => key !== 'offset')) throw new Error('invalid')
    return parsed.offset
  } catch {
    invalid('invalid learning sources cursor')
  }
}

export function normalizePageLimit(value) {
  if (value === null || value === undefined || value === '') return 50
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > LEARNING_LIMITS.pageLimit) invalid('invalid learning sources limit')
  return parsed
}

export function publicError(code, message, { status = 400, retryable = false } = {}) {
  return new GatewayError(code, message, { status, retryable })
}
