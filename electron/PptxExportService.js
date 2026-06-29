import PptxGenJS from 'pptxgenjs'
import path from 'node:path'
import fs from 'node:fs'

export class PptxExportService {
  constructor() {}

  /**
   * Parse HTML slides content into structured data for PPTX generation.
   * Extracts slide type, title, points, and style info from HTML.
   */
  parseHtmlSlides(htmlContent) {
    const slides = []

    // Extract CSS variables for theming
    const bgMatch = htmlContent.match(/--bg:\s*([^;]+)/)
    const accentMatch = htmlContent.match(/--accent:\s*([^;]+)/)
    const textMatch = htmlContent.match(/--text:\s*([^;]+)/)
    const theme = {
      bg: bgMatch?.[1]?.trim() || '#ffffff',
      accent: accentMatch?.[1]?.trim() || '#000000',
      text: textMatch?.[1]?.trim() || '#333333',
    }

    const slideBlocks = this._extractSlideBlocks(htmlContent)
    if (!slideBlocks.length) {
      const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
      slideBlocks.push({ attrs: 'class="slide"', content: bodyMatch?.[1] || htmlContent })
    }

    for (const block of slideBlocks) {
      const content = block.content
      const slide = {
        type: this._detectSlideType(block.attrs, content),
        title: this._extractHeading(content) || '',
        points: this._extractListItems(content),
        raw: content,
      }

      slide.subtitle = this._extractTextByClass(content, ['subtitle', 'sub-title', 'lead'])
      slide.quote = this._extractTextByClass(content, ['quote', 'blockquote']) || this._extractTagText(content, 'blockquote')
      slide.author = this._extractTextByClass(content, ['author', 'source', 'cite']) || this._extractTagText(content, 'cite')

      if (slide.type === 'comparison') {
        const left = this._extractBlockByClass(content, ['left', 'left-column', 'comparison-left', 'col-left'])
        const right = this._extractBlockByClass(content, ['right', 'right-column', 'comparison-right', 'col-right'])
        if (left) {
          slide.leftTitle = this._extractHeading(left, ['h2', 'h3', 'h4']) || 'A'
          slide.leftPoints = this._extractListItems(left)
        }
        if (right) {
          slide.rightTitle = this._extractHeading(right, ['h2', 'h3', 'h4']) || 'B'
          slide.rightPoints = this._extractListItems(right)
        }
        if (!slide.leftPoints?.length && !slide.rightPoints?.length && slide.points.length) {
          const mid = Math.ceil(slide.points.length / 2)
          slide.leftPoints = slide.points.slice(0, mid)
          slide.rightPoints = slide.points.slice(mid)
        }
      }

      if (!slide.points.length && slide.type !== 'comparison') {
        slide.points = this._extractParagraphs(content).slice(0, 6)
      }

      slides.push(slide)
    }

    return { slides, theme }
  }

  /**
   * Generate a PPTX file from parsed HTML slide data.
   */
  async exportLocal(htmlPath, outputPath) {
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8')
    const { slides, theme } = this.parseHtmlSlides(htmlContent)

    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE' // 13.33 x 7.5 inches
    pptx.author = 'Reviva'
    pptx.subject = 'Presentation'
    const rectShape = pptx.ShapeType?.rect || 'rect'

    // Determine if dark theme
    const isDark = this._isColorDark(theme.bg)

    for (const slide of slides) {
      const s = pptx.addSlide()

      // Background
      s.background = { fill: theme.bg.replace('#', '') }

      switch (slide.type) {
        case 'title':
          this._addTitleSlide(s, slide, theme, isDark, rectShape)
          break
        case 'comparison':
          this._addComparisonSlide(s, slide, theme, isDark, rectShape)
          break
        case 'quote':
          this._addQuoteSlide(s, slide, theme, isDark)
          break
        case 'end':
          this._addEndSlide(s, slide, theme, isDark)
          break
        default:
          this._addContentSlide(s, slide, theme, isDark, rectShape)
          break
      }
    }

    await pptx.writeFile({ fileName: outputPath })
    return { success: true, path: outputPath, slideCount: slides.length }
  }

