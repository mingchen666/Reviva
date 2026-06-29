<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  todos: { type: Array, default: () => [] },
  isDark: Boolean,
})

const open = ref(true)

const normalizedTodos = computed(() =>
  props.todos
    .map((todo, index) => ({
      id: todo.id || todo.key || index,
      content: todo.content || todo.task || todo.text || todo.title || '',
      status: String(todo.status || (todo.done ? 'completed' : 'pending')).toLowerCase().replace('-', '_'),
    }))
    .filter(todo => todo.content),
)

const counts = computed(() => {
  const total = normalizedTodos.value.length
  const completed = normalizedTodos.value.filter(todo => todo.status === 'completed' || todo.status === 'done').length
  const active = normalizedTodos.value.filter(todo => todo.status === 'in_progress' || todo.status === 'running').length
  const blocked = normalizedTodos.value.filter(todo => todo.status === 'blocked' || todo.status === 'cancelled').length
  return { total, completed, active, blocked }
})

const overallStatus = computed(() => {
  if (counts.value.blocked > 0) return { label: '需处理', tone: 'blocked' }
  if (counts.value.active > 0) return { label: '进行中', tone: 'active' }
  if (counts.value.total > 0 && counts.value.completed === counts.value.total) return { label: '已完成', tone: 'done' }
  return { label: '待开始', tone: 'pending' }
})

function statusMeta(status) {
  if (status === 'completed' || status === 'done') {
    return { icon: 'ri-check-line', label: '完成', tone: 'done' }
  }
  if (status === 'in_progress' || status === 'running') {
    return { icon: 'ri-loader-4-line', label: '进行中', tone: 'active' }
  }
  if (status === 'cancelled' || status === 'blocked') {
    return { icon: 'ri-pause-line', label: '暂停', tone: 'blocked' }
  }
  return { icon: 'ri-circle-line', label: '待办', tone: 'pending' }
}

function rowClass(status) {
  const tone = statusMeta(status).tone
  if (tone === 'done') return props.isDark ? 'text-wt-dim' : 'text-lt-aux'
  if (tone === 'active') return props.isDark ? 'text-wt-sub bg-agent-400/6' : 'text-lt-sub bg-agent-50/70'
  if (tone === 'blocked') return props.isDark ? 'text-amber-400 bg-amber-400/6' : 'text-amber-600 bg-amber-50'
  return props.isDark ? 'text-wt-aux' : 'text-lt-aux'
}

function badgeClass(tone) {
  if (tone === 'done') return props.isDark ? 'bg-output-400/10 text-output-400' : 'bg-emerald-50 text-emerald-600'
  if (tone === 'active') return props.isDark ? 'bg-agent-400/10 text-agent-400' : 'bg-agent-50 text-agent-600'
  if (tone === 'blocked') return props.isDark ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-700'
  return props.isDark ? 'bg-white/5 text-wt-dim' : 'bg-white/70 text-lt-aux'
}
</script>

<template>
  <div v-if="normalizedTodos.length" class="rounded-lg px-3 py-2.5"
    :class="isDark ? 'bg-d0/55 border border-d4' : 'bg-l2/75 border border-bdrF'">
    <button
      type="button"
      class="w-full h-6 flex items-center gap-2 text-left mb-1.5 transition-colors"
      :class="isDark ? 'text-wt-sub hover:text-wt-main' : 'text-lt-sub hover:text-lt-main'"
      :aria-expanded="open"
      @click="open = !open">
      <i :class="open ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" class="w-3 h-5 inline-flex items-center justify-center text-[12px] leading-none shrink-0" />
      <i class="ri-list-check-3 w-3 h-5 inline-flex items-center justify-center text-[12px] leading-none shrink-0" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
      <span class="min-w-0 flex-1 truncate text-[11px] font-semibold leading-none">任务进度</span>
      <span class="h-5 inline-flex items-center rounded px-1.5 text-[10px] font-medium leading-none shrink-0" :class="badgeClass(overallStatus.tone)">
        {{ overallStatus.label }}
      </span>
      <span class="h-5 inline-flex items-center rounded px-1.5 text-[10px] leading-none tabular-nums shrink-0" :class="isDark ? 'bg-white/5 text-wt-dim' : 'bg-white/70 text-lt-aux'">
        {{ counts.completed }}/{{ counts.total }}
      </span>
    </button>
    <Transition name="todo-slide">
    <div v-if="open" class="space-y-1">
      <div v-for="todo in normalizedTodos" :key="todo.id"
        class="flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] leading-relaxed"
        :class="rowClass(todo.status)">
        <i :class="[statusMeta(todo.status).icon, 'w-3 h-5 inline-flex items-center justify-center text-[12px] leading-none shrink-0', statusMeta(todo.status).tone === 'active' ? 'animate-spin' : '']" />
        <span class="flex-1 min-w-0 leading-5" :class="statusMeta(todo.status).tone === 'done' ? 'line-through opacity-75' : ''">{{ todo.content }}</span>
        <span class="h-5 inline-flex items-center shrink-0 text-[9px] leading-none" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ statusMeta(todo.status).label }}</span>
      </div>
    </div>
    </Transition>
  </div>
</template>

<style scoped>
.todo-slide-enter-active { transition: opacity 0.18s ease-out, transform 0.18s ease-out; }
.todo-slide-leave-active { transition: opacity 0.12s ease-in, transform 0.12s ease-in; }
.todo-slide-enter-from,
.todo-slide-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
