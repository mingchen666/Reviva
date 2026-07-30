<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'

const appStore = useAppStore()
const ss = useSettingsStore()
const msg = useMessage()
const mbox = useMessageBox()
const isDark = computed(() => appStore.isDark)

/* ── 主题选择器 ── */
const themeDropdownOpen = ref(false)
const themeDropdownRef = ref(null)
const currentTheme = computed(() => ss.availableThemes.find(t => t.id === ss.themeId) ?? null)

function onDocPointerDown(e) {
  if (themeDropdownRef.value && !themeDropdownRef.value.contains(e.target)) {
    themeDropdownOpen.value = false
  }
}
onMounted(() => document.addEventListener('pointerdown', onDocPointerDown))

async function selectThemeAndClose(id) {
  await selectTheme(id)
  themeDropdownOpen.value = false
}

/* ── 主题数据 ── */
const showCustomColor = computed(() => ss.accentColor === 'custom')
const useThemeAccent = computed(() => ss.accentColor === 'theme')
const accentOptions = ss.ACCENT_PRESETS
const activeThemeAccent = computed(() => ss.currentTheme.accentHex)
const selectedUserTheme = computed(() => ss.userThemes.find(t => t.id === ss.themeId) ?? null)
const visibleThemeErrors = computed(() => ss.themeLoadErrors.slice(0, 3))
const themeGroups = computed(() =>
  [
    { id: 'builtin', label: '内置主题', themes: ss.availableThemes.filter(t => t.source === 'builtin') },
    { id: 'user', label: '用户主题', themes: ss.availableThemes.filter(t => t.source === 'user') },
  ].filter(g => g.themes.length),
)

/* ── 颜色模式 ── */
const colorModes = [
  { key: 'dark', icon: 'ri-moon-fill', label: '暗色' },
  { key: 'light', icon: 'ri-sun-fill', label: '浅色' },
  { key: 'system', icon: 'ri-computer-fill', label: '跟随系统' },
]
function supportsColorMode(mode) {
  return mode === 'system' || ss.currentTheme.supports?.includes(mode)
}
function isColorModeSelected(mode) {
  if (mode === 'system') return ss.themeMode === 'system'
  if (ss.themeMode === 'system') return false
  if (supportsColorMode(ss.themeMode)) return ss.themeMode === mode
  return appStore.colorMode === mode
}
async function selectColorMode(mode) {
  if (!supportsColorMode(mode)) return
  const r = await ss.savePreference('themeMode', mode)
  if (r && r.success === false) msg.error(r.error || '切换颜色模式失败')
}

/* ── 主题预览 ── */
function themePreview(theme) {
  const mode = isDark.value ? 'dark' : 'light'
  if (theme.preview?.[mode]) return theme.preview[mode]
  return isDark.value
    ? { page: '#151518', sidebar: '#1d1d22', panel: '#292930', accent: theme.accentHex }
    : { page: '#f7f7f8', sidebar: '#eeeeF1', panel: '#ffffff', accent: theme.accentHex }
}
function themePreviewFrameStyle(theme) {
  const s = themePreview(theme)
  const st = theme.previewStyle || {}
  const elev = st.elevation || 'soft'
  const shadow =
    elev === 'glow' ? `0 0 8px ${s.accent}66`
    : elev === 'offset' ? `3px 3px 0 ${s.border || s.accent}55`
    : elev === 'flat' ? 'none'
    : `0 2px 5px ${s.border || s.accent}33`
  return {
    backgroundColor: s.page,
    borderColor: s.border || (isDark.value ? '#3a3a44' : '#d9d9df'),
    borderRadius: `${st.radius ?? 6}px`,
    borderWidth: `${st.borderWidth ?? 1}px`,
    boxShadow: shadow,
  }
}
function themePreviewPartStyle(theme, part) {
  const s = themePreview(theme)
  const r = Math.max(0, Number(theme.previewStyle?.radius ?? 6) - 1)
  if (part === 'bubble') {
    return { backgroundColor: s.secondary || s.accent, borderColor: s.accent, borderRadius: `${r}px` }
  }
  return {
    backgroundColor: s.accent,
    borderRadius: `${r}px`,
    boxShadow: theme.previewStyle?.elevation === 'glow' ? `0 0 5px ${s.accent}` : 'none',
  }
}

/* ── 主题操作 ── */
async function importUserTheme() {
  const r = await ss.importTheme()
  if (r?.canceled) return
  if (!r?.success) return msg.error(r?.error || '导入主题失败')
  msg.success(`已导入并应用「${r.theme.name}」`)
}
async function selectTheme(id) {
  const r = await ss.savePreference('themeId', id)
  if (r && r.success === false) msg.error(r.error || '切换主题失败')
}
async function reloadUserThemes() {
  const r = await ss.reloadThemes()
  if (!r?.success) return msg.error(r?.error || '重新加载主题失败')
  msg.success('主题已重新加载')
}
async function openThemeDirectory() {
  const r = await ss.openThemeDirectory()
  if (r && r.success === false) msg.error(r.error || '无法打开主题目录')
}
async function removeSelectedTheme() {
  if (!selectedUserTheme.value) return
  const ok = await mbox.confirm({
    title: '删除用户主题',
    message: `确定删除「${selectedUserTheme.value.name}」吗？当前界面会恢复为经典主题。`,
    variant: 'warning',
    confirmText: '删除主题',
    cancelText: '取消',
  })
  if (!ok) return
  const r = await ss.removeTheme(selectedUserTheme.value.id)
  if (!r?.success) return msg.error(r?.error || '删除主题失败')
  msg.success('用户主题已删除')
}

