export class MindmapGenerationModule {
  constructor({ jsonRunner }) {
    this.toolId = 'mindmap'
    this.label = '思维导图'
    this.agentEnglishName = 'mindmap-generator'
    this.supports = ['local', 'cloud']
    this.schema = 'mindmap'
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
    const root = data.mindmap
    if (!root || typeof root !== 'object' || !root.label) return { error: 'mindmap.label 缺失' }
    return { ok: true }
  }
}
