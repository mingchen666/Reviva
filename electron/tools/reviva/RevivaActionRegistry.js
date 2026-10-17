// Action registry: register/get/listDomains/listActions with example field.

const _domains = new Map()       // domainId -> { id, name, desc }
const _actions = new Map()       // domainId -> Map(actionId, entry)

const DOMAIN_META = {
  usage:           { name: '用量查询', desc: 'Token消耗与成本' },
  appearance:      { name: '主题外观', desc: '主题/强调色/自定义CSS' },
  preferences:     { name: '偏好设置', desc: '回答风格/工具栏/导航' },
  creation_tools:  { name: '创作工具', desc: '工具显隐与排序' },
  quick_inputs:    { name: '快捷输入', desc: '常用提问管理' },
  status:          { name: '系统状态', desc: '版本/工作区/环境' },
  agents:          { name: 'Agent清单', desc: 'Agent/Skill/MCP列表' },
  learning:        { name: '学习画像', desc: '学习成长概况' },
}

export function registerDomain(domainId, meta) {
  if (!_domains.has(domainId)) {
    _domains.set(domainId, { id: domainId, ...meta })
    _actions.set(domainId, new Map())
  }
}

export function register(entry) {
  if (!entry?.domain || !entry?.id) return
  registerDomain(entry.domain, DOMAIN_META[entry.domain] || { name: entry.domain, desc: '' })
  const domainMap = _actions.get(entry.domain)
  if (!domainMap.has(entry.id)) {
    domainMap.set(entry.id, {
      domain: entry.domain,
      id: entry.id,
      name: entry.name || entry.id,
      write: !!entry.write,
      params: entry.params || '',
      example: entry.example || {},
      execute: entry.execute,
    })
  }
}

export function get(actionId, domainId) {
  const domainMap = _actions.get(domainId)
  if (!domainMap) return null
  return domainMap.get(actionId) || null
}

export function listDomains() {
  const result = []
  for (const [id, meta] of _domains) {
    const actions = _actions.get(id)
    result.push({
      id,
      name: meta.name,
      desc: meta.desc,
      actions: actions.size,
    })
  }
  return result
}

export function listActions(domainId, { permission = 'readonly' } = {}) {
  const meta = _domains.get(domainId)
  if (!meta) return null
  const domainMap = _actions.get(domainId)
  const actions = []
  for (const [, entry] of domainMap) {
    // Filter write actions for readonly agents
    if (entry.write && permission !== 'readwrite') continue
    actions.push({
      id: entry.id,
      name: entry.name,
      write: entry.write,
      params: entry.params,
      example: entry.example,
    })
  }
  return { domain: domainId, name: meta.name, desc: meta.desc, actions }
}

export function hasDomain(domainId) {
  return _domains.has(domainId)
}

export function getAllDomainIds() {
  return [..._domains.keys()]
}
