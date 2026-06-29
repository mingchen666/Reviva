<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useOutputsStore } from '@/stores/outputs'
import { formatDate, formatWeekday, formatTime, getDateStr, getExtInfo, formatFileSize } from '@/utils/format'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import MainContent from '@/components/layout/MainContent.vue'
import OutputList from './sections/OutputList.vue'
import OutputDetail from './sections/OutputDetail.vue'

const appStore = useAppStore()
const outputsStore = useOutputsStore()
const isDark = computed(() => appStore.isDark)

const viewMode = ref('agent')
const searchQuery = ref('')
const expandedAgents = ref(new Set())
const expandedDates = ref(new Set())
const selectedFile = ref(null)
const fileContent = ref(null)
const loadingContent = ref(false)
const confirmDelete = ref(null)

// ── Computed ──

const filteredAgents = computed(() => {
  if (!searchQuery.value) return outputsStore.agents
  const q = searchQuery.value.toLowerCase()
  return outputsStore.agents.filter(a => {
    if (a.displayName.toLowerCase().includes(q)) return true
    if (a.name.toLowerCase().includes(q)) return true
    return false
  })
})

const totalFileCount = computed(() => {
  let count = 0
  for (const a of filteredAgents.value) {
    for (const d of a.dates) count += d.fileCount
  }
  return count
})

const selectedFileDisplayName = computed(() => {
  if (!selectedFile.value) return ''
  const match = outputsStore.agentNames.find(a => a.name === selectedFile.value.agentDirName)
  return match?.displayName || ''
})

const dateFirstGroups = computed(() => {
  const map = {}
  for (const agent of filteredAgents.value) {
    for (const d of agent.dates) {
      if (!map[d.date]) map[d.date] = { date: d.date, fileCount: 0, agents: [] }
      map[d.date].fileCount += d.fileCount
      map[d.date].agents.push(agent)
    }
  }
  const groups = Object.values(map)
  groups.sort((a, b) => b.date.localeCompare(a.date))
  return groups
})

const allDates = computed(() => {
  const set = new Set()
  for (const a of outputsStore.agents) {
    for (const d of a.dates) set.add(d.date)
  }
  return [...set].sort().reverse()
})

