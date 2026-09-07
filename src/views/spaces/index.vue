<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useCloudSpacesStore } from '@/stores/cloudSpaces'
import { useUserStore } from '@/stores/user'
import { useSettingsStore } from '@/stores/settings'
import { useMessage } from '@/components/MsMessage/useMessage'
import SpacesHeader from './sections/SpacesHeader.vue'
import KbSidebar from './sections/KbSidebar.vue'
import KbDocumentPanel from './sections/KbDocumentPanel.vue'
import CreateKbModal from './sections/CreateKbModal.vue'
import EditKbModal from './sections/EditKbModal.vue'
import ImportDocsModal from './sections/ImportDocsModal.vue'
import ConfirmDeleteModal from './sections/ConfirmDeleteModal.vue'
import KbSourcePanel from './sections/KbSourcePanel.vue'
import { normalizeDocStatus, isReadonlyKb } from './sections/kbFormat'

const router = useRouter()
const appStore = useAppStore()
const spacesStore = useCloudSpacesStore()
const userStore = useUserStore()
const settingsStore = useSettingsStore()
const msg = useMessage()

const isDark = computed(() => appStore.isDark)
// 'cloud' = built-in cloud KB (coming soon), 'external' = external knowledge sources

const activeTab = ref(settingsStore.kbMode || 'external')
const kbMode = computed(() => settingsStore.kbMode)

const activeScope = ref('mine')
const searchQuery = ref('')
const selectedKbId = ref('')
const statusFilter = ref('all')
const showCreateModal = ref(false)
const showEditModal = ref(false)
const editMode = ref('edit')
const showImportModal = ref(false)
const importTargetId = ref('')
const confirmDelete = ref(null)
const creating = ref(false)
const editing = ref(false)
const importing = ref(false)
const deleting = ref(false)
const busySystemIds = ref([])

const selectedKB = computed(() => (selectedKbId.value ? spacesStore.getKb(selectedKbId.value) : null))
const currentKbList = computed(() => (activeScope.value === 'system' ? spacesStore.systemKbs : spacesStore.kbs))
const currentKbsLoading = computed(() => (activeScope.value === 'system' ? spacesStore.systemKbsLoading : spacesStore.kbsLoading))
const currentKbsError = computed(() => (activeScope.value === 'system' ? spacesStore.systemKbsError : spacesStore.kbsError))
const selectedDocsEntry = computed(() => (selectedKbId.value ? spacesStore.getDocsEntry(selectedKbId.value) : {}))
const selectedDocs = computed(() => (selectedKbId.value ? spacesStore.getDocs(selectedKbId.value) : []))
const selectedReadonly = computed(() => isReadonlyKb(selectedKB.value))

const scopeOptions = computed(() => [
  { value: 'mine', label: '我的知识库', icon: 'ri-folder-3-line', count: spacesStore.kbs.length },
  { value: 'system', label: '系统知识库', icon: 'ri-database-2-line', count: spacesStore.systemKbs.length },
  { value: 'sources', label: '外部知识源', icon: 'ri-rocket-line', count: 0 },
])

const filteredKbs = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = currentKbList.value || []
  if (!q) return list
  return list.filter((kb) => {
    const haystack = `${kb.name || ''} ${kb.title || ''} ${kb.description || ''}`.toLowerCase()
    return haystack.includes(q)
  })
})

const filteredDocs = computed(() => {
  if (statusFilter.value === 'all') return selectedDocs.value
  return selectedDocs.value.filter((doc) => {
    const status = normalizeDocStatus(doc.status)
    if (statusFilter.value === 'PENDING') return status === 'PENDING' || status === 'UPLOADED'
    return status === statusFilter.value
  })
})

async function ensureKbs() {
  if (!userStore.isLoggedIn) return
  const results = await Promise.allSettled([
    spacesStore.loadKbList(),
    spacesStore.loadSystemKbList(),
  ])
  const failed = results.find((r) => r.status === 'rejected')
  if (failed) msg.error(failed.reason?.detail || failed.reason?.message || '加载知识库失败')
}

