export class CapabilityRegistry {
  constructor() {
    this._resources = new Map()
    this._actions = new Map()
  }

  registerResource(definition = {}) {
    if (!definition.id) throw new Error('Resource capability id is required')
    if (this._resources.has(String(definition.id))) throw new Error(`Resource capability already registered: ${definition.id}`)
    this._resources.set(String(definition.id), { ...definition, type: 'resource' })
    return this._resources.get(String(definition.id))
  }

  registerAction(definition = {}) {
    if (!definition.id) throw new Error('Action capability id is required')
    if (this._actions.has(String(definition.id))) throw new Error(`Action capability already registered: ${definition.id}`)
    this._actions.set(String(definition.id), { ...definition, type: 'action' })
    return this._actions.get(String(definition.id))
  }

  getResource(id) { return this._resources.get(String(id || '')) || null }
  getAction(id) { return this._actions.get(String(id || '')) || null }

  listPublic() {
    const clean = item => ({
      id: item.id,
      type: item.type,
      version: item.version || '1.0',
      description: item.description || '',
      executionMode: item.executionMode || 'sync',
      riskLevel: item.riskLevel || 'low',
      enabled: item.enabled !== false,
    })
    return {
      resources: [...this._resources.values()].filter(item => item.enabled !== false).map(clean),
      actions: [...this._actions.values()].filter(item => item.enabled !== false).map(clean),
    }
  }
}

export function registerBuiltinCapabilities(registry) {
  registry.registerResource({ id: 'gateway', version: '1.0', description: 'Gateway health and capability discovery' })
  return registry
}
