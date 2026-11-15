<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import MsModal from '@/components/MsModal/MsModal.vue'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const msg = useMessage()
const messageBox = useMessageBox()

const pythonStatus = ref(null)
const venvInitializing = ref(false)
const venvInitResult = ref(null)
const venvRebuilding = ref(false)
const venvDeleting = ref(false)
const showVenvManage = ref(false)
const detectingSystemPython = ref(false)
const systemPythonResult = ref(null)
const pendingVenvPath = ref('')
const interpreterSource = ref('builtin')
const pypiMirrorId = ref('aliyun')
const pypiMirrorPresets = ref([])
const pypiCustomUrl = ref('')
const pypiMirrorLoading = ref(false)
const packages = ref([])
const loadingPackages = ref(false)
const packageSearch = ref('')
const installingPackage = ref(false)
const installPackageName = ref('')
const uninstallingPackage = ref('')
const packageActionResult = ref(null)
const packageInfo = ref(null)
const loadingPackageInfo = ref('')
const switchingSource = ref(false)
const showInstallDetail = ref(false)
const showInstallPackageModal = ref(false)

const venvReady = computed(() => !!pythonStatus.value?.venv?.ready)
const venvBusy = computed(() => venvInitializing.value || venvRebuilding.value || venvDeleting.value)
const canApplyVenvPath = computed(() => {
  const pendingPath = pendingVenvPath.value.trim()
  const currentPath = pythonStatus.value?.venv?.path?.trim() || ''
  return !!pendingPath && pendingPath !== currentPath
})
const pathInputClass = computed(() => isDark.value
  ? 'bg-d0 text-wt-main border border-d4 focus:border-brand-400/50'
  : 'bg-white text-lt-main border border-bdrF focus:border-brand-400/50')
const pathReadonlyClass = computed(() => isDark.value
  ? 'bg-d0/50 text-wt-dim/80 border border-d4/70'
  : 'bg-l2/60 text-lt-aux/90 border border-bdrF')
const pathButtonClass = computed(() => isDark.value
  ? 'bg-d4/60 text-wt-aux hover:bg-d4 hover:text-wt-sub border border-d4'
  : 'bg-l4/70 text-lt-aux hover:bg-l4 hover:text-lt-sub border border-bdrF')
const pathPrimaryButtonClass = computed(() => isDark.value
  ? 'bg-brand-400/10 text-brand-400 hover:bg-brand-400/20 border border-brand-400/20'
  : 'bg-brand-50 text-brand-500 hover:bg-brand-100 border border-brand-100')
const packagesCount = computed(() => packages.value.length)

const PACKAGE_INPUT_RE = /^([A-Za-z0-9_.-]+(?:\[[A-Za-z0-9_,.\-]+\])?)(.*)$/
function parseInstallInput(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return { valid: false, name: '', spec: '', display: '' }
  const m = trimmed.match(PACKAGE_INPUT_RE)
  if (!m) return { valid: false, name: '', spec: '', display: '' }
  const name = m[1]
  const spec = (m[2] || '').trim()
  if (!/^[A-Za-z0-9_.-]/.test(name)) return { valid: false, name, spec, display: trimmed }
  return { valid: true, name, spec, display: spec ? `${name}${spec}` : name }
}
const installInputHint = computed(() => {
  const parsed = parseInstallInput(installPackageName.value)
  if (!installPackageName.value.trim()) return '包名（如 requests），可选版本：requests==2.31.0'
  if (!parsed.valid) return '格式无效，请输入合法包名'
  if (parsed.spec) return `将安装 ${parsed.display}`
  return `将安装最新版 ${parsed.name}`
})

const filteredPackages = computed(() => {
  const q = packageSearch.value.trim().toLowerCase()
  const list = [...packages.value].sort((a, b) => a.name.localeCompare(b.name))
  if (!q) return list
  return list.filter(p => p.name.toLowerCase().includes(q))
})
﻿
async function loadPythonStatus() {
  try {
    const res = await window.electronAPI?.getPythonStatus?.()
    if (res?.success) {
      pythonStatus.value = res.data
      interpreterSource.value = res.data?.interpreter?.source || 'builtin'
      pendingVenvPath.value = res.data?.venv?.path || ''
      await loadPypiMirror()
    }
  } catch {}
}

async function initVenv() {
  if (venvInitializing.value) return
  venvInitializing.value = true
  venvInitResult.value = null
  try {
    const res = await window.electronAPI?.ensureVenv?.()
    venvInitResult.value = res
    await loadPythonStatus()
    if (res?.success) msg.success(res.alreadyReady ? '虚拟环境已存在且可用' : '虚拟环境创建成功，pip 已就绪')
    else msg.error(res?.error || '初始化失败')
  } finally {
    venvInitializing.value = false
  }
}

async function rebuildVenv() {
  if (venvRebuilding.value) return
  const confirmed = await messageBox.confirm({
    title: '重建虚拟环境',
    message: '重建会删除当前 venv 及其中已安装的包，并重新创建空环境。确定继续吗？',
    variant: 'warning',
    confirmText: '确认重建',
    cancelText: '取消',
  })
  if (!confirmed) return
  venvRebuilding.value = true
  venvInitResult.value = null
  try {
    const res = await window.electronAPI?.rebuildVenv?.()
    venvInitResult.value = res
    await loadPythonStatus()
    if (res?.success) msg.success('虚拟环境已重建')
    else msg.error(res?.error || '重建失败')
  } finally {
    venvRebuilding.value = false
  }
}

