<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import { useConversationsStore } from '@/stores/conversations'

const props = defineProps({
  group: Object,
  conversations: Array,
  currentConvId: String,
  isDark: Boolean,
  expanded: Boolean,
})

const emit = defineEmits(['toggle', 'select', 'conv-rename', 'conv-delete', 'group-rename', 'group-delete', 'group-add-conv'])

const convStore = useConversationsStore()
const msg = useMessage()
const mbox = useMessageBox()

const dropdown = ref(null) // { type: 'group'|'conv', id, name, x, y }

function openMore(type, id, name, e) {
  e.stopPropagation()
  e.preventDefault()
  // Close any existing dropdown first
  if (dropdown.value) {
    document.removeEventListener('click', onClickOutside)
  }
  const rect = e.currentTarget.getBoundingClientRect()
  dropdown.value = { type, id, name, x: rect.right - 130, y: rect.bottom + 4 }
  document.addEventListener('click', onClickOutside)
}

function closeDropdown() {
  dropdown.value = null
  document.removeEventListener('click', onClickOutside)
}

function onClickOutside(e) {
  const menu = document.getElementById('sidebar-dropdown-menu')
  if (menu && menu.contains(e.target)) return
  closeDropdown()
}

onBeforeUnmount(() => {
  if (dropdown.value) document.removeEventListener('click', onClickOutside)
})

async function handleRename() {
  const d = dropdown.value
  if (!d) return
  closeDropdown()
  const isGroup = d.type === 'group'
  const newName = await mbox.prompt({
    title: isGroup ? '重命名分组' : '重命名对话',
    message: `当前名称：${d.name}`,
    value: d.name,
    placeholder: '输入新名称',
    confirmText: '确认',
    cancelText: '取消',
  })
  if (newName && newName.trim()) {
    if (isGroup) {
      emit('group-rename', { id: d.id, name: newName.trim() })
    } else {
      emit('conv-rename', { id: d.id, title: newName.trim() })
    }
  }
}

async function handleDelete() {
  const d = dropdown.value
  if (!d) return
  closeDropdown()
  const isGroup = d.type === 'group'
  if (isGroup && d.id === 'default') {
    msg.warning('默认分组不可删除')
    return
  }
  const confirmed = await mbox.confirm({
    title: isGroup ? '确认删除分组' : '确认删除对话',
    subtitle: '此操作不可撤销',
    message: isGroup
      ? '删除该分组后，分组内的对话将移至默认分组。'
      : `删除「${d.name}」？其所有消息将被永久移除。`,
    variant: 'danger',
    confirmText: '确认删除',
    cancelText: '取消',
  })
  if (!confirmed) return
  if (isGroup) {
    emit('group-delete', d.id)
  } else {
    emit('conv-delete', d.id)
  }
}

function handleAddConv() {
  const d = dropdown.value
  if (!d || d.type !== 'group') return
  closeDropdown()
  emit('group-add-conv', d.id)
}
</script>

<template>
  <div class="relative">
    <!-- Vertical group line -->
    <div v-if="expanded && conversations.length"
      class="group-line absolute left-[10px] top-[28px] bottom-[4px]"
      :class="isDark ? 'bg-d4' : 'bg-bdrF'" />

    <!-- Group header -->
    <div class="group flex items-center gap-1 py-1.5 px-1 cursor-pointer"
      @click="emit('toggle')">
      <i :class="[expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line', 'text-[14px] transition-transform', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
      <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ group.name }}</span>
      <span class="text-[10px] px-1 py-0.5 rounded" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ conversations.length }}</span>
      <button @click.stop="openMore('group', group.id, group.name, $event)"
        class="opacity-0 group-hover:opacity-100 ml-auto h-5 w-5 rounded flex items-center justify-center transition-all duration-150"
        :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
        <i class="ri-more-2-fill text-[13px]" />
      </button>
    </div>

    <!-- Conversation items -->
    <template v-if="expanded">
      <div v-for="c in conversations" :key="c.id"
        class="group py-[6px] pl-6 pr-2 rounded-md cursor-pointer flex items-center gap-2 transition-colors text-[12px]"
        @click="emit('select', c)"
        :class="currentConvId === c.id
          ? (isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500')
          : (isDark ? 'text-wt-aux hover:bg-white/4 hover:text-wt-sub' : 'text-lt-aux hover:bg-l4 hover:text-lt-sub')">
        <i class="ri-message-3-line text-[12px]" :class="currentConvId === c.id ? (isDark ? 'text-brand-400' : 'text-brand-500') : ''" />
        <span class="truncate flex-1">{{ convStore.getDisplayTitle(c.id) }}</span>
        <button @click.stop="openMore('conv', c.id, c.title, $event)"
          class="opacity-0 group-hover:opacity-100 shrink-0 transition-all duration-150"
          :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
          <i class="ri-more-2-fill text-[12px]" />
        </button>
      </div>
    </template>
  </div>

  <!-- Dropdown menu -->
  <Teleport to="body">
    <div v-if="dropdown" id="sidebar-dropdown-menu"
      class="fixed z-[60] rounded-lg py-1 min-w-[130px]"
      :style="{ left: dropdown.x + 'px', top: dropdown.y + 'px' }"
      :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l2 border border-bdrF'">
      <button v-if="dropdown.type === 'group'" @click="handleAddConv"
        class="w-full flex items-center gap-2.5 px-3 py-[7px] text-[12px] font-medium transition-colors"
        :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4'">
        <i class="ri-chat-new-line text-[13px]" />
        <span>新建对话</span>
      </button>
      <button @click="handleRename"
        class="w-full flex items-center gap-2.5 px-3 py-[7px] text-[12px] font-medium transition-colors"
        :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4'">
        <i class="ri-edit-line text-[13px]" />
        <span>重命名</span>
      </button>
      <button v-if="!(dropdown.type === 'group' && dropdown.id === 'default')" @click="handleDelete"
        class="w-full flex items-center gap-2.5 px-3 py-[7px] text-[12px] font-medium transition-colors"
        :class="isDark ? 'text-red-400 hover:bg-red-400/8' : 'text-red-500 hover:bg-red-50'">
        <i class="ri-delete-bin-line text-[13px]" />
        <span>{{ dropdown.type === 'group' ? '删除分组' : '删除对话' }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.group-line { width: 2px; border-radius: 1px; }
</style>