async function refreshCurrentList() {
  if (!userStore.isLoggedIn) {
    msg.warning('请先登录')
    return
  }
  try {
    if (activeScope.value === 'system') await spacesStore.refreshSystemKbList()
    else await spacesStore.refreshKbList()
    msg.success('已刷新')
  } catch (e) {
    msg.error(e?.detail || '刷新失败')
  }
}

async function refreshAll() {
  if (!userStore.isLoggedIn) {
    msg.warning('请先登录')
    return
  }
  try {
    await Promise.allSettled([
      spacesStore.refreshKbList(),
      spacesStore.refreshSystemKbList(),
    ])
    if (selectedKB.value) {
      await refreshDocs()
    }
    msg.success('已刷新')
  } catch (e) {
    msg.error(e?.detail || '刷新失败')
  }
}

function switchScope(scope) {
  if (activeScope.value === scope) return
  activeScope.value = scope
  selectedKbId.value = ''
  statusFilter.value = 'all'
}

async function selectKb(kb) {
  selectedKbId.value = kb.id
  statusFilter.value = 'all'
  try {
    await spacesStore.loadDocs(kb.id, { params: { page: 1, pageSize: selectedDocsEntry.value.pageSize || 50 } })
  } catch (e) {
    msg.error(e?.detail || '加载文档失败')
  }
}

async function refreshDocs(params = {}) {
  if (!selectedKB.value) return
  try {
    const entry = selectedDocsEntry.value
    await spacesStore.refreshDocs(selectedKB.value.id, {
      page: params.page || entry.page || 1,
      pageSize: params.pageSize || entry.pageSize || 50,
      sortBy: 'created',
      sortOrder: 'desc',
    })
  } catch (e) {
    msg.error(e?.detail || '加载文档失败')
  }
}

async function changePage(page) {
  if (!selectedKB.value) return
  await refreshDocs({ page })
}

async function createKb(payload) {
  if (creating.value) return
  creating.value = true
  try {
    const kb = await spacesStore.createKb(payload)
    msg.success('知识库已创建')
    showCreateModal.value = false
    activeScope.value = 'mine'
    selectedKbId.value = kb.id
    statusFilter.value = 'all'
    await spacesStore.loadDocs(kb.id, { force: true, params: { page: 1, pageSize: 50 } }).catch(() => {})
  } catch (e) {
    msg.error(e?.detail || '创建失败')
  } finally {
    creating.value = false
  }
}

function openEdit(kb = selectedKB.value) {
  if (!kb) return
  if (isReadonlyKb(kb)) {
    msg.warning('系统知识库不可编辑')
    return
  }
  editMode.value = 'edit'
  selectedKbId.value = kb.id
  showEditModal.value = true
}

function openRename(kb = selectedKB.value) {
  if (!kb) return
  if (isReadonlyKb(kb)) {
    msg.warning('系统知识库不可重命名')
    return
  }
  editMode.value = 'rename'
  selectedKbId.value = kb.id
  showEditModal.value = true
}

async function saveKb({ id, payload }) {
  if (editing.value) return
  editing.value = true
  try {
    await spacesStore.updateKb(id, payload)
    msg.success('知识库已更新')
    showEditModal.value = false
  } catch (e) {
    msg.error(e?.detail || '保存失败')
  } finally {
    editing.value = false
  }
}

function openImport(kb = selectedKB.value) {
  if (!kb) {
    msg.warning('请先选择知识库')
    return
  }
  if (isReadonlyKb(kb)) {
    msg.warning('系统知识库不可导入文档')
    return
  }
  importTargetId.value = kb.id
  showImportModal.value = true
}

async function importDocs({ kbId, files }) {
  if (importing.value) return
  importing.value = true
  try {
    await spacesStore.uploadDocs(kbId, files)
    msg.success('上传成功')
    showImportModal.value = false
    if (selectedKbId.value === kbId) await refreshDocs({ page: 1 })
  } catch (e) {
    msg.error(e?.detail || '上传失败')
  } finally {
    importing.value = false
  }
}

