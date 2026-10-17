// Unified error response formatting.

export function errorResponse(code, action, domain, extras = {}) {
  const err = {
    code,
    message: extras.message || extras.hint || code,
    domain: domain || undefined,
    action: action || undefined,
  }
  if (extras.field) err.field = extras.field
  if (extras.available) err.available = extras.available
  if (extras.expected) err.expected = extras.expected
  if (extras.got) err.got = extras.got
  if (extras.hint) err.hint = extras.hint
  return { ok: false, error: err }
}

export function errorResponseFromThrow(err, action, domain) {
  // SecurityError — treat as PERMISSION_DENIED
  if (err?.name === 'SecurityError' || err?.code?.startsWith('BLOCKED_')) {
    return errorResponse('PERMISSION_DENIED', action, domain, {
      message: err.message,
      hint: '该设置项不在可操作白名单内',
    })
  }
  // Custom error codes from domain handlers
  if (err?.code && typeof err.code === 'string') {
    return errorResponse(err.code, action, domain, {
      message: err.message,
      field: err.field,
      available: err.available,
      expected: err.expected,
      got: err.got,
      hint: err.hint,
    })
  }
  // Generic fallback
  return errorResponse('OPERATION_FAILED', action, domain, {
    message: err?.message || String(err),
  })
}

// Helper error classes for domain handlers to throw
export class DomainError extends Error {
  constructor(code, message, extras = {}) {
    super(message)
    this.code = code
    this.name = 'DomainError'
    Object.assign(this, extras)
  }
}

export function missingParam(field, expected) {
  return new DomainError('MISSING_PARAM', `缺少必填参数: ${field}`, { field, expected })
}

export function invalidParam(field, available, message) {
  return new DomainError('INVALID_PARAM', message || `参数 ${field} 无效`, { field, available })
}

export function invalidType(field, expected, got) {
  return new DomainError('INVALID_TYPE', `参数 ${field} 类型错误`, { field, expected, got })
}

export function notFound(field, available, message) {
  return new DomainError('NOT_FOUND', message || `${field} 不存在`, { field, available })
}