async function deleteVenv() {
  if (venvDeleting.value) return
  const confirmed = await messageBox.confirm({
    title: '删除虚拟环境',
    message: '将删除整个虚拟环境目录及其中所有已安装的包，删除后需重新初始化才能使用 Python 相关功能。此操作不可恢复，确定继续吗？',
    variant: 'danger',
    confirmText: '确认删除',
    cancelText: '取消',
  })
  if (!confirmed) return
  venvDeleting.value = true
  venvInitResult.value = null
  try {
    const res = await window.electronAPI?.deleteVenv?.()
    await loadPythonStatus()
    packages.value = []
    showVenvManage.value = false
    packageInfo.value = null
    packageActionResult.value = null
    if (res?.success) msg.success(res.removed ? '虚拟环境已删除' : '虚拟环境目录不存在，无需删除')
    else msg.error(res?.error || '删除失败')
  } finally {
    venvDeleting.value = false
  }
}

async function applyVenvPath() {
  const p = pendingVenvPath.value?.trim()
  if (!p) return
  const res = await window.electronAPI?.setVenvPath?.(p)
  if (res?.success) {
    await loadPythonStatus()
    msg.success('虚拟环境路径已更新')
  } else {
    venvInitResult.value = { success: false, error: res?.error || '路径无效。' }
    msg.error(res?.error || '路径无效')
  }
}
async function chooseVenvPath() {
  const dir = await window.electronAPI?.openDirectory?.()
  if (dir) {
    pendingVenvPath.value = dir
  }
}
﻿
async function loadPypiMirror() {
  try {
    const res = await window.electronAPI?.getPypiMirror?.()
    if (res?.success) {
      pypiMirrorPresets.value = res.data.presets || []
      pypiMirrorId.value = res.data.current?.id || 'aliyun'
      if (res.data.current?.id === 'custom') pypiCustomUrl.value = res.data.current.url || ''
    }
  } catch {}
}

async function applyPypiMirror(id) {
  if (id === pypiMirrorId.value) return
  pypiMirrorId.value = id
  const customUrl = id === 'custom' ? pypiCustomUrl.value.trim() : undefined
  if (id === 'custom' && !customUrl) {
    msg.error('请输入自定义镜像源 URL')
    return
  }
  try {
    const res = await window.electronAPI?.setPypiMirror?.(id, customUrl)
    if (res?.success) msg.success('PyPI 镜像源已切换')
    else msg.error(res?.error || '切换失败')
  } catch (e) { msg.error(e.message) }
}

async function applyPypiCustomUrl() {
  const url = pypiCustomUrl.value.trim()
  if (!url) { msg.error('请输入 URL'); return }
  try { new URL(url) } catch { msg.error('URL 格式无效'); return }
  const res = await window.electronAPI?.setPypiMirror?.('custom', url)
  if (res?.success) msg.success('自定义镜像源已设置')
  else msg.error(res?.error || '设置失败')
}

async function detectSystemPython() {
  if (detectingSystemPython.value) return
  detectingSystemPython.value = true
  systemPythonResult.value = null
  try {
    const res = await window.electronAPI?.detectSystemPython?.()
    if (res?.success) systemPythonResult.value = res.data
    return res?.data
  } finally {
    detectingSystemPython.value = false
  }
}

async function applyInterpreterSource(source) {
  if (source === interpreterSource.value) return
  if (source === 'builtin') {
    switchingSource.value = true
    try {
      await window.electronAPI?.setInterpreterSource?.('builtin')
      interpreterSource.value = 'builtin'
      await loadPythonStatus()
      await messageBox.alert({
        title: '已切换为内置 Python',
        message: '解释器来源已切换为内置 Python。若之前已创建虚拟环境，请点击"重建虚拟环境"使其与新解释器匹配。',
        variant: 'info',
        confirmText: '知道了',
      })
    } finally {
      switchingSource.value = false
    }
    return
  }
  if (switchingSource.value) return
  switchingSource.value = true
  try {
    const data = await detectSystemPython()
    if (!data?.found) {
      await messageBox.alert({
        title: '未检测到系统 Python',
        message: '未在系统 PATH 中检测到 python，无法切换为系统 Python。请先安装 Python 3.11 或更高版本并确保其在 PATH 中。',
        variant: 'warning',
        confirmText: '知道了',
      })
      return
    }
    if (!data?.ok) {
      await messageBox.alert({
        title: '系统 Python 版本不达标',
        message: `检测到系统 Python 版本为 ${data.version}，低于 3.11，不可用作虚拟环境解释器。请安装 Python 3.11 或更高版本后重试。`,
        variant: 'warning',
        confirmText: '知道了',
      })
      return
    }
    const confirmed = await messageBox.confirm({
      title: '切换为系统 Python',
      message: `检测到系统 Python 版本：${data.version}（符合要求）。\n\n切换后将使用该系统 Python 作为解释器来源，当前虚拟环境会因解释器不匹配而需要重建。\n\n是否继续切换？`,
      variant: 'info',
      confirmText: '切换',
      cancelText: '取消',
    })
    if (!confirmed) return
    await window.electronAPI?.setInterpreterSource?.('system')
    interpreterSource.value = 'system'
    await loadPythonStatus()
    await messageBox.alert({
      title: '已切换为系统 Python',
      message: '解释器来源已切换为系统 Python。请点击"重建虚拟环境"以基于系统 Python 重新创建虚拟环境。',
      variant: 'success',
      confirmText: '知道了',
    })
  } finally {
    switchingSource.value = false
  }
}
﻿
async function loadPackages() {
  if (!venvReady.value) { packages.value = []; return }
  loadingPackages.value = true
  try {
    const res = await window.electronAPI?.listPackages?.()
    if (res?.success) packages.value = res.packages || []
    else {
      packages.value = []
      msg.error(res?.error || '获取包列表失败')
    }
  } finally {
    loadingPackages.value = false
  }
}

