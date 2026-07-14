import fs from 'node:fs'
import path from 'node:path'

const MAX_SCHEMA_CHARS = 12000

export class WikiSchemaService {
  constructor({ wikiDir, fallbackFactory = null }) {
    this._wikiDir = wikiDir
    this._fallbackFactory = fallbackFactory
  }

  async read(title = 'Wiki') {
    const schemaPath = path.join(this._wikiDir, 'schema.md')
    let content = ''
    let warning = ''
    try {
      content = await fs.promises.readFile(schemaPath, 'utf-8')
    } catch (err) {
      content = String(this._fallbackFactory?.(title) || '')
      warning = `schema.md is unavailable: ${err.message}`
      if (content) {
        await fs.promises.mkdir(path.dirname(schemaPath), { recursive: true })
        await fs.promises.writeFile(schemaPath, content, 'utf-8').catch(() => {})
      }
    }
    if (content.length > MAX_SCHEMA_CHARS) {
      warning = `schema.md exceeds ${MAX_SCHEMA_CHARS} characters and was truncated for this run`
      content = content.slice(0, MAX_SCHEMA_CHARS)
    }
    return {
      content: content.trim(),
      path: 'schema.md',
      warning,
      max_chars: MAX_SCHEMA_CHARS,
    }
  }
}

