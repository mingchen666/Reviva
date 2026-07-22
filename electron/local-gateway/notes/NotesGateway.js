import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'
import crypto from 'node:crypto'

function cleanFolder(folder) {
  if (!folder) return null
  return { id: folder.id, parentId: folder.parent_id || folder.parentId || '', name: folder.name || '', icon: folder.icon || '', color: folder.color || '', sortOrder: Number(folder.sort_order ?? folder.sortOrder) || 0, createdAt: folder.created_at || folder.createdAt || '' }
}

function buildTree(folders) {
  const nodes = folders.map(folder => ({ ...cleanFolder(folder), children: [] }))
  const byId = new Map(nodes.map(node => [node.id, node]))
  const roots = []
  for (const node of nodes) {
    const parent = byId.get(node.parentId)
    if (parent && parent.id !== node.id) parent.children.push(node)
    else roots.push(node)
  }
  const sort = items => { items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); items.forEach(item => sort(item.children)) }
  sort(roots)
  return roots
}

export function registerNotesGateway({ server, registry, dbService, noteFileService, sendJson }) {
  registry.registerResource({ id: 'note-folders', description: 'Read nested note folders' })
  registry.registerAction({ id: 'notes.write', description: 'Create and update notes and note folders', riskLevel: 'medium' })
  registry.registerAction({ id: 'notes.trash', description: 'Move notes and note folders to recycle bin', riskLevel: 'medium' })
  server.register('GET', '/api/v1/note-folders', ({ response, url }) => {
    const folders = dbService?.listNoteFolders?.() || []
    const selected = url.searchParams.has('parentId')
      ? folders.filter(folder => String(folder.parent_id || folder.parentId || '') === String(url.searchParams.get('parentId') || ''))
      : folders
    sendJson(response, 200, { data: selected.map(cleanFolder) })
  })
  server.register('GET', '/api/v1/note-folders/tree', ({ response }) => {
    sendJson(response, 200, { data: buildTree(dbService?.listNoteFolders?.() || []) })
  })
  server.register('GET', '/api/v1/note-folders/:id', ({ response, params }) => {
    const data = cleanFolder(dbService?.getNoteFolder?.(params.id))
    if (!data) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'note folder not found', { status: 404 })
    sendJson(response, 200, { data })
  })
  server.register('POST', '/api/v1/note-folders', async ({ response, body }) => {
    const name = String(body?.name || '').trim()
    const parentId = String(body?.parentId || '').trim()
    if (!name) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'name is required', { status: 400 })
    if (parentId && !dbService?.getNoteFolder?.(parentId)) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'parentId is invalid', { status: 400 })
    const folder = await noteFileService?.createNoteFolder?.({ id: `nf_${crypto.randomUUID()}`, parent_id: parentId, name })
    sendJson(response, 201, { data: cleanFolder(folder) })
  })
  server.register('PATCH', '/api/v1/note-folders/:id', async ({ response, params, body }) => {
    if (!dbService?.getNoteFolder?.(params.id)) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'note folder not found', { status: 404 })
    const name = String(body?.name || '').trim()
    if (!name) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'name is required', { status: 400 })
    const folder = await noteFileService?.updateNoteFolder?.(params.id, { name })
    sendJson(response, 200, { data: cleanFolder(folder) })
  })
  server.register('DELETE', '/api/v1/note-folders/:id', async ({ response, params }) => {
    if (!dbService?.getNoteFolder?.(params.id)) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'note folder not found', { status: 404 })
    const result = await noteFileService?.trashNoteFolder?.(params.id)
    sendJson(response, 200, { data: { trashed: true, count: result?.count || 0 } })
  })
  server.register('POST', '/api/v1/notes', async ({ response, body }) => {
    const folderId = String(body?.folderId || '').trim()
    const title = String(body?.title || '').trim()
    const content = String(body?.content || '')
    if (!title) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'title is required', { status: 400 })
    if (folderId && !dbService?.getNoteFolder?.(folderId)) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'folderId is invalid', { status: 400 })
    if (Buffer.byteLength(content) > 10 * 1024 * 1024) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'note content exceeds 10MB', { status: 400 })
    const note = await noteFileService?.createNote?.({ id: `nt_${crypto.randomUUID()}`, folder_id: folderId, title, content })
    const { file_path, ...data } = note || {}
    sendJson(response, 201, { data })
  })
  server.register('PATCH', '/api/v1/notes/:id', async ({ response, params, body }) => {
    if (!dbService?.getNote?.(params.id)) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'note not found', { status: 404 })
    const patch = {}
    if (body?.title !== undefined) {
      const title = String(body.title || '').trim()
      if (!title) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'title cannot be empty', { status: 400 })
      patch.title = title
    }
    if (body?.content !== undefined) {
      const content = String(body.content)
      if (Buffer.byteLength(content) > 10 * 1024 * 1024) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'note content exceeds 10MB', { status: 400 })
      patch.content = content
    }
    if (body?.folderId !== undefined) {
      const folderId = String(body.folderId || '').trim()
      if (folderId && !dbService?.getNoteFolder?.(folderId)) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'folderId is invalid', { status: 400 })
      patch.folder_id = folderId
    }
    const note = await noteFileService?.updateNote?.(params.id, patch)
    const { file_path, ...data } = note || {}
    sendJson(response, 200, { data })
  })
  server.register('DELETE', '/api/v1/notes/:id', async ({ response, params }) => {
    if (!dbService?.getNote?.(params.id)) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'note not found', { status: 404 })
    const result = await noteFileService?.trashNote?.(params.id)
    sendJson(response, 200, { data: { trashed: result?.success === true } })
  })
}
