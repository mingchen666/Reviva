import { ref, computed } from 'vue'

/**
 * useNoteHistory — char-level + throttled snapshot undo/redo.
 *
 * Strategy:
 *  - Track snapshots of { content, title, cursor } in a bounded stack.
 *  - Throttle snapshots: 500ms idle OR immediately on newline / punctuation / explicit push.
 *  - Explicit `pushNow()` for AI / toolbar / paste operations.
 *  - undo() / redo() returns the snapshot to apply; caller restores cursor.
 */
export function useNoteHistory(opts = {}) {
  const max = opts.max ?? 50
  const throttleMs = opts.throttleMs ?? 500
  const triggerChars = /[\n.。,，;；:：!！?？]/

  const past = ref([])
  const future = ref([])
  let pendingTimer = null
  let lastSnapshot = null

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  function _snapshot(state) {
    return {
      content: state.content ?? '',
      title: state.title ?? '',
      cursor: state.cursor ?? { start: 0, end: 0 },
      at: Date.now(),
    }
  }

  function _commit(snap) {
    if (lastSnapshot && lastSnapshot.content === snap.content && lastSnapshot.title === snap.title) return
    past.value.push(snap)
    if (past.value.length > max) past.value.shift()
    future.value = []
    lastSnapshot = snap
  }

  /**
   * Mark a change. Called on every keystroke.
   * If `force` or the last char is a trigger char, commit immediately.
   * Otherwise schedule a throttled commit.
   */
  function record(state, opts = {}) {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
    const snap = _snapshot(state)
    const lastChar = (state.content || '').slice(-1)
    const isTrigger = opts.force || triggerChars.test(lastChar)
    if (isTrigger) {
      _commit(snap)
      return
    }
    pendingTimer = setTimeout(() => {
      _commit(snap)
      pendingTimer = null
    }, throttleMs)
  }

  /** Force-commit a snapshot synchronously (AI / paste / explicit). */
  function pushNow(state) {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
    _commit(_snapshot(state))
  }

  /**
   * Initialize after a new note loads. Resets stacks and seeds the lastSnapshot
   * so the first user keystroke doesn't get conflated with the initial value.
   */
  function init(state) {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
    past.value = []
    future.value = []
    lastSnapshot = _snapshot(state)
  }

  /** Pop the most recent snapshot. Pushes current state to future stack first. */
  function undo(current) {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; _commit(_snapshot(current)) }
    if (!past.value.length) return null
    // If lastSnapshot equals current, drop the duplicate from past
    const top = past.value[past.value.length - 1]
    if (top.content === current.content && top.title === current.title) {
      past.value.pop()
      future.value.push(_snapshot(current))
      const next = past.value[past.value.length - 1]
      if (next) { lastSnapshot = next; return next }
      lastSnapshot = null
      return null
    }
    future.value.push(_snapshot(current))
    const snap = past.value.pop()
    lastSnapshot = snap
    return snap
  }

  function redo() {
    if (!future.value.length) return null
    const snap = future.value.pop()
    past.value.push(snap)
    lastSnapshot = snap
    return snap
  }

  function clear() {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
    past.value = []
    future.value = []
    lastSnapshot = null
  }

  return { canUndo, canRedo, record, pushNow, init, undo, redo, clear }
}
