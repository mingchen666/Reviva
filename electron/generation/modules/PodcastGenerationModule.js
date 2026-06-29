export class PodcastGenerationModule {
  constructor({ cloudRunner }) {
    this.toolId = 'podcast'
    this.label = '播客'
    this.agentEnglishName = 'podcast-generator'
    this.supports = ['cloud']
    this.schema = 'podcast'
    this._cloudRunner = cloudRunner
  }

  canRun(mode = 'cloud') {
    return mode === 'cloud' && this._cloudRunner?.canRun?.()
  }

  run(request) {
    return this._cloudRunner.run({ ...request, toolId: this.toolId })
  }
}
