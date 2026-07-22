<script setup>
defineProps({ content: { type: String, default: '' }, isDark: Boolean, icon: { type: String, default: '' }, iconColor: { type: String, default: '' }, typeLabel: { type: String, default: '' } })
</script>

<template>
  <div class="p-6">
    <div class="max-w-4xl mx-auto rounded-xl overflow-hidden border" :class="isDark ? 'bg-d3 border-bdr' : 'bg-l3 border-bdrF'">
      <div class="px-4 py-2 flex items-center gap-2 border-b" :class="isDark ? 'border-bdr bg-d4/30' : 'border-bdrF bg-l4/30'">
        <i :class="[icon, iconColor]" class="text-[13px]" />
        <span class="text-[11px] font-mono uppercase tracking-wider" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ typeLabel }}</span>
      </div>
      <pre class="p-4 text-[12px] font-mono whitespace-pre-wrap break-all leading-relaxed overflow-x-auto" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ content }}</pre>
    </div>
  </div>
</template>
