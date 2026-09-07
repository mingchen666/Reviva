<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCloudSpacesStore } from '@/stores/cloudSpaces'
import { useUserStore } from '@/stores/user'
import { useSettingsStore } from '@/stores/settings'
import { useMessage } from '@/components/MsMessage/useMessage'
import * as kbApi from '@/apis/kb-source'
import SvgIcon from '@/components/SvgIcon.vue'

const props = defineProps({
  isDark: { type: Boolean, default: true },
  selectedItems: { type: Array, default: () => [] },
  activeExternalKb: { type: Object, default: null }, // { sourceId, kbId }
  kbEnabled: { type: Boolean, default: true },
})

const emit = defineEmits(['toggle-kb', 'toggle-doc', 'select-external-kb', 'clear-external-kb', 'toggle-kb-enabled'])

const router = useRouter()
const spacesStore = useCloudSpacesStore()
const userStore = useUserStore()
const settingsStore = useSettingsStore()
const msg = useMessage()

const expandedKbs = ref(new Set())
const search = ref('')

// --- External knowledge sources ---
const kbSubTab = ref(settingsStore.kbMode || 'external') // 'cloud' | 'external'
const cloudComingSoon = ref(true) // cloud KB tab shows placeholder until backend is ready
const activeSource = ref(null) // the currently active external knowledge source
const activeSourceKbs = ref([]) // KB list from the active source
const activeKbsLoading = ref(false)
const activeKbsError = ref(null) // null | 'timeout' | 'error: ...'

