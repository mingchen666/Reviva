import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useMessage } from '@/components/MsMessage/useMessage'

export function useAutoUpdate() {
  const msg = useMessage()

  const checking = ref(false)
  const updateInfo = ref(null) // { version, releaseDate, releaseNotes }
  const downloading = ref(false)
  const downloadProgress = ref(0) // 0-100
  const downloaded = ref(false)
  const error = ref(null)

  function setupListeners() {
    if (!window.electronAPI?.update) return

    window.electronAPI.update.onChecking(() => {
      checking.value = true
      error.value = null
    })

    window.electronAPI.update.onAvailable((info) => {
      checking.value = false
      updateInfo.value = info
    })

    window.electronAPI.update.onNotAvailable((info) => {
      checking.value = false
      msg.success('当前已是最新版本 v' + (info?.version || ''))
    })

    window.electronAPI.update.onProgress((p) => {
      downloadProgress.value = p.percent
    })

    window.electronAPI.update.onDownloaded((info) => {
      downloading.value = false
      downloaded.value = true
      downloadProgress.value = 100
      msg.success('新版本 v' + (info?.version || '') + ' 已下载完成，重启即可安装')
    })

    window.electronAPI.update.onError((e) => {
      checking.value = false
      downloading.value = false
      error.value = e.message
      msg.warning('更新检查失败~ ')// + e.message
      console.log('更新检查失败:' + e.message)
    })
  }

  function checkForUpdate() {
    if (!window.electronAPI?.update) {
      msg.warning('当前为开发模式，不支持自动更新')
      return
    }
    checking.value = true
    error.value = null
    window.electronAPI.update.check().catch(() => {})
  }

  function downloadUpdate() {
    if (!window.electronAPI?.update) return
    downloading.value = true
    downloadProgress.value = 0
    window.electronAPI.update.download().catch(() => {})
  }

  function installUpdate() {
    if (!window.electronAPI?.update) return
    window.electronAPI.update.install()
  }

  function cleanup() {
    window.electronAPI?.update?.removeListeners?.()
  }

  onMounted(setupListeners)
  onBeforeUnmount(cleanup)

  return {
    checking,
    updateInfo,
    downloading,
    downloadProgress,
    downloaded,
    error,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
  }
}