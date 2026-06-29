import { artifactType, attachedDocuments, titleFromTopic } from './common.js'

const STEP_LABELS = {
  queued: '云端排队中',
  starting: '启动云端执行器',
  collecting_inputs: '读取输入资料',
  planning: '规划研究问题',
  searching_web: '联网搜索',
  reading_sources: '读取来源资料',
  searching_followup: '补充搜索',
  generating_report: '生成研究报告',
  generating_infographics: '生成信息图',
  designing_html_report: '生成 HTML 报告',
  saving_artifacts: '保存云端产物',
  completed: '云端研究完成',
  failed: '云端研究失败',
}

function normalizeFormats(outputFormats) {
  const raw = Array.isArray(outputFormats) && outputFormats.length ? outputFormats : ['markdown', 'html']
  const mapped = raw.map(v => String(v).toLowerCase() === 'md' ? 'markdown' : String(v).toLowerCase())
    .filter(v => v === 'markdown' || v === 'html')
  return mapped.length ? [...new Set(mapped)] : ['markdown', 'html']
}

export const researchCloudProfile = {
  toolId: 'research',
  taskPath: '/business/deep-research/tasks',
  defaultAgentEnglishName: 'deep-researcher',
  label: '深度研究',
  artifactType: 'research',
  artifactColor: 'sky',

  buildRequest({ topic, params, localFiles, knowledgeBase }) {
    return {
      title: titleFromTopic(topic),
      query: String(topic || '').trim(),
      detail_level: params.detailLevel || params.depth || 'standard',
      language: params.language && params.language !== 'auto' ? params.language : 'zh-CN',
      enable_web_search: params.enable_web_search !== undefined
        ? !!params.enable_web_search
        : params.enableWebSearch !== false,
      knowledge_base: knowledgeBase,
      report: {
        format: normalizeFormats(params.outputFormats),
        include_sources: params.includeSources !== false,
        include_infographics: params.includeInfographics !== false,
      },
      attached_documents: attachedDocuments(localFiles),
    }
  },

  selectArtifacts({ activeArtifacts }) {
    return activeArtifacts.filter(a => {
      const name = String(a.name || '').toLowerCase()
      const mime = String(a.mime_type || '').toLowerCase()
      const type = artifactType(a)
      if (type !== 'TEXT' && type !== 'FILE') return false
      return (
        name.endsWith('.md')
        || name.endsWith('.markdown')
        || name.endsWith('.html')
        || name.endsWith('.htm')
        || mime.includes('markdown')
        || mime.includes('html')
      )
    })
  },

  stepLabel(step) {
    return STEP_LABELS[String(step || '')] || ''
  },
}