function openInstallPackageModal() {
  installPackageName.value = ''
  showInstallPackageModal.value = true
}

async function installCustomPackage() {
  const parsed = parseInstallInput(installPackageName.value)
  if (!parsed.valid || installingPackage.value) return false
  installingPackage.value = true
  packageActionResult.value = null
  showInstallDetail.value = false
  try {
    const res = await window.electronAPI?.installPackages?.({ packages: [parsed.display], label: parsed.display })
    packageActionResult.value = res
    if (res?.success) {
      installPackageName.value = ''
      msg.success(`${parsed.name} 安装成功`)
      await loadPackages()
      return true
    } else {
      msg.error(res?.error || `安装 ${parsed.name} 失败`)
      return false
    }
  } finally {
    installingPackage.value = false
  }
}

async function confirmInstallPackage() {
  const success = await installCustomPackage()
  if (success) showInstallPackageModal.value = false
}

async function uninstallPkg(name) {
  if (uninstallingPackage.value) return
  const confirmed = await messageBox.confirm({
    title: '卸载包',
    message: `确定从虚拟环境卸载 ${name} 吗？`,
    variant: 'warning',
    confirmText: '卸载',
    cancelText: '取消',
  })
  if (!confirmed) return
  uninstallingPackage.value = name
  packageActionResult.value = null
  showInstallDetail.value = false
  try {
    const res = await window.electronAPI?.uninstallPackage?.(name)
    packageActionResult.value = res
    if (res?.success) {
      msg.success(`${name} 已卸载`)
      await loadPackages()
      if (packageInfo.value?.name?.toLowerCase() === name.toLowerCase()) packageInfo.value = null
    } else {
      msg.error(res?.error || `卸载 ${name} 失败`)
    }
  } finally {
    uninstallingPackage.value = ''
  }
}

async function showPackageInfo(name) {
  loadingPackageInfo.value = name
  packageInfo.value = null
  try {
    const res = await window.electronAPI?.getPackageInfo?.(name)
    if (res?.success) packageInfo.value = { name, ...res.info }
    else msg.error(res?.error || `获取 ${name} 详情失败`)
  } finally {
    loadingPackageInfo.value = ''
  }
}

