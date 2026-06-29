<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  toolCall: Object,
  isDark: Boolean,
  iteration: { type: Number, default: null },
  needsAuth: { type: Boolean, default: false },
  authEvent: { type: Object, default: null }, // Auth decision data (decision, respondedAt, createdAt)
})

const emit = defineEmits(['retry'])

const showDetails = ref(false)

// Auth decision display
const authDecision = computed(() => props.authEvent?.decision || '')
const authDuration = computed(() => {
  if (!props.authEvent?.createdAt || !props.authEvent?.respondedAt) return ''
  const seconds = Math.round((props.authEvent.respondedAt - props.authEvent.createdAt) / 1000)
  if (seconds < 60) return seconds + 's'
  return Math.floor(seconds / 60) + 'm' + (seconds % 60) + 's'
})

function parseInput(input) {
  if (!input) return null
  if (typeof input === 'object') return input
  try { return JSON.parse(input) } catch { return null }
}

function hasSkillPath(value) {
  return /\/skills\//i.test(String(value || '').replace(/\\/g, '/'))
}

function stringifyPayload(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

function extractSkillFrontmatterName(value) {
  const text = stringifyPayload(value)
  if (!text.includes('name:')) return ''
  const normalized = text.replace(/\\n/g, '\n').replace(/\r/g, '\n')
  const multiline = normalized.match(/(?:^|\n)---\s*\n\s*name:\s*([^\n]+)/i)
  if (multiline?.[1]) return multiline[1].trim().replace(/^["']|["']$/g, '')
  const compact = normalized.match(/---\s*name:\s*([^,\n]+?)(?:\s+description:|\s+instructions:|\s+[a-z_-]+:|$)/i)
  return compact?.[1]?.trim().replace(/^["']|["']$/g, '') || ''
}

function firstSkillStringValue(value) {
  if (!value) return ''
  if (typeof value === 'string') return hasSkillPath(value) ? value : ''
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstSkillStringValue(item)
      if (found) return found
    }
    return ''
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = firstSkillStringValue(item)
      if (found) return found
    }
  }
  return ''
}

function firstStringValue(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstStringValue(item)
      if (found) return found
    }
    return ''
  }
  if (typeof value === 'object') {
    const priorityKeys = ['path', 'file_path', 'filePath', 'dir', 'directory', 'pattern', 'query']
    for (const key of priorityKeys) {
      const found = firstStringValue(value[key])
      if (found) return found
    }
    for (const item of Object.values(value)) {
      const found = firstStringValue(item)
      if (found) return found
    }
  }
  return ''
}

function extractInputPath(input) {
  const parsed = parseInput(input)
  const skillPath = firstSkillStringValue(parsed)
  if (skillPath) return skillPath
  const parsedPath = firstStringValue(parsed)
  if (parsedPath) return parsedPath
  const raw = String(input || '')
  return raw.match(/\/skills\/[^"'\s`]+/i)?.[0] || raw.match(/["'](?:path|file_path|filePath|dir|directory|pattern|query)["']\s*:\s*["']([^"']+)["']/)?.[1] || raw
}

