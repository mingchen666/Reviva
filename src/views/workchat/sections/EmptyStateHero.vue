<script setup>
import { computed } from 'vue'

const props = defineProps({
  hasConversation: Boolean,
  isDark: Boolean,
  agents: { type: Array, default: () => [] },
})

const emit = defineEmits(['create-conv', 'select-agent'])

const suggestedAgents = computed(() => {
  return props.agents.filter(a => a.isDefault || a.featured).slice(0, 3)
})

const shortcuts = [
  { keys: 'Ctrl+N', label: '新建对话' },
  { keys: 'Enter', label: '发送消息' },
  { keys: 'Shift+Enter', label: '换行' },
]
</script>

<template>
  <!-- No conversation selected -->
  <div v-if="!hasConversation" class="flex-1 flex items-center justify-center"
    :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
    <div class="text-center max-w-[280px]">
      <i class="ri-chat-new-line text-[36px] mb-4" :class="isDark ? 'text-brand-400/40' : 'text-brand-500/40'" />
      <p class="text-[15px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">开始一段新对话</p>
      <p class="text-[12px] mt-2 leading-relaxed">选择智能体，输入你的问题，开启学习之旅</p>
      <!-- Agent suggestion cards -->
      <div v-if="suggestedAgents.length" class="mt-4 flex flex-col gap-2">
        <button v-for="agent in suggestedAgents" :key="agent.id"
          @click="emit('select-agent', agent)"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left"
          :class="isDark ? 'bg-d3 hover:bg-d4 text-wt-sub' : 'bg-l3 hover:bg-l4 text-lt-sub'">
          <div class="w-[22px] h-[22px] rounded-full flex items-center justify-center"
            :class="isDark ? 'bg-agent-400/12' : 'bg-agent-50'">
           <i 
  :class="[
    agent.icon || 'ri-sparkling-2-line',
    'text-[11px]',
    isDark ? 'text-agent-400' : 'text-agent-500'
  ]" 
/>
          </div>
          <span class="text-[12px] font-medium">{{ agent.name }}</span>
          <span class="text-[10px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ agent.arch || '' }}</span>
        </button>
      </div>
      <button @click="emit('create-conv')"
        class="mt-3 h-8 px-5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors mx-auto"
        :class="isDark ? 'bg-brand-400/15 text-brand-400 hover:bg-brand-400/25' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
        <i class="ri-add-line text-[12px]" /> 新建对话
      </button>
      <!-- Keyboard shortcuts -->
      <div class="mt-4 flex items-center justify-center gap-4 text-[10px]"
        :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <span v-for="s in shortcuts" :key="s.keys" class="flex items-center gap-1">
          <kbd class="px-1 py-0.5 rounded text-[9px]"
            :class="isDark ? 'bg-d0 border border-d4' : 'bg-l1 border border-bdrF'">{{ s.keys }}</kbd>
          {{ s.label }}
        </span>
      </div>
    </div>
  </div>

  <!-- Has conversation but no messages -->
  <div v-else class="flex-1 flex items-center justify-center"
    :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
    <div class="text-center max-w-[240px]">
      <i class="ri-chat-smile-2-line text-[32px] mb-3" :class="isDark ? 'text-agent-400/40' : 'text-agent-500/40'" />
      <p class="text-[14px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">开始对话</p>
      <p class="text-[12px] mt-1">请这输入框选择 @Agent 智能体，再输入问题</p>
      <!-- Agent suggestion -->
      <div v-if="suggestedAgents.length" class="mt-3 flex flex-col gap-2">
        <button v-for="agent in suggestedAgents" :key="agent.id"
          @click="emit('select-agent', agent)"
          class="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left"
          :class="isDark ? 'bg-d3 hover:bg-d4 text-wt-sub' : 'bg-l3 hover:bg-l4 text-lt-sub'">
<i 
  :class="[
    agent.icon || 'ri-sparkling-2-line',
    'text-[11px]',
    isDark ? 'text-agent-400' : 'text-agent-500'
  ]"
/>
          <span class="text-[12px]">{{ agent.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>