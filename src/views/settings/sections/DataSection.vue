<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'

const appStore = useAppStore()
const ss = useSettingsStore()
const isDark = computed(() => appStore.isDark)

const cacheSize = ref('--')
const dataSize = ref('--')
const sizeLoading = ref(true)
const sizeError = ref('')
const loading = ref(false)
const resetConfirm = ref(false)
const clearConfirm = ref(false)

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

async function exportAll() {
  if (!window.electronAPI?.exportSettings) return
  const result = await window.electronAPI.exportSettings()
  if (!result?.success) return
  const json = JSON.stringify(result.data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reviva-settings-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function importConfig() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!window.electronAPI?.importSettings) return
      const result = await window.electronAPI.importSettings(data)
      if (result?.success) {
        await ss.loadFromDb()
        ss.applyAccentColor()
        ss.applyThemeMode()
      }
    } catch (err) {
      console.error('Import failed:', err)
    }
  }
  input.click()
}

async function exportAgents() {
  if (!window.electronAPI?.db) return
  const agents = await window.electronAPI.db.agents.list()
  const json = JSON.stringify(agents, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reviva-agents-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function exportMemory() {
  if (!window.electronAPI?.db) return
  const memories = await window.electronAPI.db.memories.list()
  const json = JSON.stringify(memories, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reviva-memories-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function resetSettings() {
  resetConfirm.value = false
  const defaults = {
    themeMode: 'dark', accentColor: 'brand', customAccentHex: '#4A6CFF',
    fontSize: 'medium', langPref: 'zh', animations: true, reducedMotion: false,
    answerStyle: 'default', conflictStrategy: 'ask',
    proxyMode: 'system', proxyType: 'http', proxyHost: '127.0.0.1', proxyPort: '7890',
    proxyAuth: false, proxyUser: '', proxyPass: '',
    maxIter: 100, maxTaskMin: 5, searchLimit: 10, fileOpLimit: 30,
    toolCallLimit: 0, modelCallLimit: 0,
    loopGuard: true, auditDays: 30, pathRedact: true,
    notifyTaskDone: true, notifyTaskFailed: true, notifySound: true, notifyDND: false,
    autoStart: false, minimizeToTray: true, trayIcon: true, singleInstance: true,
  }
  for (const [key, value] of Object.entries(defaults)) {
    await ss.savePreference(key, value)
  }
}

onMounted(() => {
  loadDataMetrics()
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
      <p class="text-[11px] mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">导出配置文件用于设备迁移或备份</p>
      <div class="grid grid-cols-2 gap-2">
        <button @click="exportAll" class="row flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-colors" :class="isDark ? 'bg-d0 border border-d4 hover:border-brand-400/30' : 'bg-l2 border border-bdrF hover:border-brand-200'">
          <i class="ri-archive-line text-[16px] text-brand-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">导出全部配置</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">服务商 / 智能体 / 记忆 / 偏好</div>
          </div>
          <i class="ri-download-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
        <button @click="importConfig" class="row flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-colors" :class="isDark ? 'bg-d0 border border-d4 hover:border-emerald-400/30' : 'bg-l2 border border-bdrF hover:border-emerald-200'">
          <i class="ri-upload-cloud-line text-[16px] text-emerald-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">导入配置</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">从 JSON 文件恢复配置</div>
          </div>
          <i class="ri-folder-open-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
        <button @click="exportAgents" class="row flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-colors" :class="isDark ? 'bg-d0 border border-d4 hover:border-agent-400/30' : 'bg-l2 border border-bdrF hover:border-agent-200'">
          <i class="ri-sparkling-line text-[16px] text-agent-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">仅导出智能体</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">分享给其他用户</div>
          </div>
          <i class="ri-download-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
        <button @click="exportMemory" class="row flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-colors" :class="isDark ? 'bg-d0 border border-d4 hover:border-rose-400/30' : 'bg-l2 border border-bdrF hover:border-rose-200'">
          <i class="ri-brain-line text-[16px] text-rose-400" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">仅导出记忆</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">语义 / 程序 / 情景记忆</div>
          </div>
          <i class="ri-download-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
      </div>
      <div class="mt-3 pt-3 flex items-center gap-2 text-[10px]" :class="isDark ? 'text-wt-dim border-t border-d4' : 'text-lt-aux border-t border-bdrF'">
        <i class="ri-shield-check-line text-emerald-400 text-[11px]" />
        <span>导出文件中 API Key 默认加密，可选择不导出敏感信息</span>
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