onMounted(() => { loadPythonStatus() })
onMounted(() => { loadPackages() })
watch(() => pythonStatus.value?.venv?.ready, (ready) => { if (ready) loadPackages() })
</script>
<template>
  <div class="max-w-6xl mx-auto px-5 lg:px-6 py-5 space-y-3">
    <!-- Info Banner -->
    <div class="rounded-xl p-3" :class="isDark ? 'bg-brand-400/6 border border-brand-400/20' : 'bg-brand-50/60 border border-brand-100'">
      <div class="flex items-start gap-2">
        <i class="ri-python-line text-brand-400 text-[14px] mt-[1px]" />
        <div class="flex-1 min-w-0">
          <div class="text-[14px] font-semibold mb-0.5" :class="isDark ? 'text-brand-400' : 'text-brand-600'">Python 虚拟环境管理</div>
          <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            管理 Reviva 隔离的 Python 运行环境，用于 Office/PDF 解析、数学可视化等 Python 库及 Skill 等。
          </p>
        </div>
      </div>
    </div>

    <!-- Venv Panel -->
    <div class="rounded-xl p-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-4">
        <i class="ri-python-line text-[18px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">虚拟环境</span>
        <span class="ml-auto text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">解释器 {{ pythonStatus?.interpreter?.version || '—' }}</span>
      </div>

      <!-- 说明 -->
      <div class="mb-4 text-[11px] leading-relaxed rounded-lg p-3" :class="isDark ? 'bg-d0/50 text-wt-dim border border-d4' : 'bg-l2/50 text-lt-aux border border-bdrF'">
        虚拟环境适用于Python，装在里面的包只对 Reviva 生效，不污染系统 Python，卸载时可一并清理。<span :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">首次使用请点击"初始化虚拟环境"。</span>
      </div>

      <!-- 状态卡片 -->
      <div class="py-3 px-4 rounded-lg mb-2"
        :class="isDark ? 'bg-d0/60 border border-d4' : 'bg-l2/60 border border-bdrF'">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              :class="venvReady
                ? (isDark ? 'bg-emerald-400/10 border border-emerald-400/20' : 'bg-emerald-50 border border-emerald-100')
                : (isDark ? 'bg-amber-400/10 border border-amber-400/20' : 'bg-amber-50 border border-amber-100')">
              <span v-if="venvBusy" class="loader-ring" :style="{ '--ring-color': isDark ? '#6C8AFF' : '#4A6CFF' }" />
              <i v-else-if="venvReady" class="ri-check-line text-[24px]" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'" />
              <i v-else class="ri-error-warning-line text-[18px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                  {{ venvDeleting ? '删除中…' : venvRebuilding ? '重建中…' : venvInitializing ? '初始化中…' : (venvReady ? '虚拟环境已就绪' : '虚拟环境未初始化') }}
                </span>
                <span v-if="pythonStatus?.interpreter?.version" class="ctx-pill text-[10px]"
                  :class="isDark ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">
                  {{ pythonStatus.interpreter.source === 'system' ? '系统' : '内置' }} Python {{ pythonStatus.interpreter.version }}
                </span>
                <span v-if="pythonStatus?.interpreter?.fallback" class="ctx-pill text-[10px]"
                  :class="isDark ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100'">
                  已回退
                </span>
              </div>
              <div v-if="venvReady" class="mt-1.5 max-w-full rounded-md px-2.5 h-9 flex items-center gap-2"
                :class="pathReadonlyClass" :title="pythonStatus.venv.path">
                <i class="ri-folder-3-line text-[14px] shrink-0" :class="isDark ? 'text-brand-400/70' : 'text-brand-500/80'" />
                <span class="flex-1 min-w-0 truncate text-[13.5px] font-mono">{{ pythonStatus.venv.path }}</span>
              </div>
              <div v-if="pythonStatus?.interpreter?.reason" class="text-[10.5px] mt-1" :class="isDark ? 'text-amber-400/80' : 'text-amber-600/90'">
                {{ pythonStatus.interpreter.reason }}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-nowrap shrink-0" role="group" aria-label="虚拟环境操作">
            <button v-if="!venvReady" type="button" @click="initVenv" :disabled="venvBusy"
              title="创建隔离的虚拟环境并安装 pip"
              class="h-8 px-4 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
              :class="isDark ? 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'">
              <span v-if="venvInitializing" class="loader-ring" :style="{ '--ring-color': isDark ? '#34D399' : '#059669' }" />
              <i v-else class="ri-play-circle-line text-[14px]" />
              {{ venvInitializing ? '初始化中…' : '初始化虚拟环境' }}
            </button>
            <template v-else>
              <button type="button" @click="rebuildVenv" :disabled="venvBusy"
                title="清空已安装包，并重新创建虚拟环境"
                class="h-8 px-3.5 rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                :class="isDark ? 'bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 border border-amber-400/20' : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100'">
                <span v-if="venvRebuilding" class="loader-ring" :style="{ '--ring-color': isDark ? '#FBBF24' : '#D97706' }" />
                <i v-else class="ri-refresh-line text-[14px]" />
                {{ venvRebuilding ? '重建中…' : '重建虚拟环境' }}
              </button>
              <button type="button" @click="deleteVenv" :disabled="venvBusy"
                title="移除整个虚拟环境目录，删除后需重新初始化"
                class="h-8 px-3.5 rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                :class="isDark ? 'bg-red-400/10 text-red-400 hover:bg-red-400/20 border border-red-400/20' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'">
                <span v-if="venvDeleting" class="loader-ring" :style="{ '--ring-color': isDark ? '#F87171' : '#EF4444' }" />
                <i v-else class="ri-delete-bin-line text-[14px]" />
                {{ venvDeleting ? '删除中…' : '删除虚拟环境' }}
              </button>
            </template>
            <button v-if="venvReady" type="button" @click="showVenvManage = !showVenvManage" :disabled="venvBusy"
              :title="venvBusy ? '操作进行中' : '管理路径、镜像源、解释器和已安装包'"
              class="h-8 px-4 rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
              :class="isDark ? 'bg-d4/60 text-wt-aux hover:bg-d4 hover:text-wt-sub border border-d4' : 'bg-l4/70 text-lt-aux hover:bg-l4 hover:text-lt-sub border border-bdrF'">
              <i class="ri-settings-3-line text-[14px]" />
              管理
            </button>
          </div>
        </div>
        <div class="mt-2.5 flex items-center gap-1.5 text-[10.5px] leading-snug" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-alert-line text-[12px] shrink-0" :class="isDark ? 'text-amber-400/80' : 'text-amber-600/90'" />
          <span>{{ venvBusy ? '操作进行中，请等待完成后再修改其他设置。' : venvReady ? '重建会清空已安装包；删除会移除整个环境目录。' : '初始化会创建隔离环境，不会污染系统 Python；路径可在下方设置。' }}</span>
        </div>
      </div>

      <!-- 安装位置（venv 未就绪时独立显示） -->
      <div v-if="!venvReady" class="mb-3 rounded-lg p-3.5" :class="isDark ? 'bg-d0/40 border border-d4' : 'bg-l2/40 border border-bdrF'">
        <div class="text-[12px] font-semibold mb-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">安装位置</div>
        <div class="flex items-center gap-2">
          <div class="flex-1 min-w-0 relative">
            <i class="ri-folder-3-line text-[13px] absolute left-2.5 top-1/2 -translate-y-1/2" :class="isDark ? 'text-brand-400/70' : 'text-brand-500/80'" />
            <input v-model="pendingVenvPath" type="text" spellcheck="false" :title="pendingVenvPath" placeholder="虚拟环境存放路径"
              aria-label="虚拟环境存放路径"
              class="w-full h-9 pl-8 pr-3 rounded-md text-[12px] font-mono"
              :class="pathInputClass"
              @change="applyVenvPath" />
          </div>
          <button type="button" @click="chooseVenvPath" class="h-9 px-3 rounded-md text-[12px] font-medium flex items-center gap-1 shrink-0"
            :class="pathButtonClass" title="选择目录">
            <i class="ri-folder-open-line text-[13px]" /> 浏览
          </button>
        </div>
        <div class="text-[10.5px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">默认：{{ pythonStatus?.venv?.defaultPath || '用户数据目录' }}。不能直接选盘符根目录（如 D:\），会自动补充子目录名。</div>
        <div class="text-[10.5px] mt-0.5" :class="isDark ? 'text-amber-400/70' : 'text-amber-600/80'">⚠ 不能选授权工作目录内的位置（会与数据库冲突）。建议选工作目录之外的独立文件夹，如 D:\Reviva-venv。</div>
      </div>

      <!-- 初始化/重建/删除 结果 -->
      <div v-if="venvInitResult" class="mb-3 text-[11px] leading-snug px-3 py-2 rounded whitespace-pre-wrap break-all"
        :class="venvInitResult.success
          ? (isDark ? 'bg-emerald-400/8 text-emerald-300/85 border border-emerald-400/15' : 'bg-emerald-50/70 text-emerald-700/85 border border-emerald-100')
          : (isDark ? 'bg-red-400/8 text-red-300/85 border border-red-400/15' : 'bg-red-50/70 text-red-600/85 border border-red-100')">
        {{ venvInitResult.success ? (venvInitResult.alreadyReady ? '虚拟环境已存在且可用。' : '虚拟环境创建成功，pip 已就绪。') : (venvInitResult.error || '初始化失败') }}
        <span v-if="!venvInitResult.success && (venvInitResult.stderr || venvInitResult.stdout)" class="block font-mono mt-0.5">
          {{ (venvInitResult.stderr || venvInitResult.stdout || '').slice(-260) }}
        </span>
        <span v-if="venvInitResult.bootstrapError" class="block font-mono mt-0.5">{{ venvInitResult.bootstrapError }}</span>
      </div>
