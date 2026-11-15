<script setup>
import { computed, ref, watch, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  groups: { type: Array, default: () => [] },
  currentGroupId: { type: String, default: '' },
  isDark: Boolean,
})

const emit = defineEmits(['select', 'close'])

const selected = ref('')
const query = ref('')
const searchRef = ref(null)

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.groups || []
  return (props.groups || []).filter(g => (g.name || '').toLowerCase().includes(q))
})

const hasResult = computed(() => filteredGroups.value.length > 0)

watch(() => props.show, (val) => {
  if (val) {
    selected.value = props.currentGroupId || ''
    query.value = ''
    nextTick(() => { searchRef.value?.focus() })
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}

function onOverlayClick() {
  emit('close')
}

function pick(groupId) {
  emit('select', groupId)
  emit('close')
}

function onConfirm() {
  if (selected.value) pick(selected.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ms-msgbox">
      <div
        v-if="show"
        class="fixed inset-0 z-[80] flex items-center justify-center p-4"
        :class="isDark ? 'theme-dark' : 'theme-light'"
      >
        <div class="ms-msgbox-overlay absolute inset-0 backdrop-blur-[2px]" @click="onOverlayClick" />
        <div
          class="ms-msgbox-card relative overflow-hidden rounded-xl"
          :class="isDark
            ? 'bg-d3 border border-bdr shadow-2xl shadow-black/60'
            : 'bg-l1 border border-bdrL shadow-2xl shadow-black/15'"
          style="width: 480px"
        >
          <div class="px-4 pt-4 pb-3">
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                :class="isDark ? 'bg-brand-400/10' : 'bg-brand-50'">
                <i class="ri-folder-transfer-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
              </div>
              <div class="min-w-0 flex-1 pt-0.5">
                <p class="text-[14px] font-semibold leading-5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">移动到分组</p>
                <p class="text-[11px] mt-1 leading-4" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">选择目标分组，当前分组会高亮标记</p>
              </div>
            </div>

            <div class="mt-3 relative">
              <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px]"
                :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              <input
                ref="searchRef"
                v-model="query"
                class="w-full h-8 pl-8 pr-2 rounded-lg text-[13px] outline-none border transition-colors focus:ring-1"
                :class="isDark
                  ? 'bg-d0 border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/60 focus:ring-brand-400/12'
                  : 'bg-l2 border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400 focus:ring-brand-400/10'"
                placeholder="搜索分组"
              >
            </div>

            <div class="mt-2 rounded-lg border overflow-hidden"
              :class="isDark ? 'border-d4' : 'border-bdrF'">
              <div class="h-[220px] overflow-y-auto">
                <button
                  v-for="(group, index) in filteredGroups"
                  :key="group.id"
                  @click="selected = group.id"
                  class="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors text-left"
                  :class="[
                    selected === group.id
                      ? (isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500')
                      : (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4'),
                    index > 0 ? (isDark ? 'border-t border-d4/60' : 'border-t border-bdrL') : ''
                  ]"
                >
                  <i :class="group.id === 'default' ? 'ri-inbox-line' : 'ri-folder-line'" class="text-[14px] shrink-0" />
                  <span class="truncate flex-1">{{ group.name }}</span>
                  <i v-if="currentGroupId === group.id" class="ri-pushpin-line text-[12px] shrink-0"
                    :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" title="当前所在分组" />
                  <i v-if="selected === group.id" class="ri-check-line text-[14px] shrink-0"
                    :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
                </button>
                <div v-if="!hasResult" class="h-full flex items-center justify-center text-[12px]"
                  :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                  <div class="flex flex-col items-center gap-1.5">
                    <i class="ri-search-eye-line text-[20px]" />
                    <span>未找到匹配的分组</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="px-4 py-3 flex items-center gap-2 justify-end"
            :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
            <button
              class="h-8 min-w-[72px] px-3.5 rounded-lg text-[13px] font-medium transition-colors"
              :class="isDark ? 'bg-d4 text-wt-sub border border-bdr hover:bg-d0 hover:text-wt-main' : 'bg-l3 text-lt-sub border border-bdrF hover:bg-l4 hover:text-lt-main'"
              @click="emit('close')"
            >取消</button>
            <button
              class="h-8 min-w-[72px] px-3.5 rounded-lg text-[13px] font-semibold transition-colors focus:outline-none focus:ring-2"
              :class="[isDark ? 'bg-brand-500 text-white hover:bg-brand-600 focus:ring-brand-400/30' : 'bg-brand-500 text-white hover:bg-brand-600 focus:ring-brand-400/30', (!selected || selected === currentGroupId) ? 'opacity-50 cursor-not-allowed' : '']"
              :disabled="!selected || selected === currentGroupId"
              @click="onConfirm"
            >移动</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ms-msgbox-enter-active { transition: opacity .22s ease }
.ms-msgbox-leave-active { transition: opacity .18s ease }
.ms-msgbox-enter-from,
.ms-msgbox-leave-to { opacity: 0 }

.theme-dark .ms-msgbox-overlay { background: rgba(0, 0, 0, .55) }
.theme-light .ms-msgbox-overlay { background: rgba(26, 26, 46, .18) }

.ms-msgbox-enter-active .ms-msgbox-card { transition: transform .26s cubic-bezier(.16, 1, .3, 1), opacity .22s ease }
.ms-msgbox-leave-active .ms-msgbox-card { transition: transform .18s ease-in, opacity .18s ease-in }
.ms-msgbox-enter-from .ms-msgbox-card { transform: scale(.94) translateY(6px); opacity: 0 }
.ms-msgbox-leave-to .ms-msgbox-card { transform: scale(.97); opacity: 0 }
</style>