  _addTitleSlide(s, slide, theme, isDark, rectShape) {
    const textColor = isDark ? 'FFFFFF' : theme.text.replace('#', '')
    const accentColor = theme.accent.replace('#', '')

    s.addText(slide.title || 'Title', {
      x: 0.8, y: 2.0, w: 11.7, h: 2.0,
      fontSize: 36, fontFace: 'Arial', bold: true,
      color: textColor, align: 'center', valign: 'middle',
    })
    if (slide.subtitle) {
      s.addText(slide.subtitle, {
        x: 1.5, y: 4.2, w: 10.3, h: 0.8,
        fontSize: 18, fontFace: 'Arial',
        color: textColor, align: 'center',
      })
    }
    // Accent line
    s.addShape(rectShape, {
      x: 5.5, y: 4.0, w: 2.3, h: 0.06,
      fill: { color: accentColor },
    })
  }

  _addContentSlide(s, slide, theme, isDark, rectShape) {
    const textColor = isDark ? 'FFFFFF' : theme.text.replace('#', '')
    const accentColor = theme.accent.replace('#', '')

    s.addText(slide.title || '', {
      x: 0.8, y: 0.5, w: 11.7, h: 0.9,
      fontSize: 24, fontFace: 'Arial', bold: true,
      color: textColor,
    })
    // Accent line under title
    s.addShape(rectShape, {
      x: 0.8, y: 1.5, w: 2.0, h: 0.04,
      fill: { color: accentColor },
    })

    if (slide.points.length) {
      const bodyText = slide.points.map(p => ({
        text: p,
        options: { fontSize: 16, fontFace: 'Arial', color: textColor, bullet: { code: '25CF', color: accentColor }, breakLine: true, paraSpaceAfter: 8 },
      }))
      s.addText(bodyText, {
        x: 1.0, y: 1.8, w: 11.3, h: 5.0,
        valign: 'top',
      })
    }
  }

  _addComparisonSlide(s, slide, theme, isDark, rectShape) {
    const textColor = isDark ? 'FFFFFF' : theme.text.replace('#', '')
    const accentColor = theme.accent.replace('#', '')

    s.addText(slide.title || '', {
      x: 0.8, y: 0.5, w: 11.7, h: 0.9,
      fontSize: 24, fontFace: 'Arial', bold: true,
      color: textColor,
    })

    // Left column
    s.addText(slide.leftTitle || 'A', {
      x: 0.8, y: 1.6, w: 5.5, h: 0.6,
      fontSize: 18, fontFace: 'Arial', bold: true, color: accentColor,
    })
    if (slide.leftPoints?.length) {
      s.addText(slide.leftPoints.map(p => ({
        text: p, options: { fontSize: 14, fontFace: 'Arial', color: textColor, bullet: true, breakLine: true },
      })), { x: 0.8, y: 2.3, w: 5.5, h: 4.5, valign: 'top' })
    }

    // Divider
    s.addShape(rectShape, {
      x: 6.6, y: 1.6, w: 0.03, h: 5.2,
      fill: { color: accentColor },
    })

    // Right column
    s.addText(slide.rightTitle || 'B', {
      x: 6.9, y: 1.6, w: 5.5, h: 0.6,
      fontSize: 18, fontFace: 'Arial', bold: true, color: accentColor,
    })
    if (slide.rightPoints?.length) {
      s.addText(slide.rightPoints.map(p => ({
        text: p, options: { fontSize: 14, fontFace: 'Arial', color: textColor, bullet: true, breakLine: true },
      })), { x: 6.9, y: 2.3, w: 5.5, h: 4.5, valign: 'top' })
    }
  }

  _addQuoteSlide(s, slide, theme, isDark) {
    const textColor = isDark ? 'FFFFFF' : theme.text.replace('#', '')
    const accentColor = theme.accent.replace('#', '')

    s.addText(slide.quote || slide.title || '', {
      x: 1.5, y: 2.0, w: 10.3, h: 3.0,
      fontSize: 24, fontFace: 'Arial', italic: true,
      color: textColor, align: 'center', valign: 'middle',
    })
    if (slide.author) {
      s.addText(`— ${slide.author}`, {
        x: 1.5, y: 5.2, w: 10.3, h: 0.6,
        fontSize: 14, fontFace: 'Arial',
        color: accentColor, align: 'center',
      })
    }
  }

  _addEndSlide(s, slide, theme, isDark) {
    const textColor = isDark ? 'FFFFFF' : theme.text.replace('#', '')

    s.addText(slide.title || 'Thank You', {
      x: 0.8, y: 2.5, w: 11.7, h: 2.0,
      fontSize: 40, fontFace: 'Arial', bold: true,
      color: textColor, align: 'center', valign: 'middle',
    })
  }

