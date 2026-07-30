<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import MarkdownImagePreview from '@/components/MarkdownImagePreview.vue'
import { toFileUrl } from '@/utils/fileUrl'
import { useAgentsStore } from '@/stores/agents'
import { useSettingsStore } from '@/stores/settings'
import { useQuickInputsStore } from '@/stores/quickInputs'
import {
  displayTextFromDocument,
  normalizeInputDocument,
  resolvedTextFromDocument,
} from '@/utils/chatInputDocument'
import MessageDeleteConfirm from './MessageDeleteConfirm.vue'
import FileCard from './FileCard.vue'
import KnowledgeScopeCard from './KnowledgeScopeCard.vue'
import ChatTokenEditor from './chat/ChatTokenEditor.vue'

const props = defineProps({
  msg: Object,
  isDark: Boolean,
  chatBusy: Boolean,
  imageAttachments: { type: Array, default: () => [] },
  fileAttachments: { type: Array, default: () => [] },
})

const emit = defineEmits(['preview-file', 'media-detail', 'copy', 'edit', 'save-edit', 'retry', 'delete'])

const isEditing = ref(false)
const editDocument = ref([])
const showDeleteConfirm = ref(false)
const copied = ref(false)
const bubbleRef = ref(null)
const editEditorRef = ref(null)
const activeImagePreview = ref(null)
const activeToken = ref(null)
const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()
const quickInputsStore = useQuickInputsStore()

function isKnowledgeAttachment(item) {
  return item?.type === 'cloud_kb' || item?.type === 'cloud_doc' || item?.type === 'kb'
}

const knowledgeAttachments = computed(() => [
  ...(props.imageAttachments || []).filter(isKnowledgeAttachment),
  ...(props.fileAttachments || []).filter(isKnowledgeAttachment),
])

const normalizedImageAttachments = computed(() =>
  (props.imageAttachments || []).filter(i => !isKnowledgeAttachment(i)).map((img, index) => ({
    ...img,
    _key: img.path || img.dataUrl || `${img.name || 'image'}_${index}`,
    _src: img.dataUrl || toFileUrl(img.path),
    _name: img.name || (img.path ? img.path.split(/[\\/]/).pop() : '图片'),
  })),
)
const localFileAttachments = computed(() =>
  (props.fileAttachments || []).filter(i => !isKnowledgeAttachment(i)),
)
const originalContent = computed(() => String(props.msg?.content || ''))
const originalDocument = computed(() => normalizeInputDocument(props.msg?.meta?.inputDocument, originalContent.value))
const editContent = computed(() => displayTextFromDocument(editDocument.value))
const editResolvedContent = computed(() => resolvedTextFromDocument(editDocument.value))
const slashItems = computed(() => {
  const agentId = props.msg?.meta?.agentId
  const agent = agentsStore.agents.find(item => item.id === agentId)
  return (agent?.skills || []).map(skillId => agentsStore.allAvailableSkills.find(skill => skill.id === skillId)).filter(Boolean).map(skill => {
    const description = skill.desc || skill.description || skill.category || ''
    const keywords = [skill.id, skill.name, skill.category, description].filter(Boolean)
    return {
      type: 'skill',
      typeLabel: 'Skill',
      id: skill.id,
      label: `/${skill.id}`,
      name: skill.name || skill.id,
      description,
      insertText: `/${skill.id}`,
      icon: skill.icon || 'ri-magic-line',
      color: skill.color,
      searchText: keywords.join(' ').toLowerCase(),
    }
  })
})
const canSaveEdit = computed(() => {
  const next = editContent.value.trim()
  return !props.chatBusy && !!next && (
    next !== originalContent.value.trim() ||
    JSON.stringify(normalizeInputDocument(editDocument.value)) !== JSON.stringify(originalDocument.value)
  )
})

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function previewImage(img) {
  if (!img?._src) return
  activeImagePreview.value = {
    src: img._src,
    alt: img._name,
    title: img._name,
  }
}

function knowledgeKey(item, index) {
  return item.id || item.docId || item.kbId || `${item.type || 'kb'}_${item.name || index}_${index}`
}

function startEdit() {
  editDocument.value = normalizeInputDocument(originalDocument.value)
  isEditing.value = true
  nextTick(() => {
    editEditorRef.value?.focus?.()
  })
}
function saveEdit() {
  if (!canSaveEdit.value) return
  emit('save-edit', {
    msgId: props.msg.id,
    content: editContent.value.trim(),
    inputDocument: normalizeInputDocument(editDocument.value),
    resolvedContent: editResolvedContent.value.trim(),
  })
  isEditing.value = false
}
function cancelEdit() { isEditing.value = false }
function copyContent() {
  navigator.clipboard.writeText(props.msg.content || '')
    .then(() => { copied.value = true; setTimeout(() => { copied.value = false }, 1500) })
    .catch(() => {})
  emit('copy')
}
function confirmDelete() { emit('delete'); showDeleteConfirm.value = false }

