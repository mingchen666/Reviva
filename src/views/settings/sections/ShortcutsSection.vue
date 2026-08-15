<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/app'
import { useMessage } from '@/components/MsMessage/useMessage'
import {
  DEFAULT_SHORTCUT_BINDINGS,
  EDITABLE_SHORTCUT_KEYS,
  SHORTCUT_GROUPS,
  SHORTCUT_MODIFIERS,
  keyboardEventKey,
  loadShortcutBindings,
  normalizeShortcutCombo,
  isValidShortcutForAction,
  setShortcutBindings,
  shortcutBindings,
  shortcutComboKey,
} from '@/config/shortcuts'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const msg = useMessage()

const editingKey = ref(null)
const recording = ref(false)
const recordedKeys = ref([])
const conflictKey = ref(null)
const conflictName = ref('')
const failedGlobalKeys = ref([])
const pendingCombo = ref(null)
const validationError = ref('')

const shortcutGroups = SHORTCUT_GROUPS
const defaultBindings = DEFAULT_SHORTCUT_BINDINGS
const bindings = shortcutBindings
const persistedBindings = ref(Object.fromEntries(Object.entries(defaultBindings).map(([key, value]) => [key, [...value]])))

function cloneBindings(value) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, combo]) => [key, [...combo]]))
}

async function loadBindings() {
  const loaded = await loadShortcutBindings()
  bindings.value = cloneBindings(loaded)
  persistedBindings.value = cloneBindings(loaded)
  if (window.electronAPI?.shortcuts?.register) {
    try {
      const result = await window.electronAPI.shortcuts.register(loaded)
      failedGlobalKeys.value = result?.failed?.map(item => item.key) || []
    } catch (error) {
      console.warn('register loaded shortcuts failed:', error)
    }
  }
}

async function saveBindings(nextBindings = bindings.value) {
  const normalized = Object.fromEntries(
    EDITABLE_SHORTCUT_KEYS.map(key => [key, [...(normalizeShortcutCombo(nextBindings[key]) || defaultBindings[key])]]),
  )
  const previous = cloneBindings(persistedBindings.value)
  const globalChanged = shortcutComboKey(previous.global_invoke) !== shortcutComboKey(normalized.global_invoke)
  let registrationResult = null
  try {
    if (window.electronAPI?.shortcuts?.register) {
      registrationResult = await window.electronAPI.shortcuts.register(normalized)
      if (registrationResult?.ok === false) throw new Error(registrationResult.error || '快捷键注册失败')
      if (registrationResult?.failed?.length) {
        failedGlobalKeys.value = registrationResult.failed.map(f => f.key)
        if (globalChanged) {
          bindings.value = cloneBindings(previous)
          setShortcutBindings(previous)
          failedGlobalKeys.value = []
          throw new Error('全局快捷键与其他应用冲突，已保留原快捷键')
        }
      } else {
        failedGlobalKeys.value = []
      }
    }
    if (window.electronAPI?.db?.settings) {
      await window.electronAPI.db.settings.set('shortcutBindings', JSON.stringify(normalized))
    }
    setShortcutBindings(normalized)
    persistedBindings.value = cloneBindings(normalized)
    return { success: true }
  } catch (e) {
    if (window.electronAPI?.shortcuts?.register && globalChanged && !registrationResult?.failed?.length) {
      try { await window.electronAPI.shortcuts.register(previous) } catch (_) {}
    }
    bindings.value = cloneBindings(previous)
    setShortcutBindings(previous)
    console.error('saveBindings error:', e)
    msg.error(e.message || '快捷键保存失败', { title: '保存失败', duration: 4200 })
    return { success: false, error: e }
  }
}

function startEdit(key) {
  if (editingKey.value === key) {
    cancelEdit()
    return
  }
  editingKey.value = key
  recording.value = true
  recordedKeys.value = []
  conflictKey.value = null
  conflictName.value = ''
  validationError.value = ''
  pendingCombo.value = null
}

function cancelEdit() {
  editingKey.value = null
  recording.value = false
  recordedKeys.value = []
  conflictKey.value = null
  conflictName.value = ''
  validationError.value = ''
  pendingCombo.value = null
}

function normalizeKey(e) {
  return keyboardEventKey(e)
}

function isModifier(key) {
  return SHORTCUT_MODIFIERS.includes(key)
}

