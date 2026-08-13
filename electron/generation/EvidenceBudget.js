export const FOLLOW_UP_EVIDENCE_CALL_LIMIT = 20

function normalizeCount(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0
}

export function stableEvidenceKey(value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return `[${value.map(stableEvidenceKey).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${key}:${stableEvidenceKey(value[key])}`).join('|')}}`
  }
  return String(value)
}

export class EvidenceBudget {
  constructor({ limit = FOLLOW_UP_EVIDENCE_CALL_LIMIT } = {}) {
    this.limit = Math.min(
      FOLLOW_UP_EVIDENCE_CALL_LIMIT,
      Math.max(0, Math.trunc(Number(limit) || 0)),
    )
    this.used = 0
    this.calls = []
  }

  get remaining() {
    return Math.max(0, this.limit - this.used)
  }

  take(requested, meta = {}) {
    const requestedCount = normalizeCount(requested)
    // Reservations are all-or-nothing: callers execute a concrete batch, so
    // partially granting it would allow the original batch to exceed the cap.
    if (requestedCount <= 0 || requestedCount > this.remaining) return 0
    const amount = requestedCount
    const callStart = this.used + 1
    this.used += amount
    this.calls.push({
      ...meta,
      count: amount,
      callStart,
      callEnd: this.used,
      used: this.used,
      remaining: this.remaining,
    })
    return amount
  }

  record(meta = {}) {
    this.calls.push({ ...meta, count: 0, used: this.used, remaining: this.remaining })
  }

  audit() {
    return {
      limit: this.limit,
      used: this.used,
      remaining: this.remaining,
      calls: this.calls.slice(-40),
    }
  }
}
