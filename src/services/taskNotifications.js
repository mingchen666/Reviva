function currentRoutePath() {
  if (typeof window === 'undefined') return ''
  const hash = window.location.hash || ''
  if (hash.startsWith('#')) return hash.slice(1).split('?')[0] || '/'
  return window.location.pathname || ''
}

async function getWindowPresence() {
  try {
    if (window.electronAPI?.getWindowPresence) {
      const result = await window.electronAPI.getWindowPresence()
      if (result?.ok) return result
    }
  } catch { /* fallback below */ }
  return {
    ok: true,
    isFocused: typeof document !== 'undefined' ? document.hasFocus() : false,
    isVisible: typeof document !== 'undefined' ? !document.hidden : true,
    isMinimized: false,
  }
}

async function shouldSuppressForActiveChat(convStore, convId) {
  const routePath = currentRoutePath()
  if (routePath !== '/workchat') return false
  if (convId && convStore?.currentConvId && convStore.currentConvId !== convId) return false

  const presence = await getWindowPresence()
  const pageVisible = typeof document !== 'undefined' ? !document.hidden : true
  return !!(presence.isFocused && presence.isVisible && !presence.isMinimized && pageVisible)
}

async function shouldUseRendererSoundFallback() {
  const presence = await getWindowPresence()
  const pageVisible = typeof document !== 'undefined' ? !document.hidden : true
  return !!(presence.isFocused && presence.isVisible && !presence.isMinimized && pageVisible)
}

async function notifyTask({ kind, convStore, settingsStore, convId }) {
  if (!settingsStore || settingsStore.notifyDND) return
  if (kind === 'done' && !settingsStore.notifyTaskDone) return
  if (kind === 'failed' && !settingsStore.notifyTaskFailed) return
  if (await shouldSuppressForActiveChat(convStore, convId)) return
  if (!(await shouldUseRendererSoundFallback())) return

  if (!settingsStore.notifySound) return
  const sound = kind === 'failed' ? 'error' : (settingsStore.notifySoundType || 'complete')
  try {
    await window.electronAPI?.playSound?.(sound)
  } catch (e) {
    console.warn('[taskNotifications] playSound failed:', e?.message || e)
  }
}

export function notifyAgentTaskDone({ convStore, settingsStore, convId }) {
  return notifyTask({ kind: 'done', convStore, settingsStore, convId })
}

export function notifyAgentTaskFailed({ convStore, settingsStore, convId }) {
  return notifyTask({ kind: 'failed', convStore, settingsStore, convId })
}