/* ── 自定义 CSS ── */
const cssDraft = ref('')
const cssDraftTouched = ref(false)
const cssError = ref('')
const cssEditor = ref(null)
const cursorLine = ref(1)
const cursorColumn = ref(1)
const hasUnappliedCss = computed(() => cssDraft.value !== ss.customCss)
const cssByteLength = computed(() => new TextEncoder().encode(cssDraft.value).length)
const customCssStatus = computed(() => {
  if (ss.customCssPreviewing) return `正在预览，${ss.customCssSecondsRemaining} 秒后自动恢复`
  if (hasUnappliedCss.value) return '有未应用修改'
  if (ss.customCss.trim()) return '已应用'
  return '未设置'
})

watch(() => ss.customCss, v => {
  if (!cssDraftTouched.value && !ss.customCssPreviewing) cssDraft.value = v
}, { immediate: true })

watch(() => ss.customCssPreviewing, (active, prev) => {
  if (prev && !active) {
    cssDraft.value = ss.customCss
    cssDraftTouched.value = false
  }
})

function updateCursor(event) {
  const t = event?.target || cssEditor.value
  if (!t) return
  const before = t.value.slice(0, t.selectionStart || 0)
  const lines = before.split('\n')
  cursorLine.value = lines.length
  cursorColumn.value = lines.at(-1).length + 1
}
function updateCssDraft(event) {
  cssDraft.value = event.target.value
  cssDraftTouched.value = cssDraft.value !== ss.customCss
  cssError.value = ''
  updateCursor(event)
}
async function applyCustomCss() {
  cssError.value = ''
  const r = await ss.previewCustomCss(cssDraft.value)
  if (r?.busy) return
  if (!r?.success) {
    cssError.value = r?.error || '无法应用自定义 CSS'
    return msg.error(cssError.value)
  }
}
async function keepCustomCss() {
  const r = await ss.commitCustomCss()
  if (r?.busy) return
  if (!r?.success) {
    cssError.value = r?.error || '无法保存自定义 CSS'
    return msg.error(cssError.value)
  }
  cssDraft.value = ss.customCss
  cssDraftTouched.value = false
  msg.success('自定义 CSS 已保存')
}
async function restoreCustomCss(showMessage = true) {
  const r = await ss.rollbackCustomCss()
  if (r?.busy) return
  cssDraft.value = ss.customCss
  cssDraftTouched.value = false
  if (!r?.success) {
    cssError.value = r?.error || '无法恢复上一份自定义 CSS'
    return showMessage && msg.error(cssError.value)
  }
  if (showMessage) msg.info('已恢复上一份样式')
}
async function resetCustomCss() {
  const ok = await mbox.confirm({
    title: '重置自定义 CSS',
    message: '将清空全部自定义 CSS，并立即恢复当前主题的原始样式。',
    variant: 'warning',
    confirmText: '重置样式',
    cancelText: '取消',
  })
  if (!ok) return
  const r = await ss.resetCustomCss()
  if (r?.busy) return
  if (!r?.success) return msg.error(r?.error || '重置自定义 CSS 失败')
  cssDraft.value = ''
  cssDraftTouched.value = false
  cssError.value = ''
  msg.success('已恢复当前主题')
}

/* ── CSS 参考区块 ── */
const refOpen = ref(false)
const refTab = ref('start')

const refTabs = [
  { key: 'start', label: '快速开始', icon: 'ri-rocket-2-line' },
  { key: 'vars', label: '变量速查', icon: 'ri-list-settings-line' },
  { key: 'advanced', label: '进阶覆盖', icon: 'ri-code-s-slash-line' },
  { key: 'limits', label: '限制与注意', icon: 'ri-shield-check-line' },
]

const cssVarGroups = [
  { label: '背景', vars: ['--ui-bg-0', '--ui-bg-1', '--ui-bg-2', '--ui-bg-3', '--ui-bg-4'] },
  { label: '文字', vars: ['--ui-text-main', '--ui-text-sub', '--ui-text-aux', '--ui-text-dim'] },
  { label: '边框', vars: ['--ui-border-panel', '--ui-border-card', '--ui-border-focus'] },
  { label: '品牌色', vars: ['--ui-brand-50', '--ui-brand-100', '--ui-brand-200', '--ui-brand-300', '--ui-brand-400', '--ui-brand-500', '--ui-brand-600'] },
  { label: '副强调', vars: ['--ui-accent-secondary'] },
  { label: '圆角', vars: ['--ui-radius-small', '--ui-radius-control', '--ui-radius-medium', '--ui-radius-card', '--ui-radius-dialog'] },
  { label: '阴影', vars: ['--ui-shadow-small', '--ui-shadow-panel', '--ui-shadow-popup', '--ui-shadow-dialog'] },
  { label: '动效', vars: ['--ui-motion-fast', '--ui-motion-normal', '--ui-motion-slow', '--ui-motion-ease'] },
]

