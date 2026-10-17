// agents/runtime/toolResolver.js — extracted from AgentService.js
// Skill/tool resolution: maps tool IDs and skill IDs to LangChain tool instances.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getLangchainTools, getUserDefinedLangchainTools } from '../langchainTools.js'

function stripYamlQuotes(value) {
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

function isTopLevelYamlKey(line) {
  return /^[A-Za-z0-9_-]+:\s*/.test(line)
}

function parseSkillFrontmatterSummary(content) {
  const match = String(content || '').replace(/^\uFEFF/, '').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!match) return {}

  const meta = {}
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const lineMatch = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!lineMatch) continue

    const key = lineMatch[1]
    const value = lineMatch[2].trim()
    if (/^[>|][+-]?$/.test(value)) {
      const block = []
      while (i + 1 < lines.length && !isTopLevelYamlKey(lines[i + 1])) {
        block.push(lines[++i].replace(/^\s{1,4}/, ''))
      }
      meta[key] = value.startsWith('>') ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim()
      continue
    }

    meta[key] = stripYamlQuotes(value)
  }
  return meta
}

export class ToolResolver {
  constructor({ db, workDirService }) {
    this._db = db
    this._workDirService = workDirService
  }

  listEnabledCustomToolRows() {
    try {
      return (this._db?.listTools?.() || []).filter(t => t?.enabled !== false && t?.enabled !== 0)
    } catch {
      return []
    }
  }

  normalizeSkillId(skillId) {
    return String(skillId || '')
      .replace(/\\/g, '/')
      .replace(/^\/?skills\//i, '')
      .replace(/\/+$/, '')
      .trim()
  }

  readJsonIfExists(filePath) {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return null
    }
  }

  builtinSkillConfigPath(skillId) {
    const electronDir = path.dirname(fileURLToPath(import.meta.url))
    const candidates = [
      process.env.APP_ROOT ? path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'skills', skillId, 'config.json') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'builtin-assets', 'skills', skillId, 'config.json') : '',
      path.join(electronDir, 'builtin-assets', 'skills', skillId, 'config.json'),
    ].filter(Boolean)
    return candidates.find(p => fs.existsSync(p)) || ''
  }

  skillAllowedTools(skillIds) {
    const ids = [...new Set((skillIds || []).map(id => this.normalizeSkillId(id)).filter(Boolean))]
    if (!ids.length) return []
  
    let dbSkills = []
    try {
      dbSkills = this._db?.listSkills?.() || []
    } catch {
      dbSkills = []
    }
  
    const workRoot = this._workDirService?.getRootPath?.() || ''
    const allowed = []
    for (const skillId of ids) {
      const workspaceConfig = workRoot
        ? this.readJsonIfExists(path.join(workRoot, 'skills', skillId, 'config.json'))
        : null
      const dbSkill = dbSkills.find(s => this.normalizeSkillId(s?.id) === skillId)
      const builtinConfig = this.readJsonIfExists(this.builtinSkillConfigPath(skillId))
      const sources = [workspaceConfig, dbSkill, builtinConfig]
  
      for (const source of sources) {
        const tools = source?.allowedTools || source?.allowed_tools
        if (Array.isArray(tools)) allowed.push(...tools.filter(Boolean))
      }
    }
    return [...new Set(allowed.map(String))]
  }

  withSkillTools(toolIds, skillIds) {
    const allSkillIds = [...this.defaultSkillIds(), ...(skillIds || [])]
    return [...new Set([...(toolIds || []), ...this.skillAllowedTools(allSkillIds)].filter(Boolean))]
  }

  buildLocalRuntimeTools(toolIds, { includeDefaults = true, modelHasVision = false, visionAvailable = modelHasVision } = {}) {
    const effectiveIds = includeDefaults ? withDefaultAgentTools(toolIds, { modelHasVision, visionAvailable }) : (toolIds || [])
    const builtinTools = effectiveIds.length ? getLangchainTools(effectiveIds) : []
    const userTools = getUserDefinedLangchainTools(effectiveIds, this.listEnabledCustomToolRows())
    return [...builtinTools, ...userTools]
  }

  defaultSkillIds() {
    return ['skill-installer']
  }

  buildSkillsPaths(skillIds) {
    const defaultIds = this.defaultSkillIds()
    const normalizedSkillIds = [...new Set([
      ...defaultIds,
      ...(skillIds || []).map(id => this.normalizeSkillId(id)),
    ].filter(Boolean))]
    if (!normalizedSkillIds.length) return { paths: undefined, info: [], boundSkillIds: [] }
    const workRoot = this._workDirService?.getRootPath?.() || ''
    if (!workRoot) return { paths: undefined, info: [], boundSkillIds: [] }
  
    const globalSkillsDir = path.join(workRoot, 'skills')
    if (!fs.existsSync(globalSkillsDir)) {
      fs.mkdirSync(globalSkillsDir, { recursive: true })
    }
  
    const skillInfo = []
    const boundSkillIds = []
    for (const skillId of normalizedSkillIds) {
      const skillDir = path.join(globalSkillsDir, skillId)
      const skillFile = path.join(skillDir, 'SKILL.md')
      if (fs.existsSync(skillFile)) {
        boundSkillIds.push(skillId)
        let skillName = skillId
        let skillDesc = ''
        try {
          const skillContent = fs.readFileSync(skillFile, 'utf-8')
          const meta = parseSkillFrontmatterSummary(skillContent)
          skillName = String(meta.name || skillId).trim()
          skillDesc = String(meta.description || '').trim()
          if (!skillDesc) {
            const titleMatch = skillContent.split(/\r?\n/).find(line => /^#\s+/.test(line))?.match(/^#\s+(.+)/)
            if (titleMatch) skillName = titleMatch[1].trim()
          }
        } catch { /* fallback to skillId */ }
        skillInfo.push({ id: skillId, name: skillName, desc: skillDesc || `路径: /skills/${skillId}/`, path: `/skills/${skillId}/` })
        console.log('[AgentService] Skill found:', skillId, '→', skillName)
      } else {
        console.warn('[AgentService] Skill not found:', skillId)
      }
    }
  
    return { paths: boundSkillIds.length ? ['/skills/'] : undefined, info: skillInfo, boundSkillIds }
  }

}
