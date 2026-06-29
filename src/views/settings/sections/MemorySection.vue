<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const memFilter = ref('all')
const memSearch = ref('')
const memEditId = ref(null)
const memEditDraft = ref('')
const showModal = ref(false)
const memNewDraft = ref('')
const memNewType = ref('semantic')
const loading = ref(false)

const memories = ref([])

// DeepAgents memory types aligned with the framework
// semantic: facts/preferences → always loaded into system prompt (AGENTS.md)
// procedural: skills/instructions → on-demand loading (SKILL.md)
// episodic: conversation summaries → preserved history
const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'semantic', label: '语义' },
  { value: 'procedural', label: '程序' },
  { value: 'episodic', label: '情节' },
]

const filterCounts = computed(() => ({
  all: memories.value.length,
  semantic: memories.value.filter(m => m.type === 'semantic').length,
  procedural: memories.value.filter(m => m.type === 'procedural').length,
  episodic: memories.value.filter(m => m.type === 'episodic').length,
}))

const typeIconMap = {
  semantic: 'ri-lightbulb-line',
  procedural: 'ri-compass-3-line',
  episodic: 'ri-history-line',
}
const typeLabelMap = {
  semantic: '语义',
  procedural: '程序',
  episodic: '情节',
}
const typeDescMap = {
  semantic: '事实与偏好，每次对话自动加载',
  procedural: '技能与指令，Agent按需调用',
  episodic: '对话摘要，保留历史经验',
}

const filteredMemories = computed(() => {
  let list = memories.value
  if (memFilter.value !== 'all') list = list.filter(m => m.type === memFilter.value)
  if (memSearch.value.trim()) {
    const q = memSearch.value.trim().toLowerCase()
    list = list.filter(m => m.content.toLowerCase().includes(q) || (m.source || '').toLowerCase().includes(q) || typeLabelMap[m.type].includes(q))
  }
  return list
})

function typeBadgeClass(type) {
  if (type === 'semantic') return isDark.value ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-600 border border-brand-200'
  if (type === 'procedural') return isDark.value ? 'bg-agent-400/10 text-agent-400 border border-agent-400/20' : 'bg-agent-50 text-agent-500 border border-agent-100'
  return isDark.value ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100'
}

function typeIconColor(type) {
  if (type === 'semantic') return isDark.value ? 'text-brand-400' : 'text-brand-500'
  if (type === 'procedural') return isDark.value ? 'text-agent-400' : 'text-agent-500'
  return isDark.value ? 'text-amber-400' : 'text-amber-500'
}

function typeIconBg(type) {
  if (type === 'semantic') return isDark.value ? 'bg-brand-400/10' : 'bg-brand-50'
  if (type === 'procedural') return isDark.value ? 'bg-agent-400/10' : 'bg-agent-50'
  return isDark.value ? 'bg-amber-400/10' : 'bg-amber-50'
}

function fmtTime(dateStr) {
  if (!dateStr) return ''
  return dateStr.slice(0, 10)
}

function sourceLabel(source) {
  if (!source) return 'Agent自动'
  if (source === '手动添加') return '手动添加'
  return source
}

async function loadMemories() {
  if (!window.electronAPI?.db?.memories) return
  loading.value = true
  try {
    memories.value = await window.electronAPI.db.memories.list()
  } catch (e) { console.error('loadMemories error:', e) }
  loading.value = false
}

function openAddModal() {
  memNewDraft.value = ''
  memNewType.value = 'semantic'
  showModal.value = true
}

async function addMem() {
  if (!memNewDraft.value.trim()) return
  if (!window.electronAPI?.db?.memories) return
  const result = await window.electronAPI.db.memories.create({
    type: memNewType.value,
    scope: 'user',
    source: '手动添加',
    content: memNewDraft.value.trim(),
  })
  if (result) {
    memories.value.unshift(result)
  }
  showModal.value = false
  memNewDraft.value = ''
}