const cssExamples = [
  {
    title: '加大全局圆角',
    desc: '一行变量覆盖，所有卡片、按钮、弹窗同时变圆。',
    code: `.theme-my-theme {\n  --ui-radius-card: 16px;\n  --ui-radius-control: 10px;\n  --ui-radius-dialog: 20px;\n}`,
  },
  {
    title: '侧边栏虚线分隔',
    desc: '给左侧导航加一条虚线，视觉更轻。',
    code: `.theme-my-theme nav {\n  border-right: 1px dashed var(--ui-border-card);\n}`,
  },
  {
    title: '代码块加边框',
    desc: '让 Markdown 中的代码块有明确边界。',
    code: `.theme-my-theme .md-content pre {\n  border: 1px solid var(--ui-border-card);\n  border-radius: var(--ui-radius-control);\n}`,
  },
]

function insertAtCursor(text) {
  const el = cssEditor.value
  if (!el) {
    cssDraft.value += text
    cssDraftTouched.value = cssDraft.value !== ss.customCss
    return
  }
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  cssDraft.value = next
  cssDraftTouched.value = next !== ss.customCss
  cssError.value = ''
  requestAnimationFrame(() => {
    el.focus()
    el.selectionStart = el.selectionEnd = start + text.length
    updateCursor()
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function insertExample(code) {
  const prefix = cssDraft.value.trim() ? '\n\n' : ''
  insertAtCursor(prefix + code + '\n')
}

/* ── 路由守卫 & 卸载 ── */
onBeforeRouteLeave(async () => {
  if (ss.customCssBusy) {
    msg.info('请等待自定义 CSS 操作完成')
    return false
  }
  if (ss.customCssPreviewing) await restoreCustomCss(false)
  if (!hasUnappliedCss.value) return true
  return await mbox.confirm({
    title: '放弃未应用的样式？',
    message: '自定义 CSS 还有未应用修改。离开后将丢弃这些修改。',
    variant: 'warning',
    confirmText: '放弃修改',
    cancelText: '继续编辑',
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  if (ss.customCssPreviewing) void ss.rollbackCustomCss()
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 py-8 space-y-8">

    <!-- ═══════════ 外观 ═══════════ -->
    <section>
      <div class="flex items-center gap-2.5 mb-5">
        <div class="w-1 h-4.5 rounded-full bg-brand-400" />
        <h2 class="text-15px font-700" :class="isDark ? 'text-wt-main' : 'text-lt-main'">外观</h2>
      </div>

      <div class="rounded-xl p-5 space-y-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">

        <!-- 界面主题 -->
        <div class="flex items-center gap-4">
          <label class="w-20 shrink-0 text-13px font-600" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">界面主题</label>
          <div ref="themeDropdownRef" class="relative flex-1">
            <button
              class="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-left transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 hover:border-brand-400/30' : 'bg-white border border-bdrF hover:border-brand-300'"
              @click="themeDropdownOpen = !themeDropdownOpen"
            >
              <span v-if="currentTheme" class="w-9 h-7 shrink-0 grid grid-cols-[7px_1fr] overflow-hidden border border-solid" :style="themePreviewFrameStyle(currentTheme)">
                <span :style="{ backgroundColor: themePreview(currentTheme).sidebar }" />
                <span class="flex flex-col justify-center gap-0.5 px-1" :style="{ backgroundColor: themePreview(currentTheme).panel }">
                  <span class="h-2px w-full" :style="themePreviewPartStyle(currentTheme, 'accent')" />
                  <span class="h-4px w-4/5 border" :style="themePreviewPartStyle(currentTheme, 'bubble')" />
                </span>
              </span>
              <span class="flex-1 min-w-0 text-13px font-500 truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ currentTheme?.name ?? '选择主题' }}</span>
              <i class="ri-arrow-down-s-line text-16px transition-transform duration-200" :class="[themeDropdownOpen ? 'rotate-180' : '', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
            </button>
            <Transition name="dropdown">
              <div v-if="themeDropdownOpen" class="absolute z-50 mt-1.5 w-full rounded-xl overflow-hidden border shadow-2xl" :class="isDark ? 'bg-d2 border-d4' : 'bg-white border-bdrF'">
                <div class="max-h-72 overflow-y-auto thin-scroll py-1.5">
                  <template v-for="group in themeGroups" :key="group.id">
                    <div class="px-3.5 pt-2.5 pb-1 text-11px font-600 uppercase tracking-wider" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ group.label }}</div>
                    <button
                      v-for="theme in group.themes" :key="theme.id"
                      class="w-full px-3.5 py-2 flex items-center gap-3 text-left transition-colors"
                      :class="ss.themeId === theme.id ? (isDark ? 'bg-brand-400/10' : 'bg-brand-50') : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')"
                      @click="selectThemeAndClose(theme.id)"
                    >
                      <span class="w-9 h-7 shrink-0 grid grid-cols-[7px_1fr] overflow-hidden border border-solid" :style="themePreviewFrameStyle(theme)">
                        <span :style="{ backgroundColor: themePreview(theme).sidebar }" />
                        <span class="flex flex-col justify-center gap-0.5 px-1" :style="{ backgroundColor: themePreview(theme).panel }">
                          <span class="h-2px w-full" :style="themePreviewPartStyle(theme, 'accent')" />
                          <span class="h-4px w-4/5 border" :style="themePreviewPartStyle(theme, 'bubble')" />
                        </span>
                      </span>
                      <span class="flex-1 min-w-0">
                        <span class="flex items-center gap-1.5">
                          <span class="text-12px font-500" :class="ss.themeId === theme.id ? 'text-brand-400' : (isDark ? 'text-wt-main' : 'text-lt-main')">{{ theme.name }}</span>
                          <em v-if="theme.id === 'default'" class="not-italic text-10px px-1 py-px rounded" :class="isDark ? 'bg-white/8 text-wt-aux' : 'bg-l4 text-lt-aux'">默认</em>
                        </span>
                        <span class="block text-11px truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ theme.description }}</span>
                      </span>
                      <i v-if="ss.themeId === theme.id" class="ri-check-line text-15px text-brand-400 shrink-0" />
                    </button>
                  </template>
                </div>
              </div>
            </Transition>
          </div>
        </div>

        <!-- 颜色模式 -->
        <div class="flex items-center gap-4">
          <label class="w-20 shrink-0 text-13px font-600" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">颜色模式</label>
          <div class="inline-flex rounded-lg p-1 gap-1" :class="isDark ? 'bg-d0' : 'bg-l2'">
            <button
              v-for="m in colorModes" :key="m.key"
              :disabled="!supportsColorMode(m.key)"
              :aria-pressed="isColorModeSelected(m.key)"
              :title="supportsColorMode(m.key) ? m.label : `当前主题不支持${m.label}`"
              class="h-8 px-3.5 rounded-md text-12px font-500 flex items-center gap-1.5 transition-all disabled:opacity-35 disabled:cursor-not-allowed"
              :class="isColorModeSelected(m.key) ? 'bg-brand-500 text-white shadow-sm' : (isDark ? 'text-wt-sub hover:text-wt-main' : 'text-lt-sub hover:text-lt-main')"
              @click="selectColorMode(m.key)"
            >
              <i :class="m.icon" class="text-14px" />{{ m.label }}
            </button>
          </div>
        </div>

        <!-- 主题颜色 -->
        <div class="flex items-start gap-4">
          <label class="w-20 shrink-0 text-13px font-600 pt-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">主题颜色</label>
          <div class="flex-1">
            <div class="flex items-center gap-1 flex-wrap">
              <button class="flex flex-col items-center gap-1 py-1.5 px-2 rounded-lg transition-colors" :class="useThemeAccent ? (isDark ? 'bg-white/8' : 'bg-white shadow-sm') : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')" @click="ss.savePreference('accentColor', 'theme')">
                <span class="w-7 h-7 rounded-full border-2 transition-all" :class="useThemeAccent ? 'border-brand-400 shadow-md' : (isDark ? 'border-white/10' : 'border-black/8')" :style="`background:${activeThemeAccent}`" />
                <span class="text-11px font-500" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">跟随主题</span>
              </button>
              <button v-for="c in accentOptions" :key="c.key" class="flex flex-col items-center gap-1 py-1.5 px-2 rounded-lg transition-colors" :class="ss.accentColor === c.key && !showCustomColor ? (isDark ? 'bg-white/8' : 'bg-white shadow-sm') : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')" @click="ss.savePreference('accentColor', c.key)">
                <span class="w-7 h-7 rounded-full border-2 transition-all" :class="ss.accentColor === c.key && !showCustomColor ? 'border-brand-400 shadow-md' : (isDark ? 'border-white/10' : 'border-black/8')" :style="`background:${c.hex}`" />
                <span class="text-11px font-500" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ c.label }}</span>
              </button>
              <button class="flex flex-col items-center gap-1 py-1.5 px-2 rounded-lg transition-colors" :class="showCustomColor ? (isDark ? 'bg-white/8' : 'bg-white shadow-sm') : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')" @click="ss.savePreference('accentColor', 'custom')">
                <span class="w-7 h-7 rounded-full border-2 border-dashed relative transition-all" :class="showCustomColor ? 'border-brand-400' : (isDark ? 'border-white/20' : 'border-black/15')" :style="showCustomColor ? `background:${ss.customAccentHex}` : ''">
                  <i v-if="!showCustomColor" class="ri-add-line text-12px absolute inset-0 m-auto w-fit h-fit" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                </span>
                <span class="text-11px font-500" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">自定义</span>
              </button>
            </div>
            <Transition name="dropdown">
              <div v-if="showCustomColor" class="mt-3 flex items-center gap-3">
                <input type="color" :value="ss.customAccentHex" class="w-9 h-9 rounded-lg cursor-pointer border-0 p-0 bg-transparent" @input="ss.savePreference('customAccentHex', $event.target.value)" />
                <input type="text" :value="ss.customAccentHex" class="w-28 h-9 px-3 rounded-lg text-12px font-mono outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/50' : 'bg-white border border-bdrF text-lt-sub focus:border-brand-300'" @change="ss.savePreference('customAccentHex', $event.target.value)" />
              </div>
            </Transition>
          </div>
        </div>

        <!-- 主题管理 beta-->
        <!-- <div class="pt-4 border-t flex items-center gap-2" :class="isDark ? 'border-d4' : 'border-bdrF'">
          <button class="h-8 px-3 rounded-lg text-12px flex items-center gap-1.5 transition-colors border" :class="isDark ? 'bg-d0 text-wt-sub hover:text-wt-main border-d4' : 'bg-l2 text-lt-sub hover:text-lt-main border-bdrF'" @click="importUserTheme"><i class="ri-folder-add-line text-14px" />导入主题</button>
          <button class="h-8 px-3 rounded-lg text-12px flex items-center gap-1.5 transition-colors" :class="isDark ? 'text-wt-aux hover:bg-white/4' : 'text-lt-aux hover:bg-l4'" @click="openThemeDirectory"><i class="ri-folder-open-line text-14px" />打开目录</button>
          <button class="h-8 px-3 rounded-lg text-12px flex items-center gap-1.5 transition-colors" :class="isDark ? 'text-wt-aux hover:bg-white/4' : 'text-lt-aux hover:bg-l4'" @click="reloadUserThemes"><i class="ri-refresh-line text-14px" />重新加载</button>
          <button v-if="selectedUserTheme" class="h-8 px-3 rounded-lg text-12px flex items-center gap-1.5 transition-colors ml-auto" :class="isDark ? 'text-red-400 hover:bg-red-400/8' : 'text-red-500 hover:bg-red-50'" @click="removeSelectedTheme"><i class="ri-delete-bin-line text-14px" />删除</button>
        </div> -->

        <!-- 主题加载错误 -->
        <div v-if="ss.themeLoadErrors.length" class="rounded-lg px-3.5 py-2.5 text-12px border" :class="isDark ? 'border-amber-400/20 bg-amber-400/6 text-amber-400' : 'border-amber-500/20 bg-amber-50 text-amber-600'" role="status">
          <div class="flex items-center gap-1.5 font-600"><i class="ri-error-warning-line text-14px" />{{ ss.themeLoadErrors.length }} 个用户主题未能加载</div>
          <div v-for="item in visibleThemeErrors" :key="item.directory" class="mt-1 truncate" :title="`${item.directory}: ${item.error}`">{{ item.directory }}：{{ item.error }}</div>
        </div>
      </div>
    </section>

    <!-- ═══════════ 自定义 CSS ═══════════ -->
    <section>
      <div class="flex items-center gap-2.5 mb-5">
        <div class="w-1 h-4.5 rounded-full bg-emerald-400" />
        <h2 class="text-15px font-700" :class="isDark ? 'text-wt-main' : 'text-lt-main'">自定义 CSS</h2>
        <span class="ml-auto text-11px font-500" :class="hasUnappliedCss ? 'text-amber-400' : (isDark ? 'text-wt-dim' : 'text-lt-aux')">{{ customCssStatus }}</span>
      </div>

      <!-- 编辑器卡片 -->
      <div class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="h-10 px-4 flex items-center gap-3 border-b" :class="isDark ? 'border-d4' : 'border-bdrF'">
          <i class="ri-css3-fill text-14px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <span class="font-mono text-13px font-500" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">custom.css</span>
          <span class="ml-auto font-mono text-11px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ cursorLine }}:{{ cursorColumn }}</span>
          <span class="font-mono text-11px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ cssByteLength }} B</span>
        </div>

        <textarea
          ref="cssEditor"
          :value="cssDraft"
          :disabled="ss.customCssPreviewing || ss.customCssBusy"
          spellcheck="false"
          aria-label="自定义 CSS 编辑器"
          class="block w-full h-72 p-3 font-mono text-12.5px leading-4 outline-none disabled:opacity-60"
          :class="isDark ? 'bg-d0 text-wt-main placeholder:text-wt-dim/40' : 'bg-white text-lt-main placeholder:text-lt-aux/50'"
          placeholder="/* 试试把示例插入进来，改改数值，然后点「应用」 */&#10;.theme-my-theme {&#10;  --ui-radius-card: 16px;&#10;}"
          @input="updateCssDraft"
          @click="updateCursor"
          @keyup="updateCursor"
        />

        <div v-if="cssError" class="px-4 py-2.5 text-11px border-t flex items-center gap-1.5" :class="isDark ? 'border-red-400/20 bg-red-400/6 text-red-400' : 'border-red-200 bg-red-50 text-red-600'" role="alert">
          <i class="ri-error-warning-line text-13px" />{{ cssError }}
        </div>

        <!-- 预览中 -->
        <div v-if="ss.customCssPreviewing" class="px-4 py-3 flex items-center gap-2.5 border-t" :class="isDark ? 'border-amber-400/20 bg-amber-400/6' : 'border-amber-200 bg-amber-50'">
          <i class="ri-timer-line text-15px text-amber-400" />
          <span class="text-12px font-600 text-amber-500">{{ ss.customCssSecondsRemaining }} 秒后自动恢复</span>
          <div class="ml-auto flex gap-2">
            <button :disabled="ss.customCssBusy" class="h-8 px-3.5 rounded-lg text-12px font-600 bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" @click="keepCustomCss"><i class="ri-check-line mr-1" />保存样式</button>
            <button :disabled="ss.customCssBusy" class="h-8 px-3.5 rounded-lg text-12px disabled:opacity-40 disabled:cursor-not-allowed transition-colors border" :class="isDark ? 'bg-d0 text-wt-sub hover:text-wt-main border-d4' : 'bg-white text-lt-sub hover:text-lt-main border-bdrF'" @click="restoreCustomCss()"><i class="ri-arrow-go-back-line mr-1" />立即恢复</button>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div v-else class="h-12 px-4 flex items-center gap-2 border-t" :class="isDark ? 'border-d4' : 'border-bdrF'">
          <span class="text-11px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">最大1MB · 应用后 5 秒预览</span>
          <div class="ml-auto flex gap-2">
            <button class="h-8 px-4 rounded-lg text-13px flex items-center gap-1.5 disabled:opacity-35 disabled:cursor-not-allowed transition-colors" :disabled="ss.customCssBusy || (!ss.customCss && !cssDraft)" :class="isDark ? 'text-wt-sub hover:text-red-400 hover:bg-red-400/6' : 'text-lt-sub hover:text-red-500 hover:bg-red-50'" @click="resetCustomCss"><i class="ri-restart-line text-14px" />重置</button>
            <button class="h-8 px-4 rounded-lg text-13px font-600 flex items-center gap-1.5 text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors" :disabled="!hasUnappliedCss || ss.customCssBusy" :class="isDark ? 'bg-brand-400 hover:bg-brand-500' : 'bg-brand-500 hover:bg-brand-600'" @click="applyCustomCss"><i class="ri-play-line text-14px" />应用</button>
          </div>
        </div>
      </div>

      <!-- ═══ 自定义CSS 参考（可展开 + Tab 分流） ═══ -->
      <div class="mt-3 rounded-xl overflow-hidden border transition-colors" :class="isDark ? 'border-bdr bg-d3/50' : 'border-bdrF bg-l3/50'">
        <!-- 折叠头 -->
        <button
          class="w-full h-11 px-4 flex items-center gap-2.5 text-left transition-colors"
          :class="isDark ? 'hover:bg-white/3' : 'hover:bg-black/2'"
          :aria-expanded="refOpen"
          @click="refOpen = !refOpen"
        >
          <i class="ri-book-read-line text-15px text-emerald-400" />
          <span class="text-12px font-600" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">自定义CSS 参考</span>
          <span class="text-11px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">变量、示例、覆盖规则、限制</span>
          <i class="ri-arrow-down-s-line ml-auto text-16px transition-transform duration-200" :class="[refOpen ? 'rotate-180' : '', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
        </button>

        <!-- 展开内容 -->
        <Transition name="ref-expand">
          <div v-if="refOpen" class="border-t" :class="isDark ? 'border-bdr' : 'border-bdrF'">
            <!-- Tab 栏 -->
            <div class="px-4 pt-3 pb-0">
              <div class="inline-flex rounded-lg p-0.75 gap-0.5" :class="isDark ? 'bg-d0' : 'bg-l2'">
                <button
                  v-for="tab in refTabs" :key="tab.key"
                  class="h-7.5 px-3 rounded-md text-11px font-500 flex items-center gap-1.5 transition-all"
                  :class="refTab === tab.key
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')"
                  @click="refTab = tab.key"
                >
                  <i :class="tab.icon" class="text-13px" />{{ tab.label }}
                </button>
              </div>
            </div>

            <!-- Tab 内容 -->
            <div class="p-4">

              <!-- ─── 快速开始 ─── -->
              <div v-if="refTab === 'start'" class="space-y-4">
                <div class="text-12px leading-relaxed space-y-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  <p>在这里输入 CSS 就能调整界面外观。不需要懂主题开发，改几个数值就能看到效果。</p>
                  <div class="flex items-start gap-3 py-2.5 px-3.5 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-white'">
                    <div class="flex items-center gap-2 text-11px font-500 shrink-0" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                      <span class="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-10px font-700">1</span>
                      写入 CSS
                    </div>
                    <i class="ri-arrow-right-line text-12px mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                    <div class="flex items-center gap-2 text-11px font-500 shrink-0" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                      <span class="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-10px font-700">2</span>
                      点击「应用」
                    </div>
                    <i class="ri-arrow-right-line text-12px mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                    <div class="flex items-center gap-2 text-11px font-500 shrink-0" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                      <span class="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-10px font-700">3</span>
                      5 秒预览
                    </div>
                    <i class="ri-arrow-right-line text-12px mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                    <div class="flex items-center gap-2 text-11px font-500 shrink-0" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                      <span class="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-10px font-700">4</span>
                      点击「保留」
                    </div>
                  </div>
                  <p class="text-11px" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                    不满意？不用管它，5 秒后自动恢复。改坏了也不怕：点「重置」清空
                  </p>
                </div>

                <!-- 可插入示例 -->
                <div>
                  <p class="text-11px font-600 mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">试试这些（点击插入到编辑器）</p>
                  <div class="space-y-2">
                    <div
                      v-for="ex in cssExamples" :key="ex.title"
                      class="rounded-lg border p-3 group cursor-pointer transition-colors"
                      :class="isDark ? 'border-d4 bg-d0 hover:border-emerald-400/40' : 'border-bdrF bg-white hover:border-emerald-400'"
                      @click="insertExample(ex.code)"
                    >
                      <div class="flex items-center gap-2 mb-1.5">
                        <span class="text-12px font-600" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ ex.title }}</span>
                        <span class="text-11px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ ex.desc }}</span>
                        <i class="ri-add-circle-line ml-auto text-14px opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400" />
                      </div>
                      <pre class="css-ref-pre m-0" :class="isDark ? 'css-ref-pre--dark' : 'css-ref-pre--light'"><code>{{ ex.code }}</code></pre>
                    </div>
                  </div>
                </div>

                <!-- 不会被改变的东西 -->
                <div class="rounded-lg px-3.5 py-2.5 text-11px leading-relaxed" :class="isDark ? 'bg-d0 text-wt-aux' : 'bg-l4/50 text-lt-aux'">
                  <i class="ri-information-line mr-1 text-emerald-400" />
                  主题和自定义 CSS 不会强制修改：业务状态色（成功/警告/错误）、文件类型色、代码高亮配色、以及你自己创建的内容样式。
                </div>
              </div>

              <!-- ─── 变量速查 ─── -->
              <div v-else-if="refTab === 'vars'" class="space-y-3">
                <p class="text-11px" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                  点击变量名插入 <code class="css-ref-code">var(--ui-xxx)</code> 到光标处。需要透明度时，使用对应的
                  <code class="css-ref-code">-rgb</code> 后缀变量（如 <code class="css-ref-code">--ui-bg-0-rgb</code>），配合
                  <code class="css-ref-code">rgba(var(--ui-bg-0-rgb), 0.5)</code> 使用。
                </p>
                <div class="space-y-2.5">
                  <div v-for="group in cssVarGroups" :key="group.label" class="flex items-start gap-3">
                    <span class="w-13 shrink-0 pt-1 text-11px font-600 text-right" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ group.label }}</span>
                    <div class="flex flex-wrap gap-1">
                      <button
                        v-for="v in group.vars" :key="v"
                        class="css-ref-chip"
                        :class="isDark ? 'css-ref-chip--dark' : 'css-ref-chip--light'"
                        :title="`插入 var(${v})`"
                        @click="insertAtCursor(`var(${v})`)"
                      >{{ v }}</button>
                    </div>
                  </div>
                </div>
                <div class="rounded-lg px-3.5 py-2.5 text-11px" :class="isDark ? 'bg-d0 text-wt-aux' : 'bg-l4/50 text-lt-aux'">
                  <i class="ri-information-line mr-1 text-emerald-400" />
                  设置中的「主题颜色」只替换交互主色（按钮、链接等），不会改变上面这些变量定义的背景、圆角、边框、阴影和动效。
                </div>
              </div>

              <!-- ─── 进阶覆盖 ─── -->
              <div v-else-if="refTab === 'advanced'" class="space-y-4 text-12px leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                <div>
                  <p class="text-11px font-600 mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">加载顺序</p>
                  <p class="text-11px" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                    经典主题样式 → 内置主题覆盖层（仅非经典主题生效） → 你的自定义 CSS。
                    你的 CSS 最后加载，所以可以覆盖前面的一切。
                  </p>
                </div>
                <div>
                  <p class="text-11px font-600 mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">选择器作用域</p>
                  <p class="text-11px mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                    建议所有选择器以 <code class="css-ref-code">.theme-{主题ID}</code> 开头，这样切换主题时你的覆盖不会串到别的主题上。
                    内部组件类名可能随版本变化，<code class="css-ref-code">--ui-*</code> 变量是推荐的稳定接口。
                  </p>
                  <pre class="css-ref-pre" :class="isDark ? 'css-ref-pre--dark' : 'css-ref-pre--light'"><code><span class="css-ref-sel">.theme-my-theme</span> .md-content pre {
  border: 1px solid <span class="css-ref-var">var(--ui-border-card)</span>;
}</code></pre>
                </div>
                <div>
                  <p class="text-11px font-600 mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">覆盖 UI 组件</p>
                  <p class="text-11px mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                    公共组件的部分变量使用了 <code class="css-ref-code">!important</code>。普通选择器覆盖不了时，用完整根选择器 + <code class="css-ref-code">!important</code>：
                  </p>
                  <pre class="css-ref-pre" :class="isDark ? 'css-ref-pre--dark' : 'css-ref-pre--light'"><code><span class="css-ref-sel">.theme-my-theme</span><span class="css-ref-attr">[data-theme='my-theme'][data-color-mode]</span> .n-input {
  --n-border-radius: 10px <span class="css-ref-imp">!important</span>;
  --n-color: <span class="css-ref-var">var(--ui-bg-2)</span> <span class="css-ref-imp">!important</span>;
}</code></pre>
                  <p class="text-11px mt-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                    仅在普通选择器无效时使用。不要使用全局 <code class="css-ref-code">*</code> 覆盖。
                  </p>
                </div>
                <div>
                  <p class="text-11px font-600 mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">内置覆盖层适配范围</p>
                  <p class="text-11px" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                    产品外壳、公共表单和弹窗，以及 Workchat、Settings、Docs、Wiki、Notes 等主要界面。
                    页面类名属于高级覆盖接口，不保证跨版本稳定；升级后如果局部覆盖失效，检查对应元素的类名。
                  </p>
                </div>
              </div>

              <!-- ─── 限制与注意 ─── -->
              <div v-else-if="refTab === 'limits'" class="space-y-4 text-11px leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <p class="font-600 mb-1.5 text-12px" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">语法与容量</p>
                    <ul class="space-y-1 px-3">
                      <li>最大 1 MB</li>
                      <li>只支持CSS</li>
                      <li>不支持 <code class="css-ref-code">@import</code>语法</li>
                      <li>不支持脚本 URL、远程资源</li>
                      <li>不解析主题内相对图片或字体</li>
                    </ul>
                  </div>
                  <div>
                    <p class="font-600 mb-1.5 text-12px" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">文件</p>
                    <ul class="space-y-1 px-3">
                      <li><code class="css-ref-code">custom.css</code> — 已确认，重启保留</li>
                      <li><code class="css-ref-code">custom.pending.css</code> — 预览，重启不加载</li>
                    </ul>
                    <p class="font-600 mt-3 mb-1.5 text-12px" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">紧急恢复</p>
                    <ul class="space-y-1 px-3">
                      <li>或点「重置」按钮</li>
                      <li>或切回「经典」主题</li>
                    </ul>
                  </div>
                </div>
                <div class="rounded-lg px-3.5 py-2.5 border" :class="isDark ? 'border-amber-400/20 bg-amber-400/5' : 'border-amber-200 bg-amber-50'">
                  <p class="font-600 text-amber-500 mb-1"><i class="ri-error-warning-line mr-1" />注意</p>
                  <p>
                    保护机制负责预览回退和紧急恢复，但不限制 CSS 可以使用的选择器或属性。
                    <code class="css-ref-code">#app</code>、<code class="css-ref-code">html</code>、<code class="css-ref-code">body</code>、全局
                    <code class="css-ref-code">*</code> 和 <code class="css-ref-code">display: none</code> 等规则仍可能改变或隐藏整个界面。
                  </p>
                </div>
              </div>

            </div>
          </div>
        </Transition>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.ref-expand-enter-active,
