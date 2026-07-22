export class SourceProviderRegistry {
  constructor(providers = []) {
    this._providers = new Map()
    for (const provider of providers) this.register(provider)
  }

  register(provider, aliases = []) {
    if (!provider?.id || typeof provider.inspect !== 'function') throw new Error('Invalid media source provider')
    for (const id of [provider.id, ...(provider.aliases || []), ...aliases]) {
      if (!id) continue
      this._providers.set(String(id), provider)
    }
    return provider
  }

  get(id) {
    return this._providers.get(String(id || '')) || null
  }

  resolve(input = {}) {
    const requested = input.providerId || input.sourceType
    if (requested && this.get(requested)) return this.get(requested)
    for (const provider of new Set(this._providers.values())) {
      if (typeof provider.supports === 'function' && provider.supports(input)) return provider
    }
    return null
  }

  list() {
    return [...new Set(this._providers.values())]
  }
}

