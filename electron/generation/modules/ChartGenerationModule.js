const MAX_CHARTS = 6
const MAX_SVG_CHARS = 120000
const UNSAFE_SVG_PATTERNS = [
  /<\s*(script|foreignObject|iframe|object|embed|image|audio|video|canvas|style)\b/i,
  /\son[a-z]+\s*=/i,
  /\sstyle\s*=/i,
  /\b(?:href|xlink:href|src)\s*=/i,
  /javascript\s*:/i,
  /data\s*:/i,
  /url\s*\(\s*(?!#[A-Za-z0-9_-]+\s*\))/i,
]

export class ChartGenerationModule {
  constructor({ jsonRunner }) {
    this.toolId = 'chart'
    this.label = '图表'
    this.agentEnglishName = 'chart-generator'
    this.supports = ['local', 'cloud']
    this.schema = 'chart'
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
    if (!Array.isArray(data.charts)) return { error: 'charts 必须是数组' }
    if (!data.charts.length) return { error: '至少需要 1 个图表' }
    if (data.charts.length > MAX_CHARTS) return { error: `一次最多生成 ${MAX_CHARTS} 个图表` }

    for (const [idx, chart] of data.charts.entries()) {
      const n = idx + 1
      if (!chart || typeof chart !== 'object') return { error: `第 ${n} 个图表不是对象` }
      if (!String(chart.title || '').trim()) return { error: `第 ${n} 个图表缺少 title` }
      if (!String(chart.type || '').trim()) return { error: `第 ${n} 个图表缺少 type` }
      const svg = String(chart.svg || '').trim()
      if (!svg) return { error: `第 ${n} 个图表缺少 svg` }
      if (svg.length > MAX_SVG_CHARS) return { error: `第 ${n} 个图表 SVG 过大` }
      if (!/^<svg[\s>]/i.test(svg)) return { error: `第 ${n} 个图表 svg 必须以 <svg> 开始` }
      if (!/<\/svg>\s*$/i.test(svg)) return { error: `第 ${n} 个图表 svg 必须以 </svg> 结束` }
      if (UNSAFE_SVG_PATTERNS.some(pattern => pattern.test(svg))) {
        return { error: `第 ${n} 个图表 SVG 包含不安全内容` }
      }
      if (chart.insights !== undefined && !Array.isArray(chart.insights)) {
        return { error: `第 ${n} 个图表 insights 必须是数组` }
      }
    }
    return { ok: true }
  }
}