﻿
      <!-- 管理面板 -->
      <div v-if="showVenvManage && venvReady" class="rounded-lg p-4 space-y-3"
        :class="isDark ? 'bg-d0/40 border border-d4' : 'bg-l2/40 border border-bdrF'">
        <!-- 路径 -->
        <div>
        <div class="text-[12px] font-semibold mb-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">虚拟环境路径</div>
          <div class="flex items-center gap-2">
            <div class="flex-1 min-w-0 relative">
              <i class="ri-folder-3-line text-[15px] absolute left-2.5 top-1/2 -translate-y-1/2" :class="isDark ? 'text-brand-400/70' : 'text-brand-500/80'" />
              <input v-model="pendingVenvPath" type="text" spellcheck="false" aria-label="虚拟环境路径" placeholder="虚拟环境路径"
                class="w-full h-8 pl-8 pr-3 rounded-md text-[14px] font-mono"
                :class="pathInputClass" @keyup.enter="applyVenvPath" />
            </div>
            <button type="button" @click="applyVenvPath" :disabled="!canApplyVenvPath"
              class="h-8 px-3 rounded-md text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              :class="pathPrimaryButtonClass">
              应用
            </button>
            <button type="button" @click="chooseVenvPath" class="h-8 px-3 rounded-md text-[12px] font-medium flex items-center gap-1"
              :class="pathButtonClass">
              <i class="ri-folder-open-line text-[12px]" /> 浏览
            </button>
          </div>
          <div class="text-[10.5px] mt-1.5 flex items-center gap-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-information-line text-[11px] shrink-0" />
            <span>更改路径后需重新初始化。默认：{{ pythonStatus?.venv?.defaultPath }}</span>
          </div>
        </div>

                <!-- PyPI 镜像源 -->
        <div>
          <div class="text-[11px] font-semibold mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">PyPI 镜像源</div>
          <div class="flex items-center gap-2 flex-wrap">
            <button v-for="preset in pypiMirrorPresets" :key="preset.id"
              @click="applyPypiMirror(preset.id)"
              class="h-8 px-3 rounded-md text-[11px] font-medium transition-colors"
              :class="pypiMirrorId === preset.id
                ? (isDark ? 'bg-brand-400/15 text-brand-400 border border-brand-400/30' : 'bg-brand-100 text-brand-600 border border-brand-300')
                : (isDark ? 'bg-d4/50 text-wt-aux border border-d4 hover:bg-d4' : 'bg-l4/70 text-lt-aux border border-bdrF hover:bg-l4')">
              {{ preset.label }}
            </button>
            <button @click="applyPypiMirror('custom')"
              class="h-8 px-3 rounded-md text-[11px] font-medium transition-colors"
              :class="pypiMirrorId === 'custom'
                ? (isDark ? 'bg-brand-400/15 text-brand-400 border border-brand-400/30' : 'bg-brand-100 text-brand-600 border border-brand-300')
                : (isDark ? 'bg-d4/50 text-wt-aux border border-d4 hover:bg-d4' : 'bg-l4/70 text-lt-aux border border-bdrF hover:bg-l4')">
              自定义
            </button>
          </div>
          <div v-if="pypiMirrorId === 'custom'" class="flex items-center gap-2 mt-2">
            <input v-model="pypiCustomUrl" type="text" placeholder="https://your-mirror.com/simple/"
              class="flex-1 h-8 px-2 rounded-md text-[11px] font-mono"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-main' : 'bg-l2 border border-bdrF text-lt-main'"
              @keyup.enter="applyPypiCustomUrl" />
            <button @click="applyPypiCustomUrl"
              class="h-8 px-3 rounded-md text-[11px] font-medium"
              :class="isDark ? 'bg-d4/60 text-wt-aux hover:bg-d4 border border-d4' : 'bg-l4/70 text-lt-aux hover:bg-l4 border border-bdrF'">
              应用
            </button>
          </div>
          <div class="text-[10px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">安装包时使用的 PyPI 镜像源，影响 venv 内所有 pip 安装。</div>
        </div>

        <!-- 解释器来源 -->
        <div>
          <div class="text-[11px] font-semibold mb-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">解释器来源</div>
          <div class="flex items-center gap-2">
            <button @click="applyInterpreterSource('builtin')" :disabled="switchingSource"
              class="h-8 px-3.5 rounded-md text-[11.5px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              :class="interpreterSource === 'builtin'
                ? (isDark ? 'bg-brand-400/15 text-brand-400 border border-brand-400/30' : 'bg-brand-100 text-brand-600 border border-brand-300')
                : (isDark ? 'bg-d4/50 text-wt-aux border border-d4 hover:bg-d4' : 'bg-l4/70 text-lt-aux border border-bdrF hover:bg-l4')">
              内置 Python
            </button>
            <button @click="applyInterpreterSource('system')" :disabled="switchingSource"
              class="h-8 px-3.5 rounded-md text-[11.5px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              :class="interpreterSource === 'system'
                ? (isDark ? 'bg-brand-400/15 text-brand-400 border border-brand-400/30' : 'bg-brand-100 text-brand-600 border border-brand-300')
                : (isDark ? 'bg-d4/50 text-wt-aux border border-d4 hover:bg-d4' : 'bg-l4/70 text-lt-aux border border-bdrF hover:bg-l4')">
              系统 Python
            </button>
            <button @click="detectSystemPython" :disabled="detectingSystemPython"
              class="h-8 px-3 rounded-md text-[11px] flex items-center gap-1 disabled:opacity-50"
              :class="isDark ? 'bg-d4/50 text-wt-aux hover:bg-d4 border border-d4' : 'bg-l4/70 text-lt-aux hover:bg-l4 border border-bdrF'">
              <span v-if="detectingSystemPython" class="loader-ring" :style="{ '--ring-color': isDark ? '#6C8AFF' : '#4A6CFF' }" />
              检测系统
            </button>
          </div>
          <div v-if="systemPythonResult" class="text-[10.5px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <template v-if="systemPythonResult.found">
              检测到 {{ systemPythonResult.version }}<span v-if="!systemPythonResult.ok">（版本低于 3.11，不可用）</span>
            </template>
            <template v-else>未检测到系统 Python</template>
          </div>
          <div class="text-[10px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">切换来源后需重建虚拟环境。</div>
        </div>

