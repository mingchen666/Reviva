const mediaApi = () => window.electronAPI?.media

export async function registerMedia(sourceInput) {
  return mediaApi()?.register(sourceInput)
}

export async function registerRemoteMedia(url, options = {}) {
  return mediaApi()?.register({
    url,
    sourceType: 'direct_url',
    title: options.title || '',
    owner: options.owner || null,
    expiresAt: options.expiresAt || '',
  })
}

export async function registerAndAnalyzeRemoteMedia(url, sourceOptions = {}, analyzeOptions = {}) {
  return mediaApi()?.registerAndAnalyze({
    url,
    sourceType: 'direct_url',
    title: sourceOptions.title || '',
    owner: sourceOptions.owner || null,
    expiresAt: sourceOptions.expiresAt || '',
  }, analyzeOptions)
}

export async function registerAndAnalyzeMedia(sourceInput, options = {}) {
  return mediaApi()?.registerAndAnalyze(sourceInput, options)
}

export async function resolveMediaOwner(owner) {
  return mediaApi()?.resolveOwner(owner)
}

export async function attachMediaOwner(mediaId, owner) {
  return mediaApi()?.attachOwner(mediaId, owner)
}

export async function analyzeMedia(mediaId, options = {}) {
  return mediaApi()?.analyze(mediaId, options)
}

export async function cancelMediaRun(runId) {
  return mediaApi()?.cancel(runId)
}

export async function getMediaRun(runId) {
  return mediaApi()?.getRun(runId)
}

export async function queryMedia(request) {
  return mediaApi()?.query(request)
}

export async function getMediaHistory(mediaId, options = {}) {
  return mediaApi()?.history(mediaId, options)
}

export async function restoreMediaRun(mediaId, runId) {
  return mediaApi()?.restoreRun(mediaId, runId)
}

export async function exportMediaTranscript(mediaId, options = {}) {
  return mediaApi()?.exportTranscript(mediaId, options)
}

export async function readMediaFrame(mediaId, frameId, options = {}) {
  return mediaApi()?.readFrame(mediaId, frameId, options)
}

export async function checkSpeechProvider(providerId, config = {}) {
  return mediaApi()?.checkSpeechProvider(providerId, config)
}

export async function fetchBilibiliCookieStatus() {
  return mediaApi()?.getBilibiliCookieStatus()
}

export async function storeBilibiliCookie(cookie) {
  return mediaApi()?.saveBilibiliCookie(cookie)
}
