<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'

const appStore = useAppStore()
const ss = useSettingsStore()
const isDark = computed(() => appStore.isDark)
const msg = useMessage()
const mbox = useMessageBox()

const cacheSize = ref('--')
const dataSize = ref('--')
const sizeLoading = ref(true)
const sizeError = ref('')
const loading = ref(false)
const resetConfirm = ref(false)
const clearConfirm = ref(false)
const backupLoadingMode = ref('')
const backupResult = ref(null)
const backupError = ref('')
const restoreLoading = ref(false)
const configLoadingMode = ref('')

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

async function loadDataMetrics() {
  if (!window.electronAPI?.getDataSize) {
    sizeLoading.value = false
    return
  }
  sizeLoading.value = true
  sizeError.value = ''
  try {
    const result = await window.electronAPI.getDataSize()
    if (!result?.success) throw new Error(result?.error || '获取失败')
    const raw = result.data.raw || 0
    dataSize.value = result.data.total
    // Cache size is approximate until a dedicated cache-size IPC is available.
    cacheSize.value = fmtSize(Math.round(raw * 0.3))
  } catch (err) {
    sizeError.value = err.message || '获取失败'
    dataSize.value = '获取失败'
    cacheSize.value = '获取失败'
  } finally {
    sizeLoading.value = false
  }
}

async function openDataDir() {
  if (!window.electronAPI?.openPath || !ss.workDirRoot) return
  const result = await window.electronAPI.openPath(ss.workDirRoot)
  if (result && result.success === false) {
    console.warn('Open workspace root failed:', result.error)
  }
}

async function clearCache() {
  clearConfirm.value = false
  if (!window.electronAPI?.clearCache) return
  loading.value = true
  const result = await window.electronAPI.clearCache()
  loading.value = false
  if (result?.success) {
    cacheSize.value = '0 MB'
    await loadDataMetrics()
  }
}

function downloadJson(data, fileName) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function exportConfig() {
  if (!window.electronAPI?.exportSettings) return
  configLoadingMode.value = 'export'
  try {
    const result = await window.electronAPI.exportSettings()
    if (!result?.success) throw new Error(result?.error || '导出配置失败')
    downloadJson(result.data, `reviva-settings-${new Date().toISOString().slice(0, 10)}.json`)
    msg.success('配置文件已导出', { title: '导出完成', duration: 3200 })
  } catch (err) {
    msg.error(err.message || '导出配置失败', { title: '导出失败', duration: 5000 })
  } finally {
    configLoadingMode.value = ''
  }
}

async function applyImportedRuntimeSettings(importedKeys = []) {
  const api = window.electronAPI
  const keys = new Set(importedKeys)
  const jobs = []
  const enqueue = callback => jobs.push(Promise.resolve().then(callback))
  if (keys.has('autoStart') && api?.setStartup) enqueue(() => api.setStartup(ss.autoStart))
  if (keys.has('minimizeToTray') && api?.setMinimizeToTray) enqueue(() => api.setMinimizeToTray(ss.minimizeToTray))
  if (keys.has('trayIcon') && api?.setTrayIcon) enqueue(() => api.setTrayIcon(ss.trayIcon))
  if (keys.has('trayMenuItems') && api?.setTrayMenu) enqueue(() => api.setTrayMenu(ss.trayMenuItems))
  if (keys.has('singleInstance') && api?.setSingleInstance) enqueue(() => api.setSingleInstance(ss.singleInstance))
  if (keys.has('shortcutBindings') && api?.db?.settings && api?.shortcuts?.register) {
    enqueue(async () => {
      const shortcutBindings = await api.db.settings.get('shortcutBindings')
      if (!shortcutBindings || typeof shortcutBindings !== 'object') {
        return { ok: false, error: '快捷键配置不可用' }
      }
      return api.shortcuts.register(shortcutBindings)
    })
  }
  const results = await Promise.allSettled(jobs)
  return results.some(item => item.status === 'rejected'
    || item.value?.ok === false
    || item.value?.failed?.length)
}

