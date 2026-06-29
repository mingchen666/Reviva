<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  wiki: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  externalError: { type: String, default: '' },
})

const emit = defineEmits(['close', 'confirm'])
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-[75] flex items-center justify-center bg-black/40" @click.self="!busy && emit('close')">
      <div class="w-[420px] rounded-xl border shadow-2xl p-4" :class="isDark ? 'bg-d2 border-bdr text-wt-main' : 'bg-white border-bdrF text-lt-main'">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-red-400/10 text-red-300' : 'bg-red-50 text-red-600'">
              <i class="ri-delete-bin-6-line text-[17px]" />
            </div>
            <div class="min-w-0">
              <h2 class="text-[14px] font-semibold">删除 Wiki</h2>
              <p class="mt-1 text-[12px] leading-5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                将删除 <span class="font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ props.wiki?.name || props.wiki?.id || '当前 Wiki' }}</span> 的页面、来源、OCR 缓存、history 和任务缓存。
              </p>
            </div>
          </div>
          <button class="h-7 w-7 rounded-md shrink-0" :class="isDark ? 'hover:bg-white/5' : 'hover:bg-l4'" :disabled="busy" @click="emit('close')">
            <i class="ri-close-line" />
          </button>
        </div>

        <p class="mt-3 rounded-lg px-3 py-2 text-[12px]" :class="isDark ? 'bg-red-400/10 text-red-300' : 'bg-red-50 text-red-600'">
          此操作不可撤销。
        </p>
        <p v-if="externalError" class="mt-3 text-[12px] text-red-500">{{ externalError }}</p>

        <div class="mt-5 flex items-center justify-end gap-2">
          <button
            class="px-3 h-8 rounded-lg text-[12px]"
            :class="isDark ? 'text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:bg-l4'"
            :disabled="busy"
            @click="emit('close')">
            取消
          </button>
          <button
            class="px-4 h-8 rounded-lg text-[12px] font-medium disabled:opacity-60"
            :class="isDark ? 'bg-red-400 text-d0 hover:bg-red-300' : 'bg-red-600 text-white hover:bg-red-700'"
            :disabled="busy || !props.wiki"
            @click="emit('confirm')">
            {{ busy ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
