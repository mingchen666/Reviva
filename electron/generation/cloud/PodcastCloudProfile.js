import { artifactType, attachedDocuments, clampInt, titleFromTopic } from './common.js'

const STEP_LABELS = {
  queued: '云端排队中',
  starting: '启动云端播客执行器',
  collecting_inputs: '读取输入资料',
  retrieving_context: '检索资料与上下文',
  planning: '规划播客脚本',
  writing_script: '撰写播客脚本',
  synthesizing_audio: '合成播客音频',
  mixing_audio: '混音与整理音频',
  saving_artifacts: '保存云端产物',
  completed: '云端播客完成',
  failed: '云端播客失败',
}

function normalizeType(value) {
  const raw = String(value || 'educational').toLowerCase()
  return ['educational', 'debate', 'interview', 'storytelling', 'news_analysis'].includes(raw)
    ? raw
    : 'educational'
}

function normalizeLanguage(value) {
  const raw = String(value || 'zh-CN').trim()
  if (/^en/i.test(raw) || raw === 'English') return 'en-US'
  return 'zh-CN'
}

function normalizeDuration(value) {
  const raw = String(value || 'standard').toLowerCase()
  return ['brief', 'standard', 'deep'].includes(raw) ? raw : 'standard'
}

function normalizeVoice(voice, speakerCount) {
  const mode = String(voice?.mode || 'auto').toLowerCase() === 'custom' ? 'custom' : 'auto'
  const rawSpeakerVoices = voice?.speaker_voices || voice?.speakerVoices
  const speakerVoices = mode === 'custom' && rawSpeakerVoices && typeof rawSpeakerVoices === 'object'
    ? rawSpeakerVoices
    : {}
  const normalizedVoices = {}
  for (let i = 1; i <= speakerCount; i += 1) {
    const key = `Person${i}`
    if (speakerVoices[key]) normalizedVoices[key] = String(speakerVoices[key])
  }
  return {
    mode,
    speaker_voices: mode === 'custom' ? normalizedVoices : {},
  }
}

export const podcastCloudProfile = {
  toolId: 'podcast',
  taskPath: '/business/podcast/tasks',
  defaultAgentEnglishName: 'podcast-generator',
  label: '播客',
  artifactType: 'podcast',
  artifactColor: 'agent',

  buildRequest({ topic, params, localFiles, knowledgeBase }) {
    const speakerCount = clampInt(params.num_speakers || params.speakerCount || 2, 1, 6)
    return {
      title: titleFromTopic(params.title || topic),
      topic: String(topic || params.topic || '').trim(),
      podcast_type: normalizeType(params.podcast_type || params.podcastType),
      num_speakers: speakerCount,
      language: normalizeLanguage(params.language),
      duration_level: normalizeDuration(params.duration_level || params.durationLevel),
      enable_web_search: !!params.enable_web_search || !!params.enableWebSearch,
      knowledge_base: knowledgeBase,
      voice: normalizeVoice(params.voice, speakerCount),
      attached_documents: attachedDocuments(localFiles),
    }
  },

  selectArtifacts({ activeArtifacts }) {
    return activeArtifacts.filter(a => {
      const name = String(a.name || '').toLowerCase()
      const mime = String(a.mime_type || '').toLowerCase()
      const type = artifactType(a)
      if (type === 'TEXT' || type === 'JSON') return true
      if (type !== 'FILE') return false
      return (
        /\.(mp3|wav|m4a|aac|ogg|flac|txt|json)$/i.test(name)
        || mime.startsWith('audio/')
        || mime.includes('text/plain')
        || mime.includes('json')
      )
    })
  },

  stepLabel(step) {
    return STEP_LABELS[String(step || '')] || ''
  },
}