async function importConfig() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    configLoadingMode.value = 'import'
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!window.electronAPI?.importSettings) return
      const result = await window.electronAPI.importSettings(data)
      if (!result?.success) throw new Error(result?.error || '导入配置失败')
      await ss.loadFromDb()
      ss.applyAccentColor()
      ss.applyThemeMode()
      const hasRuntimeWarning = await applyImportedRuntimeSettings(result.data?.importedKeys || [])
      if (hasRuntimeWarning) {
        msg.warning('配置已导入，部分系统设置或快捷键将在重启后生效', {
          title: '配置导入完成',
          duration: 5200,
        })
      } else {
        msg.success(`已导入 ${result.data?.importedCount ?? 0} 项配置`, {
          title: result.data?.legacy ? '旧版配置导入完成' : '配置导入完成',
          duration: 3800,
        })
      }
    } catch (err) {
      console.error('Import failed:', err)
      msg.error(err.message || '导入配置失败', { title: '导入失败', duration: 5200 })
    } finally {
      configLoadingMode.value = ''
    }
  }
  input.click()
}

async function createBackup(mode) {
  if (!window.electronAPI?.backup?.create) return
  backupLoadingMode.value = mode
  backupResult.value = null
  backupError.value = ''
  try {
    const result = await window.electronAPI.backup.create({ mode })
    if (result?.canceled) return
    if (!result?.success) throw new Error(result?.error || '备份失败')
    backupResult.value = result.data
    msg.success(`已创建 ${result.data.fileName}`, {
      title: '备份完成',
      duration: 4200,
    })
    await loadDataMetrics()
  } catch (err) {
    backupError.value = err.message || '备份失败'
    msg.error(backupError.value, {
      title: '备份失败',
      duration: 5200,
    })
  } finally {
    backupLoadingMode.value = ''
  }
}

async function revealBackup() {
  const filePath = backupResult.value?.path
  if (!filePath || !window.electronAPI?.showItemInFolder) return
  await window.electronAPI.showItemInFolder(filePath)
}

async function restoreBackup() {
  const confirmed = await mbox.confirm({
    title: '恢复本地数据',
    subtitle: '应用会先校验备份并创建当前数据的安全备份',
    message: '恢复将替换当前数据库，并覆盖备份包中包含的工作区文件。准备完成后应用会立即重启。',
    variant: 'warning',
    confirmText: '选择备份并恢复',
    cancelText: '取消',
  })
  if (!confirmed) return
  restoreLoading.value = true
  backupError.value = ''
  try {
    const result = await window.electronAPI?.backup?.prepareRestore?.()
    if (result?.canceled) return
    if (!result?.success) throw new Error(result?.error || '恢复准备失败')
    msg.success('备份已校验，正在重启并恢复数据', { title: '恢复准备完成', duration: 3000 })
    await window.electronAPI?.relaunch?.()
  } catch (err) {
    backupError.value = err?.message || '恢复准备失败'
    msg.error(backupError.value, { title: '恢复失败', duration: 6000 })
  } finally {
    restoreLoading.value = false
  }
}

async function resetSettings() {
  resetConfirm.value = false
  const defaults = {
    themeMode: 'light', accentColor: 'brand', customAccentHex: '#4A6CFF',
    fontSize: 'medium', langPref: 'zh', animations: true, reducedMotion: false,
    answerStyle: 'default', conflictStrategy: 'ask',
    proxyMode: 'system', proxyType: 'http', proxyHost: '127.0.0.1', proxyPort: '7890',
    proxyAuth: false, proxyUser: '', proxyPass: '',
    maxIter: 100, maxTaskMin: 5, searchLimit: 10, fileOpLimit: 30,
    toolCallLimit: 0, modelCallLimit: 0,
    loopGuard: true, auditDays: 30, pathRedact: true,
    notifyTaskDone: false, notifyTaskFailed: false, notifySound: false, notifySoundType: 'complete', notifyDND: false,
    autoStart: false, minimizeToTray: true, trayIcon: true, singleInstance: true,
  }
  for (const [key, value] of Object.entries(defaults)) {
    await ss.savePreference(key, value)
  }
}

