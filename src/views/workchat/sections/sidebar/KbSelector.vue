<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCloudSpacesStore } from '@/stores/cloudSpaces'
import { useUserStore } from '@/stores/user'
import { useMessage } from '@/components/MsMessage/useMessage'

const props = defineProps({
  isDark: { type: Boolean, default: true },
  selectedItems: { type: Array, default: () => [] }, // ctxItems 中 type === 'cloud_kb' / 'cloud_doc'
})

const emit = defineEmits(['toggle-kb', 'toggle-doc'])

const router = useRouter()
const spacesStore = useCloudSpacesStore()
const userStore = useUserStore()
const msg = useMessage()

const expandedKbs = ref(new Set())
const search = ref('')

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
    await spacesStore.refreshKbList()
    // 刷新已展开的 KB 的文档
    for (const id of expandedKbs.value) {
      await spacesStore.refreshDocs(id).catch(() => {})
    }
    msg.success('已刷新')
  } catch (e) {
    msg.error(e?.detail || '刷新失败')
  }
}

onMounted(() => {
  if (userStore.isLoggedIn) {
    spacesStore.loadKbList().catch(() => {})
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div class="px-2.5 pt-2.5 pb-2 shrink-0 flex items-center gap-2">
      <div class="relative flex-1 flex items-center">
        <!-- 使用 top-1/2 -translate-y-1/2 完美垂直居中，并添加 pointer-events-none 防止阻挡点击 -->
        <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none" 
           :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <input v-model="search" type="text" placeholder="搜索知识库..."
          class="w-full h-8 rounded-md py-0 pl-8 pr-3 text-[12.5px] outline-none transition-all duration-200"
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

    <!-- Selected hint -->
    <div v-if="selectedItems.length" class="mx-2.5 mb-2 px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-1.5 font-medium"
      :class="isDark ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-600 border border-brand-100'">
      <i class="ri-check-double-line text-[12px]" />
      已选 {{ selectedItems.length }} 项作为检索范围
    </div>

    <!-- Login hint -->
    <div v-if="!userStore.isLoggedIn" class="mx-2.5 mb-2 px-3 py-4 rounded-xl text-[11.5px] text-center border"
      :class="isDark ? 'border-d4 ' : 'border-bdrL'">
      <div class="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center"
           :class="isDark ? 'bg-wt-dim/10' : 'bg-lt-aux/10'">
        <i class="ri-lock-line text-[18px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
      </div>
      <p :class="isDark ? 'text-wt-sub' : 'text-lt-sub'" class="mb-3 font-medium">登录后查看云端知识库</p>
      <button @click="router.push('/login')"
        class="px-4 py-1.5 rounded-lg text-[11.5px] font-medium transition-all duration-200 shadow-sm"
        :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500 active:bg-brand-600' : 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700'">
        <i class="ri-login-box-line text-[11px] mr-1" /> 立即登录
      </button>
    </div>

    <!-- KB tree -->
    <div class="flex-1 overflow-y-auto custom-scrollbar px-1.5 pb-2 space-y-1">
      <!-- Empty state -->
      <template v-if="userStore.isLoggedIn && filteredKbs.length === 0 && !spacesStore.kbsLoading">
        <div class="px-3 py-10 text-center flex flex-col items-center">
          <div class="w-12 h-12 rounded-full flex items-center justify-center mb-3"
               :class="isDark ? 'bg-wt-dim/10' : 'bg-lt-aux/10'">
            <i class="ri-database-2-line text-[24px] opacity-60" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          </div>
          <p class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
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
          <span class="text-[12.5px] truncate flex-1 font-medium leading-tight" @click.stop="toggleKb(kb)">
            {{ kb.name }}
          </span>

          <!-- Doc Count Badge -->
          <span class="text-[10px] shrink-0 px-1.5 py-0.5 rounded-full font-medium" 
            :class="isKbSelected(kb.id) 
              ? (isDark ? 'bg-brand-400/20 text-brand-300' : 'bg-brand-100 text-brand-600') 
              : (isDark ? 'bg-white/5 text-wt-dim' : 'bg-l3 text-lt-aux')">
            {{ kb.docCount || 0 }}
          </span>
        </div>

        <!-- Documents list (expanded) -->
        <div v-if="expandedKbs.has(kb.id)" class="ml-6 mt-1 mb-1.5 space-y-0.5 border-l border-dashed pl-2"
             :class="isDark ? 'border-d4' : 'border-bdrL'">
          
          <div v-if="spacesStore.docsByKb[kb.id]?.loading" class="px-2 py-1.5 text-[11px] flex items-center gap-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-loader-4-line animate-spin text-[12px]" /> 加载文档中...
          </div>
          
          <div v-else-if="(spacesStore.getDocs(kb.id) || []).length === 0" class="px-2 py-2 text-[11px] text-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
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
            
            <span class="text-[11.5px] truncate flex-1 leading-tight">
              {{ doc.name }}
            </span>
          </div>
        </div>
      </div>
    </div>
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