import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveEffectiveBuiltinAgentConfig } from '../agents/builtin/EffectiveBuiltinAgentConfig.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class BuiltinModuleLoader {
  constructor({ db = null } = {}) {
    this._db = db
    this._modulesDir = this._resolveBuiltinModulesDir()
    this._moduleCache = new Map()
  }

  load(englishName) {
    let config = this._moduleCache.get(englishName)
    if (!config) {
      const dir = path.join(this._modulesDir, englishName)
      const configPath = path.join(dir, 'config.json')
      if (!fs.existsSync(configPath)) return null
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const promptPath = path.join(dir, config.prompt_file || 'orchestrator.md')
      if (fs.existsSync(promptPath)) config.prompt = fs.readFileSync(promptPath, 'utf-8')
      const rulesPath = path.join(dir, config.artifact_rules_file || 'artifact-rules.json')
      if (fs.existsSync(rulesPath)) config.artifact_rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'))
      this._moduleCache.set(englishName, config)
    }
    // Do not cache the resolved version: users can save AgentEdit changes while
    // the app stays open, and the following generation must use those changes.
    return resolveEffectiveBuiltinAgentConfig(config, this._db)
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
