export class ResearchGenerationModule {
  constructor({ agentRunner, cloudRunner }) {
    this.toolId = 'research'
    this.label = '深度研究'
    this.agentEnglishName = 'deep-researcher'
    this.supports = ['local', 'cloud']
    this.schema = 'research'
    this._agentRunner = agentRunner
    this._cloudRunner = cloudRunner
  }

  canRun(mode = 'local') {
    if (mode === 'cloud') return this._cloudRunner?.canRun?.()
    return this._agentRunner.canRun()
  }

  run(request) {
    const mode = request?.mode || request?.task?.mode || 'local'
    const runner = mode === 'cloud' ? this._cloudRunner : this._agentRunner
    return runner.run({ ...request, toolId: this.toolId })
  }
}
