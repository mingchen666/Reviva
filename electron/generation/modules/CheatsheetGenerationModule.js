import { cheatsheetArtifactSchema } from '../StructuredArtifactSchemas.js'

export class CheatsheetGenerationModule {
  constructor({ jsonRunner }) {
    this.toolId = 'cheatsheet'
    this.label = '速查表'
    this.agentEnglishName = 'cheatsheet-generator'
    this.supports = ['local']
    this.schema = 'cheatsheet'
    this.requiresTopicOrContext = true
    this._jsonRunner = jsonRunner
  }

  canRun() {
    return true
  }

  run(request) {
    return this._jsonRunner.run({
      ...request,
      toolId: this.toolId,
      includeExternalSources: true,
      schema: cheatsheetArtifactSchema,
      validateResult: data => this._validate(data),
    })
  }

  _validate(data) {
    const totalItems = data.sections.reduce((total, section) => total + section.items.length, 0)
    if (totalItems > 24) return { error: '速查表条目过多，必须保持一页式浓缩' }
    const labels = new Set()
    for (const section of data.sections) {
      for (const item of section.items) {
        const label = String(item.label || '').trim().toLocaleLowerCase()
        if (labels.has(label)) return { error: '速查表中不能重复相同条目' }
        labels.add(label)
      }
    }
    return { ok: true }
  }
}
