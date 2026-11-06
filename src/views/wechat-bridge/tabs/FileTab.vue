<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useWechatBotStore } from '@/stores/wechatBot'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
const appStore = useAppStore()
const botStore = useWechatBotStore()
const msg = useMessage()
const mbox = useMessageBox()
const isDark = computed(() => appStore.isDark)
const files = computed(() => botStore.files)
const pendingImages = computed(() => botStore.pendingImages)
const fileDir = computed(() => botStore.fileDir)

const IMG_PER = 12
const imgPage = ref(1)
const imgPages = computed(() => Math.max(1, Math.ceil(pendingImages.value.length / IMG_PER)))
const imgSlice = computed(() => pendingImages.value.slice((imgPage.value - 1) * IMG_PER, imgPage.value * IMG_PER))

const FILE_PER = 10
const filePage = ref(1)
const filePages = computed(() => Math.max(1, Math.ceil(files.value.length / FILE_PER)))
const fileSlice = computed(() => files.value.slice((filePage.value - 1) * FILE_PER, filePage.value * FILE_PER))

onMounted(() => { botStore.loadImages(); botStore.loadFiles() })
async function clearAllImages() {
  const confirmed = await mbox.confirm({
    title: '清除全部图片',
    subtitle: '将删除所有暂存的微信图片',
    message: '清除后无法恢复。微信再次发图时会重新暂存。',
    variant: 'warning', confirmText: '清除', cancelText: '取消',
  })
  if (!confirmed) return
  await botStore.clearPendingImages()
  msg.success('已清除全部暂存图片')
}
async function removeImage(name) {
  const confirmed = await mbox.confirm({
    title: '删除图片',
    subtitle: '将删除此图片',
    message: '删除后无法恢复。',
    variant: 'warning', confirmText: '删除', cancelText: '取消',
  })
  if (!confirmed) return
  await botStore.deleteImage(name)
  msg.success('图片已删除')
}
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
function copyPath() {
  if (!fileDir.value) return
  navigator.clipboard?.writeText(fileDir.value).then(() => msg.success('路径已复制')).catch(() => {})
}
</script>
<template>
  <div class="max-w-5xl mx-auto px-6 py-5 space-y-4">
    <div class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3">
        <i class="ri-image-2-line text-[15px] text-amber-400" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">图片临时目录</span>
        <span class="ml-auto text-[11.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ pendingImages.length }} 张</span>
      </div>
      <div v-if="pendingImages.length" class="flex flex-wrap gap-1.5 mb-3">
        <div v-for="img in imgSlice" :key="img.name" class="relative w-10 h-10 rounded-md overflow-hidden border group shrink-0" :class="isDark ? 'border-d4' : 'border-bdrF'">
          <img :src="img.dataUrl" class="w-full h-full object-cover" />
          <button class="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" @click="removeImage(img.name)"><i class="ri-close-line text-[9px]" /></button>
        </div>
      </div>
      <div v-else class="text-[12.5px] py-4 text-center" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">暂无图片。微信发图后暂存于此，作多模态输入给 Agent，手动删除。</div>
      <div v-if="imgPages > 1" class="flex items-center justify-center gap-2 mb-3 text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
        <button class="px-2 h-6 rounded border disabled:opacity-40" :class="isDark ? 'border-d4' : 'border-bdrF'" :disabled="imgPage<=1" @click="imgPage--">上一页</button>
        <span>{{ imgPage }} / {{ imgPages }}</span>
        <button class="px-2 h-6 rounded border disabled:opacity-40" :class="isDark ? 'border-d4' : 'border-bdrF'" :disabled="imgPage>=imgPages" @click="imgPage++">下一页</button>
      </div>
      <div class="flex justify-end">
        <button v-if="pendingImages.length" class="h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-colors" :class="isDark ? 'border-d4 text-wt-aux hover:bg-d3/50' : 'border-bdrF text-lt-aux hover:bg-l3/50'" @click="clearAllImages">清除全部</button>
      </div>
      <div class="text-[11px] mt-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">存于 .reviva/wxbot-img，不自动删除，手动管理。</div>
    </div>
    <div class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3">
        <i class="ri-folder-3-line text-[15px] text-brand-400" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">微信接收文件目录</span>
        <span class="ml-auto text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ files.length }} 个文件</span>
      </div>
      <div class="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg" :class="isDark ? 'bg-d1' : 'bg-l1'">
        <div class="w-6 h-6 rounded-md flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/15' : 'bg-brand-50'">
          <i class="ri-folder-open-line text-[14px] text-brand-400" />
        </div>
        <span class="flex-1 min-w-0 truncate font-mono text-[11.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" :title="fileDir">{{ fileDir || '未知' }}</span>
        <button v-if="fileDir" class="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-opacity opacity-50 hover:opacity-100" :class="isDark ? 'text-wt-aux hover:bg-d3/50' : 'text-lt-aux hover:bg-l3'" title="复制路径" @click="copyPath"><i class="ri-clipboard-line text-[13px]" /></button>
      </div>
      <div v-if="files.length" class="space-y-1">
        <div v-for="f in fileSlice" :key="f.name" class="flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors" :class="isDark ? 'hover:bg-d3/30' : 'hover:bg-l3/50'">
          <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0" :class="isDark ? 'bg-d3/40' : 'bg-l4'">
            <i :class="[f.icon || 'ri-file-3-line', 'text-[14px]', isDark ? 'text-wt-aux' : 'text-lt-aux']" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[12.5px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ f.name }}</div>
            <div class="text-[10.5px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatSize(f.size) }}</div>
          </div>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0" :class="f.mounted ? (isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600') : (isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux')">{{ f.mounted ? '已挂载' : '未挂载' }}</span>
        </div>
      </div>
      <div v-else class="text-center py-6"><i class="ri-folder-download-line text-[26px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" /><div class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">还没有导入的文件</div><div class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">在微信中发送文件或纯链接，会自动导入此目录</div></div>
      <div v-if="filePages > 1" class="flex items-center justify-center gap-2 mt-3 text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
        <button class="px-2 h-6 rounded border disabled:opacity-40" :class="isDark ? 'border-d4' : 'border-bdrF'" :disabled="filePage<=1" @click="filePage--">上一页</button>
        <span>{{ filePage }} / {{ filePages }}</span>
        <button class="px-2 h-6 rounded border disabled:opacity-40" :class="isDark ? 'border-d4' : 'border-bdrF'" :disabled="filePage>=filePages" @click="filePage++">下一页</button>
      </div>
      <div class="text-[11px] mt-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">微信发文件 / 链接自动导入此目录，最近 10 个保持挂载。图片不存此目录。</div>
    </div>
  </div>
</template>