const recentFiles = computed(() => {
  const results = []
  const sorted = [...outputsStore.agents]
    .flatMap(a => a.dates.map(d => ({ agent: a, date: d.date, fileCount: d.fileCount })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
  return sorted
})

// ── Actions ──

async function loadPage() {
  await outputsStore.scanAll()
  await outputsStore.loadDbOutputs()
}

onMounted(loadPage)

function isAgentExpanded(name) { return expandedAgents.value.has(name) }
function toggleAgent(name) {
  const s = new Set(expandedAgents.value)
  if (s.has(name)) s.delete(name); else s.add(name)
  expandedAgents.value = s
}

function isDateExpanded(key) { return expandedDates.value.has(key) }
async function toggleDate(agentDirName, date) {
  const key = `${agentDirName}:${date}`
  const s = new Set(expandedDates.value)
  if (s.has(key)) {
    s.delete(key)
  } else {
    s.add(key)
    if (agentDirName === '__all__') {
      for (const agent of filteredAgents.value) {
        if (agent.dates.some(d => d.date === date)) {
          await outputsStore.loadDateFiles(agent.name, date)
        }
      }
    } else {
      await outputsStore.loadDateFiles(agentDirName, date)
    }
  }
  expandedDates.value = s
}

function getDateFiles(agentDirName, date) {
  return outputsStore.dateFilesCache[`${agentDirName}:${date}`] || []
}

async function selectFile(file) {
  selectedFile.value = file
  fileContent.value = null
  loadingContent.value = true
  try {
    fileContent.value = await outputsStore.readFileContent(file.path)
  } finally {
    loadingContent.value = false
  }
}

function expandAllAgents() {
  expandedAgents.value = new Set(filteredAgents.value.map(a => a.name))
}

function collapseAll() {
  expandedAgents.value = new Set()
  expandedDates.value = new Set()
}

async function doDelete() {
  if (!confirmDelete.value) return
  try {
    await window.electronAPI.deleteFile(confirmDelete.value.absolutePath)
    if (selectedFile.value?.path === confirmDelete.value.path) {
      selectedFile.value = null
      fileContent.value = null
    }
    await outputsStore.refreshAll()
  } catch (e) {
    console.error('Delete failed:', e)
  }
  confirmDelete.value = null
}

function openFile(file) {
  if (file.absolutePath) window.electronAPI.openPath(file.absolutePath)
}

function openFolder(file) {
  if (file.absolutePath) window.electronAPI.showItemInFolder(file.absolutePath)
}

function agentTotalFiles(agent) {
  return agent.dates.reduce((s, d) => s + d.fileCount, 0)
}
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <LeftPanel :width="280" :resizable="true" :min-width="220" :max-width="360">
      <div class="h-full flex flex-col">
        <!-- Search -->
        <div class="px-3 pt-3 pb-2">
          <div class="relative">
            <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <input v-model="searchQuery" type="text" placeholder="搜索 Agent 或文件..."
              class="w-full h-8 text-[12px] rounded-md pl-8 pr-3 outline-none transition-colors"
              :class="isDark ? 'bg-d3 text-wt-main border border-bdr placeholder:text-wt-dim focus:border-brand-400/30' : 'bg-l3 text-lt-main border border-bdrF placeholder:text-lt-aux focus:border-brand-200'"
              @input="selectedFile = null" />
          </div>
        </div>

        <!-- View mode toggle -->
        <div class="px-3 pb-2">
          <div class="flex items-center gap-1 p-0.5 rounded-lg" :class="isDark ? 'bg-d3' : 'bg-l3'">
            <button
              class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-medium transition-all"
              :class="viewMode === 'agent'
                ? (isDark ? 'bg-d0 text-wt-main shadow-sm' : 'bg-white text-lt-main shadow-sm')
                : (isDark ? 'rgb(85 100 104) hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')"
              @click="viewMode = 'agent'">
              <i class="ri-sparkling-line text-[13px]" />Agent
            </button>
            <button
              class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-medium transition-all"
              :class="viewMode === 'date'
                ? (isDark ? 'bg-d0 text-wt-main shadow-sm' : 'bg-white text-lt-main shadow-sm')
                : (isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')"
              @click="viewMode = 'date'">
              <i class="ri-calendar-line text-[13px]" />日期
            </button>
          </div>
        </div>

        <div class="mx-3 mb-2 h-px" :class="isDark ? 'bg-d4' : 'bg-bdrF'" />

        <!-- File count + expand/collapse -->
        <div class="px-3 flex items-center justify-between mb-1">
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ totalFileCount }} 个输出</span>
          <div class="flex items-center gap-2">
            <button v-if="viewMode === 'agent'" class="text-[11px] font-medium cursor-pointer flex items-center gap-1"
              :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"
              @click="expandedAgents.size ? collapseAll() : expandAllAgents()">
              <i :class="expandedAgents.size ? 'ri-arrow-right-s-line' : 'ri-arrow-down-s-line'" class="text-[11px]" />
              {{ expandedAgents.size ? '折叠' : '展开' }}
            </button>
            <button class="text-[11px] font-medium cursor-pointer"
              :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"
              @click="loadPage">
              <i class="ri-refresh-line text-[12px]" />
            </button>
          </div>
        </div>

        <!-- Navigation Tree -->
        <div class="flex-1 overflow-y-auto px-3 pb-3 thin-scroll">
          <!-- Empty state -->
          <div v-if="filteredAgents.length === 0" class="text-center py-10">
            <i class="ri-folder-open-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <p class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无输出文件</p>
          </div>

          <!-- ═══ Agent-first mode ═══ -->
          <template v-if="viewMode === 'agent'">
            <div v-for="agent in filteredAgents" :key="agent.name" class="mb-1">
              <!-- Agent folder header -->
              <button class="w-full flex items-center gap-2 px-1.5 py-2 rounded-lg transition-colors"
                :class="isDark ? 'hover:bg-white/4' : 'hover:bg-l4'"
                @click="toggleAgent(agent.name)">
                <i :class="isAgentExpanded(agent.name) ? 'ri-folder-open-line' : 'ri-folder-line'"
                  class="text-[14px] text-amber-400 shrink-0" />
                <span class="text-[12px] font-semibold flex-1 text-left truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ agent.displayName }}</span>
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded" :class="isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux'">{{ agentTotalFiles(agent) }}</span>
              </button>

              <!-- Agent's date groups -->
              <div v-show="isAgentExpanded(agent.name)" class="ml-3">
                <div v-if="agent.dates.length === 0" class="py-2 pl-7 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无输出</div>
                <div v-for="d in agent.dates" :key="d.date" class="mb-0.5">
                  <!-- Date folder header -->
                  <button class="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg transition-colors"
                    :class="isDark ? 'hover:bg-white/3' : 'hover:bg-l4'"
                    @click="toggleDate(agent.name, d.date)">
                    <i :class="isDateExpanded(`${agent.name}:${d.date}`) ? 'ri-folder-open-line' : 'ri-folder-line'"
                      class="text-[13px] text-blue-400 shrink-0" />
                    <i class="ri-calendar-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                    <span class="text-[12px] font-medium flex-1 text-left" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ formatDate(d.date) }}</span>
                    <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatWeekday(d.date) }}</span>
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ml-1" :class="isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux'">{{ d.fileCount }}</span>
                  </button>

                  <!-- Files under date -->
                  <div v-show="isDateExpanded(`${agent.name}:${d.date}`)" class="ml-4">
                    <OutputList
                      v-for="f in getDateFiles(agent.name, d.date)" :key="f.path"
                      :file="f" :selected="selectedFile?.path === f.path" :is-dark="isDark"
                      :ext-info="getExtInfo(f.extension)" :time-str="formatTime(f.mtime)"
                      @select="selectFile(f)" />
                    <div v-if="getDateFiles(agent.name, d.date).length === 0"
                      class="py-2 pl-3 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">加载中...</div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- ═══ Date-first mode ═══ -->
          <template v-else>
            <div v-for="group in dateFirstGroups" :key="group.date" class="mb-1.5">
              <!-- Date folder header -->
              <button class="w-full flex items-center gap-2 px-1.5 py-2 rounded-lg transition-colors"
                :class="isDark ? 'hover:bg-white/4' : 'hover:bg-l4'"
                @click="toggleDate('__all__', group.date)">
                <i :class="isDateExpanded(`__all__:${group.date}`) ? 'ri-folder-open-line' : 'ri-folder-line'"
                  class="text-[14px] text-blue-400 shrink-0" />
                <i class="ri-calendar-line text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <span class="text-[12px] font-semibold flex-1 text-left" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formatDate(group.date) }}</span>
                <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatWeekday(group.date) }}</span>
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ml-1" :class="isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux'">{{ group.fileCount }}</span>
              </button>

              <div v-show="isDateExpanded(`__all__:${group.date}`)" class="ml-4">
                <template v-for="agent in group.agents" :key="agent.name + group.date">
                  <OutputList
                    v-for="f in getDateFiles(agent.name, group.date)" :key="f.path"
                    :file="f" :selected="selectedFile?.path === f.path" :is-dark="isDark"
                    :ext-info="getExtInfo(f.extension)" :time-str="formatTime(f.mtime)"
                    :agent-label="agent.displayName"
                    @select="selectFile(f)" />
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>
    </LeftPanel>

    <MainContent padding="p-0">
      <!-- ═══ Overview (no file selected) ═══ -->
      <div v-if="!selectedFile" class="flex-1 flex flex-col overflow-hidden">
        <div class="h-10 flex items-center px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <div class="flex items-center gap-2">
            <i class="ri-export-line text-[15px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
            <span class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">输出中心</span>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto thin-scroll">
          <div class="max-w-6xl mx-auto px-8 py-8 fade-up">
            <!-- Hero -->
            <div class="flex items-start gap-5 mb-8">
              <div class="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
                :class="isDark ? 'bg-gradient-to-br from-brand-400/20 to-output-400/10 border border-brand-400/20' : 'bg-gradient-to-br from-brand-50 to-output-50 border border-brand-100'">
                <i class="ri-export-line text-[30px] text-brand-400" />
              </div>
              <div class="flex-1 min-w-0">
                <h1 class="text-[22px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">输出中心</h1>
                <p class="text-[13px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">所有 Agent 的输出文件，按 Agent 和日期组织。支持搜索、分类浏览、内容预览与文件操作。</p>
              </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-4 gap-3 mb-8">
              <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-1.5 mb-2"><i class="ri-export-line text-brand-400 text-[13px]" /><span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">总输出</span></div>
                <div class="text-[24px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ outputsStore.totalFiles }}</div>
              </div>
              <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-1.5 mb-2"><i class="ri-sparkling-line text-agent-400 text-[13px]" /><span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">Agent</span></div>
                <div class="text-[24px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ outputsStore.agents.length }}</div>
              </div>
              <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-1.5 mb-2"><i class="ri-calendar-line text-[13px]" style="color:#34D399" /><span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">日期</span></div>
                <div class="text-[24px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ allDates.length }}</div>
              </div>
              <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-1.5 mb-2"><i class="ri-folder-line text-[13px]" style="color:#FACC15" /><span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">目录</span></div>
                <div class="text-[24px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ outputsStore.agents.reduce((s, a) => s + a.dates.length, 0) }}</div>
              </div>
            </div>

            <!-- Agent list -->
            <div class="rounded-xl p-5 mb-6" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="section-title mb-4" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">Agent 列表</div>
              <div v-if="outputsStore.agents.length === 0" class="py-6 text-center text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                暂无 Agent 输出目录
              </div>
              <div v-else class="grid grid-cols-2 gap-3">
                <div v-for="agent in outputsStore.agents" :key="agent.name"
                  class="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors"
                  :class="isDark ? 'bg-d0 border border-bdr hover:border-brand-400/30 hover:bg-brand-400/4' : 'bg-l2 border border-bdrF hover:border-brand-200 hover:bg-brand-50'"
                  @click="viewMode = 'agent'; toggleAgent(agent.name)">
                  <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    :class="isDark ? 'bg-agent-400/10' : 'bg-agent-50'">
                    <i class="ri-sparkling-line text-[16px] text-agent-400" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ agent.displayName }}</div>
                    <div class="text-[11px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ agentTotalFiles(agent) }} 个文件 · {{ agent.dates.length }} 个日期</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Recent dates -->
            <div class="rounded-xl p-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="section-title mb-4" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">近期日期</div>
              <div v-if="allDates.length === 0" class="py-6 text-center text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                暂无输出
              </div>
              <div v-else class="space-y-2">
                <div v-for="date in allDates.slice(0, 7)" :key="date"
                  class="flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-colors"
                  :class="isDark ? 'bg-d0 hover:bg-white/4' : 'bg-l2 hover:bg-l4'"
                  @click="viewMode = 'date'; toggleDate('__all__', date)">
                  <i class="ri-calendar-line text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                  <span class="text-[13px] font-medium flex-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ formatDate(date) }}</span>
                  <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatWeekday(date) }}</span>
                  <span class="text-[11px] font-bold px-2 py-0.5 rounded" :class="isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux'">
                    {{ outputsStore.agents.reduce((s, a) => s + (a.dates.find(d => d.date === date)?.fileCount || 0), 0) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="mt-6 text-center text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"><i class="ri-arrow-left-line text-[13px] mr-1" />从左侧选择输出文件查看详情</div>
          </div>
        </div>
      </div>

      <!-- ═══ Detail View ═══ -->
      <OutputDetail v-else-if="selectedFile"
        :file="selectedFile" :is-dark="isDark"
        :ext-info="getExtInfo(selectedFile.extension)"
        :file-content="fileContent"
        :loading-content="loadingContent"
        :agent-display-name="selectedFileDisplayName"
        @open-file="openFile(selectedFile)"
        @open-folder="openFolder(selectedFile)"
        @delete="confirmDelete = selectedFile" />
    </MainContent>

    <!-- Delete Modal -->
    <Teleport to="body">
      <div v-if="confirmDelete !== null" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="confirmDelete = null" />
        <div class="relative rounded-2xl p-5 w-[360px]"
          :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrL shadow-xl'">
          <div class="flex items-center gap-2.5 mb-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-red-400/8' : 'bg-red-50'">
              <i class="ri-delete-bin-line text-[16px] text-red-400" />
            </div>
            <div>
              <p class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">确认删除</p>
              <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">将删除本地文件</p>
            </div>
          </div>
          <p class="text-[12px] mb-4" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            删除「{{ confirmDelete?.name || '' }}」？此操作不可撤销。
          </p>
          <div class="flex items-center gap-2 justify-end">
            <button class="px-3 py-1.5 rounded-lg text-[12px] font-medium"
              :class="isDark ? 'bg-d4 text-wt-sub border border-bdr hover:bg-d0' : 'bg-l3 text-lt-sub border border-bdrF hover:bg-l4'"
              @click="confirmDelete = null">取消</button>
            <button class="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-red-500 text-white hover:bg-red-600"
              @click="doDelete">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
.fade-up { animation: fadeUp .2s ease-out }
</style>
