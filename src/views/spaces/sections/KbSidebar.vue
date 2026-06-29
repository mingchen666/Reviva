<script setup>
import { computed, ref, watch } from 'vue'
import KbListItem from './KbListItem.vue'

const props = defineProps({
  isDark: { type: Boolean, default: false },
  kbs: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  activeScope: { type: String, default: 'mine' },
  searchQuery: { type: String, default: '' },
  busyIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['select', 'create', 'refresh', 'join', 'leave', 'rename', 'edit', 'delete'])

const localSystemSearch = ref('')

const sidebarKbs = computed(() => {
  if (props.activeScope !== 'system') return props.kbs
  const q = localSystemSearch.value.trim().toLowerCase()
  if (!q) return props.kbs
  return props.kbs.filter((kb) => {
    const haystack = `${kb.name || ''} ${kb.title || ''} ${kb.description || ''}`.toLowerCase()
    return haystack.includes(q)
  })
})
const hasSearch = computed(() => Boolean(props.searchQuery.trim() || localSystemSearch.value.trim()))
const totalDocs = computed(() => sidebarKbs.value.reduce((sum, kb) => sum + (kb.docCount || 0), 0))
const ownKbs = computed(() => sidebarKbs.value.filter(kb => !kb.isSystem))
const joinedSystemKbs = computed(() => sidebarKbs.value.filter(kb => kb.isSystem))
const showMineGroups = computed(() => props.activeScope === 'mine' && sidebarKbs.value.length > 0)

watch(() => props.activeScope, (scope) => {
  if (scope !== 'system') localSystemSearch.value = ''
})
</script>

<template>
  <aside
    class="w-[260px] shrink-0 border-r flex flex-col min-h-0"
    :class="isDark ? 'bg-d1 border-d4' : 'bg-l2 border-bdrF'">
    <div
      v-if="activeScope === 'system'"
      class="px-3 py-2 border-b"
      :class="isDark ? 'border-d4 bg-d1' : 'border-bdrF bg-l2'">
      <div class="relative">
        <i
          class="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-[13px]"
          :class="isDark ? 'text-wt-dim' : 'text-slate-400'" />
        <input
          v-model="localSystemSearch"
          class="w-full h-8 rounded-md border pl-8 pr-8 text-[12px] outline-none transition-colors"
          :class="isDark
            ? 'bg-d0 border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/45'
            : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500'"
          placeholder="搜索系统知识库"
          spellcheck="false" />
        <button
          v-if="localSystemSearch"
          class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center"
          :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'"
          @click="localSystemSearch = ''">
          <i class="ri-close-line text-[13px]" />
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2 space-y-0.5">
      <template v-if="loading && kbs.length === 0">
        <div
          v-for="idx in 6"
          :key="idx"
          class="mx-2 rounded-md px-3 py-2.5"
          :class="isDark ? 'bg-d2' : 'bg-l3'">
          <div class="flex gap-2.5">
            <div class="w-8 h-8 rounded-lg animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" />
            <div class="flex-1 space-y-2">
              <div class="h-3 w-2/3 rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" />
              <div class="h-2.5 w-full rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" />
              <div class="h-2.5 w-1/2 rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" />
            </div>
          </div>
        </div>
      </template>

      <div
        v-else-if="error"
        class="mx-3 rounded-lg border px-4 py-8 text-center"
        :class="isDark ? 'border-red-400/15 bg-red-400/5 text-red-300' : 'border-red-100 bg-red-50 text-red-600'">
        <i class="ri-error-warning-line text-[24px]" />
        <p class="mt-2 text-[12px] font-medium">{{ error }}</p>
        <button class="mt-3 text-[11px] font-medium underline underline-offset-2" @click="emit('refresh')">
          重新加载
        </button>
      </div>

      <template v-else-if="showMineGroups">
        <div v-if="ownKbs.length" class="mb-4">
          <h3 class="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider" :class="isDark ? 'text-wt-dim' : 'text-slate-400'">
            自建库
          </h3>
          <KbListItem
            v-for="kb in ownKbs"
            :key="kb.id"
            :kb="kb"
            :is-dark="isDark"
            :selected="selectedId === kb.id"
            :scope="activeScope"
            :busy="busyIds.includes(kb.id)"
            @select="emit('select', $event)"
            @join="emit('join', $event)"
            @leave="emit('leave', $event)"
            @rename="emit('rename', $event)"
            @edit="emit('edit', $event)"
            @delete="emit('delete', $event)" />
        </div>

        <div v-if="joinedSystemKbs.length">
          <h3 class="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider" :class="isDark ? 'text-wt-dim' : 'text-slate-400'">
            已加入系统库
          </h3>
          <KbListItem
            v-for="kb in joinedSystemKbs"
            :key="kb.id"
            :kb="kb"
            :is-dark="isDark"
            :selected="selectedId === kb.id"
            :scope="activeScope"
            :busy="busyIds.includes(kb.id)"
            @select="emit('select', $event)"
            @join="emit('join', $event)"
            @leave="emit('leave', $event)"
            @rename="emit('rename', $event)"
            @edit="emit('edit', $event)"
            @delete="emit('delete', $event)" />
        </div>
      </template>

      <template v-else-if="sidebarKbs.length > 0">
        <KbListItem
          v-for="kb in sidebarKbs"
          :key="kb.id"
          :kb="kb"
          :is-dark="isDark"
          :selected="selectedId === kb.id"
          :scope="activeScope"
          :busy="busyIds.includes(kb.id)"
          @select="emit('select', $event)"
          @join="emit('join', $event)"
          @leave="emit('leave', $event)"
          @rename="emit('rename', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)" />
      </template>

      <div
        v-else
        class="mx-3 h-full min-h-[260px] rounded-lg border flex flex-col items-center justify-center px-6 text-center"
        :class="isDark ? 'border-d4 text-wt-dim' : 'border-bdrF text-lt-aux'">
        <div
          class="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
          :class="isDark ? 'bg-d0' : 'bg-l3'">
          <i class="ri-database-2-line text-[24px]" />
        </div>
        <p class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          {{ hasSearch ? '没有匹配的知识库' : activeScope === 'system' ? '暂无系统知识库' : '暂无知识库' }}
        </p>
        <p class="mt-1 text-[10.5px] leading-relaxed">
          {{
            hasSearch
              ? '换个关键词试试'
              : activeScope === 'system'
                ? '刷新后可查看后台开放的系统资料库'
                : '创建一个知识库后即可上传资料'
          }}
        </p>
        <button
          v-if="!hasSearch && activeScope === 'mine'"
          class="mt-4 h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'"
          @click="emit('create')">
          <i class="ri-add-line text-[13px]" />
          新建知识库
        </button>
      </div>
    </div>

    <div class="px-3 py-3 border-t" :class="isDark ? 'border-d4 bg-d0/30' : 'border-bdrF bg-white/70'">
      <div
        class="rounded-lg border px-2.5 py-2"
        :class="isDark ? 'border-d4 bg-d1/80' : 'border-slate-200 bg-slate-50'">
        <div class="flex items-center justify-between gap-3">
          <div
            class="flex-1 min-w-0 rounded-md px-2 py-1.5"
            :class="
              activeScope === 'system'
                ? isDark
                  ? 'bg-emerald-400/8'
                  : 'bg-emerald-50'
                : isDark
                  ? 'bg-brand-400/8'
                  : 'bg-blue-50'
            ">
            <div class="flex items-center gap-1.5">
              <i
                :class="[activeScope === 'system' ? 'ri-cloud-line' : 'ri-database-2-line', 'text-[13px]']"
                :style="{ color: activeScope === 'system' ? '#059669' : '#2563EB' }" />
              <p
                class="text-[10px] font-medium truncate"
                :class="activeScope === 'system' ? (isDark ? 'text-emerald-200' : 'text-emerald-700') : (isDark ? 'text-brand-200' : 'text-blue-700')">
                {{ activeScope === 'system' ? '系统库' : '知识库' }}
              </p>
            </div>
            <p class="mt-0.5 text-[14px] font-semibold tabular-nums" :class="activeScope === 'system' ? (isDark ? 'text-emerald-100' : 'text-emerald-900') : (isDark ? 'text-brand-100' : 'text-blue-900')">
              {{ sidebarKbs.length }}
              <span class="text-[10px] font-medium">个</span>
            </p>
          </div>
          <div
            class="flex-1 min-w-0 rounded-md px-2 py-1.5"
            :class="isDark ? 'bg-amber-400/8' : 'bg-amber-50'">
            <div class="flex items-center gap-1.5">
              <i class="ri-file-list-3-line text-[13px]" style="color: #D97706" />
              <p class="text-[10px] font-medium" :class="isDark ? 'text-amber-200' : 'text-amber-700'">文档</p>
            </div>
            <p class="mt-0.5 text-[14px] font-semibold tabular-nums" :class="isDark ? 'text-amber-100' : 'text-amber-900'">
              {{ totalDocs }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
