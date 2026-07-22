<script setup>
defineProps({
  menu: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
  isPdfParsed: { type: Function, required: true },
  isPdfParsing: { type: Function, required: true },
  pdfIcon: { type: Function, required: true },
  pdfLabel: { type: Function, required: true },
  isPdfItem: { type: Function, required: true },
  isMediaItem: { type: Function, required: true },
  isMediaParsing: { type: Function, required: true },
  mediaIcon: { type: Function, required: true },
  mediaLabel: { type: Function, required: true },
})

const emit = defineEmits(['close', 'open', 'create-subfolder', 'preview', 'parse-pdf', 'parse-media', 'media-details', 'chat', 'move', 'rename', 'show-in-folder', 'delete'])

function selectAction(action, item) {
  emit(action, item)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="menu" class="fixed inset-0 z-[100]" @click="emit('close')" @contextmenu.prevent="emit('close')">
      <div class="fixed rounded-xl shadow-xl py-1 min-w-[160px] border" :class="isDark ? 'bg-d2 border-bdr shadow-black/40' : 'bg-white border-bdrF shadow-xl'" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
        <button class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors" :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'" @click="selectAction('open', menu.item)"><i class="ri-external-link-line text-[13px]" /><span>{{ menu.item.isDirectory ? '打开文件夹' : '打开文件' }}</span></button>
        <button v-if="menu.item.isDirectory" class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors" :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'" @click="selectAction('create-subfolder', menu.item)"><i class="ri-folder-add-line text-[13px]" /><span>新建子文件夹</span></button>
        <button v-if="!menu.item.isDirectory" class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors" :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'" @click="selectAction('preview', menu.item)"><i class="ri-eye-line text-[13px]" /><span>预览</span></button>
        <button v-if="isPdfItem(menu.item)" :disabled="isPdfParsed(menu.item) || isPdfParsing(menu.item)" class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors disabled:cursor-default" :class="isPdfParsed(menu.item) ? (isDark ? 'text-emerald-300/80' : 'text-emerald-600') : (isDark ? 'text-wt-sub hover:bg-white/4 disabled:text-wt-dim' : 'text-lt-sub hover:bg-l4 disabled:text-lt-aux')" @click="selectAction('parse-pdf', menu.item)"><i :class="[pdfIcon(menu.item), 'text-[13px]']" /><span>{{ pdfLabel(menu.item) }}</span></button>
        <button v-if="isMediaItem(menu.item)" :disabled="isMediaParsing(menu.item)" class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors disabled:cursor-default" :class="isDark ? 'text-wt-sub hover:bg-white/4 disabled:text-wt-dim' : 'text-lt-sub hover:bg-l4 disabled:text-lt-aux'" @click="selectAction('parse-media', menu.item)"><i :class="[mediaIcon(menu.item), 'text-[13px]']" /><span>{{ mediaLabel(menu.item) }}</span></button>
        <button v-if="isMediaItem(menu.item)" class="w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-colors" :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l3'" @click="selectAction('media-details', menu.item)"><i class="ri-file-list-3-line text-[13px]" /><span>查看解析详情</span></button>
        <button class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors" :class="isDark ? 'text-brand-400 hover:bg-brand-400/8' : 'text-brand-500 hover:bg-brand-50'" @click="selectAction('chat', menu.item)"><i class="ri-message-3-line text-[13px]" /><span>开始对话</span></button>
        <div class="my-1 border-t" :class="isDark ? 'border-bdr' : 'border-bdrF'" />
        <button v-for="action in [{e:'move',i:'ri-folder-transfer-line',t:'移动到...'},{e:'rename',i:'ri-edit-line',t:'重命名'}]" :key="action.e" class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors" :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'" @click="selectAction(action.e, menu.item)"><i :class="[action.i, 'text-[13px]']" /><span>{{ action.t }}</span></button>
        <button v-if="!menu.item.isDirectory" class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors" :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'" @click="selectAction('show-in-folder', menu.item)"><i class="ri-folder-open-line text-[13px]" /><span>在资源管理器中显示</span></button>
        <div class="my-1 border-t" :class="isDark ? 'border-bdr' : 'border-bdrF'" />
        <button class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors" :class="isDark ? 'text-red-400 hover:bg-red-400/8' : 'text-red-500 hover:bg-red-50'" @click="selectAction('delete', menu.item)"><i class="ri-delete-bin-line text-[13px]" /><span>删除</span></button>
      </div>
    </div>
  </Teleport>
</template>
