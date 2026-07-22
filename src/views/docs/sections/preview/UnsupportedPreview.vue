<script setup>
defineProps({ file: { type: Object, required: true }, isDark: Boolean, icon: { type: String, default: '' }, iconColor: { type: String, default: '' }, iconBg: { type: String, default: '' }, typeLabel: { type: String, default: '' } })
const emit = defineEmits(['open-externally'])
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 gap-3">
    <div class="w-16 h-16 rounded-2xl flex items-center justify-center" :class="iconBg"><i :class="[icon, iconColor]" class="text-[32px]" /></div>
    <p class="text-[16px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">此文件类型暂不支持预览</p>
    <p class="text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ typeLabel }}文件：{{ file.name }}</p>
    <button class="mt-2 h-8 px-4 rounded-lg text-[14px] font-medium transition-colors" :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'" @click="emit('open-externally')"><i class="ri-external-link-line text-[14px] mr-1" />用系统应用打开</button>
  </div>
</template>