const inputPath = computed(() => extractInputPath(props.toolCall?.input))
const skillMatch = computed(() => String(inputPath.value || '').replace(/\\/g, '/').match(/\/skills\/([^/\s"'`]+)(?:\/([^\s"'`]+))?/i))
const skillId = computed(() => skillMatch.value?.[1] || '')
const skillRelativePath = computed(() => skillMatch.value?.[2] || '')
const skillFrontmatterName = computed(() => extractSkillFrontmatterName(props.toolCall?.input) || extractSkillFrontmatterName(props.toolCall?.result))
const toolName = computed(() => String(props.toolCall?.name || '').trim())
const isKbSearch = computed(() => toolName.value === 'kb_search')
const skillNameFromToolName = computed(() => toolName.value.startsWith('skill:') ? toolName.value.slice(6) : '')
const skillDisplayId = computed(() => skillId.value || skillFrontmatterName.value || skillNameFromToolName.value)
const isSkillAccess = computed(() => (!!skillId.value && ['read_file', 'ls', 'glob', 'grep'].includes(toolName.value)) || !!skillFrontmatterName.value || !!skillNameFromToolName.value)
const effectiveStatus = computed(() => {
  if ((skillFrontmatterName.value || skillNameFromToolName.value) && props.toolCall?.status === 'running') return 'completed'
  return props.toolCall?.status
})

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function isMeaningfulToolName(name) {
  const value = String(name || '').trim()
  return !!value && value !== 'tool' && !isUuidLike(value)
}

function skillActionLabel(name) {
  if (name === 'ls') return '浏览 Skill'
  if (name === 'glob' || name === 'grep') return '检索 Skill'
  return '读取 Skill'
}

const displayName = computed(() => {
  if (isKbSearch.value) return '知识库检索'
  if (isSkillAccess.value) {
    const suffix = skillRelativePath.value && skillRelativePath.value !== 'SKILL.md' ? `/${skillRelativePath.value}` : ''
    return `${skillActionLabel(toolName.value)}：${skillDisplayId.value}${suffix}`
  }
  const labels = {
    read_file: '读取文件',
    write_file: '写入文件',
    edit_file: '编辑文件',
    ls: '列出目录',
    glob: '查找文件',
    grep: '搜索文本',
  }
  if (labels[toolName.value]) return labels[toolName.value]
  return isMeaningfulToolName(toolName.value) ? toolName.value : '工具调用'
})

const statusIcon = computed(() => {
  const s = effectiveStatus.value
  if (s === 'running') return 'ri-loader-4-line'
  if (s === 'completed') return 'ri-check-line'
  return 'ri-close-line'
})

const statusLabel = computed(() => {
  const s = effectiveStatus.value
  if (isKbSearch.value) {
    if (s === 'running') return '检索中'
    if (s === 'completed') return '已检索'
    return '检索失败'
  }
  if (isSkillAccess.value) {
    if (s === 'running') return toolName.value === 'ls' ? '浏览中' : (toolName.value === 'grep' || toolName.value === 'glob' ? '检索中' : '加载中')
    if (s === 'completed') return '已加载'
  }
  if (s === 'running') return '执行中'
  if (s === 'completed') return '已完成'
  return '失败'
})

const statusBg = computed(() => {
  const s = effectiveStatus.value
  if (s === 'running') return props.isDark ? 'bg-sky-400/12 text-sky-400' : 'bg-sky-50 text-sky-500'
  if (s === 'completed') return props.isDark ? 'bg-output-400/12 text-output-400' : 'bg-emerald-50 text-emerald-500'
  return props.isDark ? 'bg-red-400/12 text-red-400' : 'bg-red-50 text-red-500'
})

const statusBadge = computed(() => {
  const s = effectiveStatus.value
  if (s === 'running') return props.isDark ? 'bg-sky-400/8 text-sky-400' : 'bg-sky-50 text-sky-500'
  if (s === 'completed') return props.isDark ? 'bg-output-400/8 text-output-400' : 'bg-emerald-50 text-emerald-500'
  return props.isDark ? 'bg-red-400/8 text-red-400' : 'bg-red-50 text-red-500'
})

const isError = computed(() => effectiveStatus.value === 'error')

function formatParams(input) {
  if (!input) return ''
  const skillName = extractSkillFrontmatterName(input)
  if (skillName) return `Skill：${skillName}`
  try {
    const parsed = typeof input === 'string' ? JSON.parse(input) : input
    return JSON.stringify(parsed, null, 2)
  } catch {
    return String(input)
  }
}

function formatResult(result) {
  const formatted = formatParams(result)
  if (isKbSearch.value) return formatted
  return formatted.length > 500 ? formatted.slice(0, 500) : formatted
}
</script>

<template>
  <div class="flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
    :class="isDark ? 'bg-d4/60 border border-d4' : 'bg-l4/60 border border-bdrF'">
    <!-- Status indicator -->
    <div class="w-[20px] h-[20px] rounded-md flex items-center justify-center shrink-0 mt-0.5"
      :class="statusBg">
      <i :class="statusIcon" class="text-[11px]"
        :style="effectiveStatus === 'running' ? 'animation:spin 1s linear infinite' : ''" />
    </div>
    <!-- Auth shield indicator -->
    <div v-if="needsAuth" class="w-[20px] h-[20px] rounded-md flex items-center justify-center shrink-0 mt-0.5"
      :class="isDark ? 'bg-amber-400/12' : 'bg-amber-50'">
      <i class="ri-shield-check-line text-[11px] text-amber-400" />
    </div>
    <!-- Tool info -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <!-- Iteration badge -->
        <span v-if="iteration" class="text-[9px] font-bold px-1 py-0.5 rounded"
          :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l1 text-lt-aux'">#{{ iteration }}</span>
        <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          {{ displayName }}
        </span>
        <span class="text-[10px] px-1 py-0.5 rounded" :class="statusBadge">{{ statusLabel }}</span>
        <!-- Auth decision badge (approved/denied with duration) -->
        <span v-if="authDecision" class="text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5"
          :class="authDecision === 'approved'
            ? (isDark ? 'bg-output-400/12 text-output-400' : 'bg-emerald-50 text-emerald-600')
            : (isDark ? 'bg-red-400/12 text-red-400' : 'bg-red-50 text-red-600')">
          <i :class="authDecision === 'approved' ? 'ri-check-line' : 'ri-close-line'" class="text-[9px]" />
          {{ authDecision === 'approved' ? '已授权' : '已拒绝' }}
          <span v-if="authDuration" class="text-[9px] opacity-60">{{ authDuration }}</span>
        </span>
      </div>
      <!-- Params preview -->
      <div v-if="showDetails && toolCall.input" class="mt-1.5 px-3 py-2 rounded-lg text-[11px] overflow-auto max-h-[150px]"
        :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l1 text-lt-aux'">
        <pre class="whitespace-pre-wrap font-mono">{{ formatParams(toolCall.input) }}</pre>
      </div>
      <!-- Result preview -->
      <div v-if="showDetails && toolCall.result" class="mt-1.5 px-3 py-2 rounded-lg text-[11px] overflow-auto max-h-[150px]"
        :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l1 text-lt-aux'">
        <pre class="whitespace-pre-wrap font-mono">{{ formatResult(toolCall.result) }}</pre>
      </div>
      <!-- Inline retry for errors -->
      <button v-if="isError" @click="emit('retry')"
        class="mt-1 text-[10px] font-medium flex items-center gap-1 transition-colors"
        :class="isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-500 hover:text-brand-400'">
        <i class="ri-refresh-line text-[10px]" /> 重试
      </button>
    </div>
    <!-- expand toggle -->
    <button @click="showDetails = !showDetails" class="shrink-0 mt-0.5 h-5 w-5 rounded flex items-center justify-center"
      :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
      <i :class="showDetails ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" class="text-[11px]" />
    </button>
  </div>
</template>

<style scoped>
@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
</style>
