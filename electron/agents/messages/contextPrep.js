// agents/messages/contextPrep.js — extracted from AgentService.js
// Context path preparation: staging external attachments, decoding images, etc.

import fs from 'node:fs'
import path from 'node:path'
import {
  MAX_VISION_IMAGE_BYTES,
  _decodeImageDataUrl,
  _ensureImageFilename,
  _isImageContextItem,
  _isUserMessage,
  _messageAttachments,
  _toWorkspaceVirtualPath,
  _uniqueDestPath,
  _dateStamp,
} from './messageAdapters.js'

export function prepareMessageAttachments(messages, workRoot, preparedCurrentCtxPaths = [], workDirService = null) {
  const source = messages || []
  const lastUserIndex = (() => {
    for (let i = source.length - 1; i >= 0; i--) {
      if (_isUserMessage(source[i])) return i
    }
    return -1
  })()

  return source.map((message, index) => {
    if (!_isUserMessage(message)) return message
    const rawAttachments = index === lastUserIndex && preparedCurrentCtxPaths?.length
      ? preparedCurrentCtxPaths
      : _messageAttachments(message)
    if (!rawAttachments?.length) return message
    const attachments = index === lastUserIndex && rawAttachments === preparedCurrentCtxPaths
      ? preparedCurrentCtxPaths
      : prepareContextItems(rawAttachments, workRoot, workDirService)
    return { ...message, attachments }
  })
}

export function prepareContextItems(ctxPaths, workRoot, workDirService) {
  if (!ctxPaths?.length || !workRoot) return ctxPaths || []

  const contextDir = path.join(workRoot, 'context', _dateStamp())
  const prepared = []

  for (const item of ctxPaths) {
    if (!item?.path && item?.dataUrl && _isImageContextItem(item)) {
      try {
        const decoded = _decodeImageDataUrl(item.dataUrl)
        if (!decoded) {
          prepared.push(item)
          continue
        }
        if (decoded.buffer.length > MAX_VISION_IMAGE_BYTES) {
          const err = new Error(`图片 ${item.name || '粘贴图片'} 过大，单张图片不能超过 10MB。请压缩后重试。`)
          err.code = 'VISION_IMAGE_TOO_LARGE'
          throw err
        }
        fs.mkdirSync(contextDir, { recursive: true })
        const imageName = _ensureImageFilename(item, decoded.ext)
        const dest = _uniqueDestPath(contextDir, imageName)
        fs.writeFileSync(dest, decoded.buffer)
        prepared.push({
          ...item,
          name: path.basename(dest),
          originalName: item.name || '',
          path: dest,
          isDirectory: false,
          source: item.source || 'attachment',
          accessPath: _toWorkspaceVirtualPath(dest, workRoot),
        })
        console.log('[AgentService] Staged pasted image context item:', item.name || imageName, '→', dest)
      } catch (e) {
        if (e.code === 'VISION_IMAGE_TOO_LARGE') throw e
        console.warn('[AgentService] Could not stage pasted image context item:', item.name || '(pasted image)', e.message)
        prepared.push(item)
      }
      continue
    }

    if (!item?.path) {
      prepared.push(item)
      continue
    }

    const name = item.name || path.basename(item.path)
    const isDirectory = !!(item.isDirectory || item.type === 'folder' || item.type === 'local_folder')

    try {
      const resolved = workDirService.resolveAndValidate(item.path, 'any')
      prepared.push({
        ...item,
        name,
        path: resolved,
        isDirectory,
        source: item.source || 'workspace',
        accessPath: _toWorkspaceVirtualPath(resolved, workRoot),
      })
      continue
    } catch {
      // Outside the authorized workspace: stage it as a temporary context attachment.
    }

    try {
      fs.mkdirSync(contextDir, { recursive: true })
      const dest = _uniqueDestPath(contextDir, name)
      if (isDirectory) {
        fs.cpSync(item.path, dest, { recursive: true })
      } else {
        fs.copyFileSync(item.path, dest)
      }
      prepared.push({
        ...item,
        name: path.basename(dest),
        originalPath: item.path,
        path: dest,
        isDirectory,
        source: item.source || 'attachment',
        accessPath: _toWorkspaceVirtualPath(dest, workRoot),
      })
      console.log('[AgentService] Staged external context item:', name, '→', dest)
    } catch (e) {
      console.warn('[AgentService] Could not stage context item:', name, e.message)
      prepared.push(item)
    }
  }

  return prepared
}

