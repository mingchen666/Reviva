<script setup>
import { computed, reactive, watch } from 'vue'
import IconPicker from '@/components/IconPicker.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  kb: { type: Object, default: null },
  mode: { type: String, default: 'edit' },
})

const emit = defineEmits(['close', 'save'])

const colorOptions = ['#6C8AFF', '#A78BFA', '#4ADE80', '#FACC15', '#F87171', '#3B82F6', '#EC4899', '#8B5CF6']

const form = reactive({
  title: '',
  description: '',
  icon: 'ri-folder-3-line',
  color: '#6C8AFF',
})

const isRenameMode = computed(() => props.mode === 'rename')
const modalTitle = computed(() => (isRenameMode.value ? '重命名知识库' : '编辑知识库'))
const modalDesc = computed(() => (isRenameMode.value ? '修改侧边栏和详情页显示的知识库名称' : '调整名称、描述和显示样式'))
const submitText = computed(() => (isRenameMode.value ? '重命名' : '保存'))

function hydrate() {
  form.title = props.kb?.name || props.kb?.title || ''
  form.description = props.kb?.description || ''
  form.icon = props.kb?.icon || 'ri-folder-3-line'
  form.color = props.kb?.color || '#6C8AFF'
}

function submit() {
  const title = form.title.trim()
  if (!props.kb || !title || props.busy) return
  emit('save', {
    id: props.kb.id,
    payload: {
      title,
      description: form.description.trim(),
      icon: form.icon,
      color: form.color,
    },
  })
}

watch(() => props.show, (show) => {
  if (show) hydrate()
})

watch(() => props.kb?.id, () => {
  if (props.show) hydrate()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/45 backdrop-blur-sm" @click="emit('close')" />
      <div
        class="relative w-full max-w-[420px] rounded-xl overflow-hidden shadow-xl"
        :class="isDark ? 'bg-d2 border border-bdr shadow-black/50' : 'bg-white border border-slate-200'">
        <div class="px-5 py-4 border-b flex items-center justify-between" :class="isDark ? 'border-d4 bg-d1/60' : 'border-slate-100 bg-slate-50'">
          <div>
            <h3 class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-slate-900'">{{ modalTitle }}</h3>
            <p class="mt-1 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-slate-500'">{{ modalDesc }}</p>
          </div>
          <button
            class="w-7 h-7 rounded-md flex items-center justify-center"
            :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'"
            @click="emit('close')">
            <i class="ri-close-line text-[15px]" />
          </button>
        </div>

        <div class="p-5 space-y-4">
          <label class="block">
            <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-slate-700'">名称</span>
            <input
              v-model="form.title"
              class="mt-1.5 w-full h-9 rounded-md px-3 text-[12.5px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/45' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500'"
              placeholder="知识库名称"
              @keydown.enter.prevent="submit" />
          </label>

          <label v-if="!isRenameMode" class="block">
            <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-slate-700'">描述</span>
            <textarea
              v-model="form.description"
              rows="3"
              class="mt-1.5 w-full rounded-md px-3 py-2 text-[12.5px] outline-none resize-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/45' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500'"
              placeholder="补充这组资料的用途" />
          </label>

          <div v-if="!isRenameMode">
            <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-slate-700'">图标</span>
            <IconPicker v-model="form.icon" class="mt-2" :is-dark="isDark" />
          </div>

          <div v-if="!isRenameMode">
            <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-slate-700'">颜色</span>
            <div class="mt-2 flex items-center gap-2">
              <button
                v-for="color in colorOptions"
                :key="color"
                class="w-7 h-7 rounded-md transition-transform"
                :class="form.color === color ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent scale-105' : ''"
                :style="{ backgroundColor: color }"
                @click="form.color = color" />
            </div>
          </div>
        </div>

        <div class="px-5 py-4 border-t flex items-center justify-end gap-2" :class="isDark ? 'border-d4 bg-d1/60' : 'border-slate-100 bg-slate-50'">
          <button
            class="h-8 px-3 rounded-md text-[12px] font-medium"
            :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'"
            @click="emit('close')">
            取消
          </button>
          <button
            class="h-8 px-3 rounded-md text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-60"
            :disabled="busy || !form.title.trim()"
            :class="isDark ? 'bg-white text-d0 hover:bg-zinc-200' : 'bg-slate-900 text-white hover:bg-slate-800'"
            @click="submit">
            <i :class="busy ? 'ri-loader-4-line animate-spin' : 'ri-check-line'" class="text-[13px]" />
            {{ submitText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
