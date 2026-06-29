<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useCloudSpacesStore } from '@/stores/cloudSpaces'
import { useUserStore } from '@/stores/user'
import { useMessage } from '@/components/MsMessage/useMessage'
import SpacesHeader from './sections/SpacesHeader.vue'
import KbSidebar from './sections/KbSidebar.vue'
import KbDocumentPanel from './sections/KbDocumentPanel.vue'
import CreateKbModal from './sections/CreateKbModal.vue'
import EditKbModal from './sections/EditKbModal.vue'
import ImportDocsModal from './sections/ImportDocsModal.vue'
import ConfirmDeleteModal from './sections/ConfirmDeleteModal.vue'
import { normalizeDocStatus, isReadonlyKb } from './sections/kbFormat'

const router = useRouter()
const appStore = useAppStore()
const spacesStore = useCloudSpacesStore()
const userStore = useUserStore()
const msg = useMessage()

const isDark = computed(() => appStore.isDark)

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

onMounted(ensureKbs)

watch(
  () => userStore.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) ensureKbs()
    else {
      spacesStore.clear()
      selectedKbId.value = ''
      statusFilter.value = 'all'
    }
  },
)
</script>

<template>
  <div class="h-full min-h-0 flex flex-col" :class="isDark ? 'bg-d2' : 'bg-l2'">
    <div v-if="!userStore.isLoggedIn" class="flex-1 flex items-center justify-center px-6">
      <div class="max-w-[340px] text-center">
        <div
          class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          :class="isDark ? 'bg-d1 border border-bdr' : 'bg-l3 border border-bdrF'">
          <i class="ri-lock-line text-[30px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        </div>
        <h2 class="text-[16px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">请先登录</h2>
        <p class="mt-2 text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          登录后可创建知识库、加入系统知识库并上传文档资料。
        </p>
        <button
          class="mt-5 h-9 px-4 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'"
          @click="router.push('/login')">
          <i class="ri-login-box-line text-[14px]" />
          登录
        </button>
      </div>
    </div>

    <template v-else>
      <SpacesHeader
        :is-dark="isDark"
        :active-scope="activeScope"
        :search-query="searchQuery"
        :scopes="scopeOptions"
        :loading="currentKbsLoading || selectedDocsEntry.loading"
        :can-create="activeScope === 'mine'"
        @update:active-scope="switchScope"
        @update:search-query="searchQuery = $event"
        @refresh="refreshAll"
        @create="showCreateModal = true" />

      <div class="flex-1 min-h-0 flex overflow-hidden">
        <KbSidebar
          :is-dark="isDark"
          :kbs="filteredKbs"
          :selected-id="selectedKbId"
          :loading="currentKbsLoading"
          :error="currentKbsError"
          :active-scope="activeScope"
          :search-query="searchQuery"
          :busy-ids="busySystemIds"
          @select="selectKb"
          @create="showCreateModal = true"
          @refresh="refreshCurrentList"
          @join="joinSystemKb"
          @leave="leaveSystemKb"
          @rename="openRename"
          @edit="openEdit"
          @delete="askDeleteKb" />

        <KbDocumentPanel
          :is-dark="isDark"
          :kb="selectedKB"
          :active-scope="activeScope"
          :docs="filteredDocs"
          :entry="selectedDocsEntry"
          :loading="selectedDocsEntry.loading"
          :error="selectedDocsEntry.error"
          :status-filter="statusFilter"
          :join-busy="selectedKB ? busySystemIds.includes(selectedKB.id) : false"
          @update:status-filter="statusFilter = $event"
          @create="showCreateModal = true"
          @import="openImport"
          @refresh="refreshDocs"
          @delete-doc="askDeleteDoc"
          @edit-kb="openEdit"
          @delete-kb="askDeleteKb"
          @page-change="changePage"
          @join="joinSystemKb"
          @leave="leaveSystemKb" />
      </div>

      <CreateKbModal
        :show="showCreateModal"
        :is-dark="isDark"
        :busy="creating"
        @close="showCreateModal = false"
        @create="createKb" />

      <ImportDocsModal
        :show="showImportModal"
        :is-dark="isDark"
        :busy="importing"
        :kbs="spacesStore.kbs"
        :target-id="importTargetId"
        @close="showImportModal = false"
        @submit="importDocs" />

      <EditKbModal
        :show="showEditModal"
        :is-dark="isDark"
        :busy="editing"
        :kb="selectedKB"
        :mode="editMode"
        @close="showEditModal = false"
        @save="saveKb" />

      <ConfirmDeleteModal
        :target="confirmDelete"
        :is-dark="isDark"
        :busy="deleting"
        @close="confirmDelete = null"
        @confirm="confirmDeleteTarget" />
    </template>
  </div>
</template>