onMounted(async () => {
  loadDataMetrics()
  const result = await window.electronAPI?.backup?.getRestoreResult?.()
  if (result?.data?.success) {
    msg.success(`已从 ${result.data.sourceFileName || '备份包'} 恢复数据`, { title: '数据恢复完成', duration: 6000 })
  } else if (result?.data && result.data.success === false) {
    msg.error(result.data.error || '数据恢复失败', { title: '恢复未完成', duration: 8000 })
  }
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <!-- Local Data -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3">
        <i class="ri-hard-drive-2-line text-emerald-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">本地数据</span>
      </div>
      <div class="grid grid-cols-3 gap-3 mb-3">
        <div class="rounded-lg p-3" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
          <div class="text-[10px] font-medium mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">数据目录大小</div>
          <div v-if="sizeLoading" class="h-4 w-20 rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" />
          <div v-else class="text-[16px] font-bold leading-none" :class="sizeError ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-wt-main' : 'text-lt-main')">{{ dataSize }}</div>
        </div>
        <div class="rounded-lg p-3" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
          <div class="text-[10px] font-medium mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">缓存大小</div>
          <div v-if="sizeLoading" class="h-4 w-16 rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" />
          <div v-else class="text-[16px] font-bold leading-none" :class="sizeError ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-wt-main' : 'text-lt-main')">{{ cacheSize }}</div>
        </div>
        <div class="rounded-lg p-3" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
          <div class="text-[10px] font-medium mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">索引大小</div>
          <div v-if="sizeLoading" class="h-4 w-12 rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" />
          <div v-else class="text-[16px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">--</div>
        </div>
      </div>
      <div v-if="sizeError" class="mb-2 flex items-center gap-1.5 text-[10px]" :class="isDark ? 'text-red-400' : 'text-red-500'">
        <i class="ri-error-warning-line text-[11px]" />
        <span>{{ sizeError }}</span>
      </div>
      <div class="space-y-1">
        <button @click="openDataDir" :disabled="!ss.workDirRoot" class="row w-full flex items-center gap-3 py-2.5 px-2 rounded-lg text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed" :class="isDark ? 'hover:bg-white/4' : 'hover:bg-l4'">
          <i class="ri-folder-open-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">打开授权根目录</div>
            <div class="text-[10px] font-mono truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ ss.workDirRoot || '未配置' }}</div>
          </div>
          <i class="ri-arrow-right-up-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
        <button @click="clearConfirm = true" class="row w-full flex items-center gap-3 py-2.5 px-2 rounded-lg text-left transition-colors" :class="isDark ? 'hover:bg-white/4' : 'hover:bg-l4'">
          <i class="ri-delete-bin-line text-[14px] text-amber-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">清理缓存</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">清理临时文件，不会影响知识库与对话</div>
          </div>
          <span class="ctx-pill" :class="isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF'">{{ cacheSize }}</span>
        </button>
      </div>
    </div>

    <!-- Export & Backup -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-1">
        <i class="ri-download-cloud-line text-brand-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">导出与备份</span>
      </div>
      <p class="text-[11px] mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">迁移偏好、模型服务商、网络、沙箱、通知与快捷键配置</p>
      <div class="grid grid-cols-2 gap-2">
        <button @click="exportConfig" :disabled="!!configLoadingMode" class="row flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed" :class="isDark ? 'bg-d0 border border-d4 hover:border-brand-400/30' : 'bg-l2 border border-bdrF hover:border-brand-200'">
          <i class="ri-archive-line text-[16px] text-brand-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">导出应用配置</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">偏好 / 服务商与模型 / 网络 / 沙箱</div>
          </div>
          <i v-if="configLoadingMode === 'export'" class="ri-loader-4-line text-[12px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <i v-else class="ri-download-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
        <button @click="importConfig" :disabled="!!configLoadingMode" class="row flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed" :class="isDark ? 'bg-d0 border border-d4 hover:border-emerald-400/30' : 'bg-l2 border border-bdrF hover:border-emerald-200'">
          <i class="ri-upload-cloud-line text-[16px] text-emerald-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">导入应用配置</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">校验 JSON 后覆盖对应配置项</div>
          </div>
          <i v-if="configLoadingMode === 'import'" class="ri-loader-4-line text-[12px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <i v-else class="ri-folder-open-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
      </div>
      <div class="mt-3 pt-3 flex items-center gap-2 text-[10px]" :class="isDark ? 'text-wt-dim border-t border-d4' : 'text-lt-aux border-t border-bdrF'">
        <i class="ri-error-warning-line text-amber-400 text-[11px]" />
        <span>导出文件可能包含 API Key 与代理凭据，请妥善保管，不要公开分享</span>
      </div>
    </div>

    <!-- Data Backup -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-1">
        <i class="ri-safe-2-line text-cyan-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">数据备份</span>
      </div>
      <p class="text-[11px] mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">创建本地备份包；配置 JSON 导入导出仍保留在上方</p>
      <div class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));">
        <button @click="createBackup('full')" :disabled="!!backupLoadingMode" class="row flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed" :class="isDark ? 'bg-d0 border border-d4 hover:border-cyan-400/30' : 'bg-l2 border border-bdrF hover:border-cyan-200'">
          <i class="ri-database-2-line text-[16px] text-cyan-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">完整数据备份</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">数据库 / 文档 / 笔记 / 知识库 / 产物</div>
          </div>
          <i v-if="backupLoadingMode === 'full'" class="ri-loader-4-line text-[12px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <i v-else class="ri-download-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
        <button @click="createBackup('compact')" :disabled="!!backupLoadingMode" class="row flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed" :class="isDark ? 'bg-d0 border border-d4 hover:border-emerald-400/30' : 'bg-l2 border border-bdrF hover:border-emerald-200'">
          <i class="ri-filter-3-line text-[16px] text-emerald-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">精简备份</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">保留核心文字资料，不含原片与大型附件</div>
          </div>
          <i v-if="backupLoadingMode === 'compact'" class="ri-loader-4-line text-[12px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <i v-else class="ri-download-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
        <button @click="createBackup('database')" :disabled="!!backupLoadingMode" class="row flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed" :class="isDark ? 'bg-d0 border border-d4 hover:border-amber-400/30' : 'bg-l2 border border-bdrF hover:border-amber-200'">
          <i class="ri-hard-drive-line text-[16px] text-amber-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">数据库备份</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">仅 SQLite 快照，高级用途</div>
          </div>
          <i v-if="backupLoadingMode === 'database'" class="ri-loader-4-line text-[12px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <i v-else class="ri-download-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
        <button @click="restoreBackup" :disabled="restoreLoading || !!backupLoadingMode" class="row flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-colors disabled:opacity-55 disabled:cursor-not-allowed" :class="isDark ? 'bg-d0 border border-d4 hover:border-sky-400/30' : 'bg-l2 border border-bdrF hover:border-sky-200'">
          <i class="ri-upload-2-line text-[16px] text-sky-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">恢复数据</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">校验备份 / 自动安全备份 / 重启恢复</div>
          </div>
          <i v-if="restoreLoading" class="ri-loader-4-line animate-spin text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <i v-else class="ri-restart-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
      </div>
      <div v-if="backupResult" class="mt-3 pt-3 flex items-center gap-2 text-[10px]" :class="isDark ? 'text-wt-dim border-t border-d4' : 'text-lt-aux border-t border-bdrF'">
        <i class="ri-checkbox-circle-line text-emerald-400 text-[11px]" />
        <span class="flex-1 min-w-0 truncate">已创建 {{ backupResult.fileName }}，包大小 {{ fmtSize(backupResult.size) }}，包含 {{ backupResult.fileCount }} 个文件</span>
        <button @click="revealBackup" class="px-2 py-1 rounded-md font-medium" :class="isDark ? 'bg-d4 text-wt-sub hover:bg-white/8' : 'bg-l4 text-lt-sub hover:bg-l5'">定位</button>
      </div>
      <div v-if="backupError" class="mt-3 pt-3 flex items-center gap-2 text-[10px]" :class="isDark ? 'text-red-400 border-t border-d4' : 'text-red-500 border-t border-bdrF'">
        <i class="ri-error-warning-line text-[11px]" />
        <span>{{ backupError }}</span>
      </div>
    </div>

    <!-- Danger Zone -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-red-400/4 border border-red-400/20' : 'bg-red-50/40 border border-red-100'">
      <div class="flex items-center gap-2 mb-3">
        <i class="ri-alarm-warning-line text-red-400 text-[14px]" />
        <span class="section-title text-red-400">危险操作</span>
      </div>
      <div class="space-y-1.5">
        <button @click="resetConfirm = true" class="row w-full flex items-center gap-3 py-2.5 px-3 rounded-lg text-left transition-colors" :class="isDark ? 'hover:bg-red-400/6' : 'hover:bg-red-50'">
          <i class="ri-refresh-line text-[14px] text-red-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">重置所有设置</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">恢复偏好、快捷键、沙箱配置至默认值（不影响知识库）</div>
          </div>
          <span class="ctx-pill" :class="isDark ? 'bg-red-400/10 text-red-400 border border-red-400/20' : 'bg-red-50 text-red-500 border border-red-100'">需确认</span>
        </button>
        <button class="row w-full flex items-center gap-3 py-2.5 px-3 rounded-lg text-left transition-colors opacity-50">
          <i class="ri-delete-bin-line text-[14px] text-red-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">清空本地数据</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">删除所有本地知识库、对话、输出（云端数据保留）</div>
          </div>
          <span class="ctx-pill" :class="isDark ? 'bg-red-400/10 text-red-400 border border-red-400/20' : 'bg-red-50 text-red-500 border border-red-100'">暂未开放</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Reset Confirm Modal -->
  <Teleport to="body">
    <div v-if="resetConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="resetConfirm = false" />
      <div class="relative rounded-2xl overflow-hidden w-full max-w-[400px]"
        :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrF shadow-xl'">
        <div class="px-5 py-4">
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-alarm-warning-line text-red-400 text-[16px]" />
            <span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">确认重置所有设置？</span>
          </div>
          <p class="text-[12px] mb-4" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">偏好、代理、沙箱、通知等设置将恢复为默认值。知识库和对话不受影响。</p>
          <div class="flex justify-end gap-2">
            <button @click="resetConfirm = false" class="px-4 py-2 rounded-lg text-[11px] font-medium" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
            <button @click="resetSettings" class="px-4 py-2 rounded-lg text-[11px] font-semibold bg-red-500 text-white hover:bg-red-600">确认重置</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Clear Cache Confirm Modal -->
  <Teleport to="body">
    <div v-if="clearConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="clearConfirm = false" />
      <div class="relative rounded-2xl overflow-hidden w-full max-w-[400px]"
        :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrF shadow-xl'">
        <div class="px-5 py-4">
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-delete-bin-line text-amber-400 text-[16px]" />
            <span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">确认清理缓存？</span>
          </div>
          <p class="text-[12px] mb-4" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">清理临时文件和缓存数据，不会影响知识库与对话记录。</p>
          <div class="flex justify-end gap-2">
            <button @click="clearConfirm = false" class="px-4 py-2 rounded-lg text-[11px] font-medium" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
            <button @click="clearCache" :disabled="loading" class="px-4 py-2 rounded-lg text-[11px] font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">确认清理</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
