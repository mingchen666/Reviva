<script setup>
import MsModal from '@/components/MsModal/MsModal.vue'

defineProps({
  show: Boolean,
  isDark: Boolean,
  currentPath: { type: String, default: '' },
  name: { type: String, default: '' },
})

const emit = defineEmits(['update:show', 'update:name', 'submit'])

function submit() {
  emit('submit')
}
</script>

<template>
  <MsModal :show="show" :width="380" :show-footer="true" @update:show="emit('update:show', $event)">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-amber-400/8' : 'bg-amber-50'">
          <i class="ri-folder-add-line text-[16px] text-amber-400" />
        </div>
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">新建文件夹</span>
      </div>
    </template>

    <div class="space-y-3">
      <div class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px]" :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l3 text-lt-aux'">
        <i class="ri-folder-line text-[12px]" />
        <span class="truncate">当前位置：{{ currentPath || '根目录' }}</span>
      </div>
      <div>
        <label class="block text-[10px] font-bold uppercase tracking-wider mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">文件夹名称</label>
        <input :value="name" type="text" placeholder="输入文件夹名称" class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'" @input="emit('update:name', $event.target.value)" @keyup.enter="emit('submit')" />
      </div>
    </div>

    <template #footer="{ close }">
      <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
      <button @click="submit" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors" :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">确认创建</button>
    </template>
  </MsModal>
</template>
