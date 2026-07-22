export class GatewayRateLimiter {
  constructor({ windowMs = 60_000, max = 120 } = {}) { this.windowMs = windowMs; this.max = max; this.buckets = new Map() }
  allow(key) {
    const now = Date.now(); const current = this.buckets.get(key)
    if (!current || now - current.startedAt >= this.windowMs) { this.buckets.set(key, { startedAt: now, count: 1 }); return true }
    current.count += 1
    return current.count <= this.max
  }
  cleanup() { const cutoff = Date.now() - this.windowMs; for (const [key, value] of this.buckets) if (value.startedAt < cutoff) this.buckets.delete(key) }
}