function askDeleteKb(kb) {
  if (isReadonlyKb(kb)) {
    msg.warning('系统知识库不可删除')
    return
  }
  confirmDelete.value = { type: 'space', id: kb.id, name: kb.name }
}

function askDeleteDoc(doc) {
  if (!selectedKB.value) return
  if (selectedReadonly.value) {
    msg.warning('系统知识库文档不可删除')
    return
  }
  confirmDelete.value = {
    type: 'doc',
    id: doc.id,
    kbId: selectedKB.value.id,
    name: doc.name,
  }
}

async function confirmDeleteTarget(target) {
  if (!target || deleting.value) return
  deleting.value = true
  try {
    if (target.type === 'space') {
      await spacesStore.deleteKb(target.id)
      if (selectedKbId.value === target.id) selectedKbId.value = ''
      msg.success('知识库已删除')
    } else {
      await spacesStore.deleteDoc(target.kbId, target.id)
      const entry = spacesStore.getDocsEntry(target.kbId)
      if (entry.items.length === 0 && entry.page > 1) {
        await spacesStore.refreshDocs(target.kbId, { page: entry.page - 1, pageSize: entry.pageSize || 50 })
      } else {
        await spacesStore.refreshDocs(target.kbId, { page: entry.page || 1, pageSize: entry.pageSize || 50 })
      }
      msg.success('文档已删除')
    }
    confirmDelete.value = null
  } catch (e) {
    msg.error(e?.detail || '删除失败')
  } finally {
    deleting.value = false
  }
}

function markSystemBusy(kbId, busy) {
  if (busy) {
    if (!busySystemIds.value.includes(kbId)) busySystemIds.value = [...busySystemIds.value, kbId]
  } else {
    busySystemIds.value = busySystemIds.value.filter(id => id !== kbId)
  }
}

async function joinSystemKb(kb) {
  if (!kb || busySystemIds.value.includes(kb.id)) return
  markSystemBusy(kb.id, true)
  try {
    await spacesStore.joinSystemKb(kb.id)
    msg.success('已加入系统知识库')
    if (selectedKbId.value === kb.id) {
      await spacesStore.loadDocs(kb.id, { force: true, params: { page: 1, pageSize: 50 } }).catch(() => {})
    }
  } catch (e) {
    msg.error(e?.detail || '加入失败')
  } finally {
    markSystemBusy(kb.id, false)
  }
}

async function leaveSystemKb(kb) {
  if (!kb || busySystemIds.value.includes(kb.id)) return
  markSystemBusy(kb.id, true)
  try {
    await spacesStore.leaveSystemKb(kb.id)
    msg.success('已移除系统知识库')
    if (activeScope.value === 'mine' && selectedKbId.value === kb.id) selectedKbId.value = ''
  } catch (e) {
    msg.error(e?.detail || '移除失败')
  } finally {
    markSystemBusy(kb.id, false)
  }
}

onMounted(() => {
  if (activeTab.value === 'cloud') ensureKbs()
})

watch(
  () => userStore.isLoggedIn,
  (loggedIn) => {
    if (activeTab.value !== 'cloud') return
    if (loggedIn) ensureKbs()
    else {
      spacesStore.clear()
      selectedKbId.value = ''
      statusFilter.value = 'all'
    }
  },
)

watch(activeTab, (tab) => {
  settingsStore.kbMode = tab
  settingsStore.savePreference('kbMode', tab)
  if (tab === 'cloud' && userStore.isLoggedIn) ensureKbs()
})

</script>

