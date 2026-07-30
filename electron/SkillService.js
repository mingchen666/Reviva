// electron/SkillService.js — Skill directory management: install, list files, read content
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'

// Text file extensions that can be previewed
const PREVIEWABLE_EXTENSIONS = [
  'md', 'txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs',
  'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt', 'scala',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'sh', 'bash',
  'sql', 'html', 'css', 'scss', 'less', 'vue', 'svelte',
  'xml', 'svg', 'graphql', 'gql', 'proto', 'dockerfile',
  'gitignore', 'editorconfig', 'prettierrc', 'eslintrc',
]

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_SKILL_DESCRIPTION_LENGTH = 1024
const MAX_IMPORT_FILE_COUNT = 500
const MAX_IMPORT_FILE_SIZE = 20 * 1024 * 1024
const MAX_IMPORT_TOTAL_SIZE = 100 * 1024 * 1024
const CONFIG_DEFAULTS = {
  version: '', author: '', license: '', allowedTools: [], outputTypes: [],
  createdAt: '', updatedAt: '', trustStatus: '',
}

function _isTopLevelYamlKey(line) {
  return /^[A-Za-z0-9_-]+:\s*/.test(line)
}

function _stripYamlQuotes(value) {
  const str = String(value || '').trim()
  if (!str) return ''
  if (str.startsWith('"') && str.endsWith('"')) {
    try {
      return JSON.parse(str)
    } catch {
      return str.slice(1, -1)
    }
  }
  if (str.startsWith("'") && str.endsWith("'")) {
    return str.slice(1, -1).replace(/''/g, "'")
  }
  return str
}

function _quoteYamlString(value) {
  return JSON.stringify(String(value || '').replace(/\r?\n/g, ' ').trim())
}

function _parseSimpleFrontmatter(raw) {
  const meta = {}
  const lines = String(raw || '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue

    const key = match[1]
    const value = match[2].trim()
    if (value === '>' || value === '|') {
      const block = []
      while (i + 1 < lines.length && !_isTopLevelYamlKey(lines[i + 1])) {
        block.push(lines[++i].replace(/^\s{1,4}/, ''))
      }
      meta[key] = value === '>' ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim()
      continue
    }

    if (!value) {
      const list = []
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        list.push(lines[++i].replace(/^\s*-\s+/, '').trim())
      }
      meta[key] = list.length ? list : ''
      continue
    }

    meta[key] = _stripYamlQuotes(value)
  }
  return meta
}

function _extractSkillFrontmatter(content) {
  const text = String(content || '').replace(/^\uFEFF/, '')
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!match) return { meta: null, raw: '', body: text, error: 'missing YAML frontmatter at the start of SKILL.md' }
  return {
    meta: _parseSimpleFrontmatter(match[1]),
    raw: match[1],
    body: text.slice(match[0].length).replace(/^\s+/, ''),
    error: '',
  }
}

function _removeFrontmatterKeys(raw, keys) {
  const removeKeys = new Set(keys)
  const kept = []
  const lines = String(raw || '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (match && removeKeys.has(match[1])) {
      while (i + 1 < lines.length && !_isTopLevelYamlKey(lines[i + 1])) i++
      continue
    }
    kept.push(lines[i])
  }
  return kept.join('\n').trim()
}

export class SkillService {
  constructor(workDirService, options = {}) {
    this._wd = workDirService
    // Absolute path to the bundled built-in skills directory (electron/builtin-assets/skills in dev,
    // resources/builtin-assets/skills in production). Set by main.js based on app.isPackaged.
    this._builtinSkillsDir = options.builtinSkillsDir || null
  }

  getSkillsRoot() {
    const root = this._wd.getRootPath()
    return root ? path.join(root, 'skills') : null
  }

  getSkillDir(skillId) {
    const root = this.getSkillsRoot()
    return root && this.isValidSkillId(skillId) ? path.join(root, skillId) : null
  }

  // Absolute path to the bundled built-in skills source folder.
  getBuiltinSkillsDir() {
    return this._builtinSkillsDir
  }

