<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useConversationsStore } from '@/stores/conversations'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['close'])

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const convStore = useConversationsStore()
const isDark = computed(() => appStore.isDark)

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref(null)
const listRef = ref(null)

// ── Command sources ────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'nav-dashboard', label: 'Dashboard', icon: 'ri-dashboard-3-line', path: '/', group: '导航' },
  { id: 'nav-learn', label: '学习台', icon: 'ri-chat-smile-2-line', path: '/workchat', group: '导航' },
  { id: 'nav-spaces', label: '知识库', icon: 'ri-database-2-line', path: '/spaces', group: '导航' },
  { id: 'nav-docs', label: '文档管理', icon: 'ri-folder-2-line', path: '/docs', group: '导航' },
  { id: 'nav-notes', label: '笔记', icon: 'ri-note-line', path: '/notes', group: '导航' },
  { id: 'nav-workspace', label: '对话工作台', icon: 'ri-chat-3-line', path: '/workspace', group: '导航' },
  { id: 'nav-agents', label: '智能体', icon: 'ri-sparkling-2-line', path: '/agents', group: '导航' },
  { id: 'nav-skills', label: 'Skills', icon: 'ri-flashlight-line', path: '/skills', group: '导航' },
  { id: 'nav-tools', label: '工具', icon: 'ri-tools-line', path: '/tools', group: '导航' },
  { id: 'nav-tasks', label: '任务', icon: 'ri-list-check-3', path: '/tasks', group: '导航' },
  { id: 'nav-translate', label: '翻译', icon: 'ri-translate-2', path: '/translate', group: '导航' },
  { id: 'nav-outputs', label: '输出中心', icon: 'ri-file-chart-line', path: '/outputs', group: '导航' },
  { id: 'nav-recycle', label: '回收站', icon: 'ri-delete-bin-line', path: '/recycle-bin', group: '导航' },
]

const SETTINGS_ITEMS = [
  { id: 'set-models-default', label: '默认模型', icon: 'ri-cpu-line', path: '/settings/default-models', group: '设置' },
  { id: 'set-models', label: '模型服务', icon: 'ri-server-line', path: '/settings/models', group: '设置' },
  {
    id: 'set-directory',
    label: '目录与权限',
    icon: 'ri-folder-shield-line',
    path: '/settings/directory',
    group: '设置',
  },
  { id: 'set-ocr', label: 'OCR 服务商配置', icon: 'ri-scan-2-line', path: '/settings/ocr', group: '设置' },
  { id: 'set-sandbox', label: '沙箱与限流', icon: 'ri-shield-keyhole-line', path: '/settings/sandbox', group: '设置' },
  { id: 'set-memory', label: '记忆管理', icon: 'ri-brain-line', path: '/settings/memory', group: '设置' },
  { id: 'set-usage', label: '用量统计', icon: 'ri-bar-chart-line', path: '/settings/usage', group: '设置' },
  { id: 'set-preference', label: '偏好配置', icon: 'ri-palette-line', path: '/settings/preference', group: '设置' },
  { id: 'set-shortcuts', label: '快捷键', icon: 'ri-keyboard-line', path: '/settings/shortcuts', group: '设置' },
  {
    id: 'set-notifications',
    label: '通知与启动',
    icon: 'ri-notification-3-line',
    path: '/settings/notifications',
    group: '设置',
  },
  { id: 'set-data', label: '数据与备份', icon: 'ri-database-line', path: '/settings/data', group: '设置' },
  { id: 'set-about', label: '系统版本', icon: 'ri-information-line', path: '/settings/about', group: '设置' },
  { id: 'set-author', label: '关于作者', icon: 'ri-user-heart-line', path: '/settings/author', group: '设置' },
]

const ACTION_ITEMS = [
  { id: 'act-new-conv', label: '新建对话', icon: 'ri-add-line', group: '操作', action: 'newConv' },
  { id: 'act-create-agent', label: '创建智能体', icon: 'ri-sparkling-2-line', group: '操作', action: 'createAgent' },
  { id: 'act-toggle-theme', label: '切换主题', icon: 'ri-contrast-line', group: '操作', action: 'toggleTheme' },
  { id: 'act-toggle-sidebar', label: '切换侧栏', icon: 'ri-layout-right-line', group: '操作', action: 'toggleSidebar' },
]

// ── Recent conversations ───────────────────────────────────────

const recentConvs = computed(() => {
  const convs = convStore.conversations || []
  return convs.slice(0, 8).map((c) => ({
    id: `conv-${c.id}`,
    label: c.title || '未命名对话',
    icon: 'ri-chat-1-line',
    group: '最近对话',
    action: 'openConv',
    convId: c.id,
  }))
})

// ── All items flattened ────────────────────────────────────────

const allItems = computed(() => {
  return [...ACTION_ITEMS, ...recentConvs.value, ...NAV_ITEMS, ...SETTINGS_ITEMS]
})

// ── Filtered results ───────────────────────────────────────────

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allItems.value
  return allItems.value.filter((item) => {
    return item.label.toLowerCase().includes(q) || (item.group || '').toLowerCase().includes(q)
  })
})

// Group filtered items for display
const grouped = computed(() => {
  const groups = []
  const map = new Map()
  for (const item of filtered.value) {
    const g = item.group || '其他'
    if (!map.has(g)) {
      map.set(g, [])
      groups.push({ name: g, items: map.get(g) })
    }
    map.get(g).push(item)
  }
  return groups
})

