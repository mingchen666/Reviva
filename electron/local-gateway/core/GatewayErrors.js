export const GATEWAY_ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  SERVICE_DISABLED: 'SERVICE_DISABLED',
  LAN_ACCESS_DISABLED: 'LAN_ACCESS_DISABLED',
  ORIGIN_DENIED: 'ORIGIN_DENIED',
  CAPABILITY_NOT_FOUND: 'CAPABILITY_NOT_FOUND',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  SOURCE_INVALID: 'SOURCE_INVALID',
  SOURCE_NOT_READY: 'SOURCE_NOT_READY',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  CONVERSATION_AGENT_MISMATCH: 'CONVERSATION_AGENT_MISMATCH',
  CONVERSATION_SOURCE_MISMATCH: 'CONVERSATION_SOURCE_MISMATCH',
  LEARNING_RUN_NOT_FOUND: 'LEARNING_RUN_NOT_FOUND',
  GATEWAY_RESTARTED: 'GATEWAY_RESTARTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
})

export class GatewayError extends Error {
  constructor(code, message, { status = 400, retryable = false, details = null } = {}) {
    super(message)
    this.name = 'GatewayError'
    this.code = code
    this.status = status
    this.retryable = retryable
    this.details = details
  }
}

export function normalizeGatewayError(error) {
  if (error instanceof GatewayError) return error
  return new GatewayError(
    GATEWAY_ERROR_CODES.INTERNAL_ERROR,
    'Gateway 内部错误。',
    { status: 500, retryable: true },
  )
}
