<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const editingKey = ref(null)
const recording = ref(false)
const recordedKeys = ref([])
const conflictKey = ref(null)
const conflictName = ref('')
const failedGlobalKeys = ref([])
const pendingCombo = ref(null)

const defaultBindings = {
  global_invoke: ['Ctrl', 'Shift', 'Space'],
  app_new: ['Ctrl', 'N'],
  app_search: ['Ctrl', 'K'],
  app_switch: ['Ctrl', 'Tab'],
  app_sidebar: ['Ctrl', 'Shift', 'L'],
  app_sidebar2: ['Ctrl', 'B'],
  input_send: ['Ctrl', 'Enter'],
  input_newline: ['Shift', 'Enter'],
  input_mention: ['@'],
  input_command: ['/'],
}

const globalKeys = ['global_invoke']

const shortcutGroups = [
  {
    label: '全局快捷键',
    icon: 'ri-global-line',
    color: 'brand',
    items: [
      { key: 'global_invoke', name: '唤起应用', desc: '从任意位置呼出 Reviva 主窗口' },
    ],
  },
  {
    label: '应用内',
    icon: 'ri-apps-line',
    color: 'agent',
    items: [
      { key: 'app_new', name: '新建对话', desc: '快速开启一个新的对话' },
      { key: 'app_search', name: '命令面板', desc: '打开命令面板，搜索页面、设置和对话' },
      { key: 'app_switch', name: '切换对话', desc: '在最近对话之间切换' },
      { key: 'app_sidebar', name: '切换侧栏', desc: '显示或隐藏侧边栏' },
      { key: 'app_sidebar2', name: '切换侧栏（备选）', desc: '显示或隐藏侧边栏' },
    ],
  },
  {
    label: '输入框',
    icon: 'ri-input-method-line',
    color: 'amber',
    items: [
      { key: 'input_send', name: '发送消息', desc: '发送当前输入框内容' },
      { key: 'input_newline', name: '换行', desc: '在输入框中插入新行' },
      { key: 'input_mention', name: '提及 Agent', desc: '在对话中 @ 某个 Agent' },
      { key: 'input_command', name: '斜杠命令', desc: '输入 / 触发快捷指令' },
    ],
  },
]

const bindings = ref({ ...defaultBindings })

async function loadBindings() {
  if (!window.electronAPI?.db?.settings) return
  try {
    const saved = await window.electronAPI.db.settings.get('shortcutBindings')
    if (saved && typeof saved === 'object') {
      bindings.value = { ...defaultBindings, ...saved }
    }
  } catch (e) { console.error('loadBindings error:', e) }
}

async function saveBindings() {
  if (!window.electronAPI?.db?.settings) return
  try {
    await window.electronAPI.db.settings.set('shortcutBindings', JSON.stringify(bindings.value))
    if (window.electronAPI?.shortcuts?.register) {
      const result = await window.electronAPI.shortcuts.register(bindings.value)
      if (result?.failed?.length) {
        failedGlobalKeys.value = result.failed.map(f => f.key)
      } else {
        failedGlobalKeys.value = []
      }
    }
  } catch (e) { console.error('saveBindings error:', e) }
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
  pendingCombo.value = null
}

function cancelEdit() {
  editingKey.value = null
  recording.value = false
  recordedKeys.value = []
  conflictKey.value = null
  conflictName.value = ''
  pendingCombo.value = null
}

function normalizeKey(e) {
  const map = {
    Control: 'Ctrl', Meta: 'Meta', Alt: 'Alt', Shift: 'Shift',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Escape: 'Esc', Delete: 'Delete', Backspace: 'Backspace',
    Enter: 'Enter', Tab: 'Tab', Space: 'Space',
  }
  return map[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key)
}

function isModifier(key) {
  return ['Ctrl', 'Shift', 'Alt', 'Meta'].includes(key)
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
    return
  }

  const combo = [...mods, key]

  if (mods.size === 0 && key.length > 1) return

  const conflict = findConflict(editingKey.value, combo)
  if (conflict) {
    recordedKeys.value = combo
    conflictKey.value = editingKey.value
    conflictName.value = conflict
    pendingCombo.value = combo
    return
  }

  applyCombo(combo)
}

function applyCombo(combo) {
  bindings.value[editingKey.value] = combo
  conflictKey.value = null
  conflictName.value = ''
  pendingCombo.value = null
  saveBindings()
  cancelEdit()
}

function confirmConflict() {
  if (pendingCombo.value) {
    applyCombo(pendingCombo.value)
  }
}

function findConflict(excludeKey, combo) {
  const str = combo.join('+')
  for (const [key, val] of Object.entries(bindings.value)) {
    if (key === excludeKey) continue
    if (val.join('+') === str) {
      const item = shortcutGroups.flatMap(g => g.items).find(i => i.key === key)
      return item?.name || key
    }
  }
  return null
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
  pendingCombo.value = null
  bindings.value = { ...defaultBindings }
  await saveBindings()
}

function exportConfig() {
  const config = {}
  for (const [key, value] of Object.entries(bindings.value)) {
    config[key] = value
  }
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'reviva_shortcuts.json'
  a.click()
  URL.revokeObjectURL(url)
}

function groupIconColor(group) {
  const m = {
    brand: isDark.value ? '#60a5fa' : '#3b82f6',
    agent: isDark.value ? '#a78bfa' : '#8b5cf6',
    amber: isDark.value ? '#fbbf24' : '#f59e0b',
  }
  return m[group.color] || m.brand
}

onMounted(() => {
  loadBindings()
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
        点击快捷键进行编辑，按下新的组合键后自动保存，按 <kbd class="kbd-inline">Esc</kbd> 取消。全局快捷键在应用外也可使用。
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
          </div>

          <!-- Right: Keyboard Shortcuts (Clickable) -->
          <div
            class="flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-all group/kbd"
            :class="[
              isEditing(item.key) 
                ? (isDark ? 'bg-brand-400/10 ring-1 ring-brand-400/30' : 'bg-brand-50 ring-1 ring-brand-200')
                : (isDark ? 'hover:bg-d4/50' : 'hover:bg-l4/50'),
              isGlobalFailed(item.key) && !isEditing(item.key) ? 'opacity-60' : ''
            ]"
            @click="startEdit(item.key)"
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
    </div>
  </div>
</template>

<style scoped>
.kbd {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0.02em;
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