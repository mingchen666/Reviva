<script setup>
import {
  docStatusDotClass,
  docStatusMeta,
  docStatusTextClass,
  fileIcon,
  fileIconClass,
  fmtBytes,
  fmtDate,
} from './kbFormat'

defineProps({
  isDark: { type: Boolean, default: false },
  docs: { type: Array, default: () => [] },
  entry: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无文档' },
})

const emit = defineEmits(['delete', 'refresh', 'page-change'])
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div
      v-if="error"
      class="flex-1 flex items-center justify-center px-6"
      :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
      <div class="text-center">
        <i class="ri-error-warning-line text-[28px] text-red-400" />
        <p class="mt-2 text-[13px] font-medium">{{ error }}</p>
        <button class="mt-3 text-[12px] text-brand-400 font-medium" @click="emit('refresh')">
          重新加载
        </button>
      </div>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-auto custom-scrollbar">
      <table class="w-full table-fixed border-collapse text-left">
        <thead
          class="sticky top-0 z-10 border-b text-[10.5px] font-semibold uppercase tracking-wider"
          :class="isDark ? 'bg-d1/95 border-d4 text-wt-dim' : 'bg-l3/95 border-bdrF text-lt-aux'">
          <tr>
            <th class="w-[44%] py-2.5 pl-4 pr-2">文件名</th>
            <th class="w-[16%] py-2.5 px-2">状态</th>
            <th class="w-[12%] py-2.5 px-2 text-right">大小</th>
            <th class="w-[20%] py-2.5 px-2 text-right">更新时间</th>
            <th class="w-[8%] py-2.5 pl-2 pr-4 text-right"></th>
          </tr>
        </thead>

        <tbody v-if="loading && docs.length === 0" :class="isDark ? 'divide-y divide-d4' : 'divide-y divide-slate-100'">
          <tr v-for="idx in 8" :key="idx">
            <td class="py-3 pl-4 pr-2">
              <div class="flex items-center gap-2.5">
                <div class="w-5 h-5 rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" />
                <div class="h-3 w-2/3 rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" />
              </div>
            </td>
            <td class="py-3 px-2"><div class="h-3 w-16 rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" /></td>
            <td class="py-3 px-2"><div class="h-3 w-12 ml-auto rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" /></td>
            <td class="py-3 px-2"><div class="h-3 w-24 ml-auto rounded animate-pulse" :class="isDark ? 'bg-d4' : 'bg-l4'" /></td>
            <td class="py-3 pl-2 pr-4"></td>
          </tr>
        </tbody>

        <tbody v-else-if="docs.length > 0" :class="isDark ? 'divide-y divide-d4' : 'divide-y divide-slate-100'">
          <tr
            v-for="doc in docs"
            :key="doc.id"
            class="group transition-colors"
            :class="isDark ? 'hover:bg-white/4' : 'hover:bg-slate-50/80'">
            <td class="py-2.5 pl-4 pr-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <i :class="[fileIcon(doc.type), fileIconClass(doc.type), 'text-[18px] shrink-0']" />
                <div class="min-w-0">
                  <div
                    class="text-[12.5px] font-medium truncate transition-colors"
                    :class="isDark ? 'text-wt-main group-hover:text-brand-300' : 'text-lt-main group-hover:text-blue-600'">
                    {{ doc.name }}
                  </div>
                  <div
                    v-if="doc.summary"
                    class="mt-0.5 text-[10.5px] truncate"
                    :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                    {{ doc.summary }}
                  </div>
                </div>
              </div>
            </td>

            <td class="py-2.5 px-2">
              <span
                class="inline-flex items-center gap-1.5 text-[11.5px] font-medium"
                :class="docStatusTextClass(doc.status, isDark)">
                <span class="w-1.5 h-1.5 rounded-full" :class="docStatusDotClass(doc.status)" />
                {{ docStatusMeta(doc.status).label }}
              </span>
            </td>

            <td class="py-2.5 px-2 text-right text-[11.5px] tabular-nums font-mono" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              {{ fmtBytes(doc.size) }}
            </td>

            <td class="py-2.5 px-2 text-right text-[11.5px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              {{ fmtDate(doc.updatedAt || doc.createdAt) }}
            </td>

            <td class="py-2.5 pl-2 pr-4 text-right">
              <button
                v-if="!readonly"
                class="h-7 w-7 rounded-md inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-600 hover:bg-red-50'"
                title="删除文档"
                @click="emit('delete', doc)">
                <i class="ri-delete-bin-line text-[14px]" />
              </button>
              <span v-else class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">只读</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div
        v-if="!loading && docs.length === 0"
        class="h-full min-h-[320px] flex items-center justify-center px-6"
        :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <div class="text-center">
          <div
            class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            :class="isDark ? 'bg-d1' : 'bg-l3'">
            <i class="ri-file-list-3-line text-[28px]" />
          </div>
          <p class="text-[12.5px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ emptyText }}</p>
        </div>
      </div>
    </div>

    <div
      class="h-11 px-4 border-t flex items-center justify-between shrink-0"
      :class="isDark ? 'border-d4 bg-d1/60' : 'border-bdrF bg-l3/50'">
      <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        共 {{ entry.total || docs.length }} 个文档
      </span>

      <div class="flex items-center gap-1.5">
        <button
          class="h-7 w-7 rounded-md flex items-center justify-center transition-colors disabled:opacity-40"
          :class="isDark ? 'text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:bg-l4'"
          :disabled="loading || !(entry.hasPrev || entry.page > 1)"
          @click="emit('page-change', (entry.page || 1) - 1)">
          <i class="ri-arrow-left-s-line text-[16px]" />
        </button>
        <span class="min-w-[62px] text-center text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          {{ entry.page || 1 }} / {{ entry.totalPages || 1 }}
        </span>
        <button
          class="h-7 w-7 rounded-md flex items-center justify-center transition-colors disabled:opacity-40"
          :class="isDark ? 'text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:bg-l4'"
          :disabled="loading || !(entry.hasNext || (entry.page || 1) < (entry.totalPages || 1))"
          @click="emit('page-change', (entry.page || 1) + 1)">
          <i class="ri-arrow-right-s-line text-[16px]" />
        </button>
      </div>
    </div>
  </div>
</template>
