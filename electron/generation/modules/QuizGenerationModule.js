export class QuizGenerationModule {
  constructor({ jsonRunner }) {
    this.toolId = 'quiz'
    this.label = '测验'
    this.agentEnglishName = 'quiz-generator'
    this.supports = ['local', 'cloud']
    this.schema = 'quiz'
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
    if (!Array.isArray(data.questions)) return { error: 'questions 必须是数组' }
    if (!data.questions.length) return { error: '至少需要 1 道题目' }

    for (const [idx, question] of data.questions.entries()) {
      const n = idx + 1
      if (!question || typeof question !== 'object') return { error: `第 ${n} 道题不是对象` }
      const type = String(question.type || '').toLowerCase()
      if (!['single', 'bool'].includes(type)) return { error: `第 ${n} 道题 type 只支持 single 或 bool` }
      if (!String(question.q || '').trim()) return { error: `第 ${n} 道题缺少 q` }
      if (type === 'single') {
        if (!Array.isArray(question.options) || question.options.length < 2) {
          return { error: `第 ${n} 道单选题至少需要 2 个选项` }
        }
        const answer = String(question.answer || '').trim().toUpperCase()
        if (!answer) return { error: `第 ${n} 道题缺少 answer` }
        const optionLetters = new Set(question.options.map((raw, i) => {
          const match = String(raw || '').trim().match(/^([A-Za-z])[\.\、]\s*/)
          return (match?.[1] || String.fromCharCode(65 + i)).toUpperCase()
        }))
        if (!optionLetters.has(answer)) return { error: `第 ${n} 道题 answer 不在选项中` }
      } else {
        const answer = String(question.answer).toLowerCase()
        if (!['true', 'false'].includes(answer)) return { error: `第 ${n} 道判断题 answer 必须是 true 或 false` }
      }
    }
    return { ok: true }
  }
}