function onKeydown(e) {
  if (!recording.value || !editingKey.value) return
  e.preventDefault()
  e.stopPropagation()

  const key = normalizeKey(e)

  if (key === 'Esc') {
    cancelEdit()
    return
  }

  const mods = new Set()
  if (e.ctrlKey || e.metaKey) mods.add('Ctrl')
  if (e.shiftKey) mods.add('Shift')
  if (e.altKey) mods.add('Alt')

  if (isModifier(key)) {
    recordedKeys.value = [...mods]
    conflictKey.value = null
    validationError.value = ''
    return
  }

  const combo = normalizeShortcutCombo([...mods, key])
  if (!combo || !isValidShortcutForAction(editingKey.value, combo)) {
    recordedKeys.value = [...mods, key].filter(Boolean)
    conflictKey.value = editingKey.value
    conflictName.value = ''
    validationError.value = combo
      ? '应用级快捷键需要包含 Ctrl、Shift 或 Alt 修饰键'
      : '快捷键必须包含一个有效按键，不能只按修饰键'
    pendingCombo.value = null
    return
  }

  const conflict = findConflict(editingKey.value, combo)
  if (conflict) {
    recordedKeys.value = combo
    conflictKey.value = editingKey.value
    conflictName.value = conflict
    validationError.value = ''
    pendingCombo.value = combo
    return
  }

  applyCombo(combo)
}

function applyCombo(combo) {
  const normalized = normalizeShortcutCombo(combo)
  if (!normalized) return
  bindings.value[editingKey.value] = normalized
  conflictKey.value = null
  conflictName.value = ''
  validationError.value = ''
  pendingCombo.value = null
  saveBindings(bindings.value)
  cancelEdit()
}

function confirmConflict() {
  if (pendingCombo.value) {
    applyCombo(pendingCombo.value)
  }
}

function findConflict(excludeKey, combo) {
  return findConflictInBindings(excludeKey, combo, bindings.value)
}

function findConflictInBindings(excludeKey, combo, source) {
  const str = shortcutComboKey(combo)
  for (const [key, val] of Object.entries(source || {})) {
    if (key === excludeKey) continue
    if (shortcutComboKey(val) === str) {
      const item = shortcutGroups.flatMap(g => g.items).find(i => i.key === key)
      return item?.name || key
    }
  }
  return null
}

function findAnyConflict(source) {
  const seen = new Map()
  for (const key of EDITABLE_SHORTCUT_KEYS) {
    const combo = shortcutComboKey(source?.[key])
    if (!combo) continue
    const previousKey = seen.get(combo)
    if (previousKey) {
      const item = shortcutGroups.flatMap(group => group.items).find(entry => entry.key === key)
      const previousItem = shortcutGroups.flatMap(group => group.items).find(entry => entry.key === previousKey)
      return `${previousItem?.name || previousKey} 与 ${item?.name || key}`
    }
    seen.set(combo, key)
  }
  return ''
}

function getCurrentKeys(key) {
  return bindings.value[key] || defaultBindings[key]
}

function isEditing(key) {
  return editingKey.value === key
}

function isGlobalFailed(key) {
  return failedGlobalKeys.value.includes(key)
}

async function resetDefaults() {
  editingKey.value = null
  recording.value = false
  recordedKeys.value = []
  conflictKey.value = null
  conflictName.value = ''
  validationError.value = ''
  pendingCombo.value = null
  bindings.value = Object.fromEntries(Object.entries(defaultBindings).map(([key, value]) => [key, [...value]]))
  await saveBindings(bindings.value)
}

function exportConfig() {
  const config = {
    format: 'reviva-shortcuts',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    bindings: Object.fromEntries(EDITABLE_SHORTCUT_KEYS.map(key => [key, bindings.value[key]])),
  }
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'reviva-shortcuts.json'
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function extractImportedBindings(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const candidate = payload.format === 'reviva-shortcuts'
    ? payload.bindings
    : payload.format === 'reviva-settings'
      ? payload.data?.settings?.shortcutBindings
      : payload.settings && typeof payload.settings === 'object'
        ? payload.settings.shortcutBindings
        : payload.shortcutBindings
  if (typeof candidate === 'string') {
    try { return JSON.parse(candidate) } catch (_) { return null }
  }
  if (candidate && typeof candidate === 'object') return candidate
  return EDITABLE_SHORTCUT_KEYS.some(key => Object.prototype.hasOwnProperty.call(payload, key)) ? payload : null
}

function importConfig() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const payload = JSON.parse(await file.text())
      const imported = extractImportedBindings(payload)
      if (!imported) throw new Error('文件中没有找到快捷键配置')
      const normalized = Object.fromEntries(Object.entries(normalizeShortcutComboMap(imported)))
      const conflict = findAnyConflict(normalized)
      if (conflict) throw new Error(`导入配置存在快捷键冲突：${conflict}`)
      bindings.value = normalized
      const result = await saveBindings(normalized)
      if (!result.success) return
      msg.success('快捷键配置已导入', { title: '导入完成', duration: 3200 })
    } catch (error) {
      msg.error(error.message || '导入快捷键配置失败', { title: '导入失败', duration: 4500 })
    }
  }
  input.click()
}