function startEditMem(mem) {
  memEditId.value = mem.id
  memEditDraft.value = mem.content
}

async function saveEditMem() {
  if (!window.electronAPI?.db?.memories) return
  const mem = memories.value.find(m => m.id === memEditId.value)
  if (mem && memEditDraft.value.trim()) {
    await window.electronAPI.db.memories.update(mem.id, { content: memEditDraft.value.trim() })
    mem.content = memEditDraft.value.trim()
  }
  memEditId.value = null
  memEditDraft.value = ''
}

function cancelEditMem() {
  memEditId.value = null
  memEditDraft.value = ''
}

async function deleteMem(id) {
  if (!window.electronAPI?.db?.memories) return
  await window.electronAPI.db.memories.delete(id)
  memories.value = memories.value.filter(m => m.id !== id)
}

const typeOptions = [
  { value: 'semantic', label: '语义', icon: 'ri-lightbulb-line', desc: '事实与偏好，每次对话自动加载', color: 'brand' },
  { value: 'procedural', label: '程序', icon: 'ri-compass-3-line', desc: '技能与指令，Agent按需调用', color: 'agent' },
  { value: 'episodic', label: '情节', icon: 'ri-history-line', desc: '对话摘要，保留历史经验', color: 'amber' },
]

onMounted(loadMemories)
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <!-- Info Banner -->
    <div class="rounded-xl p-4 flex items-start gap-3" :class="isDark ? 'bg-brand-400/6 border border-brand-400/15' : 'bg-brand-50 border border-brand-100'">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/15' : 'bg-brand-100'">
        <i class="ri-brain-line text-[15px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
      </div>
      <div>
        <div class="text-[13px] font-semibold" :class="isDark ? 'text-brand-400' : 'text-brand-600'">Reviva Agents长期记忆</div>
        <div class="text-[12px] mt-1 leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          Agent 在对话中自动学习并写入记忆，跨对话持久保留。语义记忆在每次 Agent 运行时自动注入到全局记忆文件，程序记忆按需调用，情节记忆保留对话历史。你也可以手动添加记忆条目。
        </div>
      </div>
    </div>

    <!-- Add button + Filter Row -->
    <div class="flex items-center gap-3 flex-wrap">
      <button @click="openAddModal"
        class="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-medium transition-all"
        :class="isDark ? 'bg-agent-400/15 text-agent-400 hover:bg-agent-400/25 border border-agent-400/20' : 'bg-agent-50 text-agent-600 hover:bg-agent-100 border border-agent-100'">
        <i class="ri-add-line text-[13px]" /> 手动添加
      </button>
      <div class="flex items-center gap-1.5">
        <button v-for="opt in filterOptions" :key="opt.value"
          class="ctx-pill cursor-pointer transition-all"
          :class="memFilter === opt.value
            ? (isDark ? 'text-wt-main bg-white/6 border border-bdr' : 'bg-l1 text-lt-main border border-bdrF')
            : (isDark ? 'bg-d3 text-wt-aux border border-transparent hover:border-d4' : 'bg-l3 text-lt-aux border border-transparent hover:border-bdrF')"
          @click="memFilter = opt.value">
          {{ opt.label }}·{{ filterCounts[opt.value] }}
        </button>
      </div>
      
      <!-- 🔽 优化后的搜索框 🔽 -->
      <div class="flex-1 min-w-[180px]">
        <div class="flex items-center gap-2 rounded-lg px-2 h-8 transition-colors" 
             :class="[
               isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF',
               isDark ? 'focus-within:border-agent-400/40' : 'focus-within:border-agent-400'
             ]">
          <i class="ri-search-line text-[13px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <input v-model="memSearch" type="text" placeholder="搜索记忆内容..."
            class="search-input flex-1 min-w-0"
            :class="isDark ? 'text-wt-sub placeholder:text-wt-dim' : 'text-lt-sub placeholder:text-lt-aux'" />
          <button 
            v-if="memSearch" 
            @click="memSearch = ''" 
            class="shrink-0 flex items-center justify-center w-4 h-4 rounded-full transition-colors"
            :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-d4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
            <i class="ri-close-line text-[12px]" />
          </button>
        </div>
      </div>
      <!-- 🔼 优化后的搜索框 🔼 -->

    </div>

    <!-- Memory List -->
    <div v-if="loading" class="text-center py-8">
      <i class="ri-loader-4-line text-[20px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <div class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">加载中...</div>
    </div>
    <div v-else class="space-y-2">
      <div v-for="mem in filteredMemories" :key="mem.id"
        class="rounded-xl p-4 item-row"
        :class="isDark ? 'bg-d3 border border-bdr hover:bg-d4/60' : 'bg-l3 border border-bdrF hover:bg-l4/60'">
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" :class="typeIconBg(mem.type)">
            <i :class="`${typeIconMap[mem.type] || 'ri-note-line'} text-[14px] ${typeIconColor(mem.type)}`" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1.5">
              <span class="ctx-pill" :class="typeBadgeClass(mem.type)">{{ typeLabelMap[mem.type] || mem.type }}</span>
              <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                <i class="ri-link text-[10px] mr-0.5" />{{ sourceLabel(mem.source) }}
              </span>
              <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                <i class="ri-time-line text-[10px] mr-0.5" />{{ fmtTime(mem.created_at) }}
              </span>
            </div>
            <div v-if="memEditId === mem.id">
              <textarea v-model="memEditDraft" rows="3"
                class="w-full rounded-lg px-3 py-2 text-[12px] resize-none outline-none transition-colors"
                :class="isDark ? 'bg-d0 border border-bdr text-wt-sub focus:border-agent-400/40' : 'bg-l3 border border-bdrF text-lt-sub focus:border-agent-300'" />
              <div class="flex items-center gap-2 mt-2">
                <button class="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium"
                  :class="isDark ? 'bg-agent-400/15 text-agent-400 hover:bg-agent-400/25' : 'bg-agent-50 text-agent-600 hover:bg-agent-100'"
                  @click="saveEditMem"><i class="ri-check-line text-[12px]" /> 保存</button>
                <button class="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium"
                  :class="isDark ? 'bg-d3 text-wt-aux hover:text-wt-sub' : 'bg-l4 text-lt-aux hover:text-lt-sub'"
                  @click="cancelEditMem"><i class="ri-close-line text-[12px]" /> 取消</button>
              </div>
            </div>
            <div v-else class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ mem.content }}</div>
          </div>
          <div v-if="memEditId !== mem.id" class="item-actions flex items-center gap-1 shrink-0">
            <button class="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
              :class="isDark ? 'hover:bg-d4 text-wt-dim hover:text-wt-aux' : 'hover:bg-l4 text-lt-aux hover:text-lt-sub'"
              title="编辑" @click="startEditMem(mem)"><i class="ri-edit-line text-[13px]" /></button>
            <button class="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
              :class="isDark ? 'hover:bg-red-400/10 text-wt-dim hover:text-red-400' : 'hover:bg-red-50 text-lt-aux hover:text-red-500'"
              title="删除" @click="deleteMem(mem.id)"><i class="ri-delete-bin-6-line text-[13px]" /></button>
          </div>
        </div>
      </div>

      <div v-if="filteredMemories.length === 0 && !loading"
        class="rounded-xl p-8 flex flex-col items-center justify-center"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <i class="ri-inbox-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <span class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">没有匹配的记忆</span>
        <span class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">Agent 在对话中会自动积累记忆</span>
      </div>
    </div>
  </div>

  <!-- Add Memory Modal -->
  <Teleport to="body">
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="showModal = false" />
      <div class="relative rounded-2xl overflow-hidden w-full max-w-[480px] max-h-[80vh] flex flex-col"
        :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrL shadow-xl'">

        <!-- Header -->
        <div class="px-5 py-3 flex justify-between items-center shrink-0"
          :class="isDark ? 'border-b border-d4 bg-d4/30' : 'border-b border-bdrL bg-l4/30'">
          <div class="flex items-center gap-2">
            <i class="ri-brain-line text-agent-400 text-[14px]" />
            <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">手动添加记忆</span>
          </div>
          <button @click="showModal = false" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"><i class="ri-close-line text-[14px]" /></button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto">
          <div class="p-5 space-y-4">
            <!-- Type selection -->
            <div>
              <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">记忆类型</label>
              <div class="flex gap-2">
                <button v-for="opt in typeOptions" :key="opt.value" @click="memNewType = opt.value"
                  class="flex-1 rounded-lg p-3 text-center cursor-pointer transition-all border-2"
                  :class="memNewType === opt.value
                    ? (isDark ? `border-${opt.color}-400 bg-${opt.color}-400/8` : `border-${opt.color}-400 bg-${opt.color}-50`)
                    : (isDark ? 'border-d4 bg-d0 hover:border-bdr hover:bg-d3' : 'border-bdrF bg-l2 hover:border-bdrL hover:bg-l3')">
                  <i :class="`${opt.icon} text-[16px] ${memNewType === opt.value ? (isDark ? `text-${opt.color}-400` : `text-${opt.color}-600`) : (isDark ? 'text-wt-dim' : 'text-lt-aux')}`" />
                  <div class="text-[12px] font-semibold mt-1" :class="memNewType === opt.value ? (isDark ? `text-${opt.color}-400` : `text-${opt.color}-600`) : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ opt.label }}</div>
                  <div class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ opt.desc }}</div>
                </button>
              </div>
            </div>

            <!-- Content input -->
            <div>
              <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">记忆内容</label>
              <textarea v-model="memNewDraft" rows="5"
                placeholder="输入要添加的记忆内容，例如：项目使用 pnpm 管理 monorepo..."
                class="w-full px-3 py-2.5 rounded-lg text-[12px] outline-none resize-none transition-colors"
                :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-agent-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-agent-400'" />
              <div class="flex justify-between mt-1">
                <span class="text-[10px]" :class="memNewDraft.length > 450 ? 'text-red-400' : (isDark ? 'text-wt-dim' : 'text-lt-aux')">{{ memNewDraft.length }} / 500</span>
                <span v-if="memNewDraft.length > 450" class="text-[10px] text-red-400">超出字数限制</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 flex justify-end gap-2 shrink-0"
          :class="isDark ? 'border-t border-d4 bg-d4/30' : 'border-t border-bdrL bg-l4/30'">
          <button @click="showModal = false"
            class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
            :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
          <button :disabled="!memNewDraft.trim() || memNewDraft.length > 500" @click="addMem"
            class="px-4 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
            :class="isDark ? 'bg-agent-400 text-d0 hover:bg-agent-500' : 'bg-agent-500 text-white hover:bg-agent-600'">
            <i class="ri-add-line text-[12px]" /> 添加
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.item-actions { opacity: 0; transition: opacity .12s }
.item-row:hover .item-actions { opacity: 1 }

/* 🔽 彻底重置搜索框默认样式 🔽 */
.search-input {
  appearance: none !important;
  -webkit-appearance: none !important;
  -moz-appearance: none !important;
  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 0 !important;
  width: 100%;
  font-size: 12px;
  line-height: 1.5;
  font-family: inherit;
}

/* 移除 Safari/Chrome 默认的搜索清除按钮和装饰 */
.search-input::-webkit-search-decoration,
.search-input::-webkit-search-cancel-button,
.search-input::-webkit-search-results-button,
.search-input::-webkit-search-results-decoration {
  -webkit-appearance: none !important;
  display: none !important;
}

/* 移除 IE/Edge 默认的清除按钮 */
.search-input::-ms-clear,
.search-input::-ms-reveal {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
</style>