<script setup>
import MsModal from '@/components/MsModal/MsModal.vue'
defineProps({
  show: Boolean,
  isDark: Boolean,
  item: { type: Object, default: null },
  value: { type: String, default: '' },
  extension: { type: String, default: '' },
  error: { type: String, default: '' },
  feedback: { type: String, default: '' },
  canSubmit: Boolean,
  fileIcon: { type: Function, required: true },
  fileIconColor: { type: Function, required: true },
})
const emit = defineEmits(['update:show', 'update:value', 'clear-error', 'submit'])
</script>

<template>
  <MsModal v-if="show" :show="show" :width="380" :show-footer="true" @update:show="emit('update:show', $event)">
    <template #header><div class="flex items-center gap-2.5"><div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'"><i class="ri-edit-line text-[16px] text-brand-400" /></div><span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">重命名</span></div></template>
    <div class="space-y-3"><div class="flex items-center gap-2.5 px-3 py-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l3'"><i :class="[fileIcon(item?.name, item?.isDirectory), fileIconColor(item?.name, item?.isDirectory,isDark)]" class="text-[14px]" /><span class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item?.name }}</span></div><div><label class="block text-[10px] font-bold uppercase tracking-wider mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ extension ? '文件名' : '新名称' }}</label><div class="flex items-stretch"><input :value="value" type="text" placeholder="输入新名称" class="h-9 min-w-0 flex-1 px-3 text-[12px] outline-none transition-colors" :class="[extension ? 'rounded-l-lg rounded-r-none' : 'w-full rounded-lg', isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400']" @input="emit('update:value', $event.target.value); emit('clear-error')" @keyup.enter="emit('submit')" /><span v-if="extension" class="h-9 shrink-0 inline-flex items-center rounded-r-lg border border-l-0 px-3 text-[12px] font-medium" :class="isDark ? 'bg-d2 border-d4 text-wt-aux' : 'bg-l2 border-bdrF text-lt-aux'">{{ extension }}</span></div><p v-if="extension" class="mt-1 text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">仅修改文件名，扩展名保持不变</p><p v-if="feedback" class="mt-1 text-[10.5px]" :class="error ? 'text-red-400' : (isDark ? 'text-wt-dim' : 'text-lt-aux')">{{ feedback }}</p></div></div>
    <template #footer="{ close }"><button @click="close()" class="px-4 py-2 rounded-lg text-[12px] font-medium transition-colors" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button><button :disabled="!canSubmit" @click="emit('submit'); close()" class="px-4 py-2 rounded-lg text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50" :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">确认重命名</button></template>
  </MsModal>
</template>

