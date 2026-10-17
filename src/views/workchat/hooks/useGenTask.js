import { parseModelRef } from '@/utils/modelRef'
import { readableGenerationContexts } from '@/utils/generationContext'
import { BASE_URL } from '@/apis/http'
import { useMessage } from '@/components/MsMessage/useMessage'

/**
 * Generation task logic: provider resolution, cloud context building,
 * and modal submit handlers for mindmap/graph/flashcard/quiz/etc.
 *
 * @param {object} opts - { settingsStore, agentsStore, userStore, convStore,
 *   currentCtxItems, selectedWikiIds, selectedWikiRefs, currentGroupId, currentConvId,
 *   kbEnabled, activeSourceId, activeExternalKb, activeSourceInfo, closeModalForTool }
 */
export function useGenTask(opts) {
  const {
    settingsStore, agentsStore, userStore, convStore,
    currentCtxItems, selectedWikiIds, selectedWikiRefs,
    currentGroupId, currentConvId,
    kbEnabled, activeSourceId, activeExternalKb, activeSourceInfo,
    closeModalForTool,
  } = opts
  const msg = useMessage()

function providerInfoFromModelRef(modelRef) {
  const parsed = parseModelRef(modelRef)
  if (!parsed.modelId) return null

  const modelUsable = m => m?.enabled && m?.tier !== 'embedding'
  if (parsed.scoped) {
    const provider = settingsStore.providers.find(p => p.id === parsed.providerId && p.enabled && providerConfigured(p))
    const model = provider?.models?.find(m => m.id === parsed.modelId && modelUsable(m))
    return provider && model
      ? { providerId: provider.id, apiFormat: providerApiFormat(provider), apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: model.id, modelCtx: model.ctx || model.context_window || model.contextWindow || '', modelHasVision: !!model.capabilities?.vision }
      : null
  }

  for (const provider of settingsStore.providers) {
    if (!provider.enabled || !providerConfigured(provider)) continue
    const model = provider.models?.find(m => m.id === parsed.modelId && modelUsable(m))
    if (model) return { providerId: provider.id, apiFormat: providerApiFormat(provider), apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: model.id, modelCtx: model.ctx || model.context_window || model.contextWindow || '', modelHasVision: !!model.capabilities?.vision }
  }
  return null
}

function resolveGenerationProviderInfo() {
  const refs = [
    settingsStore.defaultModels?.agent,
    settingsStore.defaultModels?.chat,
    settingsStore.defaultModels?.skill,
  ].filter(Boolean)

  for (const ref of refs) {
    const info = providerInfoFromModelRef(ref)
    if (info) return info
  }

  for (const provider of settingsStore.providers) {
    if (!provider.enabled || !providerConfigured(provider)) continue
    const model = provider.models?.find(m => m.enabled && m.tier !== 'embedding')
    if (model) return { providerId: provider.id, apiFormat: providerApiFormat(provider), apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: model.id, modelCtx: model.ctx || model.context_window || model.contextWindow || '', modelHasVision: !!model.capabilities?.vision }
  }
  return null
}

function resolveVisionProviderInfo() {
  const info = providerInfoFromModelRef(settingsStore.defaultModels?.vision)
  return info?.modelHasVision ? info : null
}

function providerConfigured(provider) {
  return settingsStore.providerConfigured
    ? settingsStore.providerConfigured(provider)
    : !!(provider?.baseUrl && provider.apiKey)
}

function providerApiFormat(provider) {
  return provider?.apiFormat || (provider?.id === 'anthropic' ? 'anthropic' : 'openai')
}

function cloneToolProviderConfigs() {
  try {
    return JSON.parse(JSON.stringify(agentsStore.toolProviderConfigMap || {}))
  } catch (_) {
    return {}
  }
}

function normalizeGenerationWebSearch(params = {}) {
  const raw = params?.webSearch
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { enabled: raw.enabled === true, provider: raw.provider || 'auto' }
  }
  return {
    enabled: params?.enableWebSearch === true || params?.enable_web_search === true,
    provider: 'auto',
  }
}