onMounted(() => quickInputsStore.ensureLoaded().catch(() => {}))
</script>

<template>
  <div class="group relative flex justify-end fade-up">
    <div :class="isEditing ? 'w-[85%] sm:w-[68%] max-w-[760px]' : 'max-w-[85%] sm:max-w-[68%]'">
      <div v-if="normalizedImageAttachments.length" class="flex flex-wrap justify-end gap-2 mb-1">
        <button v-for="img in normalizedImageAttachments" :key="img._key"
          type="button"
          class="group/img w-[132px] overflow-hidden rounded-lg text-left transition-colors"
          :class="isDark ? 'bg-d0 border border-d4 hover:border-brand-400/30' : 'bg-l2 border border-bdrF hover:border-brand-300'"
          @click="previewImage(img)">
          <div class="h-[92px] bg-black/10 overflow-hidden flex items-center justify-center">
            <img v-if="img._src" :src="img._src" :alt="img._name" class="w-full h-full object-cover group-hover/img:opacity-90 transition-opacity" />
            <i v-else class="ri-image-line text-[22px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          </div>
          <div class="px-2 py-1.5 min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <i class="ri-image-line text-[11px] text-pink-400 shrink-0" />
              <span class="text-[11px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ img._name }}</span>
            </div>
            <div class="mt-0.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ formatSize(img.size) || (img.path ? '图片附件' : '粘贴图片') }}
            </div>
          </div>
        </button>
      </div>
      <div v-if="knowledgeAttachments.length && !isEditing" class="flex flex-wrap justify-end gap-1.5 mb-1">
        <KnowledgeScopeCard
          v-for="(item, index) in knowledgeAttachments"
          :key="knowledgeKey(item, index)"
          :item="item"
          :is-dark="isDark"
        />
      </div>
      <div v-if="localFileAttachments.length && !isEditing" class="flex flex-col items-end gap-2 mb-1">
        <FileCard v-for="f in localFileAttachments" :key="f.path || f.id || f.name"
          class="w-full max-w-[420px]" :file="f" :is-dark="isDark"
          @preview="$emit('preview-file', f)"
          @media-detail="$emit('media-detail', { file: f, messageId: msg?.id || '' })" />
      </div>
      <div v-if="isEditing"
        class="relative rounded-xl rounded-tr-md overflow-hidden shadow-sm transition-colors"
        :class="isDark
          ? 'bg-gradient-to-br from-brand-400/12 via-d1 to-d2 border border-brand-400/25 shadow-black/25'
          : 'bg-gradient-to-br from-brand-50 via-l1 to-indigo-50/60 border border-brand-200/80 shadow-brand-100/70'">
        <div
          class="absolute inset-y-0 left-0 w-1"
          :class="isDark ? 'bg-brand-400/70' : 'bg-brand-500/80'" />
        <div class="px-4 pt-3 pb-2">
          <ChatTokenEditor
            ref="editEditorRef"
            v-model="editDocument"
            class="message-edit-token-editor"
            :is-dark="isDark"
            :slash-items="slashItems"
            :quick-items="quickInputsStore.enabledItems"
            :quick-enabled="settingsStore.quickInputEnabled"
            placeholder="编辑这条消息..."
            menu-direction="down"
            @submit="saveEdit" />
        </div>
        <div
          class="flex items-center gap-2 px-4 py-2 justify-between"
          :class="isDark ? 'bg-d2/80 border-t border-brand-400/15' : 'bg-white/72 border-t border-brand-100/80'">
          <span class="inline-flex items-center gap-1.5 text-[11px] font-medium" :class="isDark ? 'text-brand-200' : 'text-brand-600'">
            <i class="ri-edit-line text-[12px]" />
            编辑消息
          </span>
          <div class="flex items-center gap-2">
            <button @click="cancelEdit"
              class="h-7 px-3 rounded-lg text-[12px] font-medium transition-colors"
              :class="isDark ? 'text-wt-sub hover:text-wt-main hover:bg-white/6' : 'text-lt-sub hover:text-lt-main hover:bg-l4'">
              取消
            </button>
            <button
              @click="saveEdit"
              :disabled="!canSaveEdit"
              class="h-7 px-3 rounded-lg text-[12px] font-semibold transition-colors disabled:cursor-not-allowed"
              :class="canSaveEdit
                ? (isDark ? 'bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-600' : 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800')
                : (isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux')">
              保存并发送
            </button>
          </div>
        </div>
      </div>
      <div v-else ref="bubbleRef" class="user-message-bubble px-3.5 py-2.5 rounded-md rounded-tr-md text-[0.84375rem] leading-relaxed text-white whitespace-pre-wrap"
        style="background: linear-gradient(135deg, #6c8aff, #4a6cff)">
        <template v-for="(segment, index) in originalDocument" :key="`${index}:${segment.type}`">
          <span v-if="segment.type === 'text'">{{ segment.text }}</span>
          <button
            v-else
            type="button"
            class="message-inline-token"
            :class="segment.type === 'skill' ? 'message-inline-token-skill' : 'message-inline-token-quick'"
            :title="segment.type === 'skill' ? segment.label : '查看快捷输入内容'"
            @click.stop="activeToken = activeToken === segment ? null : segment">
            {{ segment.label }}
          </button>
        </template>
        <div v-if="activeToken?.type === 'quick-input'" class="mt-2 rounded-md px-2.5 py-2 text-[11px] leading-relaxed text-left whitespace-pre-wrap bg-black/15 border border-white/15">
          {{ activeToken.contentSnapshot }}
        </div>
      </div>
      <div v-if="!isEditing"
        class="flex items-center justify-end gap-0 mt-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity duration-150">
        <button @click="copyContent" title="复制"
          aria-label="复制消息"
          class="h-7 px-1.5 rounded-md flex items-center gap-0.5 text-[12px] transition-colors"
          :class="copied ? (isDark ? 'text-brand-400 bg-brand-400/8' : 'text-brand-500 bg-brand-50') : (isDark ? 'text-white/65 hover:text-white hover:bg-white/6' : 'text-lt-aux hover:text-lt-main hover:bg-l4')">
          <i :class="copied ? 'ri-check-line' : 'ri-file-copy-line'" class="text-[14px]" />
          <span v-if="copied">已复制</span>
        </button>
        <button @click="startEdit" title="编辑"
          aria-label="编辑消息"
          class="h-7 px-1.5 rounded-md flex items-center gap-0.5 text-[12px] transition-colors"
          :class="isDark ? 'text-white/65 hover:text-white hover:bg-white/6' : 'text-lt-aux hover:text-lt-main hover:bg-l4'">
          <i class="ri-edit-line text-[14px]" />
        </button>
        <button @click="emit('retry')" title="重试" :disabled="chatBusy"
          aria-label="重试消息"
          class="h-7 px-1.5 rounded-md flex items-center gap-0.5 text-[12px] transition-colors"
          :class="chatBusy
            ? (isDark ? 'text-white/30 cursor-not-allowed' : 'text-lt-aux/60 cursor-not-allowed')
            : (isDark ? 'text-white/65 hover:text-brand-400 hover:bg-white/6' : 'text-lt-aux hover:text-brand-500 hover:bg-l4')">
          <i class="ri-refresh-line text-[14px]" />
        </button>
        <button @click="showDeleteConfirm = true" title="删除"
          aria-label="删除消息"
          class="h-7 px-1.5 rounded-md flex items-center gap-0.5 text-[12px] transition-colors"
          :class="isDark ? 'text-white/65 hover:text-red-400 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'">
          <i class="ri-delete-bin-line text-[14px]" />
        </button>
      </div>
      <MessageDeleteConfirm v-if="showDeleteConfirm" :is-dark="isDark"
        @confirm="confirmDelete" @cancel="showDeleteConfirm = false" />
    </div>
    <MarkdownImagePreview v-if="activeImagePreview" :image="activeImagePreview" @close="activeImagePreview = null" />
  </div>
</template>

<style scoped>
.fade-up { animation: fadeUp 0.2s ease-out; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.message-edit-token-editor :deep(.chat-token-editor-surface) { min-height: 82px; max-height: 260px; overflow-y: auto; padding-bottom: 6px; }
.message-inline-token { display: inline-flex; align-items: center; height: 22px; margin: 0 2px; padding: 0 6px; border-radius: 5px; border: 1px solid rgba(255,255,255,.34); color: white; background: rgba(255,255,255,.16); font-size: 11px; line-height: 1; font-weight: 650; vertical-align: middle; cursor: pointer; }
.message-inline-token:hover { background: rgba(255,255,255,.24); }
.message-inline-token-skill { border-color: rgba(216,180,254,.5); color: #f3e8ff; background: rgba(147,51,234,.2); }
.message-inline-token-quick { border-color: rgba(199,210,254,.5); color: #e0e7ff; background: rgba(99,102,241,.22); }
</style>
