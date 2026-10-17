// agents/builtin/BuiltinModuleLoader.js — extracted from AgentService.js
// Loads builtin agent module configs from disk and syncs them to the database.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeNonNegativeLimit } from '../runtime/toolSelection.js'

export class BuiltinModuleLoader {
  constructor({ db }) {
    this._db = db
  }

  resolveModulesDir() {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const candidates = [
      path.join(__dirname, 'agents', 'builtin'),
      process.env.APP_ROOT ? path.join(process.env.APP_ROOT, 'electron', 'agents', 'builtin') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'electron', 'agents', 'builtin') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'agents', 'builtin') : '',
    ].filter(Boolean)
  
    const dir = candidates.find(p => fs.existsSync(path.join(p, 'ppt-generator', 'config.json')))
    if (dir) return dir
    console.warn('[AgentService] builtin modules dir not found, tried:', candidates)
    return candidates[0]
  }

  loadModules() {
    const modulesDir = this.resolveModulesDir()
    if (!fs.existsSync(modulesDir)) return []
  
    const modules = []
    for (const entry of fs.readdirSync(modulesDir)) {
      const configPath = path.join(modulesDir, entry, 'config.json')
      if (!fs.existsSync(configPath)) continue
  
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  
      // Load orchestrator prompt
      const promptFile = path.join(modulesDir, entry, config.prompt_file || 'orchestrator.md')
      if (fs.existsSync(promptFile)) {
        config.prompt = fs.readFileSync(promptFile, 'utf-8')
      }
  
      // Load sub-agent prompts
      const subagentDir = path.join(modulesDir, entry, config.subagent_dir || 'subagents')
      config.subagent_prompts = {}
      if (fs.existsSync(subagentDir)) {
        for (const saFile of fs.readdirSync(subagentDir)) {
          if (!saFile.endsWith('.md')) continue
          const saName = saFile.replace('.md', '')
          config.subagent_prompts[saName] = fs.readFileSync(path.join(subagentDir, saFile), 'utf-8')
        }
      }
  
      // Load artifact rules
      const rulesFile = path.join(modulesDir, entry, config.artifact_rules_file || 'artifact-rules.json')
      if (fs.existsSync(rulesFile)) {
        config.artifact_rules = JSON.parse(fs.readFileSync(rulesFile, 'utf-8'))
      }
  
      modules.push(config)
    }
    return modules
  }

  builtinAgentTemplateFromConfig(config, prompt = config.prompt || '') {
    return {
      id: config.id,
      builtin_key: config.id,
      builtin_version: config.builtin_version || config.version || '1.0.0',
      name: config.name || '',
      english_name: config.english_name || '',
      description: config.description || '',
      icon: config.icon || 'ri-sparkling-2-line',
      color: config.color || '#A78BFA',
      architecture: config.architecture || 'react',
      permissions: config.permissions || {},
      tools: config.tools || [],
      skills: config.skills || [],
      sub_agents: config.sub_agents || [],
      prompt,
      max_iterations: normalizeNonNegativeLimit(config.max_iterations, 10),
      model: config.model || '',
      temperature: config.temperature ?? 0.7,
      top_p: config.top_p ?? 1.0,
      max_tokens: config.max_tokens || 4096,
      thinking_mode: config.thinking_mode || 'auto',
      thinking_intensity: config.thinking_intensity || 'medium',
      tool_call_limit: config.tool_call_limit || 0,
      model_call_limit: config.model_call_limit || 0,
      plan_steps: config.plan_steps ?? 5,
      reviewer_model: config.reviewer_model || '',
      use_same_model: config.use_same_model === undefined ? 1 : (config.use_same_model ? 1 : 0),
    }
  }

  syncModules(modules) {
    if (!this._db?.syncBuiltinAgentTemplate || !Array.isArray(modules)) return
    for (const config of modules) {
      try {
        this._db.syncBuiltinAgentTemplate(this.builtinAgentTemplateFromConfig(config))
      } catch (err) {
        console.error(`[AgentService] Failed to sync builtin module ${config.id || config.english_name}:`, err.message)
      }
    }
  }

async installAll(dir) {
  if (!dir || !fs.existsSync(dir)) {
    console.log('[AgentService] No builtin-assets/agents directory found, skipping')
    return
  }

  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const agentDir = path.join(dir, entry.name)
    const configPath = path.join(agentDir, 'config.json')
    const promptPath = path.join(agentDir, 'PROMPT.md')

    if (!fs.existsSync(configPath)) continue

    try {
      const config = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'))
      config.id = entry.name

      let prompt = config.prompt || ''
      if (fs.existsSync(promptPath)) {
        prompt = await fs.promises.readFile(promptPath, 'utf-8')
      }

      const synced = this._db.syncBuiltinAgentTemplate(this.builtinAgentTemplateFromConfig(config, prompt))
      console.log(`[AgentService] Synced builtin agent: ${synced?.id || config.id}`)
    } catch (err) {
      console.error(`[AgentService] Failed to install ${entry.name}:`, err.message)
    }
  }
 }

 // Alias for backward compatibility with AgentService.installAllBuiltinAgents
 async installAllBuiltinAgents(dir) {
   return this.installAll(dir)
 }

}