﻿
        <!-- 已安装包管理 -->
        <div class="border-t" :class="isDark ? 'border-d4' : 'border-bdrF'">
          <div class="flex items-center gap-2 mb-2.5">
            <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">已安装包</div>
            <span class="text-[10px] font-600" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ packagesCount }} 个</span>
            <button @click="openInstallPackageModal" :disabled="installingPackage"
              class="ml-auto h-7 px-2.5 rounded-md text-[10.5px] font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              :class="isDark ? 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'">
              <span v-if="installingPackage" class="loader-ring" :style="{ '--ring-color': isDark ? '#34D399' : '#059669' }" />
              <i v-else class="ri-add-line text-[11px]" />
              安装包
            </button>
            <button @click="loadPackages" :disabled="loadingPackages"
              class="h-7 px-2.5 rounded-md text-[10.5px] flex items-center gap-1 disabled:opacity-50"
              :class="isDark ? 'bg-d4/50 text-wt-aux hover:bg-d4' : 'bg-l4/70 text-lt-aux hover:bg-l4'">
              <i class="ri-refresh-line text-[11px]" :class="loadingPackages ? 'animate-spin' : ''" /> 刷新
            </button>
          </div>

          <!-- 搜索 -->
          <div v-if="packagesCount > 0" class="relative mb-2.5" role="search">
            <i class="ri-search-line text-[12px] absolute left-2.5 top-1/2 -translate-y-1/2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <input v-model="packageSearch" type="text" aria-label="搜索已安装的包" placeholder="搜索已安装的包…"
              spellcheck="false"
              class="w-full h-8 pl-8 pr-8 rounded-md text-[11px] font-mono"
              :class="isDark ? 'bg-d0 text-wt-main border border-d4 focus:border-brand-400/50' : 'bg-white text-lt-main border border-bdrF focus:border-brand-400/50'" />
            <button v-if="packageSearch" type="button" @click="packageSearch = ''" title="清除搜索"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center"
              :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-d4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
              <i class="ri-close-line text-[12px]" />
            </button>
          </div>

          <!-- 包列表（固定高度 + 滚动） -->
          <div class="pkg-list-wrap rounded-md border" :class="isDark ? 'border-d4' : 'border-bdrF'">
            <div v-if="loadingPackages && !packagesCount" class="flex items-center gap-2 py-6 justify-center">
              <span class="loader-ring" :style="{ '--ring-color': isDark ? '#6C8AFF' : '#4A6CFF' }" />
              <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">加载中…</span>
            </div>
            <div v-else-if="!packagesCount" class="py-8 text-center">
              <i class="ri-inbox-line text-[28px]" :class="isDark ? 'text-wt-dim/40' : 'text-lt-aux/50'" />
              <div class="text-[11px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无已安装的包</div>
              <div class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/80'">在上方输入包名后点击"安装"</div>
            </div>
            <div v-else-if="!filteredPackages.length" class="py-8 text-center">
              <i class="ri-search-eye-line text-[28px]" :class="isDark ? 'text-wt-dim/40' : 'text-lt-aux/50'" />
              <div class="text-[11px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未找到匹配"{{ packageSearch }}"的包</div>
              <button @click="packageSearch = ''" class="text-[10px] mt-1 underline" :class="isDark ? 'text-brand-400' : 'text-brand-500'">清除搜索</button>
            </div>
            <div v-else class="pkg-list-inner">
              <div v-for="pkg in filteredPackages" :key="pkg.name"
                class="flex items-center gap-2 py-1.5 px-2.5 text-[11px] border-b last:border-b-0"
                :class="isDark ? 'border-d4 hover:bg-d0/60' : 'border-bdrF hover:bg-l2/60'">
                <div class="flex-1 min-w-0">
                  <span class="font-mono font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ pkg.name }}</span>
                  <span class="ml-1.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ pkg.version }}</span>
                </div>
                <button @click="showPackageInfo(pkg.name)" :disabled="loadingPackageInfo === pkg.name"
                  class="w-6 h-6 rounded flex items-center justify-center disabled:opacity-50"
                  :class="isDark ? 'text-wt-aux hover:bg-d4' : 'text-lt-aux hover:bg-l4'" title="详情">
                  <span v-if="loadingPackageInfo === pkg.name" class="loader-ring" :style="{ '--ring-color': isDark ? '#6C8AFF' : '#4A6CFF' }" />
                  <i v-else class="ri-information-line text-[12px]" />
                </button>
                <button @click="uninstallPkg(pkg.name)" :disabled="uninstallingPackage === pkg.name"
                  class="w-6 h-6 rounded flex items-center justify-center disabled:opacity-50"
                  :class="isDark ? 'text-red-400/80 hover:bg-red-400/10' : 'text-red-500/80 hover:bg-red-50'" title="卸载">
                  <span v-if="uninstallingPackage === pkg.name" class="loader-ring" :style="{ '--ring-color': isDark ? '#F87171' : '#EF4444' }" />
                  <i v-else class="ri-delete-bin-line text-[12px]" />
                </button>
              </div>
            </div>
          </div>

          <!-- 包详情 -->
          <div v-if="packageInfo" class="mt-2 rounded-md p-2.5 text-[10.5px] leading-relaxed"
            :class="isDark ? 'bg-d0/60 border border-d4' : 'bg-l2/60 border border-bdrF'">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-mono font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ packageInfo.name }}</span>
              <button @click="packageInfo = null" class="ml-auto w-5 h-5 rounded flex items-center justify-center"
                :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
                <i class="ri-close-line text-[12px]" />
              </button>
            </div>
            <div v-if="packageInfo.version" class="font-mono" :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">版本: {{ packageInfo.version }}</div>
            <div v-if="packageInfo.summary" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ packageInfo.summary }}</div>
            <div v-if="packageInfo['home-page'] || packageInfo.author" class="mt-0.5 font-mono" :class="isDark ? 'text-wt-dim/80' : 'text-lt-aux/90'">
              <span v-if="packageInfo.author">作者: {{ packageInfo.author }}</span>
              <span v-if="packageInfo['home-page']" class="ml-2">主页: {{ packageInfo['home-page'] }}</span>
            </div>
            <div v-if="packageInfo.requires" class="mt-0.5 font-mono" :class="isDark ? 'text-wt-dim/80' : 'text-lt-aux/90'">依赖: {{ packageInfo.requires }}</div>
          </div>

          <!-- 操作结果（含错误详情展开） -->
          <div v-if="packageActionResult" class="mt-2 text-[10.5px] leading-snug px-2.5 py-1.5 rounded"
            :class="packageActionResult.success
              ? (isDark ? 'bg-emerald-400/8 text-emerald-300/85 border border-emerald-400/15' : 'bg-emerald-50/70 text-emerald-700/85 border border-emerald-100')
              : (isDark ? 'bg-red-400/8 text-red-300/85 border border-red-400/15' : 'bg-red-50/70 text-red-600/85 border border-red-100')">
            <div class="flex items-center gap-1.5">
              <i :class="packageActionResult.success ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'" class="text-[11px]" />
              <span class="flex-1">{{ packageActionResult.success ? '操作成功。' : (packageActionResult.error || '操作失败') }}</span>
              <button v-if="!packageActionResult.success && (packageActionResult.stderr || packageActionResult.stdout || packageActionResult.command)" @click="showInstallDetail = !showInstallDetail"
                class="text-[10px] underline opacity-80 hover:opacity-100">
                {{ showInstallDetail ? '收起' : '详情' }}
              </button>
              <button @click="packageActionResult = null" class="text-[10px] opacity-60 hover:opacity-100">关闭</button>
            </div>
            <div v-if="showInstallDetail && !packageActionResult.success" class="mt-1.5 space-y-1 font-mono">
              <div v-if="packageActionResult.command" class="text-[9.5px] opacity-70 break-all">$ {{ packageActionResult.command }}</div>
              <div v-if="packageActionResult.stderr" class="text-[9.5px] whitespace-pre-wrap break-all opacity-90 max-h-32 overflow-y-auto">{{ packageActionResult.stderr.slice(-400) }}</div>
              <div v-if="packageActionResult.stdout" class="text-[9.5px] whitespace-pre-wrap break-all opacity-70 max-h-32 overflow-y-auto">{{ packageActionResult.stdout.slice(-400) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tip -->
    <div class="rounded-xl p-3" :class="isDark ? 'bg-d3/50 border border-bdr' : 'bg-l3/50 border border-bdrF'">
      <div class="flex items-center gap-2">
        <i class="ri-lightbulb-line text-amber-400 text-[14px] mt-[2px]" />
        <p class="text-[12px] leading-relaxed flex-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          切换解释器来源（内置 / 系统 Python）后需重建虚拟环境。包安装通过 PyPI 镜像源加速，支持指定版本（如 <span class="font-mono px-1 rounded" :class="isDark ? 'bg-d0 text-wt-aux' : 'bg-l2 text-lt-sub'">requests==2.31.0</span>）。系统 Python 需为 3.11 或更高版本。
        </p>
      </div>
    </div>

    <MsModal v-model:show="showInstallPackageModal" :width="460" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center"
            :class="isDark ? 'bg-emerald-400/10 border border-emerald-400/20' : 'bg-emerald-50 border border-emerald-100'">
            <i class="ri-add-circle-line text-[15px]" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'" />
          </div>
          <div>
            <div class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">安装 Python 包</div>
            <div class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">安装到当前虚拟环境</div>
          </div>
        </div>
      </template>

      <div class="space-y-3">
        <div>
          <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'" for="python-package-input">包名</label>
          <input id="python-package-input" v-model="installPackageName" type="text" spellcheck="false"
            placeholder="requests，或 requests==2.31.0" autocomplete="off"
            class="w-full h-9 px-3 rounded-md text-[12px] font-mono"
            :class="isDark ? 'bg-d0 text-wt-main border border-d4 focus:border-brand-400/50' : 'bg-white text-lt-main border border-bdrF focus:border-brand-400/50'"
            @keyup.enter="confirmInstallPackage" />
          <div class="text-[10.5px] mt-1.5" :class="parseInstallInput(installPackageName).valid || !installPackageName.trim() ? (isDark ? 'text-wt-dim' : 'text-lt-aux') : (isDark ? 'text-red-400' : 'text-red-600')">
            {{ installInputHint }}
          </div>
        </div>
      </div>

      <template #footer>
        <button type="button" class="h-8 px-3.5 rounded-md text-[11.5px] font-medium"
          :class="isDark ? 'bg-d4/60 text-wt-aux hover:bg-d4 border border-d4' : 'bg-l4/70 text-lt-aux hover:bg-l4 border border-bdrF'"
          @click="showInstallPackageModal = false">
          取消
        </button>
        <button type="button" @click="confirmInstallPackage" :disabled="installingPackage || !parseInstallInput(installPackageName).valid"
          class="h-8 px-3.5 rounded-md text-[11.5px] font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          :class="isDark ? 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'">
          <span v-if="installingPackage" class="loader-ring" :style="{ '--ring-color': isDark ? '#34D399' : '#059669' }" />
          <i v-else class="ri-download-2-line text-[13px]" />
          {{ installingPackage ? '安装中…' : '确认安装' }}
        </button>
      </template>
    </MsModal>
  </div>
</template>

<style scoped>
.ctx-pill { display: inline-flex; padding: 1px 5px; border-radius: 3px; font-weight: 600; line-height: 1.4; }

/* Loader ring (spinning) */
.loader-ring {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid transparent;
  border-top-color: var(--ring-color, #6C8AFF);
  border-right-color: var(--ring-color, #6C8AFF);
  animation: ring-spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes ring-spin {
  to { transform: rotate(360deg); }
}

/* Fixed-height package list with scroll */
.pkg-list-wrap {
  max-height: 240px;
  overflow: hidden;
}
.pkg-list-inner {
  max-height: 240px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.pkg-list-inner::-webkit-scrollbar {
  width: 6px;
}
.pkg-list-inner::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: rgba(128, 128, 128, 0.35);
}
.pkg-list-inner::-webkit-scrollbar-track {
  background: transparent;
}
</style>