// Timeout helper: rejects after ms if promise hasn't settled
function withTimeout(promise, ms = 15000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const filteredActiveKbs = computed(() => {
  if (!search.value) return activeSourceKbs.value
  const q = search.value.toLowerCase()
  return activeSourceKbs.value.filter(kb => (kb.name || '').toLowerCase().includes(q))
})

const activeSourceIcon = computed(() => {
  const t = activeSource.value?.type
  const p = activeSource.value?.preset
  if (t === 'mcp') return ''
  if (t === 'preset' || t === 'http') {
    if (p === 'dify' || p === 'fastgpt') return p
    return ''
  }
  return ''
})

// True when the source has a branded SVG icon (dify/fastgpt/mcp)
const hasSvgIcon = computed(() => !!activeSourceIcon.value)
// First character of the source name, for generic sources without a brand SVG
const sourceInitial = computed(() => (activeSource.value?.name || '?').charAt(0).toUpperCase())

const isMcpSource = computed(() => activeSource.value?.type === 'mcp')

const activeSourceColor = computed(() => {
  const t = activeSource.value?.type
  const p = activeSource.value?.preset
  if (t === 'mcp') return { dark: '#A78BFA', light: '#7C3AED' }
  if (p === 'dify') return { dark: '#60A5FA', light: '#2563EB' }
  if (p === 'fastgpt') return { dark: '#34D399', light: '#059669' }
  return { dark: '#818CF8', light: '#6366F1' }
})

const activeSourceTypeLabel = computed(() => {
  const t = activeSource.value?.type
  const p = activeSource.value?.preset
  if (t === 'mcp') return 'MCP'
  if (p === 'dify') return 'Dify'
  if (p === 'fastgpt') return 'FastGPT'
  if (t === 'http') return 'HTTP'
  return '外部'
})

// Fetch the one active external source and its knowledge base list
async function loadActiveSourceKbs() {
  activeKbsLoading.value = true
  activeKbsError.value = null
  try {
    const sid = await withTimeout(kbApi.getActiveSourceId())
    if (!sid) {
      activeSource.value = null
      activeSourceKbs.value = []
      return
    }
    const src = await withTimeout(kbApi.getSource(sid))
    activeSource.value = src
    // MCP servers expose tools directly via the native mcp:{serverId} channel;
    // there is no "list knowledge bases" concept, so skip that call.
    if (src?.type === 'mcp') {
      activeSourceKbs.value = []
      return
    }
    const res = await withTimeout(kbApi.listKnowledgeBases(sid))
    activeSourceKbs.value = res?.success ? (res.list || []) : [{ id: '', name: '全部知识' }]
  } catch (e) {
    activeKbsError.value = e?.message === 'timeout' ? 'timeout' : ('error: ' + (e?.message || ''))
    if (activeKbsError.value !== 'timeout') msg.error('加载知识库列表失败: ' + (e?.message || ''))
  } finally {
    activeKbsLoading.value = false
  }
}

function isExternalActive(kbId) {
  return props.activeExternalKb?.sourceId === activeSource.value?.id && props.activeExternalKb?.kbId === kbId
}

function selectExternalKb(kb) {
  if (!activeSource.value) return
  if (isExternalActive(kb.id)) {
    emit('clear-external-kb')
  } else {
    emit('select-external-kb', {
      sourceId: activeSource.value.id,
      sourceName: activeSource.value.name,
      sourceType: activeSource.value.type,
      kbId: kb.id,
      kbName: kb.name,
    })
  }
}
const filteredKbs = computed(() => {
  const list = spacesStore.kbs
  if (!search.value) return list
  const q = search.value.toLowerCase()
  return list.filter(k => (k.name || '').toLowerCase().includes(q))
})

function isKbSelected(kbId) {
  return props.selectedItems.some(i => i.type === 'cloud_kb' && i.kbId === kbId)
}

function isDocSelected(docId) {
  return props.selectedItems.some(i => i.type === 'cloud_doc' && i.docId === docId)
}

function toggleKb(kb) {
  emit('toggle-kb', {
    type: 'cloud_kb',
    id: 'ckb_' + kb.id,
    kbId: kb.id,
    name: kb.name,
    icon: kb.icon || 'ri-database-2-line',
    color: kb.color,
  })
}

async function toggleExpand(kb) {
  if (expandedKbs.value.has(kb.id)) {
    expandedKbs.value.delete(kb.id)
    expandedKbs.value = new Set(expandedKbs.value)
    return
  }
  expandedKbs.value.add(kb.id)
  expandedKbs.value = new Set(expandedKbs.value)
  try {
    await spacesStore.loadDocs(kb.id)
  } catch (e) {
    msg.error(e?.detail || '加载文档失败')
  }
}

function toggleDoc(kb, doc) {
  emit('toggle-doc', {
    type: 'cloud_doc',
    id: 'cdoc_' + doc.id,
    kbId: kb.id,
    docId: doc.id,
    name: doc.name,
    icon: 'ri-file-text-line',
  })
}

async function refresh() {
  try {
    if (!cloudComingSoon.value) {
      await spacesStore.refreshKbList()
      for (const id of expandedKbs.value) {
        await spacesStore.refreshDocs(id).catch(() => {})
      }
    }
    msg.success('已刷新')
    loadActiveSourceKbs()
  } catch (e) {
    msg.error(e?.detail || '刷新失败')
  }
}

onMounted(() => {
  if (!cloudComingSoon.value && userStore.isLoggedIn) {
    spacesStore.loadKbList().catch(() => {})
  }
  loadActiveSourceKbs()
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Master toggle -->
    <div class="flex items-center justify-between px-2.5 py-2 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2">
        <i class="ri-database-2-line text-[14px]" :class="kbEnabled ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-dim' : 'text-lt-aux')" />
        <span class="text-[13px] font-medium" :class="kbEnabled ? (isDark ? 'text-wt-main' : 'text-lt-main') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">知识库检索</span>
      </div>
      <button @click="emit('toggle-kb-enabled', !kbEnabled)" class="relative w-9 h-5 rounded-full transition-colors duration-200" :class="kbEnabled ? (isDark ? 'bg-brand-400' : 'bg-brand-500') : (isDark ? 'bg-d4' : 'bg-l4')">
        <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200" :class="kbEnabled ? 'translate-x-4' : ''" />
      </button>
    </div>
    <!-- Closed state -->
    <div v-if="!kbEnabled" class="flex-1 flex flex-col items-center justify-center gap-2 px-4">
      <i class="ri-database-2-line text-[28px] opacity-40" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <p class="text-[12px] text-center leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">知识库检索已关闭<br>开启后可选择知识库范围</p>
    </div>
    <template v-else>
    <!-- Toolbar -->
    <div class="px-2.5 pt-2.5 pb-2 shrink-0 flex items-center gap-2">
      <div class="relative flex-1 flex items-center">
        <!-- 使用 top-1/2 -translate-y-1/2 完美垂直居中，并添加 pointer-events-none 防止阻挡点击 -->
        <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none" 
           :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <input v-model="search" type="text" placeholder="搜索知识库..."
          class="w-full h-8 rounded-md py-0 pl-7 pr-3 text-[13px] outline-none transition-all duration-200"
          :class="isDark 
            ? 'bg-d0/50 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/50 focus:bg-d0' 
            : 'bg-l2/50 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400 focus:bg-white'" />
      </div>
      <button @click="refresh"
        class="h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200 shrink-0"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5 active:bg-white/10' : 'text-lt-aux hover:text-lt-sub hover:bg-l4 active:bg-l3'"
        title="刷新">
        <i class="ri-refresh-line text-[15px]" :class="spacesStore.kbsLoading ? 'animate-spin' : ''" />
    </button>
    </div>

    <!-- Sub-tab toggle -->
    <div class="flex items-center gap-0.5 px-2.5 pt-0 pb-1.5 shrink-0">
      <button @click="kbSubTab = 'cloud'" class="flex-1 h-7 rounded-lg text-[12px] transition-colors" :class="kbSubTab === 'cloud' ? (isDark ? 'bg-brand-400/15 text-wt-main font-bold' : 'bg-brand-50 text-lt-main font-bold') : (isDark ? 'text-wt-dim hover:text-wt-sub font-medium' : 'text-lt-aux hover:text-lt-sub font-medium')">云端知识库</button>
      <button @click="kbSubTab = 'external'" class="flex-1 h-7 rounded-lg text-[12px] transition-colors" :class="kbSubTab === 'external' ? (isDark ? 'bg-brand-400/15 text-wt-main font-bold' : 'bg-brand-50 text-lt-main font-bold') : (isDark ? 'text-wt-dim hover:text-wt-sub font-medium' : 'text-lt-aux hover:text-lt-sub font-medium')">外部知识源</button>
    </div>

    <div v-show="kbSubTab === 'cloud'" class="flex-1 flex flex-col min-h-0">
    <!-- Cloud coming soon banner -->
    <div v-if="cloudComingSoon" class="mx-2.5 mb-2 px-3 py-2.5 rounded-xl text-center border shrink-0"
      :class="isDark ? 'border-d4 bg-d1/30' : 'border-bdrL bg-l1/30'">
      <div class="flex items-center justify-center gap-1.5 mb-0.5">
        <i class="ri-cloud-line text-[15px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">云端知识库即将支持</span>
      </div>
      <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">当前请使用下方外部知识源</p>
    </div>
    <template v-else>
    <!-- Selected hint -->
    <div v-if="selectedItems.length" class="mx-2.5 mb-2 px-2.5 py-1.5 rounded-lg text-[12px] flex items-center gap-1.5 font-medium"
      :class="isDark ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-600 border border-brand-100'">
      <i class="ri-check-double-line text-[12px]" />
      已选 {{ selectedItems.length }} 项作为检索范围
    </div>

    <!-- Login hint -->
    <div v-if="!userStore.isLoggedIn" class="mx-2.5 mb-2 px-3 py-4 rounded-xl text-[12px] text-center border"
      :class="isDark ? 'border-d4 ' : 'border-bdrL'">
      <div class="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center"
           :class="isDark ? 'bg-wt-dim/10' : 'bg-lt-aux/10'">
        <i class="ri-lock-line text-[18px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
      </div>
      <p :class="isDark ? 'text-wt-sub' : 'text-lt-sub'" class="mb-3 font-medium">登录后查看云端知识库</p>
      <button @click="router.push('/login')"
        class="px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 shadow-sm"
        :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500 active:bg-brand-600' : 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700'">
        <i class="ri-login-box-line text-[11px] mr-1" /> 立即登录
      </button>
    </div>

    <!-- KB tree -->
    <div class="flex-1 overflow-y-auto custom-scrollbar px-1.5 pb-2 space-y-1">
      <!-- Empty state -->
      <!-- Loading state -->
      <template v-if="userStore.isLoggedIn && spacesStore.kbsLoading && filteredKbs.length === 0">
        <div class="px-3 py-10 text-center flex flex-col items-center gap-2">
          <i class="ri-loader-4-line animate-spin text-[20px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <p class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">正在加载知识库...</p>
        </div>
      </template>
      <template v-else-if="userStore.isLoggedIn && filteredKbs.length === 0 && !spacesStore.kbsLoading">
        <div class="px-3 py-10 text-center flex flex-col items-center">
          <div class="w-12 h-12 rounded-full flex items-center justify-center mb-3"
               :class="isDark ? 'bg-wt-dim/10' : 'bg-lt-aux/10'">
            <i class="ri-database-2-line text-[24px] opacity-60" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          </div>
          <p class="text-[13px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            {{ search ? '无匹配的知识库' : '暂无知识库' }}
          </p>
        </div>
      </template>

      <div v-for="kb in filteredKbs" :key="kb.id" class="rounded-lg overflow-hidden">
        <!-- KB row -->
        <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-150 group cursor-pointer relative"
          :class="isKbSelected(kb.id)
            ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-600')
            : (isDark ? 'hover:bg-white/5 text-wt-sub' : 'hover:bg-l4 text-lt-sub')">
          
          <!-- Expand Arrow -->
          <button @click.stop="toggleExpand(kb)" 
            class="w-4 h-4 flex items-center justify-center rounded shrink-0 transition-colors"
            :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
            <i class="ri-arrow-right-s-line text-[14px] transition-transform duration-200 ease-out"
               :style="{ transform: expandedKbs.has(kb.id) ? 'rotate(90deg)' : 'rotate(0deg)' }" />
          </button>

          <!-- Custom Checkbox -->
          <div @click.stop="toggleKb(kb)"
            class="h-[14px] w-[14px] rounded-[3px] flex items-center justify-center shrink-0 transition-all duration-200 border cursor-pointer"
            :class="isKbSelected(kb.id)
              ? (isDark ? 'bg-brand-400 border-brand-400' : 'bg-brand-500 border-brand-500')
              : (isDark ? 'border-wt-dim/50 group-hover:border-brand-400/60' : 'border-lt-aux/50 group-hover:border-brand-500/60')">
            <i v-if="isKbSelected(kb.id)" class="ri-check-line text-[10px] text-white" />
          </div>

          <!-- Icon -->
          <div class="w-5 h-5 rounded flex items-center justify-center shrink-0">
            <i :class="kb.icon || 'ri-database-2-line'" class="text-[13px] transition-transform duration-200 group-hover:scale-110" 
               :style="`color: ${kb.color || (isDark ? '#818CF8' : '#6366F1')}`" />
          </div>

          <!-- Name -->
          <span class="text-[13px] truncate flex-1 font-medium leading-tight" @click.stop="toggleKb(kb)">
            {{ kb.name }}
          </span>

          <!-- Doc Count Badge -->
          <span class="text-[11px] shrink-0 px-1.5 py-0.5 rounded-full font-medium"
            :class="isKbSelected(kb.id) 
              ? (isDark ? 'bg-brand-400/20 text-brand-300' : 'bg-brand-100 text-brand-600') 
              : (isDark ? 'bg-white/5 text-wt-dim' : 'bg-l3 text-lt-aux')">
            {{ kb.docCount || 0 }}
          </span>
        </div>

        <!-- Documents list (expanded) -->
        <div v-if="expandedKbs.has(kb.id)" class="ml-6 mt-1 mb-1.5 space-y-0.5 border-l border-dashed pl-2"
             :class="isDark ? 'border-d4' : 'border-bdrL'">
          
          <div v-if="spacesStore.docsByKb[kb.id]?.loading" class="px-2 py-1.5 text-[12px] flex items-center gap-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-loader-4-line animate-spin text-[12px]" /> 加载文档中...
          </div>
          
          <div v-else-if="(spacesStore.getDocs(kb.id) || []).length === 0" class="px-2 py-2 text-[12px] text-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-file-unknow-line mr-1"></i>该知识库暂无文档
          </div>

          <div v-for="doc in spacesStore.getDocs(kb.id)" :key="doc.id"
            class="flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-all duration-150 group/doc"
            :class="isDocSelected(doc.id)
              ? (isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50/80 text-brand-600')
              : (isDark ? 'hover:bg-white/5 text-wt-sub' : 'hover:bg-l4 text-lt-sub')"
            @click="toggleDoc(kb, doc)">
            
            <!-- Custom Checkbox -->
            <div class="h-[12px] w-[12px] rounded-[2px] flex items-center justify-center shrink-0 transition-all duration-200 border"
              :class="isDocSelected(doc.id)
                ? (isDark ? 'bg-brand-400 border-brand-400' : 'bg-brand-500 border-brand-500')
                : (isDark ? 'border-wt-dim/50 group-hover/doc:border-brand-400/60' : 'border-lt-aux/50 group-hover/doc:border-brand-500/60')">
              <i v-if="isDocSelected(doc.id)" class="ri-check-line text-[8px] text-white" />
            </div>

            <i class="ri-file-text-line text-[12px] shrink-0 opacity-70" />
            
            <span class="text-[12px] truncate flex-1 leading-tight">
              {{ doc.name }}
            </span>
          </div>
        </div>
      </div>
    </div>
    </template>
    </div>
    <!-- External knowledge sources -->
    <div v-show="kbSubTab === 'external'" class="flex-1 flex flex-col min-h-0">
     <!-- Active source header -->
     <div v-if="activeSource" class="mx-2.5 mb-2 shrink-0">
       <div class="flex items-center gap-2 px-2.5 py-2 rounded-lg"
         :class="isDark ? 'bg-d1/50 border border-d4' : 'bg-l1/50 border border-bdrL'">
        <div class="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          :class="isDark ? 'bg-d3' : 'bg-l3'">
          <SvgIcon v-if="hasSvgIcon" :icon-class="activeSourceIcon" :size="14" />
          <span v-else class="text-[11px] font-bold" :style="{ color: isDark ? activeSourceColor.dark : activeSourceColor.light }">{{ sourceInitial }}</span>
        </div>
         <div class="min-w-0 flex-1">
           <div class="flex items-center gap-1.5">
             <span class="text-[12px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ activeSource.name }}</span>
             <span class="text-[9px] px-1 py-px rounded font-medium shrink-0"
               :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ activeSourceTypeLabel }}</span>
           </div>
         </div>
          <span v-if="activeExternalKb" class="text-[10px] shrink-0 flex items-center gap-0.5" :class="isDark ? 'text-brand-400' : 'text-brand-500'">
            <i class="ri-check-line text-[12px]" />已选
          </span>
       </div>
     </div>
      <!-- No active source -->
      <div v-if="!activeSource && !activeKbsLoading" class="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        <div class="w-12 h-12 rounded-2xl flex items-center justify-center" :class="isDark ? 'bg-d3' : 'bg-l3'">
          <i class="ri-database-2-line text-[24px] opacity-50" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </div>
        <p class="text-[12px] text-center leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未启用外部知识源<br>请在知识库页面启用一个</p>
        <button @click="router.push('/spaces')" class="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors" :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4' : 'bg-l3 text-lt-sub hover:bg-l4'">去配置</button>
      </div>
      <!-- Loading -->
      <div v-else-if="activeKbsLoading" class="flex-1 flex flex-col items-center justify-center gap-2">
        <i class="ri-loader-4-line animate-spin text-[20px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <p class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">正在加载知识库列表...</p>
      </div>
      <!-- Error -->
      <div v-else-if="activeKbsError" class="flex-1 flex flex-col items-center justify-center gap-2">
        <i class="ri-error-warning-line text-[20px] opacity-50" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <p class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ activeKbsError === 'timeout' ? '加载超时，请检查网络或知识源配置' : '加载失败' }}</p>
        <button @click="loadActiveSourceKbs" class="text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors" :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4' : 'bg-l3 text-lt-sub hover:bg-l4'">重试</button>
      </div>
      <!-- KB list -->
      <div v-else-if="isMcpSource" class="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        <div class="w-12 h-12 rounded-2xl flex items-center justify-center" :class="isDark ? 'bg-brand-400/10' : 'bg-brand-50'">
          <i class="ri-server-line text-[24px]" :class="isDark ? 'text-brand-300' : 'text-brand-500'" />
        </div>
        <p class="text-[12px] text-center leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">MCP 服务器已连接<br><span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">工具通过 MCP 通道直接调用</span></p>
      </div>
     <!-- KB list -->
     <div v-else class="flex-1 overflow-y-auto custom-scrollbar px-1.5 pb-2 space-y-0.5">
       <div v-if="filteredActiveKbs.length === 0" class="px-3 py-8 text-center">
         <p class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ search ? '无匹配的知识库' : '无可用知识库' }}</p>
       </div>
       <div v-for="kb in filteredActiveKbs" :key="kb.id"
          class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 group/kb"
          :class="isExternalActive(kb.id)
            ? (isDark ? 'bg-brand-400/12 text-brand-300 ring-1 ring-brand-400/20' : 'bg-brand-50 text-brand-600 ring-1 ring-brand-200')
            : (isDark ? 'hover:bg-white/5 text-wt-sub' : 'hover:bg-l4 text-lt-sub')"
         @click="selectExternalKb(kb)">
          <div class="h-[16px] w-[16px] rounded-full flex items-center justify-center shrink-0 transition-all duration-150"
            :class="isExternalActive(kb.id)
              ? (isDark ? 'bg-brand-400' : 'bg-brand-500')
              : (isDark ? 'border border-wt-dim/30 group-hover/kb:border-wt-dim/50' : 'border border-lt-aux/30 group-hover/kb:border-lt-aux/50')">
            <i v-if="isExternalActive(kb.id)" class="ri-check-line text-[11px] text-white" />
          </div>
          <span class="text-[13px] truncate flex-1 font-medium leading-tight">{{ kb.name }}</span>
          <i v-if="isExternalActive(kb.id)" class="ri-arrow-right-s-line text-[14px] shrink-0 opacity-50" />
       </div>
     </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
