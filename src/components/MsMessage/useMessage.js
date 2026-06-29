import { reactive } from 'vue'

const messages = reactive([])
let nextId = 0
const MAX_MESSAGES = 5
const DEFAULT_PLACEMENT = 'top-center'

const typeConfig = {
  success: { icon: 'ri-checkbox-circle-fill', iconColor: 'text-emerald-400', accent: 'emerald' },
  error: { icon: 'ri-error-warning-fill', iconColor: 'text-red-400', accent: 'red' },
  warning: { icon: 'ri-alert-fill', iconColor: 'text-amber-400', accent: 'amber' },
  info: { icon: 'ri-information-fill', iconColor: 'text-brand-400', accent: 'brand' },
}

function add(type, content, options = {}) {
  if (messages.length >= MAX_MESSAGES) {
    remove(messages[0].id)
  }

  const id = ++nextId
  const cfg = typeConfig[type] || typeConfig.info
  const msg = {
    id,
    type,
    content,
    title: options.title || '',
    duration: options.duration ?? 3000,
    closable: options.closable ?? true,
    icon: options.icon || cfg.icon,
    iconColor: options.iconColor || cfg.iconColor,
    accent: cfg.accent,
    placement: normalizePlacement(options.placement),
    closing: false,
    timer: null,
    remaining: options.duration ?? 3000,
    startedAt: 0,
  }

  messages.push(msg)
  startTimer(msg)
  return { id, close: () => remove(id) }
}

function normalizePlacement(value) {
  if (value === 'top-right' || value === 'right') return 'top-right'
  if (value === 'top-center' || value === 'center') return 'top-center'
  return DEFAULT_PLACEMENT
}

function startTimer(msg) {
  if (msg.duration <= 0) return
  msg.startedAt = Date.now()
  msg.timer = setTimeout(() => remove(msg.id), msg.remaining)
}

function pauseTimer(id) {
  const msg = messages.find(m => m.id === id)
  if (!msg || !msg.timer) return
  clearTimeout(msg.timer)
  msg.timer = null
  msg.remaining = Math.max(0, msg.remaining - (Date.now() - msg.startedAt))
}

function resumeTimer(id) {
  const msg = messages.find(m => m.id === id)
  if (!msg || msg.timer || msg.duration <= 0) return
  startTimer(msg)
}

function remove(id) {
  const idx = messages.findIndex(m => m.id === id)
  if (idx === -1) return
  const msg = messages[idx]
  if (msg.timer) clearTimeout(msg.timer)
  msg.closing = true
  setTimeout(() => {
    const i = messages.findIndex(m => m.id === id)
    if (i !== -1) messages.splice(i, 1)
  }, 260)
}

export function useMessage() {
  return {
    messages,
    success: (content, opts) => add('success', content, opts),
    error: (content, opts) => add('error', content, opts),
    warning: (content, opts) => add('warning', content, opts),
    info: (content, opts) => add('info', content, opts),
    remove,
    pauseTimer,
    resumeTimer,
  }
}
