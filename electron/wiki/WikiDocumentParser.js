import fs from 'node:fs'
import path from 'node:path'
import { DocumentReadService } from './DocumentReadService.js'
import { WikiAssetService } from './WikiAssetService.js'
import { detectParserType, listParserCapabilities } from './WikiParserRegistry.js'

export function detectSourceType(filePath) {
  const ext = path.extname(filePath || '').toLowerCase().replace('.', '')
  return detectParserType(ext || 'file')
}

export class WikiDocumentParser {
  constructor({ wikiDir, docsRootPath = '' }) {
    this._wikiDir = wikiDir
    this._docsRootPath = docsRootPath
    this._reader = new DocumentReadService()
    this._assetService = new WikiAssetService({ wikiDir })
  }

  async parseSource(source) {
    if (!source?.original_path) throw new Error('Source original_path is required')
    if (source.type === 'markdown' || source.type === 'text') {
      return this._parseTextLike(source)
    }
    if (['pdf', 'word', 'spreadsheet', 'presentation'].includes(source.type)) {
      return this._parseRichDocument(source)
    }

    return {
      status: 'pending',
      extract_path: '',
      parser_status: 'not_implemented',
      parser_message: `该来源格式暂未接入 Wiki 解析器，后续会由文档解析工作流补齐。`,
    }
  }

  static capabilities() {
    return listParserCapabilities()
  }

  async _parseTextLike(source) {
    const content = await fs.promises.readFile(source.original_path, 'utf-8')
    const relExtractPath = `sources/extracts/${source.id}.md`
    const absExtractPath = path.join(this._wikiDir, relExtractPath)
    await fs.promises.mkdir(path.dirname(absExtractPath), { recursive: true })
    const rewritten = await this._assetService.rewriteMarkdownLocalImages({
      markdown: content,
      source,
      sourceFilePath: source.original_path,
      outputRelPath: relExtractPath,
      docsRootPath: this._docsRootPath,
    })
    const body = [
      `---`,
      `source_id: ${source.id}`,
      `source_type: ${source.type}`,
      `title: ${JSON.stringify(source.title || source.id)}`,
      `asset_count: ${rewritten.assets.length}`,
      `---`,
      ``,
      rewritten.markdown,
    ].join('\n')
    await fs.promises.writeFile(absExtractPath, body, 'utf-8')

    return {
      status: 'ingested',
      extract_path: relExtractPath,
      parser_status: 'complete',
      parser_message: '',
      meta: {
        ...(source.meta || {}),
        parse_stats: {
          ...(source.meta?.parse_stats || {}),
          asset_count: rewritten.assets.length,
        },
      },
    }
  }

  async _parseRichDocument(source) {
    const relExtractPath = `sources/extracts/${source.id}.md`
    const safeSourceId = this._safeSegment(source.id || 'source')
    const result = await this._reader.readDocument(source.original_path, {
      sourceType: source.type,
      title: source.title,
      sourceId: source.id,
      imageOutputDir: path.join(this._wikiDir, 'assets', 'images', safeSourceId),
      imageOutputRelDir: `assets/images/${safeSourceId}`,
    })

    if (!result.success) {
      return {
        status: result.code === 'PDF_NEEDS_OCR' ? 'pending' : 'failed',
        extract_path: '',
        parser_status: result.code === 'PDF_NEEDS_OCR' ? 'needs_ocr' : 'failed',
        parser_message: result.message || result.detail || '富文本文档解析失败。',
        meta: {
          ...(source.meta || {}),
          parse_stats: result.stats || {},
          parser_code: result.code || '',
        },
      }
    }

    const absExtractPath = path.join(this._wikiDir, relExtractPath)
    await fs.promises.mkdir(path.dirname(absExtractPath), { recursive: true })
    const assets = Array.isArray(result.assets) ? result.assets : []
    if (assets.length) await this._assetService.upsertAssets(assets)
    const body = [
      `---`,
      `source_id: ${source.id}`,
      `source_type: ${source.type}`,
      `title: ${JSON.stringify(source.title || source.id)}`,
      `parser: ${JSON.stringify(result.stats?.parser || '')}`,
      `asset_count: ${assets.length}`,
      `---`,
      ``,
      result.content,
      this._officeImageSection(assets, relExtractPath),
    ].join('\n')
    await fs.promises.writeFile(absExtractPath, body, 'utf-8')

    return {
      status: 'ingested',
      extract_path: relExtractPath,
      parser_status: 'complete',
      parser_message: '',
      meta: {
        ...(source.meta || {}),
        parse_stats: {
          ...(result.stats || {}),
          asset_count: assets.length,
        },
      },
    }
  }

  _officeImageSection(assets, outputRelPath) {
    if (!Array.isArray(assets) || !assets.length) return ''
    const outputDir = path.posix.dirname(String(outputRelPath || '').replace(/\\/g, '/'))
    const lines = ['', '## Embedded Images', '']
    for (const asset of assets) {
      const rel = path.posix.relative(outputDir, String(asset.path || '').replace(/\\/g, '/'))
      const markdownRef = rel.startsWith('.') ? rel : `./${rel}`
      const label = asset.name || path.posix.basename(asset.path || 'embedded image')
      lines.push(`![${label}](${markdownRef})`)
      if (asset.dom_path) lines.push('', `- DOM path: \`${asset.dom_path}\``)
      lines.push('')
    }
    return lines.join('\n')
  }

  _safeSegment(value, fallback = 'source') {
    const raw = String(value || '').trim().toLowerCase()
    const safe = raw
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
    return safe || fallback
  }
}
