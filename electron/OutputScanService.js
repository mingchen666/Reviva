// electron/OutputScanService.js — Scan agent output directories from filesystem
import path from 'node:path'
import fs from 'node:fs'

const PREVIEWABLE_EXTENSIONS = [
  'md', 'txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs',
  'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt', 'scala',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'sh', 'bash',
  'sql', 'html', 'css', 'scss', 'less', 'vue', 'svelte',
  'xml', 'svg', 'graphql', 'gql', 'proto', 'dockerfile',
  'gitignore', 'editorconfig', 'prettierrc', 'eslintrc',
]

const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/

export class OutputScanService {
  constructor(workDirService, dbService) {
    this._wd = workDirService
    this._db = dbService
  }

  // Scan all agents and their date directories (no file contents)
  async scanAll() {
    const agentsRoot = this._wd.getAgentsPath()
    if (!agentsRoot || !fs.existsSync(agentsRoot)) return []

    // Build english_name → display name map from DB
    const nameMap = {}
    if (this._db) {
      try {
        const agents = this._db.listAgents()
        for (const a of agents) {
          if (a.english_name) nameMap[a.english_name] = a.name
        }
      } catch { /* ignore */ }
    }

    const entries = await fs.promises.readdir(agentsRoot, { withFileTypes: true })
    const results = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const agentDirName = entry.name
      const outputsDir = path.join(agentsRoot, agentDirName, 'outputs')

      if (!fs.existsSync(outputsDir)) {
        results.push({ name: agentDirName, displayName: nameMap[agentDirName] || agentDirName, dates: [] })
        continue
      }

      const dateEntries = await fs.promises.readdir(outputsDir, { withFileTypes: true })
      const dates = []

      for (const d of dateEntries) {
        if (!d.isDirectory() || !DATE_DIR_RE.test(d.name)) continue
        const dateDir = path.join(outputsDir, d.name)
        const files = await fs.promises.readdir(dateDir)
        const fileCount = files.filter(f => fs.statSync(path.join(dateDir, f)).isFile()).length
        dates.push({ date: d.name, fileCount })
      }

      dates.sort((a, b) => b.date.localeCompare(a.date))

      const displayName = agentDirName === '_shared'
        ? '共享'
        : (nameMap[agentDirName] || agentDirName)

      results.push({ name: agentDirName, displayName, dates })
    }

    results.sort((a, b) => {
      if (a.name === '_shared') return 1
      if (b.name === '_shared') return -1
      return a.displayName.localeCompare(b.displayName, 'zh-CN')
    })

    return results
  }

  // Scan files in a specific agent's date directory
  async scanDateFiles(agentDirName, date) {
    const agentsRoot = this._wd.getAgentsPath()
    if (!agentsRoot) return []

    const dateDir = path.join(agentsRoot, agentDirName, 'outputs', date)
    if (!fs.existsSync(dateDir)) return []

    this._wd.resolveAndValidate(dateDir, 'any')

    const entries = await fs.promises.readdir(dateDir, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const fullPath = path.join(dateDir, entry.name)
      const ext = entry.name.split('.').pop().toLowerCase()
      let stat
      try { stat = await fs.promises.stat(fullPath) } catch { continue }

      const virtualPath = `/agents/${agentDirName}/outputs/${date}/${entry.name}`

      files.push({
        name: entry.name,
        path: virtualPath,
        absolutePath: fullPath,
        extension: ext,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        previewable: PREVIEWABLE_EXTENSIONS.includes(ext),
        agentDirName,
      })
    }

    files.sort((a, b) => a.name.localeCompare(b.name))
    return files
  }

  // Read content of an output file by virtual path
  async readOutputFile(virtualPath) {
    const root = this._wd.getRootPath()
    if (!root) return { success: false, error: 'No workspace initialized' }

    const absPath = path.join(root, virtualPath.replace(/^\//, ''))
    try {
      this._wd.resolveAndValidate(absPath, 'any')
    } catch (e) {
      return { success: false, error: e.message }
    }

    if (!fs.existsSync(absPath)) return { success: false, error: 'File not found' }

    try {
      const content = await fs.promises.readFile(absPath, 'utf-8')
      return { success: true, data: content }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }
}
