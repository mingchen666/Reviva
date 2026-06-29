<script setup>
import { reactive, watch } from 'vue'
import IconPicker from '@/components/IconPicker.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'create'])

const colorOptions = ['#6C8AFF', '#A78BFA', '#4ADE80', '#FACC15', '#F87171', '#3B82F6', '#EC4899', '#8B5CF6']

const form = reactive({
  title: '',
  description: '',
  icon: 'ri-folder-3-line',
  color: '#6C8AFF',
})

function reset() {
  form.title = ''
  form.description = ''
  form.icon = 'ri-folder-3-line'
  form.color = '#6C8AFF'
}

function submit() {
  const title = form.title.trim()
  if (!title || props.busy) return
  emit('create', {
    title,
    description: form.description.trim(),
    type: 'document',
    icon: form.icon,
    color: form.color,
  })
}

watch(() => props.show, (show) => {
  if (show) reset()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/45 backdrop-blur-sm" @click="emit('close')" />
      <div
        class="relative w-full max-w-[420px] rounded-xl overflow-hidden shadow-xl"
        :class="isDark ? 'bg-d2 border border-bdr shadow-black/50' : 'bg-l2 border border-bdrF'">
        <div class="px-5 py-4 border-b flex items-center justify-between" :class="isDark ? 'border-d4 bg-d1/60' : 'border-bdrF bg-l3/50'">
          <div>
            <h3 class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">新建知识库</h3>
            <p class="mt-1 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">创建后即可上传文档资料</p>
          </div>
          <button
            class="w-7 h-7 rounded-lg flex items-center justify-center"
            :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
            @click="emit('close')">
            <i class="ri-close-line text-[15px]" />
          </button>
        </div>

        <div class="p-5 space-y-4">
          <label class="block">
            <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">名称</span>
            <input
              v-model="form.title"
              class="mt-1.5 w-full h-9 rounded-lg px-3 text-[12.5px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/45' : 'bg-l3 border border-bdrF text-lt-main placeholder-lt-aux focus:border-brand-400'"
              placeholder="例如：课程资料、项目文档"
              @keydown.enter.prevent="submit" />
          </label>

          <label class="block">
            <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">描述</span>
            <textarea
              v-model="form.description"
              rows="3"
              class="mt-1.5 w-full rounded-lg px-3 py-2 text-[12.5px] outline-none resize-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/45' : 'bg-l3 border border-bdrF text-lt-main placeholder-lt-aux focus:border-brand-400'"
              placeholder="补充这组资料的用途" />
          </label>

          <div>
            <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">图标</span>
            <IconPicker v-model="form.icon" class="mt-2" :is-dark="isDark" />
          </div>

          <div>
            <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">颜色</span>
            <div class="mt-2 flex items-center gap-2">
              <button
                v-for="color in colorOptions"
                :key="color"
                class="w-7 h-7 rounded-lg transition-transform"
                :class="form.color === color ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-transparent scale-105' : ''"
                :style="{ backgroundColor: color }"
                @click="form.color = color" />
            </div>
          </div>
        </div>

        <div class="px-5 py-4 border-t flex items-center justify-end gap-2" :class="isDark ? 'border-d4 bg-d1/60' : 'border-bdrF bg-l3/50'">
          <button
            class="h-8 px-3 rounded-lg text-[12px] font-medium"
            :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
            @click="emit('close')">
            取消
          </button>
          <button
            class="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-60"
            :disabled="busy || !form.title.trim()"
            :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'"
            @click="submit">
            <i :class="busy ? 'ri-loader-4-line animate-spin' : 'ri-check-line'" class="text-[13px]" />
            创建
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