.ref-expand-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.ref-expand-enter-from,
.ref-expand-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

button:focus-visible,
textarea:focus-visible,
input:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}

textarea {
  min-height: 200px;
  max-height: 520px;
  tab-size: 2;
}

/* ─── 参考面板元素 ─── */
.css-ref-code {
  padding: 1px 4px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--ui-brand-400) 8%, transparent);
  color: var(--ui-brand-400);
  font-family: var(--ui-font-mono, ui-monospace, monospace);
  font-size: 10px;
  word-break: break-all;
}

.css-ref-kbd {
  display: inline-block;
  padding: 0 4px;
  border-radius: 3px;
  border: 1px solid var(--ui-border-card);
  background: var(--ui-bg-3);
  font-family: var(--ui-font-mono, ui-monospace, monospace);
  font-size: 10px;
  line-height: 1.7;
}

.css-ref-chip {
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  font-family: var(--ui-font-mono, ui-monospace, monospace);
  font-size: 10px;
  line-height: 1.7;
  cursor: pointer;
  transition: all 0.13s ease;
}
.css-ref-chip--dark {
  background: var(--ui-bg-0);
  border-color: var(--ui-border-panel);
  color: var(--ui-text-aux);
}
.css-ref-chip--dark:hover {
  border-color: var(--ui-brand-400);
  color: var(--ui-brand-400);
  background: color-mix(in srgb, var(--ui-brand-400) 8%, transparent);
}
.css-ref-chip--light {
  background: #fff;
  border-color: var(--ui-border-card);
  color: var(--ui-text-aux);
}
.css-ref-chip--light:hover {
  border-color: var(--ui-brand-500);
  color: var(--ui-brand-500);
  background: color-mix(in srgb, var(--ui-brand-500) 6%, transparent);
}

.css-ref-pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid;
  font-family: var(--ui-font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  line-height: 1.7;
  overflow-x: auto;
  white-space: pre;
}
.css-ref-pre--dark {
  background: var(--ui-bg-0);
  border-color: var(--ui-border-panel);
  color: var(--ui-text-sub);
}
.css-ref-pre--light {
  background: #fafafa;
  border-color: var(--ui-border-card);
  color: var(--ui-text-sub);
}

.css-ref-sel { color: var(--success, #34d399); }
.css-ref-var { color: var(--ui-brand-400); }
.css-ref-attr { color: var(--ui-text-dim); }
.css-ref-imp { color: var(--warning, #fbbf24); }
</style>