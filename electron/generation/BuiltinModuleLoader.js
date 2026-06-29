import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class BuiltinModuleLoader {
  constructor() {
    this._modulesDir = this._resolveBuiltinModulesDir()
    this._moduleCache = new Map()
  }

  load(englishName) {
    if (this._moduleCache.has(englishName)) return this._moduleCache.get(englishName)
    const dir = path.join(this._modulesDir, englishName)
    const configPath = path.join(dir, 'config.json')
    if (!fs.existsSync(configPath)) return null
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const promptPath = path.join(dir, config.prompt_file || 'orchestrator.md')
    if (fs.existsSync(promptPath)) config.prompt = fs.readFileSync(promptPath, 'utf-8')
    const rulesPath = path.join(dir, config.artifact_rules_file || 'artifact-rules.json')
    if (fs.existsSync(rulesPath)) config.artifact_rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'))
    this._moduleCache.set(englishName, config)
    return config
  }

  _resolveBuiltinModulesDir() {
    const candidates = [
      path.join(__dirname, '..', 'agents', 'builtin'),
      path.join(__dirname, 'agents', 'builtin'),
      process.env.APP_ROOT ? path.join(process.env.APP_ROOT, 'electron', 'agents', 'builtin') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'electron', 'agents', 'builtin') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'agents', 'builtin') : '',
    ].filter(Boolean)

    const dir = candidates.find(p => fs.existsSync(path.join(p, 'ppt-generator', 'config.json')))
    if (dir) return dir
    console.warn('[BuiltinModuleLoader] builtin modules dir not found, tried:', candidates)
    return candidates[0]
  }
}
