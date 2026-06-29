import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useWorkchatStore = defineStore('workchat', () => {
  // Keep selected context items while switching away from /workchat.
  // This is intentionally session-scoped; it should reset after an app reload.
  const ctxItems = ref([])

  return {
    ctxItems,
  }
})
