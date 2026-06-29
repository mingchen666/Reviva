<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  hasMore: Boolean,
  loading: Boolean,
  isDark: Boolean,
})

const emit = defineEmits(['load-more'])

const sentinel = ref(null)
let observer = null

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting && props.hasMore && !props.loading) {
      emit('load-more')
    }
  }, { threshold: 0.1 })

  if (sentinel.value) {
    observer.observe(sentinel.value)
  }
})

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})

// Re-observe when sentinel ref changes
watch(sentinel, (el) => {
  if (observer && el) {
    observer.disconnect()
    observer.observe(el)
  }
})
</script>

<template>
  <!-- Sentinel element at top of scroll container -->
  <div ref="sentinel" class="h-[1px] w-full" />
  <!-- Status indicators -->
  <div class="flex items-center justify-center py-2">
    <div v-if="loading" class="flex items-center gap-2 text-[11px]"
      :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      <i class="ri-loader-4-line text-[12px]" style="animation:spin 1s linear infinite" />
      加载中...
    </div>
    <div v-if="!hasMore && !loading" class="text-[10px]"
      :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      没有更多消息
    </div>
  </div>
</template>

<style scoped>
@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
</style>