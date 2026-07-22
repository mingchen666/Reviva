export class GatewayRouter {
  constructor() {
    this._routes = []
  }

  register(method, pathname, handler, { auth = true } = {}) {
    const normalizedMethod = String(method).toUpperCase()
    if (this.match(normalizedMethod, pathname)) throw new Error(`Gateway route already registered: ${normalizedMethod} ${pathname}`)
    this._routes.push({ method: normalizedMethod, pathname, handler, auth })
    return this
  }

  match(method, pathname) {
    const normalizedMethod = String(method || '').toUpperCase()
    return this._routes.find(route => route.method === normalizedMethod && route.pathname === pathname) || null
  }

  resolve(method, pathname) {
    const exact = this.match(method, pathname)
    if (exact) return { route: exact, params: {} }
    const parts = String(pathname || '').split('/').filter(Boolean)
    return this._routes.reduce((found, route) => {
      if (found || route.method !== String(method || '').toUpperCase()) return found
      const routeParts = route.pathname.split('/').filter(Boolean)
      if (routeParts.length !== parts.length) return found
      const params = {}
      for (let i = 0; i < routeParts.length; i += 1) {
        if (routeParts[i].startsWith(':')) params[routeParts[i].slice(1)] = decodeURIComponent(parts[i])
        else if (routeParts[i] !== parts[i]) return found
      }
      return { route, params }
    }, null)
  }
}