function normalizeShortcutComboMap(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return Object.fromEntries(EDITABLE_SHORTCUT_KEYS.map(key => [
    key,
    isValidShortcutForAction(key, source[key])
      ? normalizeShortcutCombo(source[key])
      : [...defaultBindings[key]],
  ]))
}

function groupIconColor(group) {
  const m = {
    brand: isDark.value ? '#60a5fa' : '#3b82f6',
    agent: isDark.value ? '#a78bfa' : '#8b5cf6',
    amber: isDark.value ? '#fbbf24' : '#f59e0b',
  }
  return m[group.color] || m.brand
}

onMounted(async () => {
  await loadBindings()
  document.addEventListener('keydown', onKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-5 space-y-3.5">
    <!-- Compact Info Banner -->
    <div class="flex items-center gap-2.5 rounded-lg px-3 py-2.5" :class="isDark ? 'bg-blue-400/8 border border-blue-400/15' : 'bg-blue-50 border border-blue-200'">
      <i class="ri-information-line text-[13px] shrink-0" :class="isDark ? 'text-blue-400' : 'text-blue-500'" />
      <span class="text-[11.5px] leading-relaxed" :class="isDark ? 'text-blue-300/80' : 'text-blue-600/80'">
        点击快捷键进行编辑，按下新的组合键后自动保存，按 <kbd class="kbd-inline">Esc</kbd> 取消。全局快捷键在应用外也可使用；输入框中的 <kbd class="kbd-inline">@</kbd> 和 <kbd class="kbd-inline">/</kbd> 是固定触发符。
      </span>
    </div>

    <!-- Global Shortcut Conflict Warning -->
    <div v-if="failedGlobalKeys.length > 0"
      class="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
      :class="isDark ? 'bg-amber-400/8 border border-amber-400/15' : 'bg-amber-50 border border-amber-200'">
      <i class="ri-error-warning-line text-[13px] shrink-0 mt-0.5" :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
      <div class="text-[11.5px] leading-relaxed" :class="isDark ? 'text-amber-300/80' : 'text-amber-600/80'">
        全局快捷键注册失败，可能与其他应用冲突：
        <span v-for="(fk, idx) in failedGlobalKeys" :key="fk">
          <template v-if="idx > 0">、</template>
          <span class="font-medium">{{ shortcutGroups.flatMap(g => g.items).find(i => i.key === fk)?.name || fk }}</span>
        </span>
        。请更换组合键或关闭占用该快捷键的其他应用。
      </div>
    </div>

    <!-- Shortcut Groups -->
    <section
      v-for="group in shortcutGroups"
      :key="group.label"
      class="rounded-xl overflow-hidden"
      :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'"
    >
      <!-- Group Header -->
      <div class="flex items-center gap-2 px-4 pt-4 pb-2.5">
        <span class="w-[3px] h-3.5 rounded-full shrink-0" :style="{ backgroundColor: groupIconColor(group) }" />
        <i :class="group.icon" class="text-[13px]" :style="{ color: groupIconColor(group) }" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ group.label }}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ group.items.length }}</span>
      </div>

      <!-- Shortcut Rows -->
      <div class="px-4 pb-3.5 space-y-0.5">
        <div
          v-for="item in group.items"
          :key="item.key"
          class="flex items-center gap-3 rounded-lg px-2.5 py-2 group/row transition-colors"
          :class="[
            isDark ? 'hover:bg-d3/50' : 'hover:bg-l3/50',
            isEditing(item.key) ? (isDark ? 'bg-brand-400/5' : 'bg-brand-50/40') : '',
            isGlobalFailed(item.key) && !isEditing(item.key) ? (isDark ? 'bg-amber-400/5' : 'bg-amber-50/40') : ''
          ]"
        >
          <!-- Left: Name & Description -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[12.5px] font-medium leading-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ item.name }}</span>
              <i v-if="isGlobalFailed(item.key)" class="ri-error-warning-line text-[11px] text-amber-400" :title="'注册失败：可能与其他应用冲突'" />
            </div>
            <div class="text-[11px] mt-0.5 leading-tight" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.desc }}</div>
            
            <!-- Inline Conflict Warning -->
            <div v-if="conflictKey === item.key && conflictName" class="flex items-center gap-1.5 mt-1.5">
              <i class="ri-alert-line text-[11px] text-amber-400" />
              <span class="text-[11px] text-amber-400">与「{{ conflictName }}」冲突</span>
              <button class="text-[11px] text-brand-400 hover:text-brand-300 ml-1 font-medium" @click="confirmConflict">仍然使用</button>
            </div>
            <div v-if="conflictKey === item.key && validationError" class="flex items-center gap-1.5 mt-1.5">
              <i class="ri-alert-line text-[11px] text-amber-400" />
              <span class="text-[11px] text-amber-400">{{ validationError }}</span>
            </div>
          </div>

          <!-- Right: Keyboard Shortcuts (Clickable) -->
          <div
            role="button"
            tabindex="0"
            :aria-label="`${item.name}：${getCurrentKeys(item.key).join(' + ')}，点击编辑`"
            :aria-pressed="isEditing(item.key)"
            class="flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-all group/kbd"
            :class="[
              isEditing(item.key) 
                ? (isDark ? 'bg-brand-400/10 ring-1 ring-brand-400/30' : 'bg-brand-50 ring-1 ring-brand-200')
                : (isDark ? 'hover:bg-d4/50' : 'hover:bg-l4/50'),
              isGlobalFailed(item.key) && !isEditing(item.key) ? 'opacity-60' : ''
            ]"
            @click="startEdit(item.key)"
            @keydown.enter.prevent="startEdit(item.key)"
            @keydown.space.prevent="startEdit(item.key)"
          >
            <!-- Recording State -->
            <template v-if="isEditing(item.key) && recording">
              <template v-if="recordedKeys.length > 0">
                <kbd
                  v-for="(key, idx) in recordedKeys"
                  :key="idx"
                  class="kbd inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded text-[11px] font-mono font-medium"
                  :class="conflictKey === item.key
                    ? (isDark ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30' : 'bg-amber-50 text-amber-600 border border-amber-200')
                    : (isDark ? 'bg-brand-400/15 text-brand-400 border border-brand-400/30' : 'bg-brand-50 text-brand-600 border border-brand-200')">
                  {{ key }}
                </kbd>
              </template>
              <template v-else>
                <span class="text-[11px] font-medium animate-pulse" :class="isDark ? 'text-brand-400' : 'text-brand-600'">按下组合键...</span>
              </template>
            </template>

            <!-- Display State -->
            <template v-else>
              <template v-for="(key, idx) in getCurrentKeys(item.key)" :key="idx">
                <kbd
                  class="kbd inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded text-[11px] font-mono font-medium"
                  :class="isGlobalFailed(item.key)
                    ? (isDark ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-200')
                    : (isDark ? 'bg-d4 text-wt-sub border border-d4' : 'bg-l4 text-lt-sub border border-bdrF')">
                  {{ key }}
                </kbd>
                <span v-if="idx < getCurrentKeys(item.key).length - 1" class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">+</span>
              </template>
              <i class="ri-edit-line text-[11px] ml-1 opacity-0 group-hover/kbd:opacity-100 transition-opacity" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer Actions -->
    <div class="flex items-center justify-end gap-2 pt-1">
      <button
        class="px-3.5 py-1.5 rounded-lg text-[11.5px] font-medium transition-all"
        :class="isDark ? 'bg-d3 text-wt-aux hover:bg-d4 hover:text-wt-sub' : 'bg-l3 text-lt-aux hover:bg-l4 hover:text-lt-sub'"
        @click="resetDefaults">
        <i class="ri-refresh-line text-[11px] mr-1.5" />
        恢复默认
      </button>
      <button
        class="px-3.5 py-1.5 rounded-lg text-[11.5px] font-medium transition-all"
        :class="isDark ? 'bg-brand-400/10 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-600 hover:bg-brand-100'"
        @click="exportConfig">
        <i class="ri-download-line text-[11px] mr-1.5" />
        导出配置
      </button>
      <button
        class="px-3.5 py-1.5 rounded-lg text-[11.5px] font-medium transition-all"
        :class="isDark ? 'bg-d3 text-wt-aux hover:bg-d4 hover:text-wt-sub' : 'bg-l3 text-lt-aux hover:bg-l4 hover:text-lt-sub'"
        @click="importConfig">
        <i class="ri-upload-line text-[11px] mr-1.5" />
        导入配置
      </button>
    </div>
  </div>
</template>

<style scoped>
.kbd {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0.02em;
}

[role="button"]:focus-visible {
  outline: 2px solid color-mix(in srgb, #4a6cff 65%, transparent);
  outline-offset: 2px;
}

.kbd-inline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  height: 16px;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 500;
  background: currentColor;
  background: linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(0,0,0,0.1));
}

:root[data-theme="dark"] .kbd-inline,
.dark .kbd-inline {
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
}

.kbd-inline {
  background: rgba(0, 0, 0, 0.08);
}
</style>
