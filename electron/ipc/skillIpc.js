import { dialog } from 'electron'
import crypto from 'node:crypto'
import path from 'node:path'

export function registerSkillIpc(ipcMain, deps) {
  const { dbService, skillService, getWin, skillImportSessions } = deps

  function isPlatformSkillRecord(skillId) {
    const record = dbService?.listSkills?.().find(skill => skill.id === skillId)
    return record?.source === 'platform' || record?.builtin === true
  }

  function skillDbPayload(skillId, config, promptContent) {
    return {
      id: skillId,
      name: config.name || skillId,
      icon: config.icon,
      color: config.color,
      description: config.description,
      prompt_template: promptContent || '',
      prompt_content: promptContent || '',
      output_types: config.outputTypes || [],
      allowed_tools: config.allowedTools || [],
      source: 'custom',
      category: config.category || '',
      version: config.version || '',
      author: config.author || '',
      license: config.license || '',
      builtin: 0,
      enabled: 1,
    }
  }

  function skillReferences(skillId) {
    const agents = dbService.listAgents().filter(agent => Array.isArray(agent.skills) && agent.skills.includes(skillId))
    const subAgents = dbService.listSubAgents().filter(agent => Array.isArray(agent.skills) && agent.skills.includes(skillId))
    return { agents, subAgents, usedBy: [
      ...agents.map(agent => ({ id: agent.id, name: agent.name, type: 'agent' })),
      ...subAgents.map(agent => ({ id: agent.id, name: agent.name, type: 'subagent' })),
    ] }
  }

  async function withSkillSnapshot(skillId, operation) {
    const snapshot = await skillService.createSkillSnapshot(skillId)
    try {
      return await operation()
    } catch (error) {
      try {
        await skillService.restoreSkillSnapshot(skillId, snapshot)
      } catch (restoreError) {
        console.error(`[SkillService] Failed to restore ${skillId}:`, restoreError.message)
        throw new Error(`${error.message}；Skill 文件回滚失败：${restoreError.message}`)
      }
      throw error
    } finally {
      await skillService.discardSkillSnapshot(snapshot)
    }
  }

  async function migrateCustomSkillBuiltinCollisions() {
    const builtinIds = new Set((await skillService.listBuiltinSkills()).map(skill => skill.id))
    const customSkills = dbService.listSkills().filter(skill => skill.source !== 'platform' && builtinIds.has(skill.id))
    if (!customSkills.length) return []

    const reservedIds = new Set([
      ...builtinIds,
      ...dbService.listSkills().map(skill => skill.id),
    ])
    const migrations = []

    for (const skill of customSkills) {
      const oldId = skill.id
      const baseId = `${oldId}-custom`
      let newId = baseId
      let suffix = 2
      while (reservedIds.has(newId) || skillService.isInstalled(newId)) {
        newId = `${baseId}-${suffix}`
        suffix += 1
      }

      let hasCustomDirectory = skillService.isInstalled(oldId)
      if (hasCustomDirectory) {
        const configResult = await skillService.readSkillFile(oldId, 'config.json')
        if (configResult.success) {
          try {
            const config = JSON.parse(configResult.data)
            hasCustomDirectory = config.source !== 'platform' && config.builtin !== true
          } catch { /* Invalid or missing config is normalized during rename. */ }
        }
      }
      if (hasCustomDirectory) await skillService.renameCustomSkill(oldId, newId)
      try {
        const migrateDb = dbService.db.transaction(() => {
          const agents = dbService.listAgents().filter(agent => Array.isArray(agent.skills) && agent.skills.includes(oldId))
          const subAgents = dbService.listSubAgents().filter(agent => Array.isArray(agent.skills) && agent.skills.includes(oldId))
          dbService.db.prepare('UPDATE custom_skills SET id = ? WHERE id = ?').run(newId, oldId)
          for (const agent of agents) dbService.updateAgent(agent.id, { skills: agent.skills.map(id => id === oldId ? newId : id) })
          for (const agent of subAgents) dbService.updateSubAgent(agent.id, { skills: agent.skills.map(id => id === oldId ? newId : id) })
        })
        migrateDb()
      } catch (error) {
        if (hasCustomDirectory) {
          try {
            await skillService.renameCustomSkill(newId, oldId)
          } catch (restoreError) {
            console.error(`[SkillService] Failed to restore custom Skill directory ${oldId}:`, restoreError.message)
            throw new Error(`${error.message}；Skill 目录回滚失败：${restoreError.message}`)
          }
        }
        throw error
      }

      reservedIds.add(newId)
      migrations.push({ oldId, newId })
      console.log(`[SkillService] Renamed custom Skill ${oldId} to ${newId} before builtin installation`)
    }

    return migrations
  }

  ipcMain.handle('skill:install', async (event, skillId, skillData) => {
    try {
      if (isPlatformSkillRecord(skillId)) throw new Error(`不能覆盖内置 Skill：${skillId}`)
      return await skillService.installSkill(skillId, { ...skillData, source: 'custom' })
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:update', async (event, skillId, skillData) => {
    try {
      if (isPlatformSkillRecord(skillId)) throw new Error(`不能编辑内置 Skill：${skillId}`)
      return await skillService.updateSkill(skillId, { ...skillData, source: 'custom' })
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:create', async (event, skillId, skillData = {}) => {
    try {
      if (dbService.listSkills().some(skill => skill.id === skillId) || skillService.isBuiltinSkillId(skillId)) throw new Error(`Skill ID "${skillId}" 已存在`)
      return await withSkillSnapshot(skillId, async () => {
        const installed = await skillService.installSkill(skillId, { ...skillData, source: 'custom' })
        if (!installed.spec?.valid) throw new Error(installed.spec?.issues?.join('；') || 'Skill 校验失败')
        const promptResult = await skillService.readSkillFile(skillId, 'SKILL.md')
        if (!promptResult.success) throw new Error(promptResult.error || '无法读取已安装的 SKILL.md')
        const row = dbService.createSkill(skillDbPayload(skillId, installed.config, promptResult.data))
        return { success: true, data: row, config: installed.config, spec: installed.spec }
      })
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:save', async (event, skillId, skillData = {}) => {
    try {
      const existing = dbService.listSkills().find(skill => skill.id === skillId)
      if (!existing || existing.source === 'platform' || existing.builtin) throw new Error('内置 Skill 不能编辑')
      return await withSkillSnapshot(skillId, async () => {
        const updated = await skillService.updateSkill(skillId, { ...skillData, source: 'custom' })
        if (!updated.spec?.valid) throw new Error(updated.spec?.issues?.join('；') || 'Skill 校验失败')
        const promptResult = await skillService.readSkillFile(skillId, 'SKILL.md')
        if (!promptResult.success) throw new Error(promptResult.error || '无法读取已保存的 SKILL.md')
        dbService.updateSkill(skillId, skillDbPayload(skillId, updated.config, promptResult.data))
        const row = dbService.listSkills().find(skill => skill.id === skillId)
        return { success: true, data: row, config: updated.config, spec: updated.spec }
      })
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:delete', async (event, skillId, options = {}) => {
    try {
      const existing = dbService.listSkills().find(skill => skill.id === skillId)
      if (!existing) return { success: true, usedBy: [] }
      if (existing.source === 'platform' || existing.builtin || skillService.isBuiltinSkillId(skillId)) throw new Error('内置 Skill 不能删除')
      const refs = skillReferences(skillId)
      if (refs.usedBy.length && !options.force) return { success: false, code: 'SKILL_IN_USE', usedBy: refs.usedBy }
      return await withSkillSnapshot(skillId, async () => {
        await skillService.uninstallSkill(skillId)
        const removeFromDb = dbService.db.transaction(() => {
          if (options.force) {
            for (const agent of refs.agents) dbService.updateAgent(agent.id, { skills: agent.skills.filter(id => id !== skillId) })
            for (const agent of refs.subAgents) dbService.updateSubAgent(agent.id, { skills: agent.skills.filter(id => id !== skillId) })
          }
          dbService.deleteSkill(skillId)
        })
        removeFromDb()
        return { success: true, usedBy: refs.usedBy }
      })
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:uninstall', async (event, skillId) => {
    try {
      if (isPlatformSkillRecord(skillId)) throw new Error(`不能删除内置 Skill：${skillId}`)
      return await skillService.uninstallSkill(skillId)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:listFiles', async (event, skillId) => {
    try {
      const files = await skillService.listSkillFiles(skillId)
      return { success: true, data: files }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:readFile', async (event, skillId, relativePath) => {
    try {
      return await skillService.readSkillFile(skillId, relativePath)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:writeFile', async (event, skillId, relativePath, content) => {
    try {
      const existing = dbService.listSkills().find(skill => skill.id === skillId)
      if (!existing || existing.source === 'platform' || existing.builtin) throw new Error('内置 Skill 不能编辑')
      return await withSkillSnapshot(skillId, async () => {
        const result = await skillService.writeSkillFile(skillId, relativePath, content)
        if (!result.success) throw new Error(result.error || '文件保存失败')

        const normalizedPath = String(relativePath || '').replace(/\\/g, '/').toLowerCase()
        if (normalizedPath === 'skill.md') {
          const updated = await skillService.updateSkill(skillId, {
            ...existing,
            description: result.spec?.description || existing.description || '',
            promptContent: content,
            source: 'custom',
          })
          if (!updated.spec?.valid) throw new Error(updated.spec?.issues?.join('；') || 'Skill 校验失败')
          const promptResult = await skillService.readSkillFile(skillId, 'SKILL.md')
          if (!promptResult.success) throw new Error(promptResult.error || '无法读取已保存的 SKILL.md')
          dbService.updateSkill(skillId, skillDbPayload(skillId, updated.config, promptResult.data))
          return { ...result, config: updated.config, spec: updated.spec }
        }

        return result
      })
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:pickImportSource', async (event, type = 'zip') => {
    try {
      const folder = type === 'folder'
      const result = await dialog.showOpenDialog(getWin(), {
        title: folder ? '选择 Skill 文件夹' : type === 'skill' ? '选择 SKILL.md' : '选择 Skill ZIP',
        properties: [folder ? 'openDirectory' : 'openFile'],
        filters: folder ? undefined : type === 'skill'
          ? [{ name: 'Skill Markdown', extensions: ['md', 'markdown'] }]
          : [{ name: 'Skill ZIP', extensions: ['zip'] }],
      })
      if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true }
      const sourcePath = result.filePaths[0]
      const customSkills = dbService.listSkills().filter(skill => skill.source !== 'platform')
      const preview = await skillService.inspectSkillSource(sourcePath, { customSkills })
      const sessionId = crypto.randomUUID()
      const now = Date.now()
      for (const [id, session] of skillImportSessions) {
        if (now - session.createdAt > 10 * 60 * 1000) skillImportSessions.delete(id)
      }
      skillImportSessions.set(sessionId, {
        sourcePath,
        createdAt: now,
        previewId: preview.id,
        allowUpdate: preview.conflict === 'custom',
      })
      return { success: true, sessionId, sourceName: path.basename(sourcePath), data: preview }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:importSource', async (event, sessionId, options = {}) => {
    try {
      const sessionKey = String(sessionId || '')
      const session = skillImportSessions.get(sessionKey)
      if (!session || Date.now() - session.createdAt > 10 * 60 * 1000) {
        skillImportSessions.delete(sessionKey)
        throw new Error('导入会话已失效，请重新选择 Skill')
      }
      const allSkills = dbService.listSkills()
      const requestedId = skillService.normalizeSkillId(options.id)
      if (!skillService.isValidSkillId(requestedId)) throw new Error('请输入合法的英文 Skill ID')
      if (skillService.isBuiltinSkillId(requestedId) || allSkills.some(skill => skill.id === requestedId && skill.source === 'platform')) {
        throw new Error(`不能覆盖内置 Skill：${requestedId}`)
      }

      const existing = allSkills.find(skill => skill.id === requestedId && skill.source !== 'platform')
      const diskConflict = skillService.isInstalled(requestedId)
      let finalId = requestedId
      if ((existing || diskConflict) && options.strategy === 'copy') {
        let suffix = 2
        while (allSkills.some(skill => skill.id === `${requestedId}-${suffix}`) || skillService.isInstalled(`${requestedId}-${suffix}`) || skillService.isBuiltinSkillId(`${requestedId}-${suffix}`)) suffix += 1
        finalId = `${requestedId}-${suffix}`
      } else if ((existing || diskConflict) && (
        options.strategy !== 'update' ||
        !session.allowUpdate ||
        requestedId !== session.previewId
      )) {
        return { success: false, conflict: 'custom', existing }
      }

      skillImportSessions.delete(sessionKey)
      return await withSkillSnapshot(finalId, async () => {
        const installed = await skillService.importSkillSource(session.sourcePath, { ...options, id: finalId, source: 'custom' })
        if (!installed.spec?.valid) throw new Error(installed.spec?.issues?.join('；') || 'Skill 校验失败')
        const promptResult = await skillService.readSkillFile(finalId, 'SKILL.md')
        if (!promptResult.success) throw new Error(promptResult.error || '无法读取导入的 SKILL.md')
        const dbPayload = skillDbPayload(finalId, installed.config, promptResult.data)
        let row
        if (existing && finalId === requestedId) {
          dbService.updateSkill(finalId, dbPayload)
          row = dbService.listSkills().find(skill => skill.id === finalId)
        } else row = dbService.createSkill(dbPayload)
        return { success: true, data: { ...row, id: finalId, config: installed.config, spec: installed.spec } }
      })
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:isInstalled', async (event, skillId) => {
    try {
      return { success: true, data: skillService.isInstalled(skillId) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('skill:listBuiltin', async () => {
    try {
      const data = await skillService.listBuiltinSkills()
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  return { migrateCustomSkillBuiltinCollisions }
}
