<script setup>
import { computed } from 'vue'
import KbDocumentTable from './KbDocumentTable.vue'
import KbEmptyGuide from './KbEmptyGuide.vue'
import { fmtBytes, fmtDate, isReadonlyKb } from './kbFormat'

const props = defineProps({
  isDark: { type: Boolean, default: false },
  kb: { type: Object, default: null },
  activeScope: { type: String, default: 'mine' },
  docs: { type: Array, default: () => [] },
  entry: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  statusFilter: { type: String, default: 'all' },
  joinBusy: { type: Boolean, default: false },
})

const emit = defineEmits([
  'create',
  'import',
  'refresh',
  'delete-doc',
  'page-change',
  'join',
  'leave',
  'edit-kb',
  'delete-kb',
  'update:statusFilter',
])

const readonly = computed(() => isReadonlyKb(props.kb))
const emptyTitle = computed(() => {
  if (!props.kb) return props.activeScope === 'system' ? '选择一个系统知识库' : '选择一个知识库'
  if (props.statusFilter !== 'all') return '该筛选条件下无文档'
  return readonly.value ? '暂无可查看文档' : '暂无文档，导入资料后开始使用'
})

</script>

<template>
  <section class="flex-1 min-w-0 min-h-0 flex flex-col" :class="isDark ? 'bg-d2' : 'bg-l1'">
    <KbEmptyGuide
      v-if="!kb"
      :is-dark="isDark"
      :active-scope="activeScope"
      @create="emit('create')" />

    <template v-else>
      <div class="shrink-0 border-b px-8 pt-8 pb-6" :class="isDark ? 'bg-d2 border-d4' : 'bg-l1 border-bdrF'">
        <div class="flex items-start justify-between gap-5">
          <div class="flex items-start gap-3 min-w-0">
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              :class="isDark ? 'bg-d1 border border-d4' : 'bg-brand-50 border border-brand-100'"
              :style="`box-shadow: inset 0 0 0 1px ${kb.color || '#6C8AFF'}22`">
              <i :class="[kb.icon || 'ri-folder-3-line', 'text-[20px]']" :style="`color:${kb.color || '#6C8AFF'}`" />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 min-w-0">
                <h2 class="text-[16px] font-semibold tracking-tight truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                  {{ kb.name }}
                </h2>
                <span
                  v-if="kb.isSystem"
                  class="px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase leading-none"
                  :class="isDark ? 'text-wt-aux bg-white/5 border-white/8' : 'text-slate-600 bg-slate-100 border-slate-200'">
                  Sys
                </span>
                <span
                  v-if="readonly"
                  class="px-1.5 py-0.5 rounded text-[10px] font-medium border leading-none"
                  :class="isDark ? 'text-wt-aux bg-white/4 border-white/8' : 'text-slate-500 bg-slate-50 border-slate-200'">
                  只读
                </span>
                <span
                  v-if="kb.isSystem"
                  class="px-1.5 py-0.5 rounded text-[10px] font-medium border leading-none"
                  :class="
                    kb.isJoined
                      ? isDark
                        ? 'text-emerald-300 bg-emerald-400/8 border-emerald-400/18'
                        : 'text-emerald-700 bg-emerald-50 border-emerald-100'
                      : isDark
                        ? 'text-wt-dim bg-white/4 border-white/8'
                        : 'text-slate-500 bg-slate-50 border-slate-200'
                  ">
                  {{ kb.isJoined ? '已加入' : '未加入' }}
                </span>
              </div>
              <p
                class="mt-1 text-[12.5px] leading-relaxed max-w-[680px] overflow-hidden"
                :class="isDark ? 'text-wt-aux' : 'text-lt-sub'"
                style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                {{ kb.description || (kb.isSystem ? '系统共享资料库' : '暂无描述') }}
              </p>
              <div class="mt-3 flex items-center gap-3 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                <span><i class="ri-file-list-3-line mr-1" />{{ kb.docCount || entry.total || 0 }} 文档</span>
                <span v-if="kb.usedBytes"><i class="ri-hard-drive-2-line mr-1" />{{ fmtBytes(kb.usedBytes) }}</span>
                <span v-if="kb.updatedAt"><i class="ri-time-line mr-1" />{{ fmtDate(kb.updatedAt) }}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="kb.isSystem && !kb.isJoined"
              class="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60"
              :disabled="joinBusy"
              :class="isDark ? 'bg-white text-d0 hover:bg-zinc-200' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'"
              @click="emit('join', kb)">
              <i :class="joinBusy ? 'ri-loader-4-line animate-spin' : 'ri-add-line'" class="text-[13px]" />
              加入
            </button>
            <button
              v-else-if="kb.isSystem && kb.isJoined"
              class="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60"
              :disabled="joinBusy"
              :class="isDark ? 'text-wt-aux bg-d1 hover:text-wt-sub hover:bg-d3' : 'text-slate-600 bg-white border border-slate-200 hover:text-slate-900 hover:bg-slate-50'"
              @click="emit('leave', kb)">
              <i :class="joinBusy ? 'ri-loader-4-line animate-spin' : 'ri-close-line'" class="text-[13px]" />
              移除
            </button>
            <button
              class="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
              :class="isDark ? 'text-wt-aux bg-d1 hover:text-wt-sub hover:bg-d3' : 'text-slate-600 bg-white border border-slate-200 hover:text-slate-900 hover:bg-slate-50'"
              @click="emit('refresh')">
              <i class="ri-refresh-line text-[13px]" :class="loading ? 'animate-spin' : ''" />
              刷新
            </button>
            <button
              v-if="!readonly"
              class="h-8 px-3 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-colors"
              :class="isDark ? 'text-wt-aux bg-d1 hover:text-wt-sub hover:bg-d3' : 'text-slate-600 bg-white border border-slate-200 hover:text-slate-900 hover:bg-slate-50'"
              @click="emit('edit-kb', kb)">
              <i class="ri-edit-line text-[13px]" />
              编辑
            </button>
            <button
              v-if="!readonly"
              class="h-8 px-3 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-all active:scale-[0.98]"
              :class="isDark ? 'bg-white text-d0 hover:bg-zinc-200' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'"
              @click="emit('import', kb)">
              <i class="ri-upload-cloud-line text-[13px]" />
              导入
            </button>
            <button
              v-if="!readonly"
              class="h-8 w-8 rounded-md flex items-center justify-center transition-colors"
              :class="isDark ? 'text-wt-dim bg-d1 hover:text-red-400 hover:bg-red-400/8' : 'text-lt-aux bg-l3 hover:text-red-600 hover:bg-red-50'"
              title="删除知识库"
              @click="emit('delete-kb', kb)">
              <i class="ri-delete-bin-line text-[14px]" />
            </button>
          </div>
        </div>

        <div
          v-if="readonly"
          class="mt-3 rounded-lg border px-3 py-2 text-[11.5px] flex items-center gap-2"
          :class="isDark ? 'text-wt-aux bg-d1 border-d4' : 'text-lt-aux bg-l3 border-bdrF'">
          <i class="ri-lock-line text-[13px]" />
          系统知识库为只读，可查看文档并参与检索，不能上传或删除文档。
        </div>

      </div>

      <div class="flex-1 min-h-0 p-8">
        <div
          class="h-full rounded-lg overflow-hidden border shadow-sm"
          :class="isDark ? 'border-d4 bg-d2 shadow-black/10' : 'border-bdrF bg-white'">
          <KbDocumentTable
            :is-dark="isDark"
            :docs="docs"
            :entry="entry"
            :loading="loading"
            :error="error"
            :readonly="readonly"
            :empty-text="emptyTitle"
            @delete="emit('delete-doc', $event)"
            @refresh="emit('refresh')"
            @page-change="emit('page-change', $event)" />
        </div>
      </div>
    </template>
  </section>
</template>
