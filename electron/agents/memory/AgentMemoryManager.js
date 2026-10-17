// agents/memory/AgentMemoryManager.js — extracted from AgentService.js
// Per-agent memory directory management, AGENTS.md read/write, semantic memory injection.

import fs from 'node:fs'
import path from 'node:path'

export class AgentMemoryManager {
  constructor({ db, workDirService }) {
    this._db = db
    this._workDirService = workDirService
  }

  safeAgentDirName(value) {
    const safe = String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    return safe || '_shared'
  }

  agentRuntimeDirName(agentId, agentEnglishName) {
    const id = String(agentId || '').trim()
    const englishName = String(agentEnglishName || '').trim()
    // Built-in asset ids such as computer-network-agent are the stable routing key.
    // Legacy built-ins use ids like agent_researcher, so keep their english_name directories.
    if (id && !/^agent_/i.test(id)) return this.safeAgentDirName(id)
    if (englishName) return this.safeAgentDirName(englishName)
    return this.safeAgentDirName(id || '_shared')
  }

  agentMemoryDirName(agentId, agentEnglishName) {
    return this.agentRuntimeDirName(agentId, agentEnglishName)
  }

  buildMemoryPaths(agentRef = {}) {
    const workRoot = this._workDirService?.getRootPath?.() || ''
    if (!workRoot) return undefined
    const agentId = typeof agentRef === 'object' ? agentRef.agentId : ''
    const agentEnglishName = typeof agentRef === 'object' ? agentRef.agentEnglishName : agentRef
  
    // 1. Global shared memory — all agents can read/write
    const globalMemDir = path.join(workRoot, 'memories')
    if (!fs.existsSync(globalMemDir)) fs.mkdirSync(globalMemDir, { recursive: true })
    const globalMd = path.join(globalMemDir, 'AGENTS.md')
    if (!fs.existsSync(globalMd)) {
      fs.writeFileSync(globalMd, '# Global Memory\n\n## 全局规则\n\n## 全局偏好\n\n', 'utf-8')
    }
  
    // 2. Per-agent private memory — only this agent can access
    const agentDirName = this.agentMemoryDirName(agentId, agentEnglishName)
    const agentMemDir = path.join(workRoot, 'agents', agentDirName, 'memory')
    if (!fs.existsSync(agentMemDir)) fs.mkdirSync(agentMemDir, { recursive: true })
    const agentMd = path.join(agentMemDir, 'AGENTS.md')
    if (!fs.existsSync(agentMd)) {
      fs.writeFileSync(agentMd, '# Agent Context\n\n## Preferences\n\n## Facts\n\n', 'utf-8')
    }
  
    const paths = [
      '/memories/AGENTS.md',                        // Global shared (all agents)
      `/agents/${agentDirName}/memory/AGENTS.md`,   // Per-agent private
    ]
  
    return paths
  }

  readMemoryContents(workRoot, agentDirName) {
    if (!workRoot || !agentDirName) return ''
    const files = [
      path.join(workRoot, 'memories', 'AGENTS.md'),
      path.join(workRoot, 'agents', agentDirName, 'memory', 'AGENTS.md'),
    ]
    const sections = []
    for (const p of files) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8').trim()
          if (content) sections.push(content)
        }
      } catch { /* ignore read errors */ }
    }
    return sections.length ? `## Agent Memory\n\n${sections.join('\n\n---\n\n')}` : ''
  }

  injectSemanticMemories(workRoot) {
    if (!workRoot) return
    const globalMd = path.join(workRoot, 'memories', 'AGENTS.md')
    if (!fs.existsSync(globalMd)) return
  
    // Read semantic memories from DB
    const rows = this._db.listMemories?.() || []
    const semanticRows = rows.filter(r => r.type === 'semantic')
    if (!semanticRows.length) return
  
    let content = fs.readFileSync(globalMd, 'utf-8')
  
    // Remove any existing injected block
    const startTag = '<!-- REVIVA_DB_MEMORIES -->'
    const endTag = '<!-- /REVIVA_DB_MEMORIES -->'
    const startIdx = content.indexOf(startTag)
    if (startIdx !== -1) {
      const endIdx = content.indexOf(endTag, startIdx)
      if (endIdx !== -1) {
        content = content.slice(0, startIdx) + content.slice(endIdx + endTag.length)
      }
    }
  
    // Build injection block
    const items = semanticRows.map(r => `- ${r.content}`).join('\n')
    const block = `\n\n${startTag}\n## 用户语义记忆\n\n${items}\n${endTag}\n`
  
    fs.writeFileSync(globalMd, content.trimEnd() + block, 'utf-8')
  }

  removeInjectedMemories(workRoot) {
    if (!workRoot) return
    const globalMd = path.join(workRoot, 'memories', 'AGENTS.md')
    if (!fs.existsSync(globalMd)) return
  
    let content = fs.readFileSync(globalMd, 'utf-8')
    const startTag = '<!-- REVIVA_DB_MEMORIES -->'
    const endTag = '<!-- /REVIVA_DB_MEMORIES -->'
    const startIdx = content.indexOf(startTag)
    if (startIdx === -1) return
  
    const endIdx = content.indexOf(endTag, startIdx)
    if (endIdx !== -1) {
      content = content.slice(0, startIdx) + content.slice(endIdx + endTag.length)
      fs.writeFileSync(globalMd, content.trimEnd() + '\n', 'utf-8')
    }
  }

}
