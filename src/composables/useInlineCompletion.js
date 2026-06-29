/**
 * useInlineCompletion — Ghost text inline AI completion for the notes textarea.
 *
 * Strategy:
 *  - On input idle (debounceMs), request a 1-sentence completion from the
 *    configured small model with the prefix/suffix around the cursor.
 *  - Expose `suggestion` (string) — caller renders it as ghost text overlay.
 *  - `accept()` returns the suggestion (caller inserts at cursor).
 *  - `dismiss()` clears suggestion and aborts in-flight request.
 *  - Only triggers when:
 *      * enabled
 *      * cursor at end of a line / not in the middle of a word
 *      * prefix has min length
 *      * no selection (start === end)
 */
import { ref, computed, watch } from 'vue'
import { runNoteAiTask, NOTE_AI_PROMPTS } from './useNoteAi'

export function useInlineCompletion(opts = {}) {
  const debounceMs = opts.debounceMs ?? 800
  const minPrefix = opts.minPrefix ?? 4
  const maxPrefix = opts.maxPrefix ?? 600
  const maxSuffix = opts.maxSuffix ?? 200

  const enabled = ref(!!opts.enabledRef?.value)
  if (opts.enabledRef) watch(opts.enabledRef, (v) => { enabled.value = !!v }, { immediate: true })

  const suggestion = ref('')
  const isFetching = ref(false)
  let abortCtrl = null
  let debounceTimer = null
  let lastTriggerKey = ''

  function dismiss() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    if (abortCtrl) { try { abortCtrl.abort() } catch {}; abortCtrl = null }
    suggestion.value = ''
    isFetching.value = false
  }

  /** Schedule a completion request based on current editor state. */
  function schedule({ content, cursorStart, cursorEnd, providerId, model }) {
    if (!enabled.value) { dismiss(); return }
    if (cursorStart !== cursorEnd) { dismiss(); return }
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }

    const prefix = (content || '').slice(Math.max(0, cursorStart - maxPrefix), cursorStart)
    const suffix = (content || '').slice(cursorEnd, cursorEnd + maxSuffix)
    if (prefix.length < minPrefix) { dismiss(); return }

    // Skip if cursor is in the middle of a word (next char is letter/digit/CJK)
    const nextChar = suffix.charAt(0)
    if (nextChar && /[A-Za-z0-9\u4e00-\u9fa5_]/.test(nextChar)) { dismiss(); return }

    // Skip code-block context — heuristic: count of unmatched ``` before cursor
    const fences = (prefix.match(/```/g) || []).length
    if (fences % 2 === 1) { dismiss(); return }

    const triggerKey = prefix + '\u0000' + suffix
    if (triggerKey === lastTriggerKey && (suggestion.value || isFetching.value)) return
    lastTriggerKey = triggerKey

    debounceTimer = setTimeout(async () => {
      if (abortCtrl) { try { abortCtrl.abort() } catch {} }
      abortCtrl = new AbortController()
      isFetching.value = true
      suggestion.value = ''
      try {
        const { system, user } = NOTE_AI_PROMPTS.completion(prefix, suffix)
        const result = await runNoteAiTask({
          systemPrompt: system,
          userPrompt: user,
          providerId,
          model,
          temperature: 0.3,
          maxTokens: 60,
          signal: abortCtrl.signal,
        })
        if (abortCtrl?.signal.aborted) return
        // Sanitize: strip markdown bullets/quotes the model sometimes adds
        const cleaned = (result || '').trim().replace(/^["“『「']+|["”』」']+$/g, '').trim()
        if (cleaned && cleaned.length <= 80 && triggerKey === lastTriggerKey) {
          suggestion.value = cleaned
        }
      } catch (e) {
        // Silently fail — completion is best-effort
        suggestion.value = ''
      } finally {
        isFetching.value = false
        abortCtrl = null
      }
    }, debounceMs)
  }

  /** Caller uses this to apply the suggestion at the cursor; returns the text. */
  function accept() {
    const s = suggestion.value
    suggestion.value = ''
    return s
  }

  return {
    enabled: computed({ get: () => enabled.value, set: (v) => { enabled.value = v; if (!v) dismiss() } }),
    suggestion,
    isFetching,
    schedule,
    accept,
    dismiss,
  }
}
