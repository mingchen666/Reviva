<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import { useConversationsStore } from '@/stores/conversations'

const props = defineProps({
  conversations: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
  currentConvId: String,
  isDark: Boolean,
})

const emit = defineEmits(['select', 'create', 'rename', 'export', 'delete', 'group-create', 'group-rename', 'group-delete', 'add-conv-to-group'])

const convStore = useConversationsStore()
const msg = useMessage()
const mbox = useMessageBox()
const scrollRef = ref(null)
const expandedGroups = ref({ default: true })
const dropdown = ref(null)

const conversationsByGroup = computed(() => {
  const map = new Map(props.groups.map(group => [group.id, []]))
  for (const conversation of props.conversations) {
    const groupId = map.has(conversation.groupId) ? conversation.groupId : 'default'
    if (!map.has(groupId)) map.set(groupId, [])
    map.get(groupId).push(conversation)
  }
  return map
})

const conversationById = computed(() => new Map(
  props.conversations.map(conversation => [conversation.id, conversation]),
))

const virtualRows = computed(() => {
  const rows = []
  for (const group of props.groups) {
    const conversations = conversationsByGroup.value.get(group.id) || []
    const expanded = !!expandedGroups.value[group.id]
    rows.push({
      key: `group:${group.id}`,
      type: 'group',
      group,
      count: conversations.length,
      expanded,
    })
    if (!expanded) continue
    conversations.forEach((conversation, index) => {
      rows.push({
        key: `conversation:${conversation.id}`,
        type: 'conversation',
        conversation,
        firstInGroup: index === 0,
        lastInGroup: index === conversations.length - 1,
      })
    })
  }
  return rows
})

const rowVirtualizer = useVirtualizer(computed(() => ({
  count: virtualRows.value.length,
  getScrollElement: () => scrollRef.value,
  estimateSize: () => 32,
  getItemKey: index => virtualRows.value[index]?.key || index,
  overscan: 10,
  gap: 2,
})))

const visibleRows = computed(() => rowVirtualizer.value.getVirtualItems().map(item => ({
  ...item,
  row: virtualRows.value[item.index],
})).filter(item => item.row))

const totalHeight = computed(() => rowVirtualizer.value.getTotalSize())

function toggleGroup(groupId) {
  expandedGroups.value[groupId] = !expandedGroups.value[groupId]
  closeDropdown()
}

function openMore(type, id, name, event) {
  event.stopPropagation()
  event.preventDefault()
  closeDropdown()
  const rect = event.currentTarget.getBoundingClientRect()
  dropdown.value = { type, id, name, x: rect.right - 130, y: rect.bottom + 4 }
  document.addEventListener('click', onClickOutside)
}

function closeDropdown() {
  dropdown.value = null
  document.removeEventListener('click', onClickOutside)
}

function onClickOutside(event) {
  const menu = document.getElementById('sidebar-dropdown-menu')
  if (menu?.contains(event.target)) return
  closeDropdown()
}

async function handleCreateGroup() {
  const name = await mbox.prompt({
    title: '新建分组',
    message: '输入分组名称',
    placeholder: '分组名称',
    confirmText: '创建',
    cancelText: '取消',
  })
  if (name?.trim()) {
    emit('group-create', { name: name.trim() })
    msg.success('分组已创建')
  }
}

async function handleRename() {
  const target = dropdown.value
  if (!target) return
  closeDropdown()
  const isGroup = target.type === 'group'
  const newName = await mbox.prompt({
    title: isGroup ? '重命名分组' : '重命名对话',
    message: `当前名称：${target.name}`,
    value: target.name,
    placeholder: '输入新名称',
    confirmText: '确认',
    cancelText: '取消',
  })
  if (!newName?.trim()) return
  if (isGroup) emit('group-rename', { id: target.id, name: newName.trim() })
  else emit('rename', { id: target.id, title: newName.trim() })
}

async function handleDelete() {
  const target = dropdown.value
  if (!target) return
  closeDropdown()
  const isGroup = target.type === 'group'
  if (isGroup && target.id === 'default') {
    msg.warning('默认分组不可删除')
    return
  }
  const confirmed = await mbox.confirm({
    title: isGroup ? '确认删除分组' : '确认删除对话',
    subtitle: '此操作不可撤销',
    message: isGroup
      ? '删除该分组后，分组内的对话将移至默认分组。'
      : `删除「${target.name}」？其所有消息将被永久移除。`,
    variant: 'danger',
    confirmText: '确认删除',
    cancelText: '取消',
  })
  if (!confirmed) return
  if (isGroup) emit('group-delete', target.id)
  else emit('delete', target.id)
}

function handleExport() {
  const target = dropdown.value
  if (!target || target.type !== 'conv') return
  closeDropdown()
  emit('export', target.id)
}

function handleAddConversation() {
  const target = dropdown.value
  if (!target || target.type !== 'group') return
  closeDropdown()
  emit('add-conv-to-group', target.id)
}

function branchSourceLabel(conversation) {
  if (!conversation?.parentConversationId) return ''
  const source = conversationById.value.get(conversation.parentConversationId)
  return source ? `来自「${source.title}」的分支` : '来源对话已删除'
}

