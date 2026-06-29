<script setup>
import AgentPopover from './AgentPopover.vue'
import AttachPopover from './AttachPopover.vue'
import WikiContextPopover from './WikiContextPopover.vue'
import ContextSettingsPopover from './ContextSettingsPopover.vue'

defineProps({
  isDark: Boolean,
  activePopover: String,
  popoverPos: { type: Object, default: () => ({ left: 0, bottom: 0, arrowLeft: 18 }) },
  ctxItems: { type: Array, default: () => [] },
  allAgents: { type: Array, default: () => [] },
  selectedAgent: Object,
  availableWikis: { type: Array, default: () => [] },
  selectedWikiIds: { type: Array, default: () => [] },
  contextLength: { type: Number, default: 30 },
  isCompressing: Boolean,
  isStreaming: Boolean,
})

const emit = defineEmits([
  'add-ctx',
  'select-agent',
  'close',
  'toggle-wiki',
  'clear-wiki',
  'update-context-length',
  'compress-context',
])

function selectAgent(agent) {
  emit('select-agent', agent)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="activePopover"
      id="chat-popover-content"
      class="fixed z-[9999] rounded-xl shadow-2xl"
      :class="isDark ? 'shadow-black/50' : 'shadow-black/20'"
      :style="{ left: popoverPos.left + 'px', bottom: popoverPos.bottom + 'px', width: '280px' }">
      <span
        class="pointer-events-none absolute -bottom-[5px] h-2.5 w-2.5 rotate-45"
        :class="isDark ? 'bg-d2 border-r border-b border-d4' : 'bg-l2 border-r border-b border-bdrF'"
        :style="{ left: popoverPos.arrowLeft + 'px' }" />

      <AttachPopover
        v-if="activePopover === 'attach'"
        :is-dark="isDark"
        :ctx-items="ctxItems"
        @add-ctx="emit('add-ctx', $event)"
        @close="emit('close')" />

      <AgentPopover
        v-if="activePopover === 'agent'"
        :is-dark="isDark"
        :agents="allAgents"
        :selected-agent="selectedAgent"
        @select="selectAgent"
        @close="emit('close')" />

      <WikiContextPopover
        v-if="activePopover === 'wiki'"
        :is-dark="isDark"
        :available-wikis="availableWikis"
        :selected-wiki-ids="selectedWikiIds"
        @toggle-wiki="emit('toggle-wiki', $event)"
        @clear-wiki="emit('clear-wiki')" />

      <ContextSettingsPopover
        v-if="activePopover === 'ctx'"
        :is-dark="isDark"
        :context-length="contextLength"
        :is-compressing="isCompressing"
        :is-streaming="isStreaming"
        @update-context-length="emit('update-context-length', $event)"
        @compress-context="emit('compress-context')"
        @close="emit('close')" />
    </div>
  </Teleport>
</template>
