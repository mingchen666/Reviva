import { glossaryArtifactSchema } from '../StructuredArtifactSchemas.js'

export class GlossaryGenerationModule {
  constructor({ jsonRunner }) {
    this.toolId = 'glossary'
    this.label = '术语表'
    this.agentEnglishName = 'glossary-generator'
    this.supports = ['local']
    this.schema = 'glossary'
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
      schema: glossaryArtifactSchema,
      validateResult: data => this._validate(data),
    })
  }

  _validate(data) {
    if (data.total_terms !== data.terms.length) return { error: 'total_terms 必须与 terms 数量一致' }
    const ids = new Set()
    const seen = new Set()
    for (const [index, item] of data.terms.entries()) {
      const id = String(item.id || '').trim()
      if (ids.has(id)) return { error: `第 ${index + 1} 个术语的 id 与前面重复` }
      ids.add(id)
      const term = String(item.term || '').trim().toLocaleLowerCase()
      if (seen.has(term)) return { error: `第 ${index + 1} 个术语与前面重复` }
      seen.add(term)
    }
    return { ok: true }
  }
}
