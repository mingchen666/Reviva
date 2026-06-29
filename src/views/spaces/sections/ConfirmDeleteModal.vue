<script setup>
defineProps({
  target: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm'])
</script>

<template>
  <Teleport to="body">
    <div v-if="target" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="emit('close')" />
      <div
        class="relative w-full max-w-[360px] rounded-xl p-5 shadow-xl"
        :class="isDark ? 'bg-d2 border border-bdr shadow-black/50' : 'bg-l2 border border-bdrF'">
        <div class="flex items-start gap-3">
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-red-400/8' : 'bg-red-50'">
            <i class="ri-delete-bin-line text-[17px] text-red-400" />
          </div>
          <div class="min-w-0">
            <h3 class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">确认删除</h3>
            <p class="mt-1 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              {{ target.type === 'space' ? '知识库下的文档也会被删除。' : '该文档将被永久移除。' }}
            </p>
          </div>
        </div>

        <p class="mt-4 text-[12.5px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          删除「{{ target.name }}」？此操作不可撤销。
        </p>

        <div class="mt-5 flex items-center justify-end gap-2">
          <button
            class="h-8 px-3 rounded-lg text-[12px] font-medium"
            :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
            @click="emit('close')">
            取消
          </button>
          <button
            class="h-8 px-3 rounded-lg text-[12px] font-medium bg-red-500 text-white hover:bg-red-600 flex items-center gap-1.5 disabled:opacity-60"
            :disabled="busy"
            @click="emit('confirm', target)">
            <i :class="busy ? 'ri-loader-4-line animate-spin' : 'ri-delete-bin-line'" class="text-[13px]" />
            删除
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
