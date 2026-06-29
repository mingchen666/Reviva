<script setup>
import { ref, computed } from 'vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import GroupSection from './GroupSection.vue'

const props = defineProps({
  conversations: Array,
  groups: Array,
  currentConvId: String,
  isDark: Boolean,
})

const emit = defineEmits(['select', 'create', 'rename', 'delete', 'group-create', 'group-rename', 'group-delete', 'add-conv-to-group'])

const msg = useMessage()
const mbox = useMessageBox()

const expandedGroups = ref({ default: true })

const convsByGroup = computed(() => {
  const map = {}
  for (const g of props.groups) {
    map[g.id] = props.conversations.filter(c => c.groupId === g.id)
  }
  return map
})

function toggleGroup(gid) {
  expandedGroups.value[gid] = !expandedGroups.value[gid]
}

async function handleCreateGroup() {
  const name = await mbox.prompt({
    title: '新建分组',
    message: '输入分组名称',
    placeholder: '分组名称',
    confirmText: '创建',
    cancelText: '取消',
  })
  if (name && name.trim()) {
    emit('group-create', { name: name.trim() })
    msg.success('分组已创建')
  }
}
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <!-- New Chat Button -->
    <div class="px-3 py-2 shrink-0">
      <button @click="emit('create')"
        class="w-full h-8 rounded-lg text-[14px] font-medium flex items-center justify-center gap-1.5 transition-colors"
        :class="isDark ? 'bg-brand-400/10 text-brand-400 hover:bg-brand-400/18 border border-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100 border border-brand-100'">
        <i class="ri-chat-new-line text-[14px]" /> 新建对话
      </button>
    </div>

    <!-- Group sections (scrollable) -->
    <div class="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 min-h-0">
      <GroupSection v-for="group in groups" :key="group.id"
        :group="group"
        :conversations="convsByGroup[group.id] || []"
        :current-conv-id="currentConvId"
        :is-dark="isDark"
        :expanded="!!expandedGroups[group.id]"
        @toggle="toggleGroup(group.id)"
        @select="emit('select', $event)"
        @conv-rename="emit('rename', $event)"
        @conv-delete="emit('delete', $event)"
        @group-rename="emit('group-rename', $event)"
        @group-delete="emit('group-delete', $event)"
        @group-add-conv="emit('add-conv-to-group', $event)" />
    </div>

    <!-- Create group (fixed bottom) -->
    <div class="px-3 py-2 shrink-0" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
      <button @click="handleCreateGroup()"
        class="w-full py-1.5 px-2 rounded-md text-[13px] font-medium flex items-center gap-1.5 transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-brand-400 hover:bg-white/4' : 'text-lt-aux hover:text-brand-400 hover:bg-l4'">
        <i class="ri-add-line text-[14px]" /> 新建分组
      </button>
    </div>
  </div>
</template>