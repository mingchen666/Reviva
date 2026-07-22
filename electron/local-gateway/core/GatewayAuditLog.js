export class GatewayAuditLog {
  constructor(limit = 200) { this.limit = limit; this.entries = [] }
  add(entry) { this.entries.push({ ...entry, timestamp: new Date().toISOString() }); if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit) }
  list(limit = 50) { return this.entries.slice(-Math.min(Math.max(Number(limit) || 50, 1), this.limit)).reverse() }
  clear() { this.entries = [] }
}
