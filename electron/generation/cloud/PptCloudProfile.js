import { artifactType, attachedDocuments, clampInt, titleFromTopic } from './common.js'

const PPT_SCENE_MAP = {
  business: 'management_report',
  tech: 'tech_sharing',
  academic: 'academic_defense',
  creative: 'pitch_deck',
  education: 'training_course',
  auto: null,
}

const STEP_LABELS = {
  queued: '云端排队中',
  starting: '启动云端执行器',
  collecting_inputs: '读取输入资料',
  retrieving_context: '检索资料与上下文',
  planning_outline: '生成草案大纲',
  retrieving_followup: '补充检索',
  finalizing_outline: '锁定最终大纲',
  rendering_pptx: '渲染 PPTX',
  rendering_html: '渲染 HTML 幻灯片',
  saving_artifacts: '保存云端产物',
  completed: '云端生成完成',
  failed: '云端生成失败',
}

function normalizeOutputFormat(value) {
  const raw = String(value || '').toLowerCase()
  return raw.includes('pptx') ? 'pptx' : 'html'
}

function normalizeScene(scene) {
  const mapped = PPT_SCENE_MAP[String(scene || 'auto')]
  return mapped === undefined ? (scene || null) : mapped
}

function normalizeStylePreset(outputFormat, preset) {
  const raw = String(preset || 'auto').trim() || 'auto'
  if (raw === 'auto') return raw
  if (outputFormat === 'pptx') {
    return /^(free|deck:|layout:|brand:)/.test(raw) ? raw : 'auto'
  }
  return /^(theme:|deck:)/.test(raw) ? raw : 'auto'
}

export const pptCloudProfile = {
  toolId: 'ppt',
  taskPath: '/business/ppt/tasks',
  defaultAgentEnglishName: 'ppt-generator',
  label: 'PPT',
  artifactType: 'presentation',
  artifactColor: 'brand',

  buildRequest({ topic, params, localFiles, knowledgeBase }) {
    const outputFormat = normalizeOutputFormat(params.outputFormat || params.format)
    return {
      title: titleFromTopic(topic),
      query: String(topic || '').trim(),
      scene: normalizeScene(params.scene),
      page_count: clampInt(params.pages || params.pageCount || 12, 3, 40),
      detail_level: params.detailLevel || 'standard',
      language: params.language || 'zh-CN',
      output_format: outputFormat,
      enable_web_search: !!params.enable_web_search || !!params.enableWebSearch,
      style: {
        preset: normalizeStylePreset(outputFormat, params.stylePreset || params.preset || 'auto'),
        custom_prompt: String(params.customPrompt || '').trim() || null,
      },
      knowledge_base: knowledgeBase,
      attached_documents: attachedDocuments(localFiles),
    }
  },

  selectArtifacts({ cloudTask, activeArtifacts }) {
    const mainId = cloudTask?.output_payload?.main_artifact_id
    const main = activeArtifacts.find(a => a.id === mainId)
      || activeArtifacts.find(a => artifactType(a) === 'FILE' && Number(a.display_order) === 10)
      || activeArtifacts.find(a => artifactType(a) === 'FILE')
    return main ? [main] : []
  },

  stepLabel(step) {
    return STEP_LABELS[String(step || '')] || ''
  },
}
