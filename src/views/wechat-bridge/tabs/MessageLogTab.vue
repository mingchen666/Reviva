<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useWechatBotStore } from '@/stores/wechatBot'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
const appStore = useAppStore()
const botStore = useWechatBotStore()
const msg = useMessage()
const mbox = useMessageBox()
const isDark = computed(() => appStore.isDark)
const filter = ref('all')
const chips = [{ k: 'all', t: '全部' }, { k: 'inbound', t: '收件' }, { k: 'outbound', t: '发件' }, { k: 'text', t: '文本' }, { k: 'image', t: '图片' }, { k: 'file', t: '文件' }, { k: 'voice', t: '语音' }]
const log = computed(() => {
  const f = filter.value
  const all = botStore.messageLog
  if (f === 'all') return all
  if (f === 'inbound' || f === 'outbound') return all.filter(m => m.direction === f)
  if (f === 'file') return all.filter(m => m.type === 'file' || m.type === 'file-imported')
  return all.filter(m => m.type === f)
})
async function clearLog() {
  const confirmed = await mbox.confirm({
    title: '清除消息记录',
    subtitle: '将清空当前所有消息日志',
    message: '清除后无法恢复。新的微信消息会继续记录。',
    variant: 'warning', confirmText: '清除', cancelText: '取消',
  })
  if (!confirmed) return
  botStore.clearMessageLog()
  msg.success('已清除消息记录')
}
</script>
<template>
  <div class="max-w-5xl mx-auto px-6 py-5 space-y-3">
    <div class="flex gap-1.5 flex-wrap items-center">
      <button v-for="c in chips" :key="c.k" class="px-3 py-1 rounded-md text-[13.5px] font-medium transition" :class="filter === c.k ? (isDark ? 'bg-white/12 text-wt-main' : 'bg-l4 text-lt-main') : (isDark ? 'text-wt-aux hover:bg-white/4' : 'text-lt-aux hover:bg-l4')" @click="filter = c.k">{{ c.t }}</button>
      <button class="ml-auto h-7 px-2.5 rounded-lg text-[13.5px]" :class="isDark ? 'text-red-400 hover:bg-red-400/10' : 'text-red-500 hover:bg-red-50'" @click="clearLog"><i class="ri-delete-bin-line mr-1" />清除</button>
    </div>
    <div class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex items-center gap-2 px-0 pt-4 pb-2.5"><i class="ri-history-line text-[15px] text-brand-400" /><span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">消息日志</span><span class="ml-2 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ log.length }} 条</span></div>
      <div class="px-5 pb-4 space-y-0.5">
        <template v-if="log.length">
          <div v-for="(m, i) in log" :key="i" class="flex items-center gap-3 px-2.5 py-2 text-[12px] border-t" :class="isDark ? 'border-d4 hover:bg-d3/30' : 'border-bdrF hover:bg-l3/30'">
            <i :class="[m.direction === 'inbound' ? 'ri-arrow-right-line' : 'ri-arrow-left-line', 'text-[14px]', m.direction === 'inbound' ? (isDark ? 'text-blue-400' : 'text-blue-500') : (isDark ? 'text-brand-400' : 'text-brand-500')]" />
            <span class="text-[10.5px] w-10 shrink-0 tabular-nums" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ m.time || '' }}</span>
            <span class="flex-1 truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ m.content }}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0" :class="isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ m.type }}</span>
          </div>
        </template>
        <div v-else class="text-center py-8"><i class="ri-history-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" /><div class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ botStore.messageLog.length ? '当前筛选无记录' : '暂无消息记录' }}</div></div>
      </div>
    </div>
  </div>
</template>