  normalizeSkillId(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  }

  isValidSkillId(value) {
    return SKILL_NAME_PATTERN.test(String(value || ''))
  }

  isBuiltinSkillId(skillId) {
    const normalized = String(skillId || '').trim()
    return !!(this.isValidSkillId(normalized) && this._builtinSkillsDir && fs.existsSync(path.join(this._builtinSkillsDir, normalized)))
  }

  _normalizeConfig(skillId, skillData = {}, existing = {}) {
    const source = skillData.source === 'platform' ? 'platform' : 'custom'
    return {
      id: skillId,
      name: String(skillData.name || existing.name || '').trim(),
      description: String(skillData.description || skillData.desc || existing.description || '').trim(),
      source,
      icon: skillData.icon || existing.icon || 'ri-brain-line',
      color: skillData.color || existing.color || '#6C8AFF',
      category: String(skillData.category || existing.category || '').trim(),
      version: String(skillData.version ?? existing.version ?? CONFIG_DEFAULTS.version),
      author: String(skillData.author ?? existing.author ?? CONFIG_DEFAULTS.author),
      license: String(skillData.license ?? existing.license ?? CONFIG_DEFAULTS.license),
      allowedTools: Array.isArray(skillData.allowedTools) ? skillData.allowedTools : Array.isArray(skillData.allowed_tools) ? skillData.allowed_tools : (Array.isArray(existing.allowedTools) ? existing.allowedTools : []),
      outputTypes: Array.isArray(skillData.outputTypes) ? skillData.outputTypes : Array.isArray(skillData.output_types) ? skillData.output_types : (Array.isArray(existing.outputTypes) ? existing.outputTypes : []),
      createdAt: String(skillData.createdAt ?? existing.createdAt ?? CONFIG_DEFAULTS.createdAt),
      updatedAt: String(skillData.updatedAt ?? existing.updatedAt ?? CONFIG_DEFAULTS.updatedAt),
      trustStatus: String(skillData.trustStatus ?? existing.trustStatus ?? CONFIG_DEFAULTS.trustStatus),
    }
  }

