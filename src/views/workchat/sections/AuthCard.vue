<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  authRequest: Object,
  isDark: Boolean,
  // Completed mode: pass the auth decision result
  decision: { type: String, default: '' }, // 'approved' | 'denied' | '' (live mode)
  respondedAt: { type: Number, default: null },
  createdAt: { type: Number, default: null },
})

const emit = defineEmits(['approve', 'deny'])

const showParams = ref(false)
const allowSession = ref(false)
const isCollapsed = ref(true)

const isLiveMode = computed(() => !props.decision)

// Tool-specific display: icon, title, description
const toolDisplay = computed(() => {
  const name = props.authRequest.toolName || ''
  const map = {
    write_file:    { icon: 'ri-file-edit-line',     title: '文件写入授权',  desc: 'Agent 请求写入或创建文件，此操作可能修改您的文件，需要您的授权确认。' },
    edit_file:     { icon: 'ri-file-text-line',     title: '文件编辑授权',  desc: 'Agent 请求编辑文件内容，此操作可能修改现有文件，需要您的授权确认。' },
    exec_command:  { icon: 'ri-terminal-box-line',  title: '命令执行授权',  desc: 'Agent 请求执行系统命令，此操作可能影响系统状态，需要您的授权确认。' },
    delete_file:   { icon: 'ri-delete-bin-line',    title: '文件删除授权',  desc: 'Agent 请求删除文件，此操作不可撤销，需要您的授权确认。' },
  }
  if (map[name]) return map[name]
  return { icon: 'ri-shield-check-line', title: name || '操作授权', desc: 'Agent 请求执行一项敏感操作，需要您的授权确认。' }
})

const riskLabel = computed(() => {
  const level = props.authRequest.riskLevel || 'medium'
  return { low: '低风险', medium: '中风险', high: '高风险' }[level]
})

const riskBadge = computed(() => {
  const level = props.authRequest.riskLevel || 'medium'
  if (level === 'low') return props.isDark ? 'bg-emerald-400/12 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
  if (level === 'high') return props.isDark ? 'bg-red-400/12 text-red-400' : 'bg-red-50 text-red-600'
  return props.isDark ? 'bg-amber-400/12 text-amber-400' : 'bg-amber-50 text-amber-600'
})

const riskBarColor = computed(() => {
  const level = props.authRequest.riskLevel || 'medium'
  if (level === 'low') return 'linear-gradient(90deg, #34D399, #10B981)'
  if (level === 'high') return 'linear-gradient(90deg, #F87171, #EF4444)'
  return 'linear-gradient(90deg, #FBBF24, #F59E0B)'
})

// Decision badge
const decisionBadge = computed(() => {
  if (props.decision === 'approved') return props.isDark ? 'bg-output-400/12 text-output-400' : 'bg-emerald-50 text-emerald-600'
  if (props.decision === 'denied') return props.isDark ? 'bg-red-400/12 text-red-400' : 'bg-red-50 text-red-600'
  return ''
})

const decisionLabel = computed(() => {
  if (props.decision === 'approved') return '已允许'
  if (props.decision === 'denied') return '已拒绝'
  return ''
})

const decisionIcon = computed(() => {
  if (props.decision === 'approved') return 'ri-check-line'
  if (props.decision === 'denied') return 'ri-close-line'
  return ''
})

// Duration from auth request to response
const authDuration = computed(() => {
  const start = props.createdAt || props.authRequest.createdAt
  const end = props.respondedAt
  if (!start || !end) return ''
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 60) return seconds + 's'
  return Math.floor(seconds / 60) + 'm' + (seconds % 60) + 's'
})

function handleApprove() {
  emit('approve', { requestId: props.authRequest.requestId, allowSession: allowSession.value })
}

function handleDeny() {
  emit('deny', { requestId: props.authRequest.requestId })
}

function formatParams(params) {
  if (!params) return ''
  try {
    return JSON.stringify(typeof params === 'string' ? JSON.parse(params) : params, null, 2)
  } catch {
    return String(params)
  }
}
</script>

