<script setup>
import MsModal from '@/components/MsModal/MsModal.vue'
import MoveFolderRow from './MoveFolderRow.vue'
import { ref, computed, watch } from 'vue'

const props = defineProps({
  show: Boolean,
  isDark: Boolean,
  item: { type: Object, default: null }, // { name, path, isDirectory, relPath }
  folderTree: { type: Array, default: () => [] }, // [{ name, path, children, files }]
  currentPath: { type: String, default: '' }, // current parent rel-path
})

const emit = defineEmits(['update:show', 'submit'])

const selectedPath = ref('') // '' = root, otherwise relative path
const expandedSet = ref(new Set())

const visible = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

watch(() => props.show, (v) => {
  if (v) {
    selectedPath.value = ''
    // auto-expand path to current parent
    const parts = (props.currentPath || '').split('/').filter(Boolean)
    let acc = ''
    expandedSet.value = new Set()
    for (const p of parts) {
      acc = acc ? acc + '/' + p : p
      expandedSet.value.add(acc)
    }
  }
})

const itemRelPath = computed(() => {
  if (!props.item) return ''
  return props.item.relPath || ''
})

const isFolder = computed(() => !!props.item?.isDirectory)

// A path is "disabled" (can't be a target) when:
//   - it equals the item's own folder rel-path (moving folder into itself)
//   - it is a descendant of the item (moving folder into its child)
//   - it equals the current parent (no-op move)
function isDisabled(relPath) {
  // current parent: nothing to do
  if (relPath === props.currentPath) return true
  if (!isFolder.value) return false
  const self = itemRelPath.value
  if (!self) return false
  if (relPath === self) return true
  return relPath.startsWith(self + '/')
}

function toggleExpand(node) {
  if (expandedSet.value.has(node.path)) expandedSet.value.delete(node.path)
  else expandedSet.value.add(node.path)
  expandedSet.value = new Set(expandedSet.value)
}

function selectPath(path) {
  if (isDisabled(path)) return
  selectedPath.value = path
}

const canSubmit = computed(() => {
  if (!props.item) return false
  return !isDisabled(selectedPath.value)
})

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', { item: props.item, destRelPath: selectedPath.value })
  visible.value = false
}
</script>

<template>
  <MsModal v-model:show="visible" :width="480" :show-footer="true" max-height="80vh">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center"
          :class="isDark ? 'bg-brand-400/12' : 'bg-brand-50'">
          <i class="ri-folder-transfer-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[13px] font-bold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">移动到...</div>
          <div class="text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i :class="item?.isDirectory ? 'ri-folder-line' : 'ri-file-line'" class="text-[10px] mr-0.5" />
            {{ item?.name }}
          </div>
        </div>
      </div>
    </template>

    <div class="text-[10px] font-bold uppercase tracking-wider mb-2"
      :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">选择目标文件夹</div>

    <div class="rounded-lg border max-h-[360px] overflow-y-auto thin-scroll"
      :class="isDark ? 'bg-d0 border-d4' : 'bg-l3 border-bdrL'">

      <!-- Root row -->
      <div @click="selectPath('')"
        class="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-b"
        :class="[
          isDark ? 'border-d4' : 'border-bdrL',
          isDisabled('')
            ? (isDark ? 'opacity-40 cursor-not-allowed' : 'opacity-40 cursor-not-allowed')
            : '',
          selectedPath === '' && !isDisabled('')
            ? (isDark ? 'bg-brand-400/12' : 'bg-brand-50')
            : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')
        ]">
        <i class="ri-home-4-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        <span class="text-[12px] font-medium flex-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">全部文档（根目录）</span>
        <i v-if="selectedPath === '' && !isDisabled('')" class="ri-check-line text-[14px]"
          :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        <span v-else-if="isDisabled('')" class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">当前位置</span>
      </div>

      <!-- Folder rows -->
      <template v-if="folderTree.length > 0">
        <MoveFolderRow
          v-for="node in folderTree"
          :key="node.path"
          :node="node"
          :level="0"
          :is-dark="isDark"
          :selected-path="selectedPath"
          :expanded-set="expandedSet"
          :is-disabled-fn="isDisabled"
          @select="selectPath"
          @toggle="toggleExpand"
        />
      </template>
      <div v-else class="px-3 py-6 text-center">
        <i class="ri-folders-line text-[20px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无文件夹</p>
      </div>
    </div>

    <!-- Selection summary -->
    <div class="mt-3 px-3 py-2 rounded-lg flex items-center gap-2"
      :class="isDark ? 'bg-d0' : 'bg-l3'">
      <i class="ri-arrow-right-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <span class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">目标位置：</span>
      <span class="text-[11px] font-medium font-mono truncate"
        :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ selectedPath || '根目录' }}</span>
    </div>

    <template #footer="{ close }">
      <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
      <button @click="handleSubmit"
        :disabled="!canSubmit"
        class="px-4 py-2 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5"
        :class="canSubmit
          ? (isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600')
          : (isDark ? 'bg-d0 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
        <i class="ri-folder-transfer-line text-[12px]" />
        移动到此
      </button>
    </template>
  </MsModal>
</template>

<style scoped>
.thin-scroll::-webkit-scrollbar { width: 6px }
.thin-scroll::-webkit-scrollbar-thumb { background: rgba(127,127,127,.2); border-radius: 3px }
.thin-scroll::-webkit-scrollbar-thumb:hover { background: rgba(127,127,127,.4) }
</style>
