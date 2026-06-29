export class GraphGenerationModule {
  constructor({ jsonRunner }) {
    this.toolId = 'graph'
    this.label = '知识图谱'
    this.agentEnglishName = 'graph-generator'
    this.supports = ['local', 'cloud']
    this.schema = 'graph'
    this._jsonRunner = jsonRunner
  }

  canRun() {
    return true
  }

  run(request) {
    return this._jsonRunner.run({
      ...request,
      toolId: this.toolId,
      validateResult: data => this._validate(data),
    })
  }

  _validate(data) {
    if (!data || typeof data !== 'object') return { error: '返回数据不是对象' }
    const g = data.graph
    if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) {
      return { error: 'graph.nodes / graph.edges 必须是数组' }
    }
    if (!g.nodes.length) return { error: '至少需要 1 个节点' }
    const idSet = new Set(g.nodes.map(n => n.id))
    for (const e of g.edges) {
      if (!idSet.has(e.source) || !idSet.has(e.target)) {
        return { error: `边 ${e.id || ''} 引用了不存在的节点` }
      }
    }
    return { ok: true }
  }
}
