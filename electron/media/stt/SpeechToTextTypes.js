export const SPEECH_TO_TEXT_PROVIDER_IDS = Object.freeze({
  LOCAL_ASR: 'local_asr',
  OPENAI_WHISPER_COMPATIBLE: 'openai_whisper_compatible',
  ALIYUN_BAILIAN_ASR: 'aliyun_bailian_asr',
})

export const SPEECH_TO_TEXT_INPUT_MODES = Object.freeze({
  LOCAL_FILE: 'local_file',
  PUBLIC_URL: 'public_url',
})

export const SPEECH_TO_TEXT_TIMESTAMP_LEVELS = Object.freeze({
  NONE: 'none',
  SEGMENT: 'segment',
  WORD: 'word',
})

const INPUT_MODES = new Set(Object.values(SPEECH_TO_TEXT_INPUT_MODES))
const TIMESTAMP_LEVELS = new Set(Object.values(SPEECH_TO_TEXT_TIMESTAMP_LEVELS))

export function normalizeSpeechToTextCapabilities(capabilities = {}) {
  const inputModes = [...new Set((capabilities.inputModes || []).filter(value => INPUT_MODES.has(value)))]
  const timestampLevels = [...new Set((capabilities.timestampLevels || []).filter(value => TIMESTAMP_LEVELS.has(value)))]
  return Object.freeze({
    inputModes,
    timestampLevels: timestampLevels.length ? timestampLevels : [SPEECH_TO_TEXT_TIMESTAMP_LEVELS.NONE],
    supportsDiarization: capabilities.supportsDiarization === true,
    supportsHotwords: capabilities.supportsHotwords === true,
    requiresClientChunking: capabilities.requiresClientChunking === true,
    maxDurationMs: Math.max(0, Number(capabilities.maxDurationMs) || 0),
    maxFileBytes: Math.max(0, Number(capabilities.maxFileBytes) || 0),
  })
}

export function assertSpeechToTextProvider(provider) {
  if (!provider?.id || typeof provider.transcribe !== 'function') throw new Error('Invalid speech-to-text provider')
  return provider
}

/**
 * @typedef {Object} SpeechToTextProvider
 * @property {string} id
 * @property {() => object} getCapabilities
 * @property {(input: { mode: 'local_file'|'public_url', localPath?: string, url?: string, language?: string }, config: object, context?: { signal?: AbortSignal, deferAsync?: boolean, onProviderJobSubmitted?: (job: object) => (void|Promise<void>) }) => Promise<SpeechToTextResult>} transcribe
 * @property {(job: object, config: object, context?: object) => Promise<SpeechToTextResult>=} resume
 * @property {(job: object, config: object) => Promise<object>=} cancel
 */

/**
 * @typedef {Object} SpeechToTextResult
 * @property {string} language
 * @property {string} text
 * @property {Array<{ id?: string, startMs?: number, endMs?: number, text: string, speaker?: string|null, confidence?: number|null }>} segments
 * @property {string=} providerJobId
 * @property {string=} providerJobStatus
 * @property {boolean=} pending
 * @property {object=} usage
 * @property {string[]=} warnings
 */
