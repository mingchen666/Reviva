<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useWechatBotStore } from '@/stores/wechatBot'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
const appStore = useAppStore()
const botStore = useWechatBotStore()
const msg = useMessage()
const mbox = useMessageBox()
const isDark = computed(() => appStore.isDark)
const reminders = computed(() => botStore.reminders)
const showAdd = ref(false)
// 一次性提醒需要 date 字段；type 支持 daily / weekly / onetime
const form = reactive({ name: '', type: 'daily', time: '20:00', weekdays: [1], date: '', content: '' })
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const typeOpen = ref(false)
const typeOptions = [
  { value: 'daily', label: '每日提醒' },
  { value: 'weekly', label: '每周提醒' },
  { value: 'onetime', label: '一次性提醒' },
]
const typeLabel = computed(() => {
  const opt = typeOptions.find(o => o.value === form.type)
  return opt ? opt.label : '选择类型'
})
const todayStr = computed(() => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
})
const hourOpen = ref(false)
const minuteOpen = ref(false)
const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = Array.from({ length: 60 }, (_, i) => i)
const hourVal = computed(() => form.time ? form.time.split(':')[0] : '00')
const minuteVal = computed(() => form.time ? form.time.split(':')[1] : '00')
const hourText = ref(hourVal.value)
const minuteText = ref(minuteVal.value)
function syncTimeDisplay() { hourText.value = hourVal.value; minuteText.value = minuteVal.value }
function onHourBlur() {
  const n = Math.min(23, Math.max(0, Number(hourText.value) || 0))
  hourText.value = String(n).padStart(2, '0')
  form.time = hourText.value + ':' + minuteVal.value
  hourOpen.value = false
}
function onMinuteBlur() {
  const n = Math.min(59, Math.max(0, Number(minuteText.value) || 0))
  minuteText.value = String(n).padStart(2, '0')
  form.time = hourVal.value + ':' + minuteText.value
  minuteOpen.value = false
}
function normalizeTime() {
  const h = Math.min(23, Math.max(0, Number(hourText.value) || 0))
  const m = Math.min(59, Math.max(0, Number(minuteText.value) || 0))
  form.time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  hourText.value = String(h).padStart(2, '0')
  minuteText.value = String(m).padStart(2, '0')
}
function pickHour(v) { form.time = String(v).padStart(2, '0') + ':' + minuteVal.value; hourText.value = String(v).padStart(2, '0'); hourOpen.value = false }
function pickMinute(v) { form.time = hourVal.value + ':' + String(v).padStart(2, '0'); minuteText.value = String(v).padStart(2, '0'); minuteOpen.value = false }
const yearOpen = ref(false)
const monthOpen = ref(false)
const dayOpen = ref(false)
const _now = new Date()
const currentYear = _now.getFullYear()
const currentMonth = _now.getMonth() + 1
const currentDay = _now.getDate()
const years = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4, currentYear + 5]
const allMonths = Array.from({ length: 12 }, (_, i) => i + 1)
const yearVal = computed(() => form.date ? form.date.split('-')[0] : String(currentYear))
const monthVal = computed(() => form.date ? form.date.split('-')[1] : String(currentMonth).padStart(2, '0'))
const dayVal = computed(() => form.date ? form.date.split('-')[2] : String(currentDay).padStart(2, '0'))
const daysInMonth = computed(() => new Date(Number(yearVal.value), Number(monthVal.value), 0).getDate())
const days = computed(() => Array.from({ length: daysInMonth.value }, (_, i) => i + 1))
function pickYear(v) { const m = monthVal.value; const d = dayVal.value; const maxDay = new Date(v, Number(m), 0).getDate(); const adjD = String(Math.min(Number(d), maxDay)).padStart(2, '0'); const nd = v + '-' + m + '-' + adjD; form.date = nd < todayStr.value ? todayStr.value : nd; yearOpen.value = false }
function pickMonth(v) { const y = yearVal.value; const d = dayVal.value; const maxDay = new Date(Number(y), v, 0).getDate(); const adjD = String(Math.min(Number(d), maxDay)).padStart(2, '0'); const nd = y + '-' + String(v).padStart(2, '0') + '-' + adjD; form.date = nd < todayStr.value ? todayStr.value : nd; monthOpen.value = false }
function pickDay(v) { form.date = yearVal.value + '-' + monthVal.value + '-' + String(v).padStart(2, '0'); dayOpen.value = false }

