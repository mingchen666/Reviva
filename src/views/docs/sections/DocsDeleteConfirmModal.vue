<script setup>
import MsModal from '@/components/MsModal/MsModal.vue'

defineProps({
  show: Boolean,
  isDark: Boolean,
  item: { type: Object, default: null },
})

const emit = defineEmits(['update:show', 'confirm'])

function confirm(item, close) {
  emit('confirm', item)
  close()
}
</script>

<template>
  <MsModal v-if="item" :show="show" :width="360" :show-footer="true" @update:show="emit('update:show', $event)">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-red-400/8' : 'bg-red-50'">
          <i class="ri-delete-bin-line text-[16px] text-red-400" />
        </div>
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">确认删除</span>
      </div>
    </template>

    <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
      确定要删除「{{ item.name }}」{{ item.isDirectory ? '及其所有内容' : '' }}吗？文件将移入回收站，可随时恢复。
    </p>

    <template #footer="{ close }">
      <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
      <button @click="confirm(item, close)" class="px-4 py-2 rounded-lg text-[11px] font-medium bg-red-500 text-white hover:bg-red-600">移入回收站</button>
    </template>
  </MsModal>
</template>
