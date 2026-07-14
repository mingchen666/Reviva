<script setup>
import { ref } from 'vue'
import { useInfiniteScroll } from '@vueuse/core'

const props = defineProps({
  show: Boolean,
  isDark: Boolean,
  jobs: { type: Array, default: () => [] },
  loading: Boolean,
  hasMore: Boolean,
  currentPath: { type: String, default: '' },
})

const emit = defineEmits(['update:show', 'retry', 'delete', 'clear', 'open', 'load-more'])
const scrollContainer = ref(null)

useInfiniteScroll(
  scrollContainer,
  () => emit('load-more'),
  {
    distance: 80,
    immediate: false,
    canLoadMore: () => props.hasMore && !props.loading,
  },
)

function statusText(job) {
  return ({ pending: '排队中', running: '处理中', succeeded: '已完成', partial: '部分完成', failed: '失败', interrupted: '已中断' })[job.status] || job.status
}

function statusIcon(job) {
  if (['pending', 'running'].includes(job.status)) return 'ri-loader-4-line animate-spin'
  if (job.status === 'succeeded') return 'ri-checkbox-circle-line'
  if (job.status === 'partial') return 'ri-alert-line'
  return 'ri-error-warning-line'
}

function statusClass(job) {
  if (job.status === 'succeeded') return 'text-emerald-400'
  if (job.status === 'partial') return 'text-amber-400'
  if (['failed', 'interrupted'].includes(job.status)) return 'text-red-400'
  return 'text-brand-400'
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}
</script>

<template>
  <Transition name="web-history-drawer">
    <div v-if="show" class="fixed inset-0 z-50 flex justify-end">
      <div class="absolute inset-0 bg-black/30 backdrop-blur-[2px]" @click="emit('update:show', false)" />
      <aside class="relative w-[380px] max-w-[92vw] h-full flex flex-col border-l shadow-2xl" :class="isDark ? 'bg-d1 border-d4' : 'bg-l1 border-bdrL'">
        <header class="h-14 px-4 flex items-center gap-2.5 shrink-0 border-b" :class="isDark ? 'border-d4' : 'border-bdrL'">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-600'"><i class="ri-history-line text-[16px]" /></div>
          <div class="min-w-0">
            <div class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">导入记录</div>
            <div class="text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ currentPath || '根目录' }} · 已加载 {{ jobs.length }} 条</div>
          </div>
          <div class="flex-1" />
          <button v-if="jobs.length" class="h-7 px-2 rounded-md text-[10.5px] transition-colors" :class="isDark ? 'text-wt-dim hover:text-red-300 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'" @click="emit('clear')">清理已完成</button>
          <button class="w-7 h-7 rounded-md flex items-center justify-center transition-colors" :class="isDark ? 'text-wt-dim hover:text-wt-main hover:bg-white/5' : 'text-lt-aux hover:text-lt-main hover:bg-l4'" title="关闭" @click="emit('update:show', false)"><i class="ri-close-line text-[15px]" /></button>
        </header>

        <div ref="scrollContainer" class="flex-1 overflow-y-auto p-3 space-y-2 thin-scroll">
          <article v-for="job in jobs" :key="job.id" class="rounded-xl border p-3" :class="isDark ? 'bg-d2 border-d4' : 'bg-white border-bdrF'">
            <div class="flex items-start gap-2.5">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-white/4' : 'bg-l3'"><i :class="[statusIcon(job), statusClass(job), 'text-[15px]']" /></div>
              <div class="min-w-0 flex-1">
                <div class="text-[14px] leading-5 font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'" :title="job.title || job.requested_url">{{ job.title || job.requested_url }}</div>
                <div class="text-[12px] leading-[18px] mt-1 truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" :title="job.requested_url">{{ job.requested_url }}</div>
                <div class="flex items-center gap-2 mt-2 text-[12px] leading-[18px] tabular-nums">
                  <span :class="statusClass(job)">{{ statusText(job) }}<template v-if="['pending','running'].includes(job.status)"> · {{ job.progress || 0 }}%</template></span>
                  <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ job.provider }}</span>
                  <span class="ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatTime(job.created_at) }}</span>
                </div>
                <div v-if="job.error_message" class="mt-2 rounded-lg px-2.5 py-2 text-[12.5px] leading-5" :class="isDark ? 'bg-red-400/8 text-red-300' : 'bg-red-50 text-red-600'">{{ job.error_message }}</div>
                <div v-if="['pending','running'].includes(job.status)" class="h-1 mt-2 rounded-full overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'"><div class="h-full rounded-full bg-brand-400 transition-all" :style="{ width: `${job.progress || 0}%` }" /></div>
              </div>
            </div>
            <div v-if="!['pending','running'].includes(job.status)" class="flex flex-nowrap items-center justify-end gap-1.5 mt-2.5 pt-2 border-t" :class="isDark ? 'border-d4' : 'border-bdrL'">
              <button v-if="['succeeded','partial'].includes(job.status)" class="h-8 px-3 shrink-0 inline-flex items-center rounded-md text-[12.5px] text-brand-400 hover:bg-brand-400/8" @click="emit('open', job)">打开文档</button>
              <button v-if="['failed','interrupted','partial'].includes(job.status)" class="h-8 px-3 shrink-0 inline-flex items-center rounded-md text-[12.5px] text-brand-400 hover:bg-brand-400/8" @click="emit('retry', job.id)">重试</button>
              <button class="w-8 h-8 shrink-0 rounded-md flex items-center justify-center" :class="isDark ? 'text-wt-dim hover:text-red-300 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'" title="删除记录" @click="emit('delete', job.id)"><i class="ri-delete-bin-line text-[14px]" /></button>
            </div>
          </article>

          <div v-if="loading" class="h-10 flex items-center justify-center gap-2 text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-loader-4-line animate-spin text-[13px]" />正在加载更多记录
          </div>
          <button v-else-if="hasMore" class="w-full h-10 rounded-lg text-[12px] transition-colors" :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l3'" @click="emit('load-more')">继续加载</button>
          <div v-else-if="jobs.length" class="h-9 flex items-center justify-center text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">已加载全部记录</div>

          <div v-if="!jobs.length && !loading" class="h-full min-h-[280px] flex flex-col items-center justify-center gap-3 text-center">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center" :class="isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux'"><i class="ri-history-line text-[20px]" /></div>
            <div><div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">暂无导入记录</div><div class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">从网页 URL 导入文档后，进度和错误原因会显示在这里。</div></div>
          </div>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.thin-scroll::-webkit-scrollbar { width: 6px; }
.thin-scroll::-webkit-scrollbar-thumb { background: rgba(127,127,127,.22); border-radius: 999px; }
.web-history-drawer-enter-active { transition: opacity .18s ease; }
.web-history-drawer-leave-active { transition: opacity .14s ease; }
.web-history-drawer-enter-from, .web-history-drawer-leave-to { opacity: 0; }
.web-history-drawer-enter-active aside, .web-history-drawer-leave-active aside { transition: transform .2s cubic-bezier(.16,1,.3,1); }
.web-history-drawer-enter-from aside, .web-history-drawer-leave-to aside { transform: translateX(100%); }
</style>
