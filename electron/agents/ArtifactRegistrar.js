// agents/ArtifactRegistrar.js — extracted from AgentService.js
// Scans agent output directory for newly created files and registers them as artifacts.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export class ArtifactRegistrar {
  constructor({ db, send, resolveAgentDirName }) {
    this._db = db
    this._send = send
    this._resolveAgentDirName = resolveAgentDirName
  }

  async registerArtifacts({ conversationId, groupId, agentEnglishName, agentDirName = '', workRoot, runStartTime, builtinModules = [] }) {
    const date = new Date(runStartTime).toISOString().slice(0, 10)
    const runtimeDirName = agentDirName || this._resolveAgentDirName('', agentEnglishName)
    const outputDir = path.join(workRoot, 'agents', runtimeDirName, 'outputs', date)
  
    if (!fs.existsSync(outputDir)) return []
  
    // Background generation tasks may not have a conversation yet.
    const conv = conversationId ? this._db.getConv(conversationId) : null
    const resolvedGroupId = groupId || conv?.group_id || 'default'
  
    // Find module config for artifact rules
    const moduleConfig = builtinModules?.find(m => m.english_name === agentEnglishName)
    const rules = moduleConfig?.artifact_rules
    const created = []
  
    // Scan for new files (mtime > runStartTime)
    for (const file of fs.readdirSync(outputDir)) {
      const filePath = path.join(outputDir, file)
      let stat
      try { stat = fs.statSync(filePath) } catch { continue }
      if (!stat.isFile()) continue
      if (stat.mtimeMs < runStartTime) continue
  
      const ext = file.split('.').pop().toLowerCase()
      const title = file.replace(/\.[^.]+$/, '')
  
      // Match file pattern from rules
      const pattern = rules?.file_patterns?.find(p => p.ext === ext)
      // 只注册 artifact-rules.json 中声明过的扩展名，未声明的（如 .txt 探针文件）直接跳过
      // 仅在已声明 file_patterns 时严格过滤，无规则时保留旧行为
      if (rules?.file_patterns?.length && !pattern) continue
      // 跳过模型自写的探针文件（test.txt / test.html 等）
      if (title.toLowerCase() === 'test') continue
      const icon = pattern?.icon || (ext === 'html' ? 'ri-bar-chart-box-line' : 'ri-file-text-line')
      const type = pattern?.type || 'research'
  
      const artifact = this._db.createArtifact({
        id: `art_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        group_id: resolvedGroupId,
        conversation_id: conversationId || '',
        title,
        type,
        icon,
        color: moduleConfig?.color || '#38BDF8',
        storage_type: 'file',
        file_path: filePath,
        content: null,
        agent_name: moduleConfig?.name || agentEnglishName,
        skill_name: moduleConfig?.skills?.[0] || '',
      })
      created.push(artifact)
    }
  
    // Notify renderer
    if (created.length) {
      this._send('agent:artifactsCreated', { groupId: resolvedGroupId, agentEnglishName, artifacts: created })
    }
    return created
  }
}