function openAdd() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  form.name = ''; form.type = 'daily'; form.time = hh + ':' + mm; form.weekdays = [1]; form.date = todayStr.value; form.content = ''
  typeOpen.value = false; hourOpen.value = false; minuteOpen.value = false; yearOpen.value = false; monthOpen.value = false; dayOpen.value = false
  syncTimeDisplay()
  showAdd.value = true
}
function pickType(v) { form.type = v; if (v === 'onetime' && !form.date) { form.date = todayStr.value }; typeOpen.value = false }
function toggleWeekday(i) {
  const idx = form.weekdays.indexOf(i)
  if (idx >= 0) form.weekdays.splice(idx, 1)
  else form.weekdays.push(i)
  form.weekdays.sort((a, b) => a - b)
}
async function saveReminder() {
  normalizeTime()
  if (!form.name.trim()) { form.name = '提醒' }
  if (!form.content.trim()) { msg.error('请输入提醒内容'); return }
  if (form.type === 'weekly' && form.weekdays.length === 0) { msg.error('请至少选择一个星期'); return }
  if (form.type === 'onetime') {
    if (!form.date) { msg.error('请选择提醒日期'); return }
    const target = new Date(form.date + 'T' + form.time + ':00')
    if (isNaN(target.getTime()) || target.getTime() <= Date.now()) { msg.error('提醒时间不能早于当前时间'); return }
  }
  await botStore.addReminder({ name: form.name.trim(), type: form.type, time: form.time, weekday: form.type === 'weekly' ? form.weekdays : null, date: form.type === 'onetime' ? form.date : null, content: form.content.trim(), enabled: true })
  showAdd.value = false
  msg.success('提醒已添加')
}
async function removeReminder(id) {
  const confirmed = await mbox.confirm({
    title: '删除提醒',
    subtitle: '将删除此提醒',
    message: '删除后无法恢复，可重新添加。',
    variant: 'warning', confirmText: '删除', cancelText: '取消',
  })
  if (!confirmed) return
  await botStore.deleteReminder(id)
  msg.success('提醒已删除')
}
async function toggleReminder(r) {
  const next = !r.enabled
  await botStore.setReminderEnabled(r.id, next)
  msg.success(next ? '提醒已继续' : '提醒已暂停')
}
function scheduleText(r) {
  const t = r.time || ''
  if (r.type === 'weekly') {
    const days = (Array.isArray(r.weekdays) && r.weekdays.length ? r.weekdays : (r.weekday != null ? [r.weekday] : []))
      .slice().sort((a, b) => a - b).map(d => WEEKDAYS[d] || '').filter(Boolean)
    return (days.length ? days.join('、') : '未选') + ' ' + t
  }
  if (r.type === 'onetime') return (r.date || '未设日期') + ' ' + t
  return '每天 ' + t
}
function typeIcon(t) { return t === 'weekly' ? 'ri-calendar-line' : t === 'onetime' ? 'ri-calendar-event-line' : 'ri-repeat-line' }
function typeText(t) { return t === 'weekly' ? '每周' : t === 'onetime' ? '单次' : '每日' }
function typeIconBox(t, enabled) {
  if (!enabled) return isDark.value ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'
  if (t === 'weekly') return isDark.value ? 'bg-blue-400/10 text-blue-400' : 'bg-blue-50 text-blue-500'
  if (t === 'onetime') return isDark.value ? 'bg-rose-400/10 text-rose-400' : 'bg-rose-50 text-rose-500'
  return isDark.value ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
}
function typeBadgeClass(t) {
  if (t === 'weekly') return isDark.value ? 'bg-blue-400/12 text-blue-400' : 'bg-blue-50 text-blue-500'
  if (t === 'onetime') return isDark.value ? 'bg-rose-400/12 text-rose-400' : 'bg-rose-50 text-rose-500'
  return isDark.value ? 'bg-emerald-400/12 text-emerald-400' : 'bg-emerald-50 text-emerald-500'
}
function onEsc(e) { if (e.key === 'Escape') { showAdd.value = false; showLogs.value = false; typeOpen.value = false; hourOpen.value = false; minuteOpen.value = false; yearOpen.value = false; monthOpen.value = false; dayOpen.value = false } }
// —— 推送记录（历史）——
const showLogs = ref(false)
const logs = computed(() => botStore.reminderLogs)
const logPage = computed(() => botStore.reminderLogsPage)
const logTotal = computed(() => botStore.reminderLogsTotal)
const logPageSize = computed(() => botStore.reminderLogsPageSize)
const logTotalPages = computed(() => Math.max(1, Math.ceil(logTotal.value / logPageSize.value)))
const logFilter = ref('all')
const logsLoading = ref(false)
const logFilterOptions = [
  { value: 'all', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'skipped', label: '跳过' },
]
const filteredLogs = computed(() => {
  if (logFilter.value === 'all') return logs.value
  return logs.value.filter(l => l.status === logFilter.value)
})
const logCounts = computed(() => {
  const c = { all: logs.value.length, success: 0, failed: 0, skipped: 0 }
  for (const l of logs.value) { if (c[l.status] != null) c[l.status]++ }
  return c
})
async function openLogs() {
  showLogs.value = true
  logsLoading.value = true
  await botStore.loadReminderLogs(1).finally(() => { logsLoading.value = false })
}
async function refreshLogs() { logsLoading.value = true; await botStore.loadReminderLogs(logPage.value || 1).finally(() => { logsLoading.value = false }) }
async function clearLogs() {
  const confirmed = await mbox.confirm({
    title: '清空推送记录', subtitle: '将删除所有历史记录',
    message: '删除后无法恢复。', variant: 'warning', confirmText: '清空', cancelText: '取消',
  })
  if (!confirmed) return
  await botStore.clearReminderLogs()
  msg.success('已清空推送记录')
}
function logPrevPage() { if (logPage.value > 1) botStore.loadReminderLogs(logPage.value - 1) }
function logNextPage() { if (logPage.value < logTotalPages.value) botStore.loadReminderLogs(logPage.value + 1) }
function logStatusText(s) { return ({ success: '已推送', failed: '失败', skipped: '跳过', pending: '待发' })[s] || s }
function logStatusIcon(s) { return ({ success: 'ri-checkbox-circle-line', failed: 'ri-error-warning-line', skipped: 'ri-arrow-right-double-line' })[s] || 'ri-question-line' }
function logStatusIconColor(s) {
  if (s === 'success') return isDark.value ? 'text-emerald-400' : 'text-emerald-500'
  if (s === 'failed') return isDark.value ? 'text-red-400' : 'text-red-500'
  if (s === 'skipped') return isDark.value ? 'text-amber-400' : 'text-amber-500'
  return isDark.value ? 'text-wt-dim' : 'text-lt-aux'
}
function logStatusClass(s) {
  if (s === 'success') return isDark.value ? 'bg-emerald-400/15 text-emerald-400' : 'bg-emerald-50 text-emerald-500'
  if (s === 'failed') return isDark.value ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-500'
  if (s === 'skipped') return isDark.value ? 'bg-amber-400/15 text-amber-400' : 'bg-amber-50 text-amber-500'
  return isDark.value ? 'bg-d4/40 text-wt-dim' : 'bg-l4 text-lt-aux'
}
function formatLogTime(t) {
  if (!t) return ''
  const d = new Date(String(t).replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return String(t)
  return d.toLocaleString('zh-CN', { hour12: false })
}
function relativeTime(t) {
  if (!t) return ''
  const d = new Date(String(t).replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return String(t)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'
  return d.toLocaleDateString('zh-CN').replace(/\//g, '-')
}
function logBorderColor(s) {
  if (s === 'success') return isDark.value ? 'border-emerald-400' : 'border-emerald-500'
  if (s === 'failed') return isDark.value ? 'border-red-400' : 'border-red-500'
  if (s === 'skipped') return isDark.value ? 'border-amber-400' : 'border-amber-500'
  return isDark.value ? 'border-d4' : 'border-bdrF'
}
function shortUserId(id) {
  if (!id) return ''
  return id.length > 20 ? id.slice(0, 18) + '…' : id
}
onMounted(() => document.addEventListener('keydown', onEsc))
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))
</script>
<template>
  <div class="max-w-5xl mx-auto px-6 py-5 space-y-4">
    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <i class="ri-alarm-line text-[16px] text-amber-400" />
          <span class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">提醒列表</span><span v-if="reminders.length" class="text-[11.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ reminders.length }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button class="h-8 px-3 rounded-md text-[13px] font-semibold flex items-center gap-1.5 transition-colors" :class="isDark ? 'bg-d2 border border-d4 text-wt-sub hover:border-d3' : 'bg-l2 border border-bdrF text-lt-sub'" @click="openLogs"><i class="ri-history-line text-[15px]" />推送记录<span v-if="logTotal" class="px-1.5 py-0.5 rounded text-[9.5px] font-medium" :class="isDark ? 'bg-d4/50 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ logTotal }}</span></button>
        <button class="h-8 px-3 rounded-md text-[13px] font-semibold text-white bg-brand-500 hover:bg-brand-600 flex items-center gap-1.5" @click="openAdd"><i class="ri-add-line text-16px" />添加提醒</button>
      </div>
    </div>
    <div class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="px-5 py-3 space-y-0.5">
        <template v-if="reminders.length">
            <div v-for="(r, idx) in reminders" :key="r.id" class="flex items-center gap-3 px-3 py-2.5" :class="[(isDark ? 'border-d4 hover:bg-d3/40' : 'border-bdrF hover:bg-l3/40'), idx === 0 ? '' : 'border-t', r.enabled ? '' : 'opacity-50']">
                <div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0" :class="typeIconBox(r.type, r.enabled)"><i class="text-[15px]" :class="typeIcon(r.type)" /></div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ r.name }}</span>
                  <span v-if="!r.enabled" class="text-[10px] font-medium shrink-0" :class="isDark ? 'text-amber-400' : 'text-amber-600'">已暂停</span>
                </div>
                <div class="text-[11px] mt-0.5 flex items-center gap-1.5 min-w-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                    <span class="px-1.5 py-px rounded text-[9px] font-medium shrink-0" :class="typeBadgeClass(r.type)">{{ typeText(r.type) }}</span>
                  <span class="tabular-nums shrink-0">{{ scheduleText(r) }}</span>
                  <span v-if="r.content" class="truncate">· {{ r.content }}</span>
                </div>
              </div>
              <div class="flex items-center gap-0.5 shrink-0">
                <button class="w-7 h-7 rounded-md flex items-center justify-center transition-colors" :class="r.enabled ? (isDark ? 'hover:bg-white/5 text-wt-aux' : 'hover:bg-black/5 text-lt-aux') : (isDark ? 'hover:bg-emerald-400/10 text-emerald-400' : 'hover:bg-emerald-50 text-emerald-500')" :title="r.enabled ? '暂停' : '继续'" @click="toggleReminder(r)"><i class="text-[14px]" :class="r.enabled ? 'ri-pause-line' : 'ri-play-line'" /></button>
                <button class="w-7 h-7 rounded-md flex items-center justify-center transition-colors" :class="isDark ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-red-50 text-red-500'" title="删除" @click="removeReminder(r.id)"><i class="ri-delete-bin-line text-[14px]" /></button>
              </div>
            </div>
        </template>
        <div v-else class="text-center py-10">
          <i class="ri-alarm-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <div class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">还没有提醒</div>
          <div class="text-[10.5px] mt-1" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/70'">点击右上角「添加提醒」创建</div>
        </div>
      </div>
    </div>
      <div class="flex items-start gap-2 px-1">
        <i class="ri-information-line text-[12px] mt-px shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <div class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">主动推送需先发过消息建立连接（context_token）。发 <code class="px-1 py-px rounded text-[10px] font-mono" :class="isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500'">/status</code> 可查看推送状态。</div>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="showAdd" class="fixed inset-0 z-50 flex items-center justify-center" style="background:rgba(26,26,46,.25);backdrop-filter:blur(2px)" @click.self="showAdd = false">
        <div class="w-[440px] max-w-[90vw] rounded-2xl overflow-hidden" :class="isDark ? 'bg-d2' : 'bg-l2'">
          <div class="px-5 pt-4 flex items-center justify-between">
            <h3 class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">添加提醒</h3>
            <button class="w-7 h-7 rounded-md flex items-center justify-center transition-colors" :class="isDark ? 'hover:bg-white/5 text-wt-dim' : 'hover:bg-black/5 text-lt-aux'" @click="showAdd = false"><i class="ri-close-line text-[24px]" /></button>
          </div>
          <div class="px-5 py-3 space-y-3.5">
            <div><label class="block text-[11px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">名称</label><input v-model="form.name" type="text" placeholder="如：复习数据结构" class="w-full h-8 px-3 rounded-md text-[14px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/50' : 'bg-l3 border border-bdrF text-lt-sub focus:border-brand-400/50'" /></div>
            <div class="flex gap-3">
              <div class="flex-1 relative">
  <label class="block text-[11px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">类型</label>
  <button type="button" class="w-full h-8 px-3 rounded-md text-[14px] flex items-center justify-between transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-d3' : 'bg-l3 border border-bdrF text-lt-sub'" @click="typeOpen = !typeOpen">
    <span>{{ typeLabel }}</span>
    <i class="ri-arrow-down-s-line text-[15px] transition-transform" :class="typeOpen ? 'rotate-180' : ''" />
  </button>
  <div v-if="typeOpen" class="fixed inset-0 z-40" @click="typeOpen = false" />
  <div v-if="typeOpen" class="absolute left-0 right-0 top-full mt-1 z-50 rounded-md overflow-hidden py-1" :class="isDark ? 'bg-d2 border border-d4 shadow-xl shadow-black/40' : 'bg-l2 border border-bdrF shadow-xl'">
    <button v-for="opt in typeOptions" :key="opt.value" type="button" class="w-full px-3 py-2 text-left text-[13px] flex items-center justify-between transition-colors" :class="form.type === opt.value ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')" @click="pickType(opt.value)">
      <span>{{ opt.label }}</span>
      <i v-if="form.type === opt.value" class="ri-check-line text-[14px]" />
    </button>
  </div>
</div>
              <div class="flex-1"><label class="block text-[11px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">时间</label><div class="flex items-center gap-1">
<div class="relative">
<input type="text" inputmode="numeric" v-model="hourText" @blur="onHourBlur" class="w-[52px] h-8 pl-2 pr-5 rounded-md text-[14px] text-center outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/50' : 'bg-l3 border border-bdrF text-lt-sub focus:border-brand-400/50'" />
<button type="button" tabindex="-1" @mousedown.prevent @click="hourOpen = !hourOpen" class="absolute right-0.5 top-1/2 -translate-y-1/2 w-4 h-6 flex items-center justify-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
<i class="ri-arrow-down-s-line text-[14px] transition-transform" :class="hourOpen ? 'rotate-180' : ''" />
</button>
<div v-if="hourOpen" class="fixed inset-0 z-40" @click="hourOpen = false" />
<div v-if="hourOpen" class="absolute left-0 top-full mt-1 z-50 rounded-md overflow-hidden py-1 max-h-[200px] overflow-y-auto w-[52px]" :class="isDark ? 'bg-d2 border border-d4 shadow-xl shadow-black/40' : 'bg-l2 border border-bdrF shadow-xl'">
<button v-for="h in hours" :key="h" type="button" class="w-full px-2 py-1.5 text-center text-[14px] transition-colors" :class="Number(hourVal) === h ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')" @click="pickHour(h)">
<span>{{ String(h).padStart(2, '0') }}</span>
</button>
</div>
</div>
<span class="text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">:</span>
<div class="relative">
<input type="text" inputmode="numeric" v-model="minuteText" @blur="onMinuteBlur" class="w-[52px] h-8 pl-2 pr-5 rounded-md text-[14px] text-center outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/50' : 'bg-l3 border border-bdrF text-lt-sub focus:border-brand-400/50'" />
<button type="button" tabindex="-1" @mousedown.prevent @click="minuteOpen = !minuteOpen" class="absolute right-0.5 top-1/2 -translate-y-1/2 w-4 h-6 flex items-center justify-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
<i class="ri-arrow-down-s-line text-[14px] transition-transform" :class="minuteOpen ? 'rotate-180' : ''" />
</button>
<div v-if="minuteOpen" class="fixed inset-0 z-40" @click="minuteOpen = false" />
<div v-if="minuteOpen" class="absolute left-0 top-full mt-1 z-50 rounded-md overflow-hidden py-1 max-h-[200px] overflow-y-auto w-[52px]" :class="isDark ? 'bg-d2 border border-d4 shadow-xl shadow-black/40' : 'bg-l2 border border-bdrF shadow-xl'">
<button v-for="m in minutes" :key="m" type="button" class="w-full px-2 py-1.5 text-center text-[12px] transition-colors" :class="Number(minuteVal) === m ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')" @click="pickMinute(m)">
<span>{{ String(m).padStart(2, '0') }}</span>
</button>
</div>
</div>
</div></div>
            </div>
            <div v-if="form.type === 'weekly'">
              <label class="block text-[11px] font-semibold mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">星期（可多选）</label>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="(w, i) in WEEKDAYS" :key="i" type="button" class="h-8 px-3 rounded-md text-[12px] transition-colors" :class="form.weekdays.includes(i) ? (isDark ? 'bg-brand-400/15 text-brand-400 border border-brand-400/30 font-bold' : 'bg-brand-50 text-brand-500 border border-brand-200 font-bold') : (isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-d3 font-medium' : 'bg-l3 border border-bdrF text-lt-sub hover:bg-l4 font-medium')" @click="toggleWeekday(i)">{{ w }}</button>
              </div>
            </div>
            <div v-if="form.type === 'onetime'"><label class="block text-[11px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">日期</label><div class="flex items-center gap-1">
<div class="relative">
<button type="button" class="h-8 px-2.5 rounded-md text-[14px] flex items-center gap-1 min-w-[60px] justify-center transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-d3' : 'bg-l3 border border-bdrF text-lt-sub'" @click="yearOpen = !yearOpen">
<span>{{ yearVal }}</span>
<i class="ri-arrow-down-s-line text-[13px] transition-transform" :class="yearOpen ? 'rotate-180' : ''" />
</button>
<div v-if="yearOpen" class="fixed inset-0 z-40" @click="yearOpen = false" />
<div v-if="yearOpen" class="absolute left-0 top-full mt-1 z-50 rounded-md overflow-hidden py-1 max-h-[200px] overflow-y-auto w-[64px]" :class="isDark ? 'bg-d2 border border-d4 shadow-xl shadow-black/40' : 'bg-l2 border border-bdrF shadow-xl'">
<button v-for="y in years" :key="y" type="button" class="w-full px-2 py-1.5 text-center text-[12px] transition-colors" :class="Number(yearVal) === y ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')" @click="pickYear(y)">
<span>{{ y }}</span>
</button>
</div>
</div>
<span class="text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">年</span>
<div class="relative">
<button type="button" class="h-8 px-2.5 rounded-md text-[13px] flex items-center gap-1 min-w-[48px] justify-center transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-d3' : 'bg-l3 border border-bdrF text-lt-sub'" @click="monthOpen = !monthOpen">
<span>{{ monthVal }}</span>
<i class="ri-arrow-down-s-line text-[13px] transition-transform" :class="monthOpen ? 'rotate-180' : ''" />
</button>
<div v-if="monthOpen" class="fixed inset-0 z-40" @click="monthOpen = false" />
<div v-if="monthOpen" class="absolute left-0 top-full mt-1 z-50 rounded-md overflow-hidden py-1 max-h-[200px] overflow-y-auto w-[52px]" :class="isDark ? 'bg-d2 border border-d4 shadow-xl shadow-black/40' : 'bg-l2 border border-bdrF shadow-xl'">
<button v-for="m in allMonths" :key="m" type="button" class="w-full px-2 py-1.5 text-center text-[14px] transition-colors" :class="Number(monthVal) === m ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')" @click="pickMonth(m)">
<span>{{ String(m).padStart(2, '0') }}</span>
</button>
</div>
</div>
<span class="text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">月</span>
<div class="relative">
<button type="button" class="h-8 px-2.5 rounded-md text-[13px] flex items-center gap-1 min-w-[48px] justify-center transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-d3' : 'bg-l3 border border-bdrF text-lt-sub'" @click="dayOpen = !dayOpen">
<span>{{ dayVal }}</span>
<i class="ri-arrow-down-s-line text-[13px] transition-transform" :class="dayOpen ? 'rotate-180' : ''" />
</button>
<div v-if="dayOpen" class="fixed inset-0 z-40" @click="dayOpen = false" />
<div v-if="dayOpen" class="absolute left-0 top-full mt-1 z-50 rounded-md overflow-hidden py-1 max-h-[200px] overflow-y-auto w-[52px]" :class="isDark ? 'bg-d2 border border-d4 shadow-xl shadow-black/40' : 'bg-l2 border border-bdrF shadow-xl'">
<button v-for="d in days" :key="d" type="button" class="w-full px-2 py-1.5 text-center text-[12px] transition-colors" :class="Number(dayVal) === d ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')" @click="pickDay(d)">
<span>{{ String(d).padStart(2, '0') }}</span>
</button>
</div>
</div>
<span class="text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">日</span>
</div>
              <div class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">提醒时间：{{ form.date }} {{ form.time }}</div></div>
            <div><label class="block text-[11px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">提醒内容</label><textarea v-model="form.content" rows="3" placeholder="如：该复习排序算法了，记得看快排和归并" class="w-full px-3 py-2 rounded-md text-[13px] outline-none transition-colors resize-none" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/50' : 'bg-l3 border border-bdrF text-lt-sub focus:border-brand-400/50'"></textarea></div>
          </div>
          <div class="px-5 py-3 flex justify-end gap-2 border-t" :class="isDark ? 'border-d4 bg-d3' : 'border-bdrF bg-l3'">
            <button class="h-7 px-3 rounded-md text-[13px]" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l3 border border-bdrF text-lt-sub'" @click="showAdd = false">取消</button>
            <button class="h-7 px-3 rounded-md text-[13px] font-semibold text-white bg-brand-500" @click="saveReminder">保存</button>
          </div>
        </div>
      </div>
    </Teleport>
    <!-- 推送记录抽屉（右侧滑入） -->
    <Teleport to="body">
      <Transition name="logDrawer">
        <div v-if="showLogs" class="fixed inset-0 z-50" @click.self="showLogs = false">
          <div class="absolute inset-0 logDrawer-overlay" />
          <div class="absolute right-0 top-0 bottom-0 w-[520px] max-w-[92vw] flex flex-col shadow-2xl logDrawer-panel" :class="isDark ? 'bg-d1 border-l border-d4' : 'bg-l1 border-l border-bdrF'">
            <!-- header -->
            <div class="flex items-center justify-between px-5 py-3.5 border-b shrink-0" :class="isDark ? 'border-d4' : 'border-bdrF'">
              <div class="flex items-center gap-2.5">
                <i class="ri-history-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
                <span class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">推送记录</span>
                <span v-if="logTotal" class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ logTotal }} 条</span>
              </div>
              <div class="flex items-center gap-0.5">
                <button class="w-7 h-7 rounded-md flex items-center justify-center transition-colors" :class="isDark ? 'hover:bg-white/5 text-wt-dim' : 'hover:bg-black/5 text-lt-aux'" title="刷新" @click="refreshLogs"><i class="ri-refresh-line text-[18px]" /></button>
                <button v-if="logTotal" class="w-7 h-7 rounded-md flex items-center justify-center transition-colors" :class="isDark ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-red-50 text-red-500'" title="清空" @click="clearLogs"><i class="ri-delete-bin-line text-[18px]" /></button>
                <button class="w-7 h-7 rounded-md flex items-center justify-center transition-colors" :class="isDark ? 'hover:bg-white/5 text-wt-dim' : 'hover:bg-black/5 text-lt-aux'" title="关闭" @click="showLogs = false"><i class="ri-close-line text-[24px]" /></button>
              </div>
            </div>
            <!-- filter chips -->
            <div class="flex items-center gap-1.5 px-5 py-2 border-b shrink-0" :class="isDark ? 'border-d4' : 'border-bdrF'">
              <button v-for="f in logFilterOptions" :key="f.value" class="px-2.5 py-1 rounded-md text-[14px] font-medium transition" :class="logFilter === f.value ? (isDark ? 'bg-white/12 text-wt-main' : 'bg-l4 text-lt-main') : (isDark ? 'text-wt-aux hover:bg-white/4' : 'text-lt-aux hover:bg-l4')" @click="logFilter = f.value">{{ f.label }}<span class="ml-1 text-[12px] opacity-60">{{ logCounts[f.value] || 0 }}</span></button>
            </div>
            <!-- body -->
            <div class="flex-1 overflow-y-auto">
              <div v-if="logsLoading" class="py-20 flex flex-col items-center gap-2">
                <i class="ri-loader-4-line text-[22px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">加载中...</span>
              </div>
              <div v-else-if="filteredLogs.length" class="rounded-xl mx-4 my-3 overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
                <div v-for="(log, idx) in filteredLogs" :key="log.id" class="px-4 py-2.5" :class="[(isDark ? 'border-d4 hover:bg-d3/30' : 'border-bdrF hover:bg-l3/30'), idx === 0 ? '' : 'border-t']">
                  <div class="flex items-center gap-2.5">
                    <i :class="[logStatusIcon(log.status), 'text-[15px] shrink-0', logStatusIconColor(log.status)]" />
                    <span class="text-[12.5px] font-medium truncate flex-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ log.reminderName || '提醒' }}</span>
                    <span class="px-1.5 py-0.5 rounded text-[9.5px] font-medium shrink-0" :class="logStatusClass(log.status)">{{ logStatusText(log.status) }}</span>
                    <span class="text-[10px] shrink-0 tabular-nums" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ relativeTime(log.firedAt) }}</span>
                  </div>
                  <div v-if="log.content" class="text-[11.5px] mt-1 ml-[23px] break-words leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ log.content }}</div>
                  <div v-if="log.error" class="mt-1 ml-[23px] text-[11px] flex items-start gap-1 leading-relaxed" :class="isDark ? 'text-red-400/80' : 'text-red-500/80'"><i class="ri-error-warning-line text-[12px] mt-px shrink-0" /><span class="break-words">{{ log.error }}</span></div>
                  <div v-if="log.targetUserId" class="text-[9.5px] mt-1 ml-[23px] flex items-center gap-1 opacity-60" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"><i class="ri-user-3-line text-[10px]" />{{ shortUserId(log.targetUserId) }}</div>
                </div>
              </div>
              <div v-else class="py-20 flex flex-col items-center gap-1.5">
                <i class="ri-inbox-2-line text-[30px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ logFilter === 'all' ? '暂无推送记录' : '该筛选下无记录' }}</span>
                <span v-if="logFilter === 'all'" class="text-[10px]" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/70'">到点推送后这里会显示记录</span>
              </div>
            </div>
            <!-- footer -->
            <div v-if="logTotalPages > 1" class="flex items-center justify-center gap-3 px-5 py-2.5 border-t shrink-0" :class="isDark ? 'border-d4' : 'border-bdrF'">
              <button class="h-7 px-2.5 rounded-md text-[11px] flex items-center gap-1 transition-colors" :class="logPage <= 1 ? (isDark ? 'bg-d0/50 border border-d4 text-wt-dim/50' : 'bg-l3/50 border border-bdrF text-lt-aux/50') : (isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-d3' : 'bg-l3 border border-bdrF text-lt-sub hover:border-brand-400/50')" :disabled="logPage <= 1" @click="logPrevPage"><i class="ri-arrow-left-s-line text-[14px]" />上一页</button>
              <span class="text-[11px] tabular-nums" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ logPage }} / {{ logTotalPages }}</span>
              <button class="h-7 px-2.5 rounded-md text-[11px] flex items-center gap-1 transition-colors" :class="logPage >= logTotalPages ? (isDark ? 'bg-d0/50 border border-d4 text-wt-dim/50' : 'bg-l3/50 border border-bdrF text-lt-aux/50') : (isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-d3' : 'bg-l3 border border-bdrF text-lt-sub hover:border-brand-400/50')" :disabled="logPage >= logTotalPages" @click="logNextPage">下一页<i class="ri-arrow-right-s-line text-[14px]" /></button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
</template>

<style>
.logDrawer-enter-active,
.logDrawer-leave-active { transition: opacity .2s ease; }
.logDrawer-enter-active .logDrawer-panel,
.logDrawer-leave-active .logDrawer-panel { transition: transform .28s cubic-bezier(.4,0,.2,1); }
.logDrawer-enter-active .logDrawer-overlay,
.logDrawer-leave-active .logDrawer-overlay { transition: opacity .2s ease; }
.logDrawer-enter-from,
.logDrawer-leave-to { opacity: 0; }
.logDrawer-enter-from .logDrawer-panel,
.logDrawer-leave-to .logDrawer-panel { transform: translateX(100%); }
.logDrawer-enter-from .logDrawer-overlay,
.logDrawer-leave-to .logDrawer-overlay { opacity: 0; }
.logDrawer-overlay { background: rgba(26,26,46,.35); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
</style>