// ── Navigation & execution ─────────────────────────────────────

function execute(item) {
  if (item.path) {
    router.push(item.path)
  } else if (item.action === 'newConv') {
    router.push('/workchat')
    convStore.createConv({ title: '新对话' })
  } else if (item.action === 'createAgent') {
    router.push('/agents/create')
  } else if (item.action === 'toggleTheme') {
    appStore.toggleTheme()
  } else if (item.action === 'toggleSidebar') {
    appStore.toggleRightPanel()
  } else if (item.action === 'openConv') {
    router.push('/workchat')
    convStore.setCurrentConv(item.convId)
  }
  close()
}

function close() {
  query.value = ''
  activeIndex.value = 0
  emit('close')
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, filtered.value.length - 1)
    scrollToActive()
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
    scrollToActive()
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const item = filtered.value[activeIndex.value]
    if (item) execute(item)
    return
  }
}

function scrollToActive() {
  nextTick(() => {
    const el = listRef.value?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

// Reset index when query changes
watch(query, () => {
  activeIndex.value = 0
})

// Focus input when opened
watch(
  () => props.visible,
  (v) => {
    if (v) {
      query.value = ''
      activeIndex.value = 0
      nextTick(() => inputRef.value?.focus())
    }
  },
)

// Global Escape to close
function onDocKeydown(e) {
  if (!props.visible) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}
onMounted(() => document.addEventListener('keydown', onDocKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onDocKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="cmd-fade">
      <div v-if="visible" class="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]" @click.self="close">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" />

        <!-- Palette -->
        <div
          class="relative w-[560px] max-h-[460px] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          :class="isDark ? 'bg-d1 border border-bdr' : 'bg-l1 border border-bdrF'"
          @keydown="onKeydown">
          <!-- Search input -->
          <div
            class="flex items-center gap-2 px-4 py-3 border-b shrink-0"
            :class="isDark ? 'border-bdr' : 'border-bdrF'">
            <i class="ri-search-line text-[16px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <input
              ref="inputRef"
              v-model="query"
              placeholder="搜索页面、设置、对话..."
              class="flex-1 bg-transparent outline-none text-[14px]"
              :class="isDark ? 'text-wt-main placeholder:text-wt-dim' : 'text-lt-main placeholder:text-lt-aux'"
              @keydown="onKeydown" />
            <kbd
              class="text-[10px] px-1.5 py-0.5 rounded font-mono"
              :class="isDark ? 'bg-d3 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">
              ESC
            </kbd>
          </div>

          <!-- Results -->
          <div ref="listRef" class="flex-1 overflow-y-auto thin-scroll py-2">
            <template v-if="grouped.length">
              <template v-for="group in grouped" :key="group.name">
                <div class="px-4 pt-2 pb-1">
                  <span
                    class="text-[10px] font-semibold tracking-wider uppercase"
                    :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                    {{ group.name }}
                  </span>
                </div>
                <div
                  v-for="item in group.items"
                  :key="item.id"
                  :data-active="filtered.indexOf(item) === activeIndex"
                  class="flex items-center gap-3 px-4 py-2 mx-2 rounded-lg cursor-pointer transition-colors"
                  :class="
                    filtered.indexOf(item) === activeIndex
                      ? isDark
                        ? 'bg-brand-400/12 text-wt-main'
                        : 'bg-brand-400/8 text-lt-main'
                      : isDark
                        ? 'text-wt-sub hover:bg-white/4'
                        : 'text-lt-sub hover:bg-l3'
                  "
                  @click="execute(item)"
                  @mouseenter="activeIndex = filtered.indexOf(item)">
                  <i
                    :class="[
                      item.icon,
                      'text-[14px] w-5 text-center shrink-0',
                      filtered.indexOf(item) === activeIndex
                        ? 'text-brand-400'
                        : isDark
                          ? 'text-wt-dim'
                          : 'text-lt-aux',
                    ]" />
                  <span class="text-[13px] flex-1 truncate">{{ item.label }}</span>
                  <i
                    v-if="item.path"
                    class="ri-arrow-right-up-line text-[11px]"
                    :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                </div>
              </template>
            </template>
            <div v-else class="px-4 py-8 text-center">
              <i class="ri-search-line text-[24px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              <div class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">没有匹配的结果</div>
            </div>
          </div>

          <!-- Footer -->
          <div
            class="flex items-center gap-4 px-4 py-2 border-t text-[10px] shrink-0"
            :class="isDark ? 'border-bdr text-wt-dim' : 'border-bdrF text-lt-aux'">
            <span class="flex items-center gap-1">
              <kbd class="px-1 rounded" :class="isDark ? 'bg-d3' : 'bg-l3'">↑↓</kbd>
              导航
            </span>
            <span class="flex items-center gap-1">
              <kbd class="px-1 rounded" :class="isDark ? 'bg-d3' : 'bg-l3'">↵</kbd>
              打开
            </span>
            <span class="flex items-center gap-1">
              <kbd class="px-1 rounded" :class="isDark ? 'bg-d3' : 'bg-l3'">esc</kbd>
              关闭
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cmd-fade-enter-active {
  transition: opacity 0.15s ease;
}
.cmd-fade-leave-active {
  transition: opacity 0.1s ease;
}
.cmd-fade-enter-from,
.cmd-fade-leave-to {
  opacity: 0;
}
</style>