<template>
  <div class="h-full min-h-0 flex flex-col" :class="isDark ? 'bg-d2' : 'bg-l2'">
   <!-- Tab bar -->
   <div class="flex items-center gap-1 px-4 h-11 border-b shrink-0" :class="isDark ? 'border-bdr' : 'border-bdrF'">
      <div class="flex items-center gap-0.5 p-0.5 rounded-lg" :class="isDark ? 'bg-d3' : 'bg-l3'">
       <button class="px-3 h-7 rounded-md text-[12px] transition-all"
         :class="[activeTab === 'cloud' ? (isDark ? 'bg-brand-400 text-d0 shadow-sm' : 'bg-brand-500 text-white shadow-sm') : (isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'), activeTab === 'cloud' ? 'font-bold' : 'font-medium']"
         @click="activeTab = 'cloud'">
         <i class="ri-cloud-line text-[12px] mr-1" />内置云端知识库
       </button>
       <button class="px-3 h-7 rounded-md text-[12px] transition-all"
         :class="[activeTab === 'external' ? (isDark ? 'bg-brand-400 text-d0 shadow-sm' : 'bg-brand-500 text-white shadow-sm') : (isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'), activeTab === 'external' ? 'font-bold' : 'font-medium']"
         @click="activeTab = 'external'">
         <i class="ri-rocket-line text-[12px] mr-1" />外部知识源
       </button>
      </div>
     <div class="flex-1" />
      <span class="text-[11px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">当前默认：{{ kbMode === 'cloud' ? '云端知识库' : '外部知识源' }}，对话时自动检索</span>
    </div>

    <!-- External knowledge sources tab -->
    <div v-if="activeTab === 'external'" class="flex-1 min-h-0 flex flex-col">
      <KbSourcePanel :is-dark="isDark" />
    </div>

   <!-- Cloud knowledge base tab: coming soon -->
   <template v-else>
      <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-8">
        <div class="mx-auto w-full max-w-[800px] space-y-4">

          <!-- 状态卡片 -->
          <section
            class="rounded-xl border px-6 py-8 text-center"
            :class="isDark ? 'border-white/[0.08] bg-[#0C101B]' : 'border-slate-200 bg-white shadow-sm'">
            <div
              class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              :class="isDark ? 'bg-d1 border border-bdr' : 'bg-l3 border border-bdrF'">
              <i class="ri-book-shelf-line text-[30px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
            </div>
            <h2 class="text-[18px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">内置云端知识库即将支持</h2>
            <p class="mt-2 text-[13px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              知识库能力正在开发中，未来将支持创建知识库、导入文档和管理资料，并逐步开放云端知识库。
            </p>
            <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                :class="isDark ? 'border-white/[0.08] bg-white/[0.03] text-wt-aux' : 'border-slate-200 bg-slate-50 text-lt-aux'">
                <i class="ri-rocket-line text-[12px]" />即将支持
              </span>
              <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                :class="isDark ? 'border-white/[0.08] bg-white/[0.03] text-wt-aux' : 'border-slate-200 bg-slate-50 text-lt-aux'">
                <i class="ri-cloud-line text-[12px]" />未来开放云端
              </span>
              <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                :class="isDark ? 'border-white/[0.08] bg-white/[0.03] text-wt-aux' : 'border-slate-200 bg-slate-50 text-lt-aux'">
                <i class="ri-server-line text-[12px]" />支持私有化部署
              </span>
            </div>
          </section>

         <!-- 联系作者卡片 -->
         <section
           class="rounded-xl border px-6 py-5"
           :class="isDark ? 'border-white/[0.08] bg-[#0C101B]' : 'border-slate-200 bg-white shadow-sm'">
           <div class="flex items-start gap-3">
             <div class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
               :class="isDark ? 'bg-brand-400/10' : 'bg-brand-50'">
               <i class="ri-customer-service-2-line text-[18px] text-brand-400" />
             </div>
             <div class="min-w-0 flex-1">
              <h3 class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">您还没有知识库？</h3>
               <p class="mt-1 text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                如果您还没有知识库，或者需要部署搭建，可以联系作者咨询。作者可协助私有化部署个人知识库，也可接入已有的外部知识源。
               </p>
                <button
                  class="mt-3 h-8 px-3.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.98]"
                  :class="isDark ? 'bg-white text-slate-950 hover:bg-slate-200' : 'bg-slate-950 text-white hover:bg-slate-800 shadow-sm'"
                  @click="router.push({ name: 'SettingsAuthor' })">
                  <i class="ri-user-voice-line text-[14px]" />
                  联系作者咨询
                </button>
             </div>
           </div>
         </section>

        </div>
      </div>
   </template>
  </div>
</template>
