import { tool } from 'langchain'
import { z } from 'zod'
import { MEDIA_ERROR_CODES, MediaError, normalizeMediaError } from '../core/MediaErrors.js'

export function createMediaReadTool({ getQueryService, getRunContext } = {}) {
  return tool(
    async (input) => {
      const service = getQueryService?.()
      if (!service) {
        return JSON.stringify({ success: false, code: MEDIA_ERROR_CODES.INTERNAL, message: '媒体读取服务尚未初始化。' })
      }
      try {
        const context = getRunContext?.() || {}
        return JSON.stringify(service.query(input, {
          allowedMediaIds: context.allowedMediaIds || [],
          trustedInternal: false,
        }))
      } catch (error) {
        const normalized = error instanceof MediaError
          ? error
          : normalizeMediaError(error, { message: '读取媒体解析结果失败。' })
        return JSON.stringify(normalized.toPublicResult())
      }
    },
    {
      name: 'media_read',
      description: [
        '只读访问当前运行已授权并已解析的音视频；不能解析、下载、截取、创建文件或枚举其他 mediaId。',
        '先读 metadata。事实/主题用 search，连续内容用 transcript，完整总结优先 chapters，画面问题用 frames。按任务调整 limit、maxChars、时间范围和 contextSegments，证据充分即停止。',
        'search 是混合词法检索并返回相邻上下文；不足时按 recommendedTranscriptRange 补读。cursor 必须原样用于相同条件。保留真实时间戳，timelineAvailable=false 时不得编造。',
      ].join('\n'),
      schema: z.object({
        mediaId: z.string().min(1).describe('当前运行已授权的媒体 ID。'),
        mode: z.enum(['metadata', 'transcript', 'search', 'chapters', 'frames', 'artifacts']).default('metadata').describe('读取模式，默认 metadata。'),
        query: z.string().optional().describe('search 的主题、术语或短句。'),
        startMs: z.number().int().min(0).optional().describe('transcript/frames 起始毫秒。'),
        endMs: z.number().int().min(0).optional().describe('transcript/frames 结束毫秒。'),
        cursor: z.string().optional().describe('相同条件上一页的 nextCursor，原样传回。'),
        limit: z.number().int().min(1).max(500).optional().describe('返回数量上限。'),
        maxChars: z.number().int().min(200).max(30000).optional().describe('transcript/search 单次文本上限。'),
        contextSegments: z.number().int().min(0).max(6).default(2).describe('search 命中前后段数，默认 2。'),
      }),
    },
  )
}