  // Install a skill: create directory and write SKILL.md + config.json
  // Used for user-created / AI-generated skills (passes data through, not from disk)
  async installSkill(skillId, skillData) {
    if (!this.isValidSkillId(skillId)) throw new Error('Skill ID 只能使用英文小写、数字和连字符')
    if (skillData?.source !== 'platform' && this.isBuiltinSkillId(skillId)) throw new Error(`不能覆盖内置 Skill：${skillId}`)
    const skillDir = this.getSkillDir(skillId)
    if (!skillDir) throw new Error('No workspace initialized')
    if (fs.existsSync(skillDir)) throw new Error(`Skill ID "${skillId}" 已存在`)

    await fs.promises.mkdir(this.getSkillsRoot(), { recursive: true })
    const tempDir = await fs.promises.mkdtemp(path.join(this.getSkillsRoot(), `.skill-${skillId}-`))

    try {
      const promptContent = this._normalizeSkillMarkdown(skillId, skillData)
      await fs.promises.writeFile(path.join(tempDir, 'SKILL.md'), promptContent, 'utf-8')
      const config = this._normalizeConfig(skillId, skillData)
      await fs.promises.writeFile(path.join(tempDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8')
      const spec = this._validateSkillDir(skillId, tempDir, false)
      if (!spec.valid) throw new Error(spec.issues.join('；'))
      await this._replaceSkillDir(tempDir, skillDir)
      return { success: true, dir: skillDir, config, spec: this.validateSkillSpec(skillId) }
    } catch (err) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
      throw err
    }
  }

  async updateSkill(skillId, skillData = {}) {
    if (!this.isValidSkillId(skillId)) throw new Error('Skill ID 不合法')
    if (this.isBuiltinSkillId(skillId)) throw new Error(`不能编辑内置 Skill：${skillId}`)
    const skillDir = this.getSkillDir(skillId)
    if (!skillDir || !fs.existsSync(skillDir)) throw new Error('Skill 目录不存在')
    const existingConfig = await this._readJsonFile(path.join(skillDir, 'config.json')) || {}
    const promptContent = this._normalizeSkillMarkdown(skillId, skillData)
    const config = this._normalizeConfig(skillId, { ...existingConfig, ...skillData, source: 'custom' }, existingConfig)
    const tempDir = await fs.promises.mkdtemp(path.join(this.getSkillsRoot(), `.skill-update-${skillId}-`))
    try {
      await this._copyDirectoryContents(skillDir, tempDir)
      await fs.promises.writeFile(path.join(tempDir, 'SKILL.md'), promptContent, 'utf-8')
      await fs.promises.writeFile(path.join(tempDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8')
      const spec = this._validateSkillDir(skillId, tempDir, false)
      if (!spec.valid) throw new Error(spec.issues.join('；'))
      await this._replaceSkillDir(tempDir, skillDir)
      return { success: true, dir: skillDir, config, spec: this.validateSkillSpec(skillId) }
    } catch (err) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
      throw err
    }
  }

  async _replaceSkillDir(tempDir, targetDir) {
    const backupDir = `${targetDir}.backup-${crypto.randomUUID()}`
    const hadTarget = fs.existsSync(targetDir)
    if (hadTarget) await fs.promises.rename(targetDir, backupDir)
    try {
      await fs.promises.rename(tempDir, targetDir)
      if (hadTarget) await fs.promises.rm(backupDir, { recursive: true, force: true })
    } catch (err) {
      if (fs.existsSync(targetDir)) await fs.promises.rm(targetDir, { recursive: true, force: true }).catch(() => {})
      if (hadTarget && fs.existsSync(backupDir)) await fs.promises.rename(backupDir, targetDir).catch(() => {})
      throw err
    }
  }

  async createSkillSnapshot(skillId) {
    const skillDir = this.getSkillDir(skillId)
    if (!skillDir) throw new Error('No workspace initialized')
    const snapshotRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-skill-snapshot-'))
    try {
      const existed = fs.existsSync(skillDir)
      if (existed) await this._copyDirectoryContents(skillDir, path.join(snapshotRoot, 'skill'))
      return { root: snapshotRoot, existed }
    } catch (error) {
      await fs.promises.rm(snapshotRoot, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  async restoreSkillSnapshot(skillId, snapshot) {
    const skillDir = this.getSkillDir(skillId)
    if (!skillDir || !snapshot?.root) return
    if (!snapshot.existed) {
      await fs.promises.rm(skillDir, { recursive: true, force: true })
      return
    }
    const snapshotDir = path.join(snapshot.root, 'skill')
    const tempDir = await fs.promises.mkdtemp(path.join(this.getSkillsRoot(), `.skill-restore-${skillId}-`))
    try {
      await this._copyDirectoryContents(snapshotDir, tempDir)
      await this._replaceSkillDir(tempDir, skillDir)
    } catch (error) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  async discardSkillSnapshot(snapshot) {
    if (snapshot?.root) await fs.promises.rm(snapshot.root, { recursive: true, force: true }).catch(() => {})
  }

  async renameCustomSkill(oldId, newId) {
    if (!this.isValidSkillId(oldId) || !this.isValidSkillId(newId)) throw new Error('Skill ID 不合法')
    const oldDir = this.getSkillDir(oldId)
    const newDir = this.getSkillDir(newId)
    if (!oldDir || !newDir || !fs.existsSync(oldDir)) throw new Error(`自定义 Skill 目录不存在：${oldId}`)
    if (fs.existsSync(newDir)) throw new Error(`Skill ID "${newId}" 已存在`)
    const existingConfig = await this._readJsonFile(path.join(oldDir, 'config.json')) || {}
    if (existingConfig.source === 'platform' || existingConfig.builtin === true) throw new Error('内置 Skill 不能迁移')
    const raw = await fs.promises.readFile(path.join(oldDir, 'SKILL.md'), 'utf-8')
    const tempDir = await fs.promises.mkdtemp(path.join(this.getSkillsRoot(), `.skill-rename-${newId}-`))
    try {
      await this._copyDirectoryContents(oldDir, tempDir)
      const skillData = { ...existingConfig, id: newId, promptContent: raw, source: 'custom' }
      await fs.promises.writeFile(path.join(tempDir, 'SKILL.md'), this._normalizeSkillMarkdown(newId, skillData), 'utf-8')
      await fs.promises.writeFile(path.join(tempDir, 'config.json'), JSON.stringify(this._normalizeConfig(newId, skillData, existingConfig), null, 2), 'utf-8')
      const spec = this._validateSkillDir(newId, tempDir, false)
      if (!spec.valid) throw new Error(spec.issues.join('；'))
      await this._replaceSkillDir(tempDir, newDir)
      try {
        await fs.promises.rm(oldDir, { recursive: true, force: true })
      } catch (err) {
        await fs.promises.rm(newDir, { recursive: true, force: true }).catch(() => {})
        throw err
      }
      return { success: true, oldId, newId }
    } catch (err) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
      throw err
    }
  }

  _normalizeSkillMarkdown(skillId, skillData = {}) {
    const rawContent = String(
      skillData.promptContent ||
      skillData.prompt_content ||
      skillData.promptTemplate ||
      skillData.prompt_template ||
      '',
    )
    const parsed = _extractSkillFrontmatter(rawContent)
    const existingDescription = parsed.meta?.description ? String(parsed.meta.description).trim() : ''
    const description = skillData.description ||
      skillData.desc ||
      existingDescription ||
      skillData.name ||
      `Custom skill ${skillId}`

    if (parsed.meta?.name === skillId && existingDescription === String(description).trim()) {
      return rawContent.replace(/^\uFEFF/, '')
    }

    const preserved = parsed.meta ? _removeFrontmatterKeys(parsed.raw, ['name', 'description']) : ''
    const frontmatter = [
      '---',
      `name: ${skillId}`,
      `description: ${_quoteYamlString(description)}`,
      preserved,
      '---',
    ].filter(Boolean).join('\n')
    const body = (parsed.meta ? parsed.body : rawContent).trim()
    const fallbackBody = `# ${skillData.name || skillId}\n\nUse this skill when it matches the request. Follow the instructions in this file and ask for missing inputs before acting.`
    return `${frontmatter}\n\n${body || fallbackBody}\n`
  }

  async uninstallSkill(skillId) {
    if (this.isBuiltinSkillId(skillId)) throw new Error(`不能删除内置 Skill：${skillId}`)
    const skillDir = this.getSkillDir(skillId)
    if (!skillDir) throw new Error('No workspace initialized')
    if (fs.existsSync(skillDir)) {
      await fs.promises.rm(skillDir, { recursive: true, force: true })
    }
    return { success: true }
  }

  // List all files in a skill directory (recursive, for file tree)
  async listSkillFiles(skillId) {
    const skillDir = this.getSkillDir(skillId)
    if (!skillDir || !fs.existsSync(skillDir)) return []

    const results = []
    await this._walkDir(skillDir, '', results)
    return results
  }

  async _walkDir(absDir, relativePrefix, results) {
    const entries = await fs.promises.readdir(absDir, { withFileTypes: true })
    const dirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
    const files = entries.filter(e => e.isFile()).sort((a, b) => a.name.localeCompare(b.name))

    for (const d of dirs) {
      const relPath = relativePrefix ? `${relativePrefix}/${d.name}` : d.name
      results.push({ name: d.name, path: relPath, isDirectory: true, children: [] })
      await this._walkDir(path.join(absDir, d.name), relPath, results[results.length - 1].children)
    }
    for (const f of files) {
      const ext = f.name.split('.').pop().toLowerCase()
      const relPath = relativePrefix ? `${relativePrefix}/${f.name}` : f.name
      results.push({
        name: f.name,
        path: relPath,
        isDirectory: false,
        previewable: PREVIEWABLE_EXTENSIONS.includes(ext),
        extension: ext,
      })
    }
  }

  async readSkillFile(skillId, relativePath) {
    const skillDir = this.getSkillDir(skillId)
    if (!skillDir) return { success: false, error: 'No workspace' }

    const filePath = path.join(skillDir, relativePath)
    const resolved = path.resolve(filePath)
    const skillDirResolved = path.resolve(skillDir)
    if (!resolved.startsWith(skillDirResolved + path.sep) && resolved !== skillDirResolved) {
      return { success: false, error: 'Path outside skill directory' }
    }

    try {
      const content = await fs.promises.readFile(resolved, 'utf-8')
      return { success: true, data: content }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async writeSkillFile(skillId, relativePath, content) {
    if (this.isBuiltinSkillId(skillId)) return { success: false, error: '不能编辑内置 Skill' }
    if (typeof content !== 'string') return { success: false, error: '文件内容必须是文本' }
    const skillDir = this.getSkillDir(skillId)
    if (!skillDir) return { success: false, error: 'No workspace' }
    const resolved = this._resolveSkillPath(skillDir, relativePath)
    if (!resolved || path.basename(resolved).toLowerCase() === 'config.json') return { success: false, error: '不允许直接编辑 config.json' }
    try {
      const previous = await fs.promises.readFile(resolved, 'utf-8').catch(() => null)
      await fs.promises.mkdir(path.dirname(resolved), { recursive: true })
      await fs.promises.writeFile(resolved, content, 'utf-8')
      if (path.basename(resolved).toLowerCase() === 'skill.md') {
        const spec = this.validateSkillSpec(skillId)
        if (!spec.valid) {
          if (previous === null) await fs.promises.rm(resolved, { force: true })
          else await fs.promises.writeFile(resolved, previous, 'utf-8')
          return { success: false, error: spec.issues.join('；'), spec }
        }
      }
      return { success: true, spec: this.validateSkillSpec(skillId) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  _resolveSkillPath(skillDir, relativePath) {
    const rel = String(relativePath || '').replace(/\\/g, '/')
    if (!rel || rel.startsWith('/') || rel.split('/').some(part => part === '..')) return null
    const resolved = path.resolve(skillDir, rel)
    const base = path.resolve(skillDir)
    return resolved.startsWith(base + path.sep) ? resolved : null
  }

  async _copyDirectoryContents(sourceDir, targetDir) {
    await fs.promises.mkdir(targetDir, { recursive: true })
    for (const entry of await fs.promises.readdir(sourceDir, { withFileTypes: true })) {
      const source = path.join(sourceDir, entry.name)
      const target = path.join(targetDir, entry.name)
      const stat = await fs.promises.lstat(source)
      if (stat.isSymbolicLink()) throw new Error('Skill 文件夹不能包含符号链接')
      if (stat.isDirectory()) await this._copyDirectoryContents(source, target)
      else if (stat.isFile()) await fs.promises.copyFile(source, target)
    }
  }

  async _assertSafeSourceTree(rootDir) {
    let fileCount = 0
    let totalSize = 0
    const walk = async (dir) => {
      for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name)
        const stat = await fs.promises.lstat(abs)
        if (stat.isSymbolicLink()) throw new Error('Skill 文件夹不能包含符号链接')
        if (stat.isDirectory()) await walk(abs)
        else if (stat.isFile()) {
          fileCount += 1
          totalSize += stat.size
          if (fileCount > MAX_IMPORT_FILE_COUNT) throw new Error('Skill 文件数量超出限制')
          if (stat.size > MAX_IMPORT_FILE_SIZE || totalSize > MAX_IMPORT_TOTAL_SIZE) throw new Error('Skill 文件内容超出限制')
        }
      }
    }
    await walk(rootDir)
  }

  async _extractZip(sourcePath) {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(await fs.promises.readFile(sourcePath), { createFolders: true })
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-skill-'))
    let fileCount = 0
    let totalSize = 0
    try {
      for (const [name, entry] of Object.entries(zip.files)) {
        const originalName = entry.unsafeOriginalName || name
        const rawName = originalName.replace(/\\/g, '/')
        if (rawName.startsWith('/') || /^[a-zA-Z]:\//.test(rawName)) throw new Error('ZIP 包含绝对路径')
        const normalized = rawName.replace(/^\.\//, '')
        if (!normalized || normalized.split('/').some(part => part === '..') || path.isAbsolute(normalized)) throw new Error('ZIP 包含非法路径')
        if (entry.dir) continue
        fileCount += 1
        if (fileCount > MAX_IMPORT_FILE_COUNT) throw new Error('ZIP 文件数量超出限制')
        const data = await entry.async('nodebuffer')
        totalSize += data.length
        if (data.length > MAX_IMPORT_FILE_SIZE || totalSize > MAX_IMPORT_TOTAL_SIZE) throw new Error('ZIP 解压内容超出限制')
        const target = this._resolveSkillPath(tempDir, normalized)
        if (!target) throw new Error('ZIP 包含越界路径')
        await fs.promises.mkdir(path.dirname(target), { recursive: true })
        await fs.promises.writeFile(target, data)
      }
      return tempDir
    } catch (err) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
      throw err
    }
  }

  async _sourceRoot(sourcePath) {
    const resolved = path.resolve(String(sourcePath || ''))
    if (!resolved || !fs.existsSync(resolved)) throw new Error('导入路径不存在')
    const stat = await fs.promises.stat(resolved)
    let tempRoot = ''
    let sourceName = path.basename(resolved, path.extname(resolved))
    if (stat.isFile() && path.extname(resolved).toLowerCase() === '.zip') tempRoot = await this._extractZip(resolved)
    else if (stat.isFile() && path.basename(resolved).toLowerCase() === 'skill.md') {
      sourceName = path.basename(path.dirname(resolved))
      if (stat.size > MAX_IMPORT_FILE_SIZE) throw new Error('SKILL.md 文件过大')
      tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-skill-'))
      await fs.promises.copyFile(resolved, path.join(tempRoot, 'SKILL.md'))
    } else if (stat.isDirectory()) {
      await this._assertSafeSourceTree(resolved)
      tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-skill-'))
      await this._copyDirectoryContents(resolved, tempRoot)
    } else throw new Error('请选择 ZIP、Skill 文件夹或 SKILL.md')

    const direct = path.join(tempRoot, 'SKILL.md')
    if (fs.existsSync(direct)) return { root: tempRoot, cleanup: true, sourceName }
    const children = await fs.promises.readdir(tempRoot, { withFileTypes: true })
    const dirs = children.filter(item => item.isDirectory())
    if (dirs.length === 1 && fs.existsSync(path.join(tempRoot, dirs[0].name, 'SKILL.md'))) return { root: path.join(tempRoot, dirs[0].name), cleanup: true, parent: tempRoot, sourceName: dirs[0].name }
    await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
    throw new Error('导入内容中未找到根目录 SKILL.md')
  }

  async inspectSkillSource(sourcePath, context = {}) {
    const source = await this._sourceRoot(sourcePath)
    try {
      const raw = await fs.promises.readFile(path.join(source.root, 'SKILL.md'), 'utf-8')
      const parsed = _extractSkillFrontmatter(raw)
      const config = await this._readJsonFile(path.join(source.root, 'config.json')) || {}
      const suggestedId = this.normalizeSkillId(parsed.meta?.name || config.id || source.sourceName || path.basename(source.root))
      const files = await this.listFilesFromDir(source.root)
      const builtin = this.isBuiltinSkillId(suggestedId)
      const existing = Array.isArray(context.customSkills) ? context.customSkills.find(item => item.id === suggestedId) : null
      const diskConflict = !builtin && this.isInstalled(suggestedId)
      return {
        id: suggestedId,
        validId: this.isValidSkillId(suggestedId),
        name: String(config.name || parsed.meta?.title || parsed.meta?.name || suggestedId),
        description: String(config.description || parsed.meta?.description || ''),
        icon: config.icon || 'ri-brain-line', color: config.color || '#6C8AFF', category: config.category || '',
        source: 'custom', promptContent: raw, files, fileCount: files.length,
        issues: parsed.meta ? [] : ['SKILL.md 缺少 YAML frontmatter'],
        conflict: builtin ? 'platform' : (existing || diskConflict) ? 'custom' : '',
      }
    } finally {
      await fs.promises.rm(source.parent || source.root, { recursive: true, force: true }).catch(() => {})
    }
  }

  async listFilesFromDir(rootDir) {
    const results = []
    const walk = async (dir, prefix = '') => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          results.push({ name: entry.name, path: rel, isDirectory: true })
          await walk(path.join(dir, entry.name), rel)
        } else results.push({ name: entry.name, path: rel, isDirectory: false, previewable: PREVIEWABLE_EXTENSIONS.includes(entry.name.split('.').pop().toLowerCase()) })
      }
    }
    await walk(rootDir)
    return results
  }

  async importSkillSource(sourcePath, options = {}) {
    const source = await this._sourceRoot(sourcePath)
    const skillId = this.normalizeSkillId(options.id || '')
    if (!this.isValidSkillId(skillId)) throw new Error('Skill ID 只能使用英文小写、数字和连字符')
    if (this.isBuiltinSkillId(skillId)) throw new Error(`不能覆盖内置 Skill：${skillId}`)
    const targetDir = this.getSkillDir(skillId)
    if (!targetDir) throw new Error('No workspace initialized')
    await fs.promises.mkdir(this.getSkillsRoot(), { recursive: true })
    const tempDir = await fs.promises.mkdtemp(path.join(this.getSkillsRoot(), `.skill-import-${skillId}-`))
    try {
      await this._copyDirectoryContents(source.root, tempDir)
      const raw = await fs.promises.readFile(path.join(tempDir, 'SKILL.md'), 'utf-8')
      const parsed = _extractSkillFrontmatter(raw)
      const config = await this._readJsonFile(path.join(tempDir, 'config.json')) || {}
      const skillData = { ...config, ...options, name: options.name || config.name || parsed.meta?.title || skillId, description: options.description || config.description || parsed.meta?.description || '', promptContent: raw, source: 'custom' }
      await fs.promises.writeFile(path.join(tempDir, 'SKILL.md'), this._normalizeSkillMarkdown(skillId, skillData), 'utf-8')
      await fs.promises.writeFile(path.join(tempDir, 'config.json'), JSON.stringify(this._normalizeConfig(skillId, skillData, config), null, 2), 'utf-8')
      const spec = this._validateSkillDir(skillId, tempDir, false)
      if (!spec.valid) throw new Error(spec.issues.join('；'))
      await this._replaceSkillDir(tempDir, targetDir)
      return { success: true, id: skillId, config: this._normalizeConfig(skillId, skillData, config), spec: this.validateSkillSpec(skillId) }
    } catch (err) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
      throw err
    } finally {
      await fs.promises.rm(source.parent || source.root, { recursive: true, force: true }).catch(() => {})
    }
  }

  async ensureSkillsRoot() {
    const root = this.getSkillsRoot()
    if (root) {
      await fs.promises.mkdir(root, { recursive: true })
    }
  }

  isInstalled(skillId) {
    const skillDir = this.getSkillDir(skillId)
    return skillDir ? fs.existsSync(skillDir) : false
  }

  validateSkillSpec(skillId) {
    const skillDir = this.getSkillDir(skillId)
    if (!skillDir) {
      return { valid: false, installed: false, issues: ['工作区未初始化'] }
    }
    if (!fs.existsSync(skillDir)) {
      return { valid: false, installed: false, issues: ['技能目录不存在'] }
    }
    return this._validateSkillDir(skillId, skillDir, true)
  }

  _validateSkillDir(skillId, skillDir, installed = true) {
    const issues = []

    const skillFile = path.join(skillDir, 'SKILL.md')
    if (!fs.existsSync(skillFile)) {
      return { valid: false, installed, issues: ['缺少 SKILL.md'] }
    }

    let content = ''
    try {
      content = fs.readFileSync(skillFile, 'utf-8')
    } catch (err) {
      return { valid: false, installed, issues: [`无法读取 SKILL.md：${err.message}`] }
    }

    const parsed = _extractSkillFrontmatter(content)
    if (!parsed.meta) {
      return { valid: false, installed, issues: ['SKILL.md 必须从 YAML frontmatter 开始'] }
    }

    const name = String(parsed.meta.name || '').trim()
    const description = String(parsed.meta.description || '').trim()
    if (!name) issues.push('frontmatter 缺少 name')
    if (!description) issues.push('frontmatter 缺少 description')
    if (name && !SKILL_NAME_PATTERN.test(name)) {
      issues.push('name 只能使用小写字母、数字和连字符，且不能以连字符开头/结尾')
    }
    if (name && name !== skillId) {
      issues.push(`name 必须等于 Skill ID：${skillId}`)
    }
    if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
      issues.push(`description 超过 ${MAX_SKILL_DESCRIPTION_LENGTH} 字符，DeepAgents 会截断`)
    }

    return {
      valid: issues.length === 0,
      installed,
      path: skillFile,
      name,
      description,
      issues,
    }
  }

  // Scan bundled built-in skills directory and return metadata array (one per valid subfolder).
  // A valid subfolder must contain config.json. Folder name overrides config.id (single source of truth).
  async listBuiltinSkills() {
    const src = this._builtinSkillsDir
    if (!src || !fs.existsSync(src)) return []

    const results = []
    const entries = await fs.promises.readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const configPath = path.join(src, entry.name, 'config.json')
      if (!fs.existsSync(configPath)) continue

      try {
        const raw = await fs.promises.readFile(configPath, 'utf-8')
        const config = JSON.parse(raw)
        config.id = entry.name
        config.source = config.source || 'platform'
        config.builtin = true
        results.push(config)
      } catch (err) {
        console.error(`[SkillService] Invalid config for ${entry.name}:`, err.message)
      }
    }
    return results
  }

  async _readJsonFile(filePath) {
    try {
      return JSON.parse(await fs.promises.readFile(filePath, 'utf-8'))
    } catch {
      return null
    }
  }

  // Copy every bundled skill folder into the workspace skills directory at startup.
  // Existing platform skills are refreshed when the bundled version changes or
  // when their SKILL.md no longer follows the Agent Skills spec.
  async installAllBuiltinSkills() {
    if (!this.getSkillsRoot()) return
    const src = this._builtinSkillsDir
    if (!src || !fs.existsSync(src)) {
      console.log('[SkillService] No builtin-assets/skills directory found, skipping')
      return
    }

    await this.ensureSkillsRoot()

    const entries = await fs.promises.readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillId = entry.name
      const srcDir = path.join(src, skillId)
      const dstDir = this.getSkillDir(skillId)

      const srcConfigPath = path.join(srcDir, 'config.json')
      const dstConfigPath = path.join(dstDir, 'config.json')
      if (!fs.existsSync(srcConfigPath)) continue

      const srcConfig = await this._readJsonFile(srcConfigPath)
      if (!srcConfig) continue

      if (fs.existsSync(dstDir)) {
        const dstConfig = await this._readJsonFile(dstConfigPath)
        const isPlatformSkill = dstConfig?.source === 'platform' || dstConfig?.builtin === true
        const dstSpec = this.validateSkillSpec(skillId)
        const shouldRefresh = isPlatformSkill && (
          (srcConfig.version && dstConfig?.version !== srcConfig.version) ||
          !dstSpec.valid
        )
        if (!shouldRefresh) continue

        try {
          await fs.promises.cp(srcDir, dstDir, { recursive: true, force: true })
          console.log(`[SkillService] Updated builtin skill: ${skillId} (${dstConfig?.version || 'unknown'} -> ${srcConfig.version})`)
        } catch (err) {
          console.error(`[SkillService] Failed to update ${skillId}:`, err.message)
        }
        continue
      }

      try {
        await fs.promises.cp(srcDir, dstDir, { recursive: true })
        console.log(`[SkillService] Installed builtin skill: ${skillId}`)
      } catch (err) {
        console.error(`[SkillService] Failed to install ${skillId}:`, err.message)
      }
    }
  }
}
