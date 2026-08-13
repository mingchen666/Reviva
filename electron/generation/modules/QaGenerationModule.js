import { qaArtifactSchema } from '../StructuredArtifactSchemas.js'

export class QaGenerationModule {
  constructor({ jsonRunner }) {
    this.toolId = 'qa'
    this.label = 'Q&A 问答卡'
    this.agentEnglishName = 'qa-generator'
    this.supports = ['local']
    this.schema = 'qa'
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
      schema: qaArtifactSchema,
      validateResult: data => this._validate(data),
    })
  }

  _validate(data) {
    if (data.total_items !== data.items.length) return { error: 'total_items 必须与 items 数量一致' }
    const ids = new Set()
    const seen = new Set()
    for (const [index, item] of data.items.entries()) {
      const id = String(item.id || '').trim()
      if (ids.has(id)) return { error: `第 ${index + 1} 条问答的 id 与前面重复` }
      ids.add(id)
      const question = String(item.question || '').trim().toLocaleLowerCase()
      if (seen.has(question)) return { error: `第 ${index + 1} 条问答与前面重复` }
      seen.add(question)
    }
    return { ok: true }
  }
}
