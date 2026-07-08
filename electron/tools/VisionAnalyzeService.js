import fs from 'node:fs'
import path from 'node:path'
import { HumanMessage } from '@langchain/core/messages'
import { createVfsPathResolver } from '../security/VfsPathResolver.js'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}
const MAX_VISION_IMAGES = 8
const MAX_VISION_IMAGE_BYTES = 10 * 1024 * 1024

function messageContentToText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part
      if (typeof part?.text === 'string') return part.text
      return ''
    }).filter(Boolean).join('\n')
  }
  return ''
}

export class VisionAnalyzeService {
  constructor({ workDirService, createModel }) {
    this._workDirService = workDirService
    this._createModel = createModel
  }

  async analyze(args = {}, runContext = {}) {
    const vision = runContext?.vision || {}
    const currentVisionModel = vision.modelHasVision && vision.providerId && vision.model ? vision : null
    const defaultVisionModel = vision.defaultModel?.modelHasVision && vision.defaultModel.providerId && vision.defaultModel.model
      ? vision.defaultModel
      : null
    const activeVisionModel = currentVisionModel || defaultVisionModel
    if (!activeVisionModel) {
      return {
        success: false,
        code: 'VISION_UNAVAILABLE',
        message: '当前未配置可用的视觉理解模型。可以展示图片，但不能进行视觉分析。',
      }
    }
    if (!activeVisionModel.providerId || !activeVisionModel.model) {
      return {
        success: false,
        code: 'VISION_MODEL_NOT_CONFIGURED',
        message: '缺少视觉理解模型配置。',
      }
    }

    const rawPaths = [
      args.path,
      ...(Array.isArray(args.paths) ? args.paths : []),
    ].map(item => String(item || '').trim()).filter(Boolean)
    const uniquePaths = [...new Set(rawPaths)]
    if (!uniquePaths.length) {
      return { success: false, code: 'MISSING_PATH', message: 'vision_analyze 缺少 path 或 paths 参数。' }
    }

    const maxImages = Math.min(Math.max(Number(args.maxImages) || 4, 1), MAX_VISION_IMAGES)
    const selectedPaths = uniquePaths.slice(0, maxImages)
    const skipped = Math.max(uniquePaths.length - selectedPaths.length, 0)
    const resolver = createVfsPathResolver({ workDirService: this._workDirService })
    const images = []

    for (const inputPath of selectedPaths) {
      let resolved
      let virtualPath
      try {
        const result = resolver.resolve(inputPath, {
          op: 'read',
          toolName: 'vision_analyze',
          agentDirName: runContext?.agentEnglishName || '_shared',
          boundSkillIds: runContext?.boundSkillIds || [],
          wikiContext: runContext?.wikiContext || {},
        })
        resolved = result.realPath
        virtualPath = result.virtualPath
      } catch (e) {
        return { success: false, code: 'PATH_NOT_ALLOWED', message: `安全限制：${e.message}`, path: inputPath }
      }

      if (!fs.existsSync(resolved)) {
        return { success: false, code: 'FILE_NOT_FOUND', message: '图片文件不存在。', path: virtualPath || inputPath }
      }
      const ext = path.extname(resolved).toLowerCase()
      if (!IMAGE_EXTS.has(ext)) {
        return { success: false, code: 'UNSUPPORTED_IMAGE_FORMAT', message: `不支持的图片格式：${ext || '(无扩展名)'}`, path: virtualPath || inputPath }
      }
      const stat = fs.statSync(resolved)
      if (!stat.isFile()) {
        return { success: false, code: 'INVALID_IMAGE_PATH', message: '图片路径必须指向文件。', path: virtualPath || inputPath }
      }
      if (stat.size > MAX_VISION_IMAGE_BYTES) {
        return { success: false, code: 'IMAGE_TOO_LARGE', message: '单张图片不能超过 10MB。', path: virtualPath || inputPath, size: stat.size }
      }

      const mimeType = IMAGE_MIME[ext] || 'image/png'
      images.push({
        inputPath,
        path: virtualPath || inputPath,
        realPath: resolved,
        mimeType,
        data: fs.readFileSync(resolved).toString('base64'),
        size: stat.size,
      })
    }

    const question = String(args.question || '').trim() || '请描述图片中的主要内容，并提取与当前任务相关的信息。'
    const context = String(args.context || '').trim()
    const mode = ['auto', 'per_image', 'compare'].includes(args.mode) ? args.mode : 'auto'
    const modeText = {
      auto: '综合分析这些图片，重点回答问题。',
      per_image: '请逐张图片说明关键内容，再给出简短总结。',
      compare: '请比较这些图片之间的差异、联系和共同结论。',
    }[mode]
    const prompt = [
      '你是图片理解工具。请只根据图片可见内容和给定上下文回答，不要编造不可见信息。',
      `任务：${question}`,
      context ? `上下文：${context}` : '',
      `分析模式：${modeText}`,
      `图片路径：\n${images.map((item, index) => `${index + 1}. ${item.path}`).join('\n')}`,
    ].filter(Boolean).join('\n\n')

    try {
      const model = this._createModel(
        activeVisionModel.providerId,
        activeVisionModel.apiKey,
        activeVisionModel.baseUrl,
        activeVisionModel.model,
        {
          apiFormat: activeVisionModel.apiFormat,
          streaming: false,
          temperature: 0.2,
          maxTokens: 2048,
        },
      )
      const content = [
        { type: 'text', text: prompt },
        ...images.map(item => ({
          type: 'image',
          source_type: 'base64',
          mime_type: item.mimeType,
          data: item.data,
        })),
      ]
      const response = await model.invoke([new HumanMessage({ content })])
      return {
        success: true,
        paths: images.map(item => item.path),
        skipped,
        question,
        mode,
        model: activeVisionModel.model,
        providerId: activeVisionModel.providerId,
        modelSource: activeVisionModel === vision ? 'agent' : 'default_vision',
        content: messageContentToText(response?.content).trim(),
        usage: response?.usage_metadata || response?.response_metadata?.tokenUsage || null,
      }
    } catch (e) {
      return {
        success: false,
        code: 'VISION_ANALYZE_FAILED',
        message: e?.message || '图片理解失败。',
        paths: images.map(item => item.path),
      }
    }
  }
}