onBeforeUnmount(closeDropdown)
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <div class="px-3 py-2 shrink-0">
      <button @click="emit('create')"
        class="w-full h-8 rounded-lg text-[14px] font-medium flex items-center justify-center gap-1.5 transition-colors"
        :class="isDark ? 'bg-brand-400/10 text-brand-400 hover:bg-brand-400/18 border border-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100 border border-brand-100'">
        <i class="ri-chat-new-line text-[14px]" /> 新建对话
      </button>
    </div>

    <div ref="scrollRef" class="flex-1 overflow-y-auto px-2 pb-2 min-h-0" @scroll.passive="closeDropdown">
      <div class="relative w-full" :style="{ height: totalHeight + 'px' }">
        <div v-for="item in visibleRows" :key="item.key"
          class="absolute left-0 right-0"
          :style="{ height: item.size + 'px', transform: `translateY(${item.start}px)` }">
          <div v-if="item.row.type === 'group'"
            class="group h-full flex items-center gap-1 px-1 cursor-pointer"
            @click="toggleGroup(item.row.group.id)">
            <i :class="[item.row.expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line', 'text-[16px] transition-transform', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
            <span class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.row.group.name }}</span>
            <span class="text-[12px] px-1 py-0.5 rounded" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ item.row.count }}</span>
            <button @click.stop="openMore('group', item.row.group.id, item.row.group.name, $event)"
              class="opacity-0 group-hover:opacity-100 ml-auto h-5 w-5 rounded flex items-center justify-center transition-all duration-150"
              :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
              <i class="ri-more-2-fill text-[16px]" />
            </button>
          </div>

          <div v-else
            class="group relative h-full pl-6 pr-2 rounded-md cursor-pointer flex items-center gap-2 transition-colors text-[13px]"
            @click="emit('select', item.row.conversation)"
            :class="currentConvId === item.row.conversation.id
              ? (isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500')
              : (isDark ? 'text-wt-aux hover:bg-white/4 hover:text-wt-sub' : 'text-lt-aux hover:bg-l4 hover:text-lt-sub')">
            <span class="absolute left-[8px] w-[2px] rounded-full"
              :class="isDark ? 'bg-d4' : 'bg-bdrF'"
              :style="{ top: item.row.firstInGroup ? '0' : '-2px', bottom: item.row.lastInGroup ? '0' : '-2px' }" />
            <i :class="[item.row.conversation.parentConversationId ? 'ri-git-branch-line' : 'ri-message-3-line', 'text-[14px] shrink-0', currentConvId === item.row.conversation.id ? (isDark ? 'text-brand-400' : 'text-brand-500') : '']"
              :title="branchSourceLabel(item.row.conversation)" />
            <span class="truncate flex-1">{{ convStore.titleTypewriterMap[item.row.conversation.id] || item.row.conversation.title }}</span>
            <button @click.stop="openMore('conv', item.row.conversation.id, item.row.conversation.title, $event)"
              class="opacity-0 group-hover:opacity-100 shrink-0 h-5 w-5 rounded flex items-center justify-center transition-all duration-150"
              :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
              <i class="ri-more-2-fill text-[12px]" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="px-3 py-2 shrink-0" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
      <button @click="handleCreateGroup"
        class="w-full my-brand py-1.5 px-2 rounded-md text-[14px] font-medium flex items-center gap-1.5 transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-brand-400 hover:bg-white/4' : 'text-lt-aux hover:text-brand-400 hover:bg-l4'">
        <i class="ri-add-line text-[16px]" /> 新建分组
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="dropdown" id="sidebar-dropdown-menu"
      class="fixed z-[60] rounded-lg py-1 min-w-[130px]"
      :style="{ left: dropdown.x + 'px', top: dropdown.y + 'px' }"
      :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l2 border border-bdrF'">
      <button v-if="dropdown.type === 'group'" @click="handleAddConversation"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors"
        :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4'">
        <i class="ri-chat-new-line text-[13px]" />
        <span>新建对话</span>
      </button>
      <button @click="handleRename"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors"
        :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4'">
        <i class="ri-edit-line text-[13px]" />
        <span>重命名</span>
      </button>
      <button v-if="dropdown.type === 'conv'" @click="handleExport"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors"
        :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4'">
        <i class="ri-markdown-line text-[13px]" />
        <span>导出 Markdown</span>
      </button>
      <div v-if="dropdown.type === 'conv'" class="h-px my-1" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />
      <button v-if="!(dropdown.type === 'group' && dropdown.id === 'default')" @click="handleDelete"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors"
        :class="isDark ? 'text-red-400 hover:bg-red-400/8' : 'text-red-500 hover:bg-red-50'">
        <i class="ri-delete-bin-line text-[13px]" />
        <span>{{ dropdown.type === 'group' ? '删除分组' : '删除对话' }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.my-brand:hover {
  color: var(--brand);
}
// .my-brand{
//   background: rgba(var(--brand-rgb),.12);
//   }
</style>