<template>
  <Transition name="auth-slide" appear>
    <div class="auth-card-container rounded-xl overflow-hidden"
      :class="[
        isDark ? 'bg-d3' : 'bg-l2',
        decision === 'approved'
          ? (isDark ? 'border border-output-400/20' : 'border border-emerald-200')
          : decision === 'denied'
            ? (isDark ? 'border border-red-400/20' : 'border border-red-200')
            : (isDark ? 'border border-amber-400/20' : 'border border-amber-200')
      ]">
      <!-- Risk visualization bar -->
      <div class="h-[3px]"
        :style="{ background: decision === 'approved' ? 'linear-gradient(90deg, #34D399, #10B981)' : decision === 'denied' ? 'linear-gradient(90deg, #F87171, #EF4444)' : riskBarColor }" />

      <!-- Header — always visible -->
      <div class="px-4 py-2.5 flex items-center gap-2" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
        <i :class="[toolDisplay.icon, decision === 'approved' ? 'text-output-400' : decision === 'denied' ? 'text-red-400' : 'text-amber-400']" class="text-[14px]" />
        <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
          {{ toolDisplay.title }}
        </span>
        <span v-if="isLiveMode" class="text-[10px] px-1.5 py-0.5 rounded font-medium" :class="riskBadge">{{ riskLabel }}</span>
        <span v-if="decision" class="text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5" :class="decisionBadge">
          <i :class="decisionIcon" class="text-[9px]" /> {{ decisionLabel }}
        </span>
        <!-- Duration -->
        <span v-if="authDuration" class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ authDuration }}</span>
        <!-- Collapse toggle -->
        <button v-if="isLiveMode" @click="isCollapsed = !isCollapsed"
          class="ml-auto h-5 px-1.5 rounded flex items-center transition-colors"
          :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          <i :class="isCollapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'" class="text-[12px]" />
        </button>
      </div>

      <!-- Collapsible body (live mode only) -->
      <template v-if="isLiveMode">
        <div v-if="!isCollapsed" class="max-h-[200px] overflow-y-auto thin-scroll">
          <div class="px-4 py-3">
            <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              {{ authRequest.description || toolDisplay.desc }}
            </p>
            <div v-if="authRequest.params" class="mt-2">
              <button @click="showParams = !showParams"
                class="flex items-center gap-1 text-[11px] font-medium transition-colors"
                :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
                <i :class="showParams ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" class="text-[11px]" />
                查看参数详情
              </button>
              <div v-if="showParams" class="mt-1.5 px-3 py-2 rounded-lg text-[11px] overflow-auto max-h-[100px] thin-scroll"
                :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l1 text-lt-aux'">
                <pre class="whitespace-pre-wrap font-mono">{{ formatParams(authRequest.params) }}</pre>
              </div>
            </div>
          </div>
          <div class="px-4 py-1.5 flex items-center gap-3"
            :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
            <label class="flex items-center gap-2 text-[11px] cursor-pointer select-none"
              :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              <input type="checkbox" v-model="allowSession" class="w-[14px] h-[14px] rounded accent-brand-400" />
              本次会话内允许同类操作
            </label>
          </div>
        </div>
        <div v-if="isCollapsed" class="px-4 py-1">
          <span class="text-[11px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            {{ authRequest.description || toolDisplay.desc }}
          </span>
        </div>
        <div class="px-4 py-2 flex items-center gap-2"
          :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
          <button @click="handleApprove"
            class="h-7 px-4 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
            :class="isDark ? 'bg-brand-400/15 text-brand-400 hover:bg-brand-400/25' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
            <i class="ri-check-line text-[11px]" /> 允许执行
          </button>
          <button @click="handleDeny"
            class="h-7 px-4 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
            :class="isDark ? 'bg-red-400/12 text-red-400 hover:bg-red-400/20' : 'bg-red-50 text-red-500 hover:bg-red-100'">
            <i class="ri-close-line text-[11px]" /> 拒绝
          </button>
        </div>
      </template>

      <!-- Completed mode — compact summary -->
      <template v-if="!isLiveMode">
        <div class="px-4 py-2">
          <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            {{ authRequest.description || toolDisplay.desc }}
          </p>
          <!-- Expandable params -->
          <div v-if="authRequest.params" class="mt-1.5">
            <button @click="showParams = !showParams"
              class="flex items-center gap-1 text-[11px] font-medium transition-colors"
              :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
              <i :class="showParams ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" class="text-[11px]" />
              查看参数详情
            </button>
            <div v-if="showParams" class="mt-1 px-3 py-2 rounded-lg text-[11px] overflow-auto max-h-[120px] thin-scroll"
              :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l1 text-lt-aux'">
              <pre class="whitespace-pre-wrap font-mono">{{ formatParams(authRequest.params) }}</pre>
            </div>
          </div>
        </div>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.auth-card-container { max-height: 280px; }
.auth-slide-enter-active { transition: all .25s ease-out; }
.auth-slide-leave-active { transition: all .15s ease-in; }
.auth-slide-enter-from { opacity: 0; transform: translateY(-8px); }
.auth-slide-leave-to { opacity: 0; transform: translateY(4px); }
</style>