// electron/SkillService.js — Skill directory management: install, list files, read content
import path from 'node:path'
import fs from 'node:fs'

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
    return root ? path.join(root, skillId) : null
  }

  // Absolute path to the bundled built-in skills source folder.
  getBuiltinSkillsDir() {
    return this._builtinSkillsDir
  }

  // Install a skill: create directory and write SKILL.md + config.json
  // Used for user-created / AI-generated skills (passes data through, not from disk)
  async installSkill(skillId, skillData) {
    const skillDir = this.getSkillDir(skillId)
    if (!skillDir) throw new Error('No workspace initialized')

    await fs.promises.mkdir(this.getSkillsRoot(), { recursive: true })
    await fs.promises.mkdir(skillDir, { recursive: true })

    // Write SKILL.md. DeepAgents requires YAML frontmatter with name + description.
    const promptContent = this._normalizeSkillMarkdown(skillId, skillData)
    await fs.promises.writeFile(path.join(skillDir, 'SKILL.md'), promptContent, 'utf-8')

    // Write config.json (metadata for display and binding)
    const config = {
      id: skillId,
      name: skillData.name || '',
      description: skillData.description || '',
      icon: skillData.icon || '🧠',
      color: skillData.color || '#6C8AFF',
      category: skillData.category || '',
      source: skillData.source || 'custom',
      allowedTools: skillData.allowedTools || skillData.allowed_tools || [],
      outputTypes: skillData.outputTypes || skillData.output_types || ['Markdown'],
      version: skillData.version || '1.0',
      author: skillData.author || '',
      license: skillData.license || '',
    }
    await fs.promises.writeFile(path.join(skillDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8')

    return { success: true, dir: skillDir, spec: this.validateSkillSpec(skillId) }
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
    const description = existingDescription ||
      skillData.description ||
      skillData.desc ||
      skillData.name ||
      `Custom skill ${skillId}`

    if (parsed.meta?.name === skillId && existingDescription) {
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
    const issues = []
    if (!skillDir) {
      return { valid: false, installed: false, issues: ['工作区未初始化'] }
    }
    if (!fs.existsSync(skillDir)) {
      return { valid: false, installed: false, issues: ['技能目录不存在'] }
    }

    const skillFile = path.join(skillDir, 'SKILL.md')
    if (!fs.existsSync(skillFile)) {
      return { valid: false, installed: true, issues: ['缺少 SKILL.md'] }
    }

    let content = ''
    try {
      content = fs.readFileSync(skillFile, 'utf-8')
    } catch (err) {
      return { valid: false, installed: true, issues: [`无法读取 SKILL.md：${err.message}`] }
    }

    const parsed = _extractSkillFrontmatter(content)
    if (!parsed.meta) {
      return { valid: false, installed: true, issues: ['SKILL.md 必须从 YAML frontmatter 开始'] }
    }

    const dirName = path.basename(skillDir)
    const name = String(parsed.meta.name || '').trim()
    const description = String(parsed.meta.description || '').trim()
    if (!name) issues.push('frontmatter 缺少 name')
    if (!description) issues.push('frontmatter 缺少 description')
    if (name && !SKILL_NAME_PATTERN.test(name)) {
      issues.push('name 只能使用小写字母、数字和连字符，且不能以连字符开头/结尾')
    }
    if (name && name !== dirName) {
      issues.push(`name 必须等于技能目录名：${dirName}`)
    }
    if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
      issues.push(`description 超过 ${MAX_SKILL_DESCRIPTION_LENGTH} 字符，DeepAgents 会截断`)
    }

    return {
      valid: issues.length === 0,
      installed: true,
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
