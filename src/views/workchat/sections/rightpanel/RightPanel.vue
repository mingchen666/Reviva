<script setup>
import { ref, watch } from 'vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import { useRecycleBinStore } from '@/stores/recycleBin'
import PreviewTab from './PreviewTab.vue'
import WorkspaceTab from './WorkspaceTab.vue'
import ArtifactModal from './ArtifactModal.vue'

const props = defineProps({
  previewFile: Object,
  isDark: Boolean,
  width: Number,
  selectedAgent: Object,
  allAgents: Array,
  ctxItems: Array,
  groupId: { type: String, default: 'default' },
})

const emit = defineEmits(['close', 'preview-file', 'tool-action', 'select-skill'])

const activeTab = ref('workspace')
const viewingArtifact = ref(null)
const viewingTask = ref(null)
const msg = useMessage()
const mbox = useMessageBox()
const recycleBin = useRecycleBinStore()

// Auto-switch to preview tab when a file is selected
watch(
  () => props.previewFile,
  (file) => {
    if (file?.path) activeTab.value = 'preview'
  },
)

function openArtifactModal(payload) {
  if (payload?.artifact) {
    viewingArtifact.value = payload.artifact
    viewingTask.value = payload.task || null
    return
  }
  viewingArtifact.value = payload
  viewingTask.value = null
}

function closeArtifactModal() {
  viewingArtifact.value = null
  viewingTask.value = null
}

async function deleteArtifact(a) {
  if (!a?.id) return
  const confirmed = await mbox.confirm({
    title: '删除生成结果',
    subtitle: '将移入回收站，可稍后还原',
    message: `确定删除「${a.title || '生成结果'}」吗？`,
    variant: 'danger',
    confirmText: '移入回收站',
    cancelText: '取消',
  })
  if (!confirmed) return
  const result = await recycleBin.trashArtifact(a.id)
  if (result.success) {
    viewingArtifact.value = null
    viewingTask.value = null
    window.dispatchEvent(new CustomEvent('reviva:artifacts-updated', { detail: { artifactId: a.id } }))
    msg.success('已移入回收站')
  } else {
    msg.error(result.error || '删除失败')
  }
}
</script>

<template>
  <div
    class="flex flex-col shrink-0 min-h-0 overflow-hidden"
    :class="isDark ? 'bg-d1' : 'bg-l1'"
    :style="{ width: width + 'px', borderLeft: `1px solid ${isDark ? '#2e2e3a' : '#dddcd9'}` }">
    <!-- Header: Tabs + Close -->
    <div
      class="h-9 flex items-center justify-between px-3 shrink-0"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-1">
        <button
          @click="activeTab = 'workspace'"
          class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all duration-150"
          :class="
            activeTab === 'workspace'
              ? isDark
                ? 'text-brand-400 bg-brand-400/10 shadow-[0_1px_2px_rgba(108,138,255,0.08)]'
                : 'text-brand-500 bg-brand-50 shadow-sm'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4'
                : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
          ">
          <svg-icon icon-class="wand-magic-sparkles" size="12" class="mr-0.5"/>
          工作台
        </button>
        <button
          @click="activeTab = 'preview'"
          class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all duration-150"
          :class="
            activeTab === 'preview'
              ? isDark
                ? 'text-brand-400 bg-brand-400/10 shadow-[0_1px_2px_rgba(108,138,255,0.08)]'
                : 'text-brand-500 bg-brand-50 shadow-sm'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4'
                : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
          ">
          <i class="ri-eye-line text-[12px] mr-0.5" />
          预览
        </button>
      </div>
      <button
        @click="emit('close')"
        title="关闭侧边栏"
        class="h-6 w-6 rounded flex items-center justify-center transition-colors"
        :class="
          isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
        ">
        <i class="ri-close-line text-[14px]" />
      </button>
    </div>

    <!-- Tab content -->
    <PreviewTab
      v-if="activeTab === 'preview'"
      :preview-file="previewFile"
      :is-dark="isDark"
      @preview-file="(f) => emit('preview-file', f)"
      @close="
        activeTab = 'workspace';
        emit('preview-file', null)
      " />
    <WorkspaceTab
      v-if="activeTab === 'workspace'"
      :is-dark="isDark"
      :selected-agent="selectedAgent"
      :group-id="groupId"
      @view-artifact="openArtifactModal"
      @delete-artifact="deleteArtifact"
      @tool-action="(t) => emit('tool-action', t)"
      @select-skill="(skill) => emit('select-skill', skill)" />
  </div>

  <!-- Artifact Modal (rendered outside panel so it's not clipped) -->
  <ArtifactModal
    v-if="viewingArtifact"
    :artifact="viewingArtifact"
    :task="viewingTask"
    :ctx-items="ctxItems || []"
    :is-dark="isDark"
    @close="closeArtifactModal"
    @delete="deleteArtifact" />
</template>
