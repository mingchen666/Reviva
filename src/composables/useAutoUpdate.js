import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import { checkUpdateSources } from '@/services/updateSources'

const checking = ref(false)
const updateInfo = ref(null)
const downloading = ref(false)
const downloadProgress = ref(0)
const downloaded = ref(false)
const error = ref(null)
const lastCheckStatus = ref('idle') // idle | checking | available | not-available | error
const lastCheckMessage = ref('')

let listenersReady = false
let consumerCount = 0
let msgApi = null

function setChecking() {
  checking.value = true
  error.value = null
  lastCheckStatus.value = 'checking'
  lastCheckMessage.value = '正在检查更新...'
}

function setAvailable(info) {
  checking.value = false
  downloading.value = false
  downloaded.value = false
  downloadProgress.value = 0
  updateInfo.value = info
  error.value = null
  lastCheckStatus.value = 'available'
  lastCheckMessage.value = `发现新版本 v${info?.version || ''}`
}

function setNotAvailable(version) {
  checking.value = false
  lastCheckStatus.value = 'not-available'
  lastCheckMessage.value = '当前已是最新版本' + (version ? ` v${version}` : '')
  msgApi?.success(lastCheckMessage.value)
}

function setFallbackNotAvailable(version) {
  checking.value = false
  error.value = null
  lastCheckStatus.value = 'not-available'
  lastCheckMessage.value = '当前已是最新版本' + (version ? ` v${version}` : '')
  msgApi?.success(lastCheckMessage.value)
}

function setError(message) {
  checking.value = false
  downloading.value = false
  error.value = message || '更新检查失败'
  lastCheckStatus.value = 'error'
  lastCheckMessage.value = '更新检查失败，可稍后重试或使用备用下载'
  msgApi?.warning('更新检查失败~ ')
  console.log('更新检查失败:' + error.value)
}

async function checkConfiguredSources({ quietError = false, confirmNotAvailable = false } = {}) {
  const result = await checkUpdateSources()
  if (result.updateInfo) {
    setAvailable(result.updateInfo)
    return result.updateInfo
  }
  if (confirmNotAvailable && result.latestInfo && !result.errors?.length) {
    setFallbackNotAvailable(result.latestInfo.version)
    return null
  }
  if (!quietError && result.errors?.length) {
    setError(result.errors[0]?.message || '备用更新源检查失败')
  }
  return null
}

function setupListeners() {
  if (listenersReady || !window.electronAPI?.update) return
  listenersReady = true

  window.electronAPI.update.onChecking(() => {
    setChecking()
  })

  window.electronAPI.update.onAvailable((info) => {
    setAvailable({
      ...info,
      sourceId: info?.sourceId || 'electron-updater',
      sourceName: info?.sourceName || '自动更新通道',
      fallbackUrl: info?.fallbackUrl || '',
      canAutoDownload: true,
    })
  })

  window.electronAPI.update.onNotAvailable(async (info) => {
    const fallbackInfo = await checkConfiguredSources({ quietError: true })
    if (!fallbackInfo) setNotAvailable(info?.version)
  })

  window.electronAPI.update.onProgress((p) => {
    downloadProgress.value = p.percent
  })

  window.electronAPI.update.onDownloaded((info) => {
    downloading.value = false
    downloaded.value = true
    downloadProgress.value = 100
    msgApi?.success('新版本 v' + (info?.version || '') + ' 已下载完成，重启即可安装')
  })

  window.electronAPI.update.onError(async (e) => {
    const fallbackInfo = await checkConfiguredSources({ quietError: true, confirmNotAvailable: true })
    if (fallbackInfo || lastCheckStatus.value === 'not-available') return
    setError(e?.message || '检查更新失败')
  })

  window.electronAPI.update.onManualCheck?.(() => {
    checkForUpdate()
  })
}

async function checkForUpdate() {
  setChecking()
  updateInfo.value = null
  downloaded.value = false
  downloadProgress.value = 0

  if (!window.electronAPI?.update) {
    const fallbackInfo = await checkConfiguredSources({ quietError: true })
    if (!fallbackInfo) {
      setNotAvailable()
      msgApi?.warning('当前环境不支持自动更新，已检查备用发布通道')
    }
    return fallbackInfo
  }

  try {
    const result = await window.electronAPI.update.check()
    if (result?.skipped) {
      const fallbackInfo = await checkConfiguredSources({ quietError: true, confirmNotAvailable: true })
      if (!fallbackInfo && lastCheckStatus.value !== 'not-available') {
        setFallbackNotAvailable()
      }
      return fallbackInfo
    }
    return null
  } catch (e) {
    const fallbackInfo = await checkConfiguredSources({ quietError: true, confirmNotAvailable: true })
    if (!fallbackInfo && lastCheckStatus.value !== 'not-available') setError(e?.message || '检查更新失败')
    return fallbackInfo
  }
}

function downloadUpdate() {
  if (!window.electronAPI?.update) return
  if (updateInfo.value?.canAutoDownload === false) {
    const url = updateInfo.value?.fallbackUrl
    if (url && /^https?:\/\//i.test(url)) window.electronAPI?.openExternal?.(url)
    return
  }
  downloading.value = true
  downloadProgress.value = 0
  window.electronAPI.update.download().catch((e) => {
    downloading.value = false
    error.value = e?.message || '下载更新失败'
  })
}

function installUpdate() {
  if (!window.electronAPI?.update) return
  window.electronAPI.update.install()
}

function cleanup() {
  consumerCount = Math.max(0, consumerCount - 1)
  if (consumerCount > 0) return
  window.electronAPI?.update?.removeListeners?.()
  listenersReady = false
}

export function useAutoUpdate() {
  msgApi = useMessage()

  onMounted(() => {
    consumerCount += 1
    setupListeners()
  })
  onBeforeUnmount(cleanup)

  return {
    checking,
    updateInfo,
    downloading,
    downloadProgress,
    downloaded,
    error,
    lastCheckStatus,
    lastCheckMessage,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
  }
}
