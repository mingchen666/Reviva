const MB = 1024 * 1024
const GB = 1024 * 1024 * 1024
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

export const ALIYUN_ASR_PROTOCOLS = Object.freeze({
  ASYNC_FILE_URLS: 'async_file_urls',
  ASYNC_FILE_URL: 'async_file_url',
  QWEN_FLASH_CHAT: 'qwen_flash_chat',
  FUN_ASR_FLASH: 'fun_asr_flash',
})

export const ALIYUN_ASR_MODEL_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: 'fun-asr',
    name: 'Fun-ASR',
    description: '长音视频转写，支持时间戳与说话人分离',
    recommended: true,
    preset: true,
    protocol: ALIYUN_ASR_PROTOCOLS.ASYNC_FILE_URLS,
    inputModes: Object.freeze(['public_url']),
    maxFileBytes: 2 * GB,
    maxDurationMs: 12 * HOUR,
    supportsDiarization: true,
    diarizationRecommendedMaxDurationMs: 2 * HOUR,
  }),
  Object.freeze({
    id: 'qwen3-asr-flash-filetrans',
    name: 'Qwen3-ASR-Flash-Filetrans',
    description: '长音频异步转写，支持句级和字级时间戳',
    recommended: false,
    preset: true,
    protocol: ALIYUN_ASR_PROTOCOLS.ASYNC_FILE_URL,
    inputModes: Object.freeze(['public_url']),
    maxFileBytes: 2 * GB,
    maxDurationMs: 12 * HOUR,
    supportsDiarization: false,
    diarizationRecommendedMaxDurationMs: 0,
  }),
  Object.freeze({
    id: 'paraformer-v2',
    name: 'Paraformer V2',
    description: '稳定转写，支持时间戳与说话人分离',
    recommended: false,
    preset: true,
    protocol: ALIYUN_ASR_PROTOCOLS.ASYNC_FILE_URLS,
    inputModes: Object.freeze(['public_url']),
    maxFileBytes: 2 * GB,
    maxDurationMs: 12 * HOUR,
    supportsDiarization: true,
    diarizationRecommendedMaxDurationMs: 2 * HOUR,
  }),
  Object.freeze({
    id: 'qwen3-asr-flash',
    name: 'Qwen3-ASR-Flash',
    description: '短音频同步转写，支持公网 URL 或本地 Base64 输入',
    recommended: false,
    preset: false,
    protocol: ALIYUN_ASR_PROTOCOLS.QWEN_FLASH_CHAT,
    inputModes: Object.freeze(['local_file', 'public_url']),
    maxFileBytes: 10 * MB,
    maxDurationMs: 5 * MINUTE,
    supportsDiarization: false,
    diarizationRecommendedMaxDurationMs: 0,
  }),
  Object.freeze({
    id: 'fun-asr-flash-2026-06-15',
    name: 'Fun-ASR-Flash 2026-06-15',
    description: '日期快照短音频同步模型',
    recommended: false,
    preset: false,
    protocol: ALIYUN_ASR_PROTOCOLS.FUN_ASR_FLASH,
    inputModes: Object.freeze(['local_file', 'public_url']),
    maxFileBytes: 2 * GB,
    maxLocalFileBytes: 10 * MB,
    maxDurationMs: 5 * MINUTE,
    supportsDiarization: false,
    diarizationRecommendedMaxDurationMs: 0,
  }),
])

const MODEL_BY_ID = new Map(ALIYUN_ASR_MODEL_CAPABILITIES.map(model => [model.id, model]))

export const ALIYUN_ASR_PRESET_MODELS = Object.freeze(
  ALIYUN_ASR_MODEL_CAPABILITIES.filter(model => model.preset),
)

export function getAliyunAsrModelCapability(modelId) {
  return MODEL_BY_ID.get(String(modelId || '').trim().toLowerCase()) || null
}

export function formatAliyunAsrLimit(capability) {
  if (!capability) return '自定义模型能力未验证'
  const size = capability.maxFileBytes >= GB
    ? `${Math.round(capability.maxFileBytes / GB)} GB`
    : `${Math.round(capability.maxFileBytes / MB)} MB`
  const duration = capability.maxDurationMs >= HOUR
    ? `${Math.round(capability.maxDurationMs / HOUR)} 小时`
    : `${Math.round(capability.maxDurationMs / MINUTE)} 分钟`
  return `最大 ${size} · 最长 ${duration}`
}
