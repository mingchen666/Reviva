export class FlashcardGenerationModule {
  constructor({ jsonRunner }) {
    this.toolId = 'flashcard'
    this.label = '闪卡'
    this.agentEnglishName = 'flashcard-generator'
    this.supports = ['local', 'cloud']
    this.schema = 'flashcard'
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
    if (!Array.isArray(data.cards)) return { error: 'cards 必须是数组' }
    if (!data.cards.length) return { error: '至少需要 1 张闪卡' }

    for (const [idx, card] of data.cards.entries()) {
      if (!card || typeof card !== 'object') return { error: `第 ${idx + 1} 张闪卡不是对象` }
      const type = String(card.type || 'qa').toLowerCase()
      if (!['qa', 'cloze'].includes(type)) return { error: `第 ${idx + 1} 张闪卡 type 只支持 qa 或 cloze` }
      if (!String(card.front || '').trim()) return { error: `第 ${idx + 1} 张闪卡缺少 front` }
      if (!String(card.back || '').trim()) return { error: `第 ${idx + 1} 张闪卡缺少 back` }
    }
    return { ok: true }
  }
}
