import { normalizeFilePath } from '@/utils/fileUrl'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'])

function randomId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function baseName(filePath) {
  return normalizeFilePath(filePath || '').split(/[\\/]/).pop() || ''
}

function fileExt(name) {
  const parts = String(name || '').split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

function isImageFile(name, mime = '') {
  return String(mime || '').startsWith('image/') || IMAGE_EXTS.has(fileExt(name))
}

function iconForFile(name, mime = '') {
  const ext = fileExt(name)
  if (isImageFile(name, mime)) return 'ri-image-line'
  if (ext === 'pdf') return 'ri-file-pdf-2-line'
  if (['doc', 'docx'].includes(ext)) return 'ri-file-word-2-line'
  if (['xls', 'xlsx'].includes(ext)) return 'ri-file-excel-2-line'
  if (['ppt', 'pptx'].includes(ext)) return 'ri-file-ppt-2-line'
  if (['txt', 'md', 'markdown', 'csv'].includes(ext)) return 'ri-file-text-line'
  if (['json', 'js', 'ts', 'vue', 'html', 'css', 'py'].includes(ext)) return 'ri-code-line'
  return 'ri-file-line'
}

function imageExtFromType(type) {
  const value = String(type || '').toLowerCase()
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpg'
  if (value.includes('webp')) return 'webp'
  if (value.includes('gif')) return 'gif'
  if (value.includes('bmp')) return 'bmp'
  if (value.includes('svg')) return 'svg'
  return 'png'
}

function imageTimestamp() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function normalizePastedImageName(file) {
  const original = String(file?.name || '').trim()
  const generic = !original || /^image(?:\s*\(\d+\))?\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(original)
  if (!generic) return original
  return `粘贴图片_${imageTimestamp()}_${Math.random().toString(36).slice(2, 6)}.${imageExtFromType(file?.type)}`
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

async function statPath(filePath) {
  if (!filePath || !window.electronAPI?.stat) return null
  try {
    const stat = await window.electronAPI.stat(filePath)
    return stat?.data || stat || null
  } catch {
    return null
  }
}

export function collectFilesFromDataTransfer(dataTransfer) {
  const files = []
  const seen = new Set()

  const addFile = (file) => {
    if (!file) return
    const key = file.path || `${file.name || ''}:${file.size || 0}:${file.type || ''}`
    if (seen.has(key)) return
    seen.add(key)
    files.push(file)
  }

  for (const item of dataTransfer?.items || []) {
    if (item.kind === 'file') addFile(item.getAsFile())
  }

  for (const file of dataTransfer?.files || []) {
    addFile(file)
  }

  return files
}

export function canCreateAttachmentFromFile(file) {
  return !!(file?.path || isImageFile(file?.name, file?.type))
}

export async function createAttachmentContextItem(file, options = {}) {
  const source = options.source || 'attachment'
  const filePath = normalizeFilePath(file?.path || '')
  const fallbackName = baseName(filePath) || file?.name || '未命名文件'
  const mime = file?.type || ''

  if (filePath) {
    const stat = await statPath(filePath)
    const isDirectory = !!stat?.isDirectory
    const name = fallbackName
    const image = !isDirectory && isImageFile(name, mime)
    return {
      type: isDirectory ? 'folder' : image ? 'image' : 'file',
      source,
      id: randomId(isDirectory ? 'folder' : image ? 'img' : 'file'),
      name,
      icon: isDirectory ? 'ri-folder-line' : iconForFile(name, mime),
      path: filePath,
      isDirectory,
      ...(isDirectory ? {} : { size: stat?.size || file?.size || undefined }),
      ...(mime ? { mime } : {}),
    }
  }

  if (options.allowImageDataUrl !== false && isImageFile(file?.name, mime)) {
    const name = normalizePastedImageName(file)
    const dataUrl = await readAsDataUrl(file)
    return {
      type: 'image',
      source,
      id: randomId('img'),
      name,
      icon: 'ri-image-line',
      dataUrl,
      size: file?.size,
      ...(mime ? { mime } : {}),
    }
  }

  return null
}

export async function createAttachmentContextItems(files, options = {}) {
  const result = []
  for (const file of files || []) {
    const item = await createAttachmentContextItem(file, options)
    if (item) result.push(item)
  }
  return result
}