  /**
   * Cloud export stub — will call backend API in the future.
   */
  async exportCloud(htmlPath, outputPath) {
    throw new Error('云端 PPTX 导出即将上线，当前请使用本地导出或 HTML 格式')
  }

  _stripTags(html) {
    return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim()
  }

  _extractSlideBlocks(html) {
    const blocks = []
    const openRe = /<([a-zA-Z][\w:-]*)\b([^>]*)>/g
    let match
    while ((match = openRe.exec(html)) !== null) {
      const tag = match[1].toLowerCase()
      const attrs = match[2] || ''
      const classes = this._classList(attrs)
      if (!classes.includes('slide') && !classes.some(c => c.startsWith('slide-'))) continue

      const close = this._findMatchingClose(html, tag, openRe.lastIndex)
      if (!close) continue

      blocks.push({ attrs, content: html.slice(openRe.lastIndex, close.start) })
      openRe.lastIndex = close.end
    }
    return blocks
  }

  _findMatchingClose(html, tag, fromIndex) {
    const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi')
    tagRe.lastIndex = fromIndex
    let depth = 1
    let match
    while ((match = tagRe.exec(html)) !== null) {
      const token = match[0]
      if (token.startsWith('</')) depth -= 1
      else if (!token.endsWith('/>')) depth += 1
      if (depth === 0) return { start: match.index, end: tagRe.lastIndex }
    }
    return null
  }

  _getAttr(attrs, name) {
    const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
    return match?.[1] || ''
  }

  _classList(attrs) {
    return this._getAttr(attrs, 'class').toLowerCase().split(/\s+/).filter(Boolean)
  }

  _hasAnyClass(attrs, names) {
    const classes = new Set(this._classList(attrs))
    return names.some(name => classes.has(name.toLowerCase()))
  }

  _detectSlideType(attrs, content) {
    const dataType = this._getAttr(attrs, 'data-type').toLowerCase()
    if (['title', 'cover', 'comparison', 'quote', 'end', 'content'].includes(dataType)) {
      return dataType === 'cover' ? 'title' : dataType
    }

    const classes = this._classList(attrs)
    if (classes.some(c => c.includes('comparison'))) return 'comparison'
    if (classes.some(c => c.includes('quote'))) return 'quote'
    if (classes.some(c => c.includes('title') || c.includes('cover'))) return 'title'
    if (classes.some(c => c.includes('end') || c.includes('thanks'))) return 'end'

    if (this._extractTextByClass(content, ['author'])) return 'title'
    if (this._extractTextByClass(content, ['quote', 'blockquote'])) return 'quote'
    if (/<h1\b/i.test(content) && !/<h2\b/i.test(content) && !/<li\b/i.test(content)) return 'end'
    return 'content'
  }

  _extractHeading(html, tags = ['h1', 'h2']) {
    for (const tag of tags) {
      const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
      if (match) return this._stripTags(match[1])
    }
    return ''
  }

  _extractListItems(html) {
    const points = []
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let match
    while ((match = liRegex.exec(html)) !== null) {
      const text = this._stripTags(match[1])
      if (text) points.push(text)
    }
    return points
  }

  _extractParagraphs(html) {
    const points = []
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi
    let match
    while ((match = pRegex.exec(html)) !== null) {
      const text = this._stripTags(match[1])
      if (text) points.push(text)
    }
    return points
  }

  _extractTagText(html, tag) {
    const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    return match ? this._stripTags(match[1]) : ''
  }

  _extractBlockByClass(html, classNames) {
    const openRe = /<([a-zA-Z][\w:-]*)\b([^>]*)>/g
    let match
    while ((match = openRe.exec(html)) !== null) {
      const tag = match[1].toLowerCase()
      const attrs = match[2] || ''
      if (!this._hasAnyClass(attrs, classNames)) continue
      const close = this._findMatchingClose(html, tag, openRe.lastIndex)
      if (!close) return ''
      return html.slice(openRe.lastIndex, close.start)
    }
    return ''
  }

  _extractTextByClass(html, classNames) {
    const block = this._extractBlockByClass(html, classNames)
    return block ? this._stripTags(block) : ''
  }

  _isColorDark(hex) {
    const c = hex.replace('#', '')
    const r = parseInt(c.substring(0, 2), 16)
    const g = parseInt(c.substring(2, 4), 16)
    const b = parseInt(c.substring(4, 6), 16)
    return (r * 299 + g * 587 + b * 114) / 1000 < 128
  }
}
