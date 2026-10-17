import fs from 'node:fs'
import path from 'node:path'

export function registerRecycleBinIpc(ipcMain, deps) {
  const {
    dbService, workDirService, noteFileService,
    pdfLifecycleService, mediaModule, learningMemoryService,
    validateFsPath,
  } = deps

  async function _restoreFileItem(record) {
    const originalDir = path.dirname(record.original_path)
    if (!fs.existsSync(originalDir)) await fs.promises.mkdir(originalDir, { recursive: true })
    let restorePath = record.original_path
    if (fs.existsSync(restorePath)) {
      const ext = path.extname(restorePath)
      const base = path.basename(restorePath, ext)
      restorePath = path.join(originalDir, base + '_restored' + ext)
    }
    if (fs.existsSync(record.trash_path)) {
      await fs.promises.rename(record.trash_path, restorePath)
    }
    return restorePath
  }

  async function _restoreDbItem(record) {
    const payload = record.payload_json ? JSON.parse(record.payload_json) : {}
    if (record.item_type === 'conversation') {
      const conv = payload.conv
      const messages = payload.messages || []
      if (!conv) throw new Error('Conversation payload missing')
      const restoreConversation = dbService.db.transaction(() => {
        const originalGroupId = conv.group_id || conv.groupId || 'default'
        const groupExists = originalGroupId === 'default' || dbService.listConvGroups().some(g => g.id === originalGroupId)
        conv.group_id = groupExists ? originalGroupId : 'default'
        if (dbService.getConv(conv.id)) conv.id = 'conv_' + Date.now()
        dbService.createConv(conv)
        const messageIdMap = new Map(messages.map((message, index) => {
          const oldId = message.id || `missing_${index}`
          const nextId = message.id && !dbService.getMsg(message.id)
            ? message.id
            : 'msg_' + Date.now() + '_' + index + '_' + Math.random().toString(36).slice(2, 8)
          return [oldId, nextId]
        }))
        for (const message of messages) {
          const oldId = message.id
          dbService.createMsg({
            ...message,
            id: messageIdMap.get(oldId) || 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            conversation_id: conv.id,
            parent_msg_id: messageIdMap.get(message.parentMsgId || message.parent_msg_id) || '',
          })
        }
        return { restoredId: conv.id, messageIdMap: Object.fromEntries(messageIdMap) }
      })
      const restored = restoreConversation()
      mediaModule?.lifecycle?.onConversationRestored?.(payload.mediaLifecycle, restored.messageIdMap)
      return { restoredId: restored.restoredId }
    }
    if (record.item_type === 'note') {
      if (noteFileService) return await noteFileService.restoreNote(record)
      const note = payload.note
      if (!note) throw new Error('Note payload missing')
      if (note.folder_id && !dbService.getNoteFolder(note.folder_id)) note.folder_id = ''
      if (dbService.getNote(note.id)) note.id = 'nt_' + Date.now()
      dbService.createNote(note)
      return { restoredId: note.id }
    }
    if (record.item_type === 'note_folder') {
      const folder = payload.folder
      if (!folder) throw new Error('Folder payload missing')
      if (folder.parent_id && !dbService.getNoteFolder(folder.parent_id)) folder.parent_id = ''
      if (dbService.getNoteFolder(folder.id)) folder.id = 'nf_' + Date.now()
      dbService.createNoteFolder(folder)
      return { restoredId: folder.id }
    }
    if (record.item_type === 'artifact') {
      const artifact = payload.artifact
      const taskSnapshot = payload.task
      if (!artifact) throw new Error('Artifact payload missing')
      const originalArtifactId = artifact.id
      if (artifact.group_id && artifact.group_id !== 'default') {
        const groupExists = dbService.listConvGroups().some(g => g.id === artifact.group_id)
        if (!groupExists) artifact.group_id = 'default'
      }
      if (artifact.storage_type === 'file' && record.trash_path && record.original_path) {
        artifact.file_path = await _restoreFileItem(record)
      }
      if (dbService.getArtifact(artifact.id)) artifact.id = 'art_' + Date.now()
      const restored = dbService.createArtifact(artifact)
      let restoredTaskId = ''
      if (taskSnapshot && typeof taskSnapshot === 'object') {
        const baseParams = taskSnapshot.params && typeof taskSnapshot.params === 'object' ? taskSnapshot.params : {}
        const originalIds = Array.isArray(baseParams.artifactIds) ? baseParams.artifactIds : []
        const artifactIds = originalIds
          .map(id => id === originalArtifactId ? restored.id : id)
          .filter(Boolean)
        if (!artifactIds.includes(restored.id)) artifactIds.push(restored.id)

        const taskId = taskSnapshot.id || 'task_' + Date.now()
        const existingTask = dbService.getTask(taskId)
        if (existingTask) {
          const params = existingTask.params && typeof existingTask.params === 'object' ? existingTask.params : {}
          const mergedIds = new Set(Array.isArray(params.artifactIds) ? params.artifactIds : [])
          if (existingTask.artifact_id) mergedIds.add(existingTask.artifact_id)
          mergedIds.add(restored.id)
          dbService.updateTask(taskId, {
            status: 'completed',
            progress: 100,
            artifact_id: existingTask.artifact_id || restored.id,
            params: { ...params, artifactIds: [...mergedIds].filter(Boolean) },
          })
        } else {
          dbService.createTask({
            ...taskSnapshot,
            id: taskId,
            name: taskSnapshot.name || artifact.title || '生成结果',
            status: 'completed',
            progress: 100,
            error: '',
            group_id: artifact.group_id || taskSnapshot.group_id || 'default',
            conversation_id: artifact.conversation_id || taskSnapshot.conversation_id || '',
            artifact_id: taskSnapshot.artifact_id && taskSnapshot.artifact_id !== originalArtifactId ? taskSnapshot.artifact_id : restored.id,
            params: { ...baseParams, artifactIds },
            steps: Array.isArray(taskSnapshot.steps) ? taskSnapshot.steps : [],
          })
        }
        restoredTaskId = taskId
      }
      return { restoredId: restored.id, restoredTaskId }
    }
    throw new Error('Unknown item_type: ' + record.item_type)
  }

  async function _permanentlyDeleteItem(record) {
    if (record.item_type === 'file' || record.item_type === 'note' || record.item_type === 'artifact' || !record.item_type) {
      if (record.trash_path && fs.existsSync(record.trash_path)) {
        if (record.is_directory) {
          await fs.promises.rm(record.trash_path, { recursive: true, force: true })
        } else {
          await fs.promises.unlink(record.trash_path)
        }
      }
    }
  }

  async function _finalizePermanentlyDeletedItem(record) {
    if (pdfLifecycleService && (record.item_type === 'file' || !record.item_type)) {
      await pdfLifecycleService.onPermanentlyDeleted(record)
    }
    if (mediaModule?.lifecycle && (record.item_type === 'file' || !record.item_type)) {
      await mediaModule.lifecycle.onPermanentlyDeleted(record)
    }
    if (record.item_type === 'conversation') {
      const payload = record.payload_json ? JSON.parse(record.payload_json) : {}
      await mediaModule?.lifecycle?.onConversationPermanentlyDeleted?.(payload.mediaLifecycle)
      const conversationId = record.item_id || payload.conv?.id || ''
      if (conversationId) learningMemoryService?.deleteByConversation?.(conversationId)
    }
  }

  ipcMain.handle('recycleBin:moveToTrash', async (event, itemPath, itemMeta) => {
    try {
      const validatedPath = validateFsPath(itemPath)
      const rootPath = workDirService?.getRootPath()
      if (!rootPath) return { success: false, error: 'No workspace initialized' }

      const trashDir = path.join(rootPath, '.reviva', 'trash')
      if (!fs.existsSync(trashDir)) {
        await fs.promises.mkdir(trashDir, { recursive: true })
      }

      const timestamp = Date.now()
      const originalName = path.basename(validatedPath)
      const trashName = timestamp + '_' + originalName
      const trashPath = path.join(trashDir, trashName)

      let stat = null
      try { stat = await fs.promises.stat(validatedPath) } catch { /* ignore */ }
      const isDir = stat ? stat.isDirectory() : (itemMeta?.isDirectory || false)
      const pdfSnapshot = pdfLifecycleService
        ? await pdfLifecycleService.prepareMoveToTrash(validatedPath, { isDirectory: isDir })
        : null
      let mediaSnapshot = null
      try { mediaSnapshot = mediaModule?.lifecycle?.prepareMoveToTrash?.(validatedPath, { isDirectory: isDir }) || null }
      catch (error) { console.error('[MediaLifecycle] Failed to snapshot trashed path:', error) }

      await fs.promises.rename(validatedPath, trashPath)

      const ext = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : ''
      let category = 'other'
      if (isDir) category = 'folder'
      else if (['pdf', 'docx', 'doc', 'md', 'markdown', 'txt', 'xlsx', 'xls', 'pptx', 'ppt', 'csv'].includes(ext)) category = 'document'
      else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) category = 'image'
      else if (['mp4', 'avi', 'mov', 'mkv'].includes(ext)) category = 'video'
      else if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) category = 'audio'
      else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) category = 'archive'
      else if (['js', 'py', 'json', 'java', 'cpp', 'ts', 'html', 'css'].includes(ext)) category = 'code'

      const trashId = 'trash_' + timestamp + '_' + Math.random().toString(36).slice(2, 7)
      const record = dbService.createTrashItem({
        id: trashId,
        original_path: validatedPath,
        original_name: originalName,
        trash_path: trashPath,
        is_directory: isDir,
        size: stat ? (isDir ? 0 : stat.size) : 0,
        file_type: ext,
        category,
        item_type: 'file',
        payload_json: pdfSnapshot || mediaSnapshot ? JSON.stringify({
          ...(pdfSnapshot ? { pdfLifecycle: pdfSnapshot } : {}),
          ...(mediaSnapshot ? { mediaLifecycle: mediaSnapshot } : {}),
        }) : '',
      })

      if (pdfLifecycleService && pdfSnapshot) {
        try {
          pdfLifecycleService.onMovedToTrash(record.id, pdfSnapshot)
        } catch (error) {
          console.error('[PdfLifecycle] Failed to mark PDF references as trashed:', error)
        }
      }
      if (mediaModule?.lifecycle && mediaSnapshot) {
        try {
          mediaModule.lifecycle.onMovedToTrash(record.id, mediaSnapshot)
        } catch (error) {
          console.error('[MediaLifecycle] Failed to mark media references as trashed:', error)
        }
      }

      return { success: true, data: record }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('recycleBin:trashArtifact', async (event, artifactId, options = {}) => {
    try {
      const artifact = dbService.getArtifact(artifactId)
      if (!artifact) return { success: false, error: 'Artifact not found' }
      const titleOverride = typeof options?.title === 'string' ? options.title.trim() : ''
      const artifactSnapshot = { ...artifact, title: titleOverride || artifact.title }
      const taskSnapshot = options?.task && typeof options.task === 'object'
        ? {
          id: options.task.id || '',
          name: options.task.name || titleOverride || artifact.title || '',
          type: options.task.type || 'agent',
          status: options.task.status || 'completed',
          architecture: options.task.architecture || '',
          space_id: options.task.space_id || '',
          agent_id: options.task.agent_id || '',
          skill_type: options.task.skill_type || '',
          progress: options.task.progress || 100,
          steps: Array.isArray(options.task.steps) ? options.task.steps : [],
          result: options.task.result || '',
          error: options.task.error || '',
          tool_id: options.task.tool_id || artifact.type || '',
          mode: options.task.mode || 'local',
          conversation_id: options.task.conversation_id || artifact.conversation_id || '',
          group_id: options.task.group_id || artifact.group_id || 'default',
          params: options.task.params && typeof options.task.params === 'object' ? options.task.params : {},
          artifact_id: options.task.artifact_id || artifact.id,
          cloud_task_id: options.task.cloud_task_id || '',
        }
        : null

      let originalPath = artifact.file_path || ''
      let trashPath = ''
      let size = (artifactSnapshot.content || '').length
      let fileType = artifact.type || 'artifact'

      if (artifact.storage_type === 'file' && artifact.file_path) {
        const validatedPath = validateFsPath(artifact.file_path)
        originalPath = validatedPath
        const originalName = path.basename(validatedPath)
        const ext = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : ''
        fileType = ext || artifact.type || 'artifact'

        if (fs.existsSync(validatedPath)) {
          const rootPath = workDirService?.getRootPath()
          if (!rootPath) return { success: false, error: 'No workspace initialized' }
          const trashDir = path.join(rootPath, '.reviva', 'trash')
          if (!fs.existsSync(trashDir)) {
            await fs.promises.mkdir(trashDir, { recursive: true })
          }

          const stat = await fs.promises.stat(validatedPath)
          size = stat.isDirectory() ? 0 : stat.size
          const trashName = `${Date.now()}_${artifact.id}_${originalName}`
          trashPath = path.join(trashDir, trashName)
          await fs.promises.rename(validatedPath, trashPath)
        }
      }

      const record = dbService.createTrashItem({
        original_path: originalPath,
        original_name: artifactSnapshot.title || (originalPath ? path.basename(originalPath) : 'Untitled artifact'),
        trash_path: trashPath,
        is_directory: 0,
        size,
        file_type: fileType,
        category: 'artifact',
        item_type: 'artifact',
        item_id: artifactId,
        payload_json: JSON.stringify({ artifact: artifactSnapshot, task: taskSnapshot, fileMoved: !!trashPath }),
      })
      dbService.deleteArtifact(artifactId)
      return { success: true, data: record }
    } catch (err) {
      console.error('[RecycleBin] trashArtifact failed:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('recycleBin:trashConversation', async (event, convId) => {
    try {
      const conv = dbService.getConv(convId)
      if (!conv) return { success: false, error: 'Conversation not found' }
      const messages = dbService.listMsgs(convId)
      const mediaLifecycle = mediaModule?.lifecycle?.prepareConversationTrash?.(messages.map(message => message.id)) || null
      const record = dbService.createTrashItem({
        original_path: '', trash_path: '',
        original_name: conv.title || '未命名对话',
        is_directory: 0, size: messages.length, file_type: 'chat',
        category: 'chat',
        item_type: 'conversation', item_id: convId,
        payload_json: JSON.stringify({ conv, messages, mediaLifecycle }),
      })
      mediaModule?.lifecycle?.onConversationTrashed?.(record.id, mediaLifecycle)
      dbService.deleteConv(convId)
      console.log(`[RecycleBin] Trashed conversation ${convId} -> ${record.id} (${messages.length} msgs)`)
      return { success: true, data: record }
    } catch (err) {
      console.error('[RecycleBin] trashConversation failed:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('recycleBin:trashNote', async (event, noteId) => {
    try {
      if (noteFileService) return await noteFileService.trashNote(noteId)
      const note = dbService.getNote(noteId)
      if (!note) return { success: false, error: 'Note not found' }
      const record = dbService.createTrashItem({
        original_path: '', trash_path: '',
        original_name: note.title || '未命名笔记',
        is_directory: 0, size: (note.content || '').length, file_type: 'note',
        category: 'note',
        item_type: 'note', item_id: noteId,
        payload_json: JSON.stringify({ note }),
      })
      dbService.deleteNote(noteId)
      return { success: true, data: record }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('recycleBin:trashNoteFolder', async (event, folderId) => {
    try {
      if (noteFileService?.trashNoteFolder) return await noteFileService.trashNoteFolder(folderId)
      const records = []
      async function trashRecursive(fid) {
        const folder = dbService.getNoteFolder(fid)
        if (!folder) return
        const childNotes = dbService.listNotes(fid)
        const childFolders = dbService.listNoteFolders(fid)
        for (const sub of childFolders) await trashRecursive(sub.id)
        for (const n of childNotes) {
          if (noteFileService) {
            const result = await noteFileService.trashNote(n.id)
            if (result?.data) records.push(result.data)
          } else {
            records.push(dbService.createTrashItem({
              original_path: '', trash_path: '',
              original_name: n.title || '未命名笔记',
              is_directory: 0, size: (n.content || '').length, file_type: 'note',
              category: 'note',
              item_type: 'note', item_id: n.id,
              payload_json: JSON.stringify({ note: n }),
            }))
            dbService.deleteNote(n.id)
          }
        }
        records.push(dbService.createTrashItem({
          original_path: '', trash_path: '',
          original_name: folder.name,
          is_directory: 1, size: 0, file_type: 'folder',
          category: 'note',
          item_type: 'note_folder', item_id: fid,
          payload_json: JSON.stringify({ folder }),
        }))
        dbService.deleteNoteFolder(fid)
      }
      await trashRecursive(folderId)
      return { success: true, data: records, count: records.length }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('recycleBin:restore', async (event, trashId) => {
    try {
      const record = dbService.getTrashItem(trashId)
      if (!record) return { success: false, error: 'Item not found in recycle bin' }

      if (record.item_type === 'file' || !record.item_type) {
        const restoredPath = await _restoreFileItem(record)
        if (pdfLifecycleService) await pdfLifecycleService.onRestored(record, restoredPath)
        if (mediaModule?.lifecycle) {
          try { mediaModule.lifecycle.onRestored(record, restoredPath) }
          catch (error) { console.error('[MediaLifecycle] Failed after restoring file:', error) }
        }
        dbService.deleteTrashItem(trashId)
        return { success: true, data: { restoredPath } }
      } else {
        const result = await _restoreDbItem(record)
        dbService.deleteTrashItem(trashId)
        return { success: true, data: result }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('recycleBin:restoreBatch', async (event, trashIds) => {
    const results = []
    for (const id of trashIds) {
      const record = dbService.getTrashItem(id)
      if (!record) { results.push({ id, success: false, error: 'Not found' }); continue }
      try {
        if (record.item_type === 'file' || !record.item_type) {
          const restoredPath = await _restoreFileItem(record)
          if (pdfLifecycleService) await pdfLifecycleService.onRestored(record, restoredPath)
          if (mediaModule?.lifecycle) {
            try { mediaModule.lifecycle.onRestored(record, restoredPath) }
            catch (error) { console.error('[MediaLifecycle] Failed after restoring file:', error) }
          }
          dbService.deleteTrashItem(id)
          results.push({ id, success: true, restoredPath })
        } else {
          const res = await _restoreDbItem(record)
          dbService.deleteTrashItem(id)
          results.push({ id, success: true, ...res })
        }
      } catch (err) {
        results.push({ id, success: false, error: err.message })
      }
    }
    return { success: true, results }
  })

  ipcMain.handle('recycleBin:deletePermanently', async (event, trashId) => {
    try {
      const record = dbService.getTrashItem(trashId)
      if (!record) return { success: false, error: 'Item not found' }
      await _permanentlyDeleteItem(record)
      await _finalizePermanentlyDeletedItem(record)
      dbService.deleteTrashItem(trashId)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('recycleBin:deleteBatchPermanently', async (event, trashIds) => {
    const results = []
    for (const id of trashIds) {
      const record = dbService.getTrashItem(id)
      if (!record) { results.push({ id, success: false, error: 'Not found' }); continue }
      try {
        await _permanentlyDeleteItem(record)
        await _finalizePermanentlyDeletedItem(record)
        dbService.deleteTrashItem(id)
        results.push({ id, success: true })
      } catch (err) {
        console.error('Failed to permanently delete trash item:', id, err)
        results.push({ id, success: false, error: err.message })
      }
    }
    const failed = results.filter(item => !item.success)
    return {
      success: failed.length === 0,
      results,
      deletedIds: results.filter(item => item.success).map(item => item.id),
      failedIds: failed.map(item => item.id),
      error: failed.length ? `${failed.length} 个回收站项目未能永久删除。` : '',
    }
  })

  ipcMain.handle('recycleBin:emptyTrash', async () => {
    try {
      const items = dbService.listTrash()
      const results = []
      for (const item of items) {
        try {
          await _permanentlyDeleteItem(item)
          await _finalizePermanentlyDeletedItem(item)
          dbService.deleteTrashItem(item.id)
          results.push({ id: item.id, success: true })
        } catch (e) {
          console.error('emptyTrash item failed:', item.id, e.message)
          results.push({ id: item.id, success: false, error: e.message })
        }
      }
      const failed = results.filter(item => !item.success)
      return {
        success: failed.length === 0,
        results,
        deletedIds: results.filter(item => item.success).map(item => item.id),
        failedIds: failed.map(item => item.id),
        error: failed.length ? `${failed.length} 个回收站项目未能永久删除。` : '',
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}
