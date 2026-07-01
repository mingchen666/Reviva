import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useWorkchatStore = defineStore('workchat', () => {
  const ctxItems = ref([])

  return {
    ctxItems,
  }
})
