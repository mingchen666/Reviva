import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FALLBACK_TOOLSETS = [
  {
    id: 'ffmpeg',
    name: 'FFmpeg 工具集',
    routerTool: 'ffmpeg_tool',
    category: 'media',
    requires: ['ffmpeg', 'ffprobe'],
    operations: [
      { id: 'probe', name: '读取媒体信息' },
      { id: 'extract_audio', name: '提取音频' },
      { id: 'extract_subtitles', name: '提取字幕' },
      { id: 'extract_frames', name: '抽帧/截图' },
      { id: 'thumbnail', name: '生成封面图' },
      { id: 'clip', name: '截取片段' },
    ],
  },
  {
    id: 'pandoc',
    name: 'Pandoc 工具集',
    routerTool: 'pandoc_tool',
    category: 'document',
    requires: ['pandoc'],
    operations: [
      { id: 'formats', name: '查看支持格式' },
      { id: 'convert', name: '转换文档格式' },
    ],
  },
  {
    id: 'manim',
    name: 'Manim 动画工具集',
    routerTool: 'manim_tool',
    category: 'media',
    requires: ['manim', 'ffmpeg'],
    operations: [
      { id: 'check', name: '检查 Manim 环境' },
      { id: 'list_scenes', name: '列出 Scene' },
      { id: 'render', name: '渲染动画' },
    ],
  },
  {
    id: 'office',
    name: 'OfficeCLI 创建编辑工具集',
    routerTool: 'office_write',
    category: 'document',
    requires: ['officecli'],
    operations: [
      { id: 'help', name: '查询 OfficeCLI schema' },
      { id: 'create', name: '创建 Office 文件' },
      { id: 'edit', name: '编辑 Office 文件副本' },
    ],
  },
]

function _defaultManifestPath() {
  if (process.env.APP_ROOT) {
    return path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'tools', 'builtin-tools.json')
  }
  if (process.resourcesPath) {
    return path.join(process.resourcesPath, 'builtin-assets', 'tools', 'builtin-tools.json')
  }
  return path.resolve(__dirname, '..', 'builtin-assets', 'tools', 'builtin-tools.json')
}

function _normalizeToolset(raw) {
  if (!raw?.id || !raw?.routerTool || !Array.isArray(raw.operations)) return null
  const operations = raw.operations
    .filter(op => op?.id)
    .map(op => ({
      id: String(op.id),
      name: op.name || op.id,
      description: op.description || '',
    }))
  if (!operations.length) return null
  return {
    id: String(raw.id),
    name: raw.name || raw.id,
    routerTool: String(raw.routerTool),
    category: raw.category || '',
    requires: Array.isArray(raw.requires) ? raw.requires.map(String) : [],
    defaultEnabled: !!raw.defaultEnabled,
    operations,
  }
}

export class ToolsetRegistry {
  constructor(manifestPath = _defaultManifestPath()) {
    this._manifestPath = manifestPath
    this._toolsets = null
  }

  listToolsets() {
    if (this._toolsets) return this._toolsets
    this._toolsets = this._loadToolsets()
    return this._toolsets
  }

  getToolset(id) {
    return this.listToolsets().find(t => t.id === id) || null
  }

  resolveRouterTools(toolIds) {
    const ids = Array.isArray(toolIds) ? toolIds.filter(id => typeof id === 'string') : []
    const idSet = new Set(ids)
    const out = []

    for (const toolset of this.listToolsets()) {
      const allOps = toolset.operations.map(op => op.id)
      const allowed = new Set()

      if (idSet.has(toolset.routerTool) || idSet.has(`${toolset.id}:*`)) {
        allOps.forEach(op => allowed.add(op))
      } else {
        for (const op of allOps) {
          if (idSet.has(`${toolset.id}:${op}`)) allowed.add(op)
        }
      }

      if (allowed.size) {
        out.push({
          ...toolset,
          allowedOperations: [...allowed],
        })
      }
    }

    return out
  }

  isOperationAllowed(toolsetId, operation, allowedOperations = []) {
    const toolset = this.getToolset(toolsetId)
    if (!toolset) return false
    if (!toolset.operations.some(op => op.id === operation)) return false
    return allowedOperations.includes(operation)
  }

  _loadToolsets() {
    try {
      if (fs.existsSync(this._manifestPath)) {
        const raw = JSON.parse(fs.readFileSync(this._manifestPath, 'utf-8'))
        const toolsets = Array.isArray(raw?.toolsets)
          ? raw.toolsets.map(_normalizeToolset).filter(Boolean)
          : []
        if (toolsets.length) return toolsets
      }
    } catch (err) {
      console.warn('[ToolsetRegistry] Failed to load builtin toolsets:', err.message)
    }
    return FALLBACK_TOOLSETS
  }
}