function resolveCloudBaseUrl() {
  const envBase = import.meta.env.VITE_CLOUD_BASE_URL
  if (envBase) return envBase
  if (import.meta.env.DEV) return 'http://localhost:8000'
  if (BASE_URL) return BASE_URL
  if (typeof window !== 'undefined' && /^https?:/i.test(window.location.origin)) return window.location.origin
  return ''
}

function normalizePptOutputFormat(format) {
  return String(format || '').includes('pptx') ? 'pptx' : 'html'
}

function buildCloudContext(ctxItems) {
  if (!kbEnabled.value) return {}
  const defaultKbIds = new Set()
  const defaultDocIds = new Set()
  for (const item of ctxItems || []) {
    if (item?.type === 'cloud_kb' && item.kbId) {
      defaultKbIds.add(item.kbId)
    } else if (item?.type === 'cloud_doc') {
      if (item.kbId) defaultKbIds.add(item.kbId)
      if (item.docId) defaultDocIds.add(item.docId)
    }
  }
  return {
    baseUrl: resolveCloudBaseUrl(),
    token: userStore.token || '',
    defaultKbIds: [...defaultKbIds],
    defaultDocIds: [...defaultDocIds],
    activeSourceId: activeSourceInfo.value?.type === 'mcp' ? '' : (activeSourceId.value || activeExternalKb.value?.sourceId || ''),
    externalKbId: activeExternalKb.value?.kbId || '',
  }
}

// Handle modal submit for background generation tasks
async function handleGenTaskSubmit(payload) {
  const { toolId, mode } = payload || {}
  // Close the corresponding modal
  closeModalForTool(toolId)


  if (!window.electronAPI?.genTasks?.create) {
    msg.error('生成服务未就绪')
    return
  }

  if (mode === 'cloud' && !userStore.token) {
    msg.error('请先登录云端账号')
    return
  }

  const providerInfo = resolveGenerationProviderInfo()

  if (mode === 'local' && !providerInfo) {
    msg.error('请先在设置中配置可用的默认模型 Provider')
    return
  }

  const ctxSnapshot = JSON.parse(JSON.stringify(currentCtxItems.value || []))
  const needsTopicOrSource = ['mindmap', 'graph', 'flashcard', 'quiz', 'chart', 'qa', 'glossary', 'cheatsheet', 'studycard'].includes(toolId)
  if (needsTopicOrSource && !String(payload.topic || '').trim() && !readableGenerationContexts(ctxSnapshot).length && !selectedWikiRefs.value.length) {
    msg.warning('请填写主题，或选择具体文件、知识库或 Wiki')
    return
  }

  const webSearch = normalizeGenerationWebSearch(payload.params || {})

  const req = {
    toolId,
    mode,
    topic: payload.topic || '',
    params: payload.params || {},
    groupId: currentGroupId.value,
    conversationId: currentConvId.value || '',
    ctxItems: ctxSnapshot,
    wikiContext: { enabled: selectedWikiRefs.value.length > 0, mode: 'selected', wikiIds: [...selectedWikiIds.value] },
    sourceScope: {
      wikiIds: [...selectedWikiIds.value],
      wikiRefs: JSON.parse(JSON.stringify(selectedWikiRefs.value)),
      web: webSearch,
    },
    toolProviderConfigs: cloneToolProviderConfigs(),
    cloudContext: buildCloudContext(ctxSnapshot),
    visionModel: resolveVisionProviderInfo(),
    ...(providerInfo || {}),
  }

  const res = await window.electronAPI.genTasks.create(req)
  if (!res?.success) {
    msg.error(res?.error || '任务创建失败')
    return
  }

  // Notify right-panel to refresh task list
  window.dispatchEvent(new CustomEvent('reviva:gen-task-created', { detail: res.task }))
  msg.success(`已开始生成${{ mindmap: '思维导图', graph: '知识图谱', flashcard: '闪卡', studycard: '知识卡片', quiz: '测验', chart: '图表', qa: 'Q&A 问答卡', glossary: '术语表', cheatsheet: '速查表', podcast: '播客', research: '深度研究', ppt: 'PPT', studyguide: '学习指南' }[toolId] || ''}`)
}

