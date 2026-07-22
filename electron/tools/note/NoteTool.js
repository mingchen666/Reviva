import { tool } from 'langchain'
import { z } from 'zod'

const READ_ACTIONS = new Set(['list', 'get'])
const WRITE_ACTIONS = new Set(['create', 'update', 'delete', 'create_folder'])

function result(success, data = {}, code = '', message = '') {
  return {
    success,
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...data,
  }
}

function toolError(code, message, details = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

function requireValue(value, name) {
  const normalized = String(value || '').trim()
  if (!normalized) throw toolError('INVALID_ARGUMENT', `note_tool 缺少参数：${name}`, { parameter: name })
  return normalized
}

function checkPermission(action, context = {}) {
  const permission = READ_ACTIONS.has(action) ? 'noteRead' : 'noteWrite'
  if (!context.permissions?.[permission]) {
    throw toolError('NOTE_PERMISSION_DENIED', `当前 Agent 未开启 ${permission} 权限。`, { action, permission })
  }
}

function folderSummary(folder = {}) {
  return {
    id: folder.id || '',
    parent_id: folder.parent_id || '',
    name: folder.name || '',
    path: folder.path || '',
    created_at: folder.created_at || '',
    updated_at: folder.updated_at || '',
    chain: Array.isArray(folder.chain) ? folder.chain : [],
  }
}

function noteSummary(service, note = {}, { includeContent = false, maxChars = 30000 } = {}) {
  const folder = service.getFolderDescriptor(note.folder_id || '')
  const content = String(note.content || '')
  const clipped = includeContent && content.length > maxChars
  return {
    id: note.id || '',
    folder_id: note.folder_id || '',
    folder_path: folder.path || '',
    title: note.title || '',
    file_path: String(note.file_path || '').replace(/\\/g, '/'),
    created_at: note.created_at || '',
    updated_at: note.updated_at || '',
    ...(includeContent ? { content: clipped ? content.slice(0, maxChars) : content, truncated: clipped } : {}),
  }
}

async function resolveTargetFolder(service, input = {}, { createMissing = false } = {}) {
  const hasFolderPath = typeof input.folder_path === 'string'
  const hasFolderId = typeof input.folder_id === 'string'
  const byId = hasFolderId ? service.getFolderDescriptor(input.folder_id.trim()) : null
  const byPath = hasFolderPath
    ? await service.resolveFolderPath(input.folder_path, { createMissing: byId ? false : createMissing })
    : null

  if (byId && byPath && byId.id !== byPath.id) {
    throw toolError('FOLDER_TARGET_CONFLICT', 'folder_id 与 folder_path 指向不同目录。', {
      folderId: byId.id,
      folderPath: byPath.path,
    })
  }
  return byId || byPath || service.getFolderDescriptor('')
}

function normalizeError(error) {
  return result(false, error?.details || {}, error?.code || 'NOTE_SYNC_FAILED', error?.message || '笔记操作失败。')
}

export function createNoteTool({ getNoteService, getRunContext } = {}) {
  return tool(
    async (input = {}) => {
      const service = getNoteService?.()
      if (!service) return JSON.stringify(result(false, {}, 'NOTE_SERVICE_UNAVAILABLE', '笔记服务尚未初始化。'))

      const action = String(input.action || '')
      try {
        if (!READ_ACTIONS.has(action) && !WRITE_ACTIONS.has(action)) {
          throw toolError('INVALID_ACTION', `不支持的笔记操作：${action || '(空)'}`, { action })
        }
        checkPermission(action, getRunContext?.() || {})

        if (action === 'list') {
          const folder = await resolveTargetFolder(service, input)
          const contents = await service.listFolderContents(folder.id)
          return JSON.stringify(result(true, {
            action,
            folder: folderSummary(contents.folder),
            folders: contents.folders.map(folderSummary),
            notes: contents.notes.map(note => noteSummary(service, note)),
          }))
        }

        if (action === 'get') {
          const noteId = requireValue(input.note_id, 'note_id')
          const note = await service.getNote(noteId)
          if (!note) throw toolError('NOT_FOUND', `笔记不存在：${noteId}`, { noteId })
          return JSON.stringify(result(true, {
            action,
            note: noteSummary(service, note, { includeContent: true, maxChars: input.max_chars || 30000 }),
          }))
        }

        if (action === 'create') {
          const title = requireValue(input.title, 'title')
          const folder = await resolveTargetFolder(service, input, { createMissing: input.create_folders !== false })
          const note = await service.createNote({
            title,
            content: input.content || '',
            folder_id: folder.id,
          })
          return JSON.stringify(result(true, { action, note: noteSummary(service, note, { includeContent: true }) }))
        }

        if (action === 'update') {
          const noteId = requireValue(input.note_id, 'note_id')
          const existing = await service.getNote(noteId)
          if (!existing) throw toolError('NOT_FOUND', `笔记不存在：${noteId}`, { noteId })
          const patch = {}
          if (input.title !== undefined) patch.title = requireValue(input.title, 'title')
          if (input.content !== undefined) patch.content = String(input.content || '')
          if (input.folder_path !== undefined || input.folder_id !== undefined) {
            const folder = await resolveTargetFolder(service, input, { createMissing: input.create_folders !== false })
            patch.folder_id = folder.id
          }
          if (!Object.keys(patch).length) throw toolError('INVALID_ARGUMENT', 'update 至少需要 title、content 或目标目录。')
          const note = await service.updateNote(noteId, patch)
          if (!note) throw toolError('NOT_FOUND', `笔记不存在：${noteId}`, { noteId })
          return JSON.stringify(result(true, { action, note: noteSummary(service, note, { includeContent: true }) }))
        }

        if (action === 'delete') {
          const noteId = requireValue(input.note_id, 'note_id')
          const existing = await service.getNote(noteId)
          if (!existing) throw toolError('NOT_FOUND', `笔记不存在：${noteId}`, { noteId })
          const deleted = await service.trashNote(noteId)
          if (!deleted?.success) throw toolError('NOTE_SYNC_FAILED', deleted?.error || '笔记移入回收站失败。', { noteId })
          return JSON.stringify(result(true, {
            action,
            note_id: noteId,
            trashed: true,
            trash_id: deleted.data?.id || '',
          }))
        }

        const usesParentForm = input.parent_folder_id !== undefined || input.name !== undefined
        if (usesParentForm && input.folder_path !== undefined) {
          throw toolError('INVALID_ARGUMENT', 'create_folder 不能同时使用 folder_path 和 parent_folder_id/name。')
        }
        if (usesParentForm) {
          const parent = service.getFolderDescriptor(String(input.parent_folder_id || '').trim())
          const name = requireValue(input.name, 'name')
          const folder = await service.createChildFolder(parent.id, name)
          return JSON.stringify(result(true, { action, folder: folderSummary(folder) }))
        }

        const folderPath = requireValue(input.folder_path, 'folder_path')
        const folder = await service.createFolderPath(folderPath)
        return JSON.stringify(result(true, { action, folder: folderSummary(folder) }))
      } catch (error) {
        return JSON.stringify(normalizeError(error))
      }
    },
    {
      name: 'note_tool',
      description: [
        '管理 MindSpace 笔记和嵌套笔记目录。所有写入通过 NoteFileService 同步数据库与 Markdown 文件，不能用 write_file 代替。',
        'action=list/get 需要 noteRead；create/update/delete/create_folder 需要 noteWrite。delete 只移入回收站。',
        'folder_path 是相对 notes 根目录的目录路径，例如 项目/产品A/会议记录；create/update 默认自动逐级创建缺失目录。',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['list', 'get', 'create', 'update', 'delete', 'create_folder']).describe('笔记操作。'),
        note_id: z.string().optional().describe('get/update/delete 的笔记 ID。'),
        title: z.string().optional().describe('create 的标题或 update 的新标题。'),
        content: z.string().optional().describe('Markdown 正文。'),
        folder_path: z.string().optional().describe('相对 notes 根目录的嵌套目录路径。'),
        folder_id: z.string().optional().describe('稳定目录 ID；可替代 folder_path。'),
        parent_folder_id: z.string().optional().describe('create_folder 可指定父目录 ID。'),
        name: z.string().optional().describe('create_folder 使用 parent_folder_id 时的新目录名。'),
        create_folders: z.boolean().optional().default(true).describe('create/update 遇到缺失目录时是否自动逐级创建，默认 true。'),
        max_chars: z.number().int().min(200).max(100000).optional().default(30000).describe('get 返回正文的最大字符数。'),
      }),
    },
  )
}
