<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { toFileUrl } from '@/utils/fileUrl'
import MessageDeleteConfirm from './MessageDeleteConfirm.vue'
import FileCard from './FileCard.vue'
import KnowledgeScopeCard from './KnowledgeScopeCard.vue'

const props = defineProps({
  msg: Object,
  isDark: Boolean,
  chatBusy: Boolean,
  imageAttachments: { type: Array, default: () => [] },
  fileAttachments: { type: Array, default: () => [] },
})

const emit = defineEmits(['preview-file', 'copy', 'edit', 'save-edit', 'retry', 'delete'])

const isEditing = ref(false)
const editContent = ref('')
const showDeleteConfirm = ref(false)
const copied = ref(false)
const bubbleRef = ref(null)
const editTextareaRef = ref(null)

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
const canSaveEdit = computed(() => {
  const next = editContent.value.trim()
  return !props.chatBusy && !!next && next !== originalContent.value.trim()
})

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function previewImage(img) {
  if (img.path) emit('preview-file', img)
}

function knowledgeKey(item, index) {
  return item.id || item.docId || item.kbId || `${item.type || 'kb'}_${item.name || index}_${index}`
}

function startEdit() {
  editContent.value = originalContent.value
  isEditing.value = true
  nextTick(() => {
    autoResizeEdit()
    editTextareaRef.value?.focus()
    const len = editContent.value.length
    editTextareaRef.value?.setSelectionRange(len, len)
  })
}
function saveEdit() {
  if (!canSaveEdit.value) return
  emit('save-edit', { msgId: props.msg.id, content: editContent.value.trim() })
  isEditing.value = false
}
function cancelEdit() { isEditing.value = false }
function autoResizeEdit() {
  const el = editTextareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 260) + 'px'
}
function handleEditKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
    return
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    saveEdit()
  }
}
function copyContent() {
  navigator.clipboard.writeText(props.msg.content || '')
    .then(() => { copied.value = true; setTimeout(() => { copied.value = false }, 1500) })
    .catch(() => {})
  emit('copy')
}
function confirmDelete() { emit('delete'); showDeleteConfirm.value = false }

watch(editContent, () => {
  if (isEditing.value) nextTick(autoResizeEdit)
})
</script>

<template>
  <div class="group relative flex justify-end fade-up">
    <div :class="isEditing ? 'w-[85%] sm:w-[68%] max-w-[760px]' : 'max-w-[85%] sm:max-w-[68%]'">
      <div v-if="normalizedImageAttachments.length" class="flex flex-wrap gap-2 mb-1">
        <button v-for="img in normalizedImageAttachments" :key="img._key"
          class="group/img w-[132px] overflow-hidden rounded-lg text-left transition-colors"
          :class="isDark ? 'bg-d0 border border-d4 hover:border-brand-400/30' : 'bg-l2 border border-bdrF hover:border-brand-300'"
          @click="previewImage(img)">
          <div class="h-[92px] bg-black/10 overflow-hidden flex items-center justify-center">
            <img v-if="img._src" :src="img._src" class="w-full h-full object-cover group-hover/img:opacity-90 transition-opacity" />
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
      <div v-if="localFileAttachments.length && !isEditing" class="flex flex-col gap-2 mb-1">
        <FileCard v-for="f in localFileAttachments" :key="f.path || f.id || f.name" :file="f" :is-dark="isDark" @preview="$emit('preview-file', f)" />
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
          <textarea
            ref="editTextareaRef"
            v-model="editContent"
            class="w-full min-h-[76px] max-h-[260px] bg-transparent outline-none resize-none border-0 text-[13px] leading-relaxed p-0"
            :class="isDark ? 'text-wt-main placeholder-wt-dim' : 'text-lt-main placeholder-lt-aux'"
            rows="3"
            placeholder="编辑这条消息..."
            @keydown="handleEditKeydown" />
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
      <div v-else ref="bubbleRef" class="px-3 py-2 rounded-md rounded-tr-md text-[13px] leading-relaxed text-white"
        style="background: linear-gradient(135deg, #6c8aff, #4a6cff)">
        {{ msg.content }}
      </div>
      <div v-if="!isEditing"
        class="flex items-center justify-end gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button @click="copyContent" title="复制"
          class="h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[11px] transition-colors"
          :class="copied ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
          <i :class="copied ? 'ri-check-line' : 'ri-file-copy-line'" class="text-[12px]" />
          <span v-if="copied">已复制</span>
        </button>
        <button @click="startEdit" title="编辑"
          class="h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[11px] transition-colors"
          :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          <i class="ri-edit-line text-[12px]" />
        </button>
        <button @click="emit('retry')" title="重试" :disabled="chatBusy"
          class="h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[11px] transition-colors"
          :class="chatBusy
            ? (isDark ? 'text-wt-dim/60 cursor-not-allowed' : 'text-lt-aux/60 cursor-not-allowed')
            : (isDark ? 'text-wt-dim hover:text-brand-400' : 'text-lt-aux hover:text-brand-500')">
          <i class="ri-refresh-line text-[12px]" />
        </button>
        <button @click="showDeleteConfirm = true" title="删除"
          class="h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[11px] transition-colors"
          :class="isDark ? 'text-wt-dim hover:text-red-400' : 'text-lt-aux hover:text-red-500'">
          <i class="ri-delete-bin-line text-[12px]" />
        </button>
      </div>
      <MessageDeleteConfirm v-if="showDeleteConfirm" :is-dark="isDark"
        @confirm="confirmDelete" @cancel="showDeleteConfirm = false" />
    </div>
  </div>
</template>

<style scoped>
.fade-up { animation: fadeUp 0.2s ease-out; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
</style>