async function handleResearchStart({ requirement, settings }) {
  const ctxItems = currentCtxItems.value
  const sourceItems = [...ctxItems, ...selectedWikiRefs.value]
  const fileNames = sourceItems.map(i => i.name || i.path).join('、')
  const mode = settings?.mode === 'cloud' ? 'cloud' : 'local'
  if (mode === 'local' && !sourceItems.length) {
    msg.warning('请先选择要研究的文件、文件夹、知识库或 Wiki')
    return
  }
  await handleGenTaskSubmit({
    toolId: 'research',
    mode,
    topic: requirement || `请对以下资料进行深度研究分析：${fileNames}`,
    params: mode === 'cloud'
      ? {
          outputFormats: ['markdown', 'html'],
          detailLevel: 'standard',
          language: 'zh-CN',
          enable_web_search: settings?.enableWebSearch !== false,
        }
      : {
          outputFormats: ['md', 'html'],
          enable_web_search: settings?.enableWebSearch !== false,
        },
  })
}

async function handleStudyguideStart({ requirement, guideType, settings }) {
  const ctxItems = currentCtxItems.value
  const sourceItems = [...ctxItems, ...selectedWikiRefs.value]
  const fileNames = sourceItems.map(i => i.name || i.path).join('、')
  const mode = settings?.mode === 'cloud' ? 'cloud' : 'local'
  if (mode === 'local' && !sourceItems.length) {
    msg.warning('请先选择要学习的文件、文件夹、知识库或 Wiki')
    return
  }
  await handleGenTaskSubmit({
    toolId: 'studyguide',
    mode,
    topic: requirement || `请根据以下资料生成学习指南：${fileNames}`,
    params: mode === 'cloud'
      ? {
          outputFormats: ['markdown', 'html'],
          guideType: guideType || 'comprehensive',
          detailLevel: 'standard',
          language: 'zh-CN',
          enable_web_search: settings?.enableWebSearch !== false,
        }
      : {
          outputFormats: ['md', 'html'],
          guideType: guideType || 'comprehensive',
          enable_web_search: settings?.enableWebSearch !== false,
        },
  })
}

async function handlePptStart({ requirement, settings }) {
  const ctxItems = currentCtxItems.value
  const sourceItems = [...ctxItems, ...selectedWikiRefs.value]
  const fileNames = sourceItems.map(i => i.name || i.path).join('、')
  const mode = settings?.mode === 'cloud' ? 'cloud' : 'local'
  const outputFormat = normalizePptOutputFormat(settings?.format)
  if (mode === 'local' && !sourceItems.length) {
    msg.warning('请先选择要处理的文件、文件夹、知识库或 Wiki')
    return
  }
  await handleGenTaskSubmit({
    toolId: 'ppt',
    mode,
    topic: requirement || `请根据以下资料生成演示文稿：${fileNames}`,
    params: mode === 'cloud'
      ? {
          scene: settings?.scene || 'auto',
          outputFormat,
          pages: settings?.pages || 12,
          stylePreset: settings?.stylePreset || 'auto',
          customPrompt: settings?.customPrompt || '',
          enable_web_search: !!settings?.enableWebSearch,
        }
      : {
          scene: settings?.scene || 'auto',
          format: outputFormat === 'pptx' ? 'pptx-local' : 'html',
          pages: settings?.pages || 12,
          enable_web_search: !!settings?.enableWebSearch,
        },
  })
}

  return {
    buildCloudContext,
    handleGenTaskSubmit,
    handleResearchStart,
    handleStudyguideStart,
    handlePptStart,
  }
}
