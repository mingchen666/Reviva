<script setup>
import { reactive, ref, watch } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  externalError: { type: String, default: '' },
})

const emit = defineEmits(['close', 'create'])
const form = reactive({ name: '', description: '' })
const error = ref('')

watch(() => props.show, (show) => {
  if (show) {
    form.name = ''
    form.description = ''
    error.value = ''
  }
})

function submit() {
  const name = form.name.trim()
  if (!name) {
    error.value = '请输入 Wiki 名称'
    return
  }
  emit('create', { name, description: form.description.trim() })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-[70] flex items-center justify-center bg-black/35" @click.self="emit('close')">
      <div class="w-[420px] rounded-xl border shadow-2xl p-4" :class="isDark ? 'bg-d2 border-bdr text-wt-main' : 'bg-white border-bdrF text-lt-main'">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500'">
              <i class="ri-book-3-line text-[16px]" />
            </div>
            <span class="text-[14px] font-semibold">新建 Wiki</span>
          </div>
          <button class="h-7 w-7 rounded-md" :class="isDark ? 'hover:bg-white/5' : 'hover:bg-l4'" @click="emit('close')">
            <i class="ri-close-line" />
          </button>
        </div>

        <div class="space-y-3">
          <label class="block">
            <span class="block text-[11px] mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">名称</span>
            <input
              v-model="form.name"
              class="w-full h-9 px-3 rounded-lg text-[13px] outline-none border"
              :class="isDark ? 'bg-d0 border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/50' : 'bg-l2 border-bdrL text-lt-main placeholder-lt-aux focus:border-brand-400'"
              placeholder="例如：产品调研 Wiki"
              @keyup.enter="submit" />
          </label>

          <label class="block">
            <span class="block text-[11px] mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">描述</span>
            <textarea
              v-model="form.description"
              class="w-full h-20 px-3 py-2 rounded-lg text-[13px] outline-none border resize-none"
              :class="isDark ? 'bg-d0 border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/50' : 'bg-l2 border-bdrL text-lt-main placeholder-lt-aux focus:border-brand-400'"
              placeholder="这个 Wiki 用来整理什么资料？" />
          </label>
        </div>

        <p v-if="error || externalError" class="mt-3 text-[12px] text-red-500">{{ error || externalError }}</p>

        <div class="mt-5 flex items-center justify-end gap-2">
          <button class="px-3 h-8 rounded-lg text-[12px]" :class="isDark ? 'text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:bg-l4'" @click="emit('close')">取消</button>
          <button class="px-4 h-8 rounded-lg text-[12px] font-medium" :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'" @click="submit">创建</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
