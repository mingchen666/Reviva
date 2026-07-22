export const GATEWAY_CONFIG_KEY = 'localGatewayConfig'

export const DEFAULT_GATEWAY_CONFIG = Object.freeze({
  host: '127.0.0.1',
  port: 1210,
  lanEnabled: false,
  lanHost: '',
  allowedOrigins: [],
  allowExtensionOrigins: true,
  maxJsonBodyBytes: 12 * 1024 * 1024,
})

function asPort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return DEFAULT_GATEWAY_CONFIG.port
  return port
}

function asOrigins(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))]
}

export function normalizeGatewayConfig(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const { enabled: _legacyEnabled, ...input } = raw
  return {
    ...DEFAULT_GATEWAY_CONFIG,
    ...input,
    host: String(input.host || DEFAULT_GATEWAY_CONFIG.host),
    port: asPort(input.port),
    lanEnabled: input.lanEnabled === true,
    lanHost: String(input.lanHost || '').trim(),
    allowedOrigins: asOrigins(input.allowedOrigins),
    allowExtensionOrigins: input.allowExtensionOrigins !== false,
    maxJsonBodyBytes: Math.max(16 * 1024, Math.min(20 * 1024 * 1024, Number(input.maxJsonBodyBytes) || DEFAULT_GATEWAY_CONFIG.maxJsonBodyBytes)),
  }
}

export function loadGatewayConfig(dbService) {
  return normalizeGatewayConfig(dbService?.getSetting?.(GATEWAY_CONFIG_KEY) || DEFAULT_GATEWAY_CONFIG)
}

export function saveGatewayConfig(dbService, patch = {}) {
  const { enabled: _runtimeOnly, ...persistedPatch } = patch || {}
  const next = normalizeGatewayConfig({ ...loadGatewayConfig(dbService), ...persistedPatch })
  dbService?.setSetting?.(GATEWAY_CONFIG_KEY, next)
  return next
}
