// electron/WorkDirService.js — Workspace directory management + path sandboxing
import path from 'node:path'
import fs from 'node:fs'

const META_DIR = '.reviva'

export class WorkDirService {
  constructor(dbService) {
    this._db = dbService
    this._rootPath = null
  }

  loadFromDb() {
    if (!this._db || !this._db.db) return
    try {
      this._rootPath = this._db.getSetting('workdir_root') || null
    } catch {
      this._rootPath = null
    }
  }

  setRootPath(rootPath) {
    this._rootPath = rootPath ? path.resolve(rootPath) : null
  }

  async initWorkspace(rootPath) {
    const absRoot = path.resolve(rootPath)
    const metaDir = path.join(absRoot, META_DIR)

    // Create directory structure
    await fs.promises.mkdir(metaDir, { recursive: true })
    await fs.promises.mkdir(path.join(metaDir, 'trash'), { recursive: true })
    await fs.promises.mkdir(path.join(metaDir, 'logs'), { recursive: true })
    await fs.promises.mkdir(path.join(absRoot, 'docs'), { recursive: true })
    await fs.promises.mkdir(path.join(absRoot, 'notes'), { recursive: true })
    await fs.promises.mkdir(path.join(absRoot, 'wikis'), { recursive: true })
    await fs.promises.mkdir(path.join(absRoot, 'agents'), { recursive: true })
    await fs.promises.mkdir(path.join(absRoot, 'skills'), { recursive: true })

    const configPath = path.join(metaDir, 'config.json')

    // Write config.json
    const config = {
      version: 1,
      rootPath: absRoot,
      createdAt: new Date().toISOString(),
    }
    await fs.promises.writeFile(
      configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    )

    this._rootPath = absRoot

    return {
      rootPath: absRoot,
      docsPath: this.getDocsPath(),
    }
  }

  getRootPath() { return this._rootPath }
  getDocsPath() { return this._rootPath ? path.join(this._rootPath, 'docs') : null }
  getNotesPath() { return this._rootPath ? path.join(this._rootPath, 'notes') : null }
  getWikiPath() { return this._rootPath ? path.join(this._rootPath, 'wikis') : null }
  getAgentsPath() { return this._rootPath ? path.join(this._rootPath, 'agents') : null }
  getAgentDir(englishName) { return this._rootPath ? path.join(this._rootPath, 'agents', englishName || '_shared') : null }
  getConfigPath() { return this._rootPath ? path.join(this._rootPath, META_DIR, 'config.json') : null }
  getTrashPath() { return this._rootPath ? path.join(this._rootPath, META_DIR, 'trash') : null }
  getLogsPath() { return this._rootPath ? path.join(this._rootPath, META_DIR, 'logs') : null }

  isWorkspaceInitialized() {
    if (!this._rootPath) return false
    return fs.existsSync(path.join(this._rootPath, META_DIR, 'config.json'))
  }

  getStatus() {
    const initialized = this.isWorkspaceInitialized()
    return {
      initialized,
      rootPath: this._rootPath,
      docsPath: this.getDocsPath(),
      notesPath: this.getNotesPath(),
      wikiPath: this.getWikiPath(),
    }
  }

  // Core: validate a path falls within authorized workspace directories
  resolveAndValidate(inputPath, scope = 'any') {
    if (!this._rootPath) throw new Error('No workspace initialized')

    const resolved = path.resolve(this._resolveWorkspaceInputPath(inputPath))
    const normalized = resolved.toLowerCase()

    const prefixes = {
      docs: path.resolve(this._rootPath, 'docs').toLowerCase(),
      notes: path.resolve(this._rootPath, 'notes').toLowerCase(),
      wiki: path.resolve(this._rootPath, 'wikis').toLowerCase(),
      legacyWiki: path.resolve(this._rootPath, 'wiki').toLowerCase(),
      agents: path.resolve(this._rootPath, 'agents').toLowerCase(),
      skills: path.resolve(this._rootPath, 'skills').toLowerCase(),
      context: path.resolve(this._rootPath, 'context').toLowerCase(),
      reviva: path.resolve(this._rootPath, META_DIR).toLowerCase(),
    }

    const isWithin = (dir) => normalized === dir || normalized.startsWith(dir + path.sep)

    if (scope === 'docs' && !isWithin(prefixes.docs)) throw new Error(`Path outside docs scope: ${inputPath}`)
    if (scope === 'notes' && !isWithin(prefixes.notes)) throw new Error(`Path outside notes scope: ${inputPath}`)
    if (scope === 'wiki' && !isWithin(prefixes.wiki) && !isWithin(prefixes.legacyWiki)) throw new Error(`Path outside wiki scope: ${inputPath}`)
    if (scope === 'any' && !isWithin(prefixes.docs) && !isWithin(prefixes.notes) && !isWithin(prefixes.wiki) && !isWithin(prefixes.legacyWiki) && !isWithin(prefixes.agents) && !isWithin(prefixes.skills) && !isWithin(prefixes.context) && !isWithin(prefixes.reviva)) {
      throw new Error(`Path outside authorized scope: ${inputPath}`)
    }

    return resolved
  }

  _resolveWorkspaceInputPath(inputPath) {
    if (typeof inputPath !== 'string') return inputPath

    const slashPath = inputPath.replace(/\\/g, '/')
    const match = slashPath.match(/^\/*(docs|notes|wiki|wikis|agents|skills|context|\.reviva)(?:\/(.*))?$/i)
    if (!match) return inputPath

    const topLevel = match[1].toLowerCase()
    const rest = (match[2] || '').split('/').filter(Boolean)
    return path.join(this._rootPath, topLevel, ...rest)
  }
}
