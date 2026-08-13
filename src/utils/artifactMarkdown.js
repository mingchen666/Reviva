import { createMarkdownRenderer } from './markdown.js'

// 结构化创作成果需要保留换行，但不需要自动把纯文本 URL 变成链接。
const artifactMarkdown = createMarkdownRenderer({
  breaks: true,
  linkify: false,
})

function toText(value) {
  return value === null || value === undefined ? '' : String(value)
}

/**
 * 现有 Markdown 渲染器原生支持 $...$ 和 $$...$$。
 * 这里额外兼容常见的 \\(...\\) 与 \\[...\\]，让模型与用户都可以使用标准 LaTeX 分隔符。
 */
function normalizeMathDelimiters(value, { inline = false } = {}) {
  const displayMath = (_, latex) => {
    const formula = latex.trim()
    return inline
      ? '$' + formula.replace(/\s+/g, ' ') + '$'
      : '\n\n$$\n' + formula + '\n$$\n\n'
  }

  return toText(value)
    .replace(/\\\[([\s\S]*?)\\\]/g, displayMath)
    .replace(/\$\$([\s\S]*?)\$\$/g, displayMath)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => '$' + latex.trim() + '$')
}

/**
 * 渲染可包含段落、列表和块公式的成果字段。
 * `markdown.js` 保持 html: false，因此调用方可安全地将结果传给 v-html。
 */
export function renderArtifactMarkdown(value) {
  const source = normalizeMathDelimiters(value)
  return source ? artifactMarkdown.render(source) : ''
}

/**
 * 渲染标题、术语、标签等不能容纳块级 HTML 的字段。
 * 若模型误用了块公式分隔符，则降级成行内公式，避免生成非法嵌套结构。
 */
export function renderArtifactMarkdownInline(value) {
  const source = normalizeMathDelimiters(value, { inline: true })
  return source ? artifactMarkdown.renderInline(source) : ''
}
