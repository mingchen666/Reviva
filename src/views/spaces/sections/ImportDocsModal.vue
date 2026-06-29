<script setup>
import { computed, ref, watch } from 'vue'
import { fmtBytes } from './kbFormat'

const props = defineProps({
  show: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  kbs: { type: Array, default: () => [] },
  targetId: { type: String, default: '' },
})

const emit = defineEmits(['close', 'submit'])

const selectedKbId = ref('')
const files = ref([])
const inputRef = ref(null)

const targetOptions = computed(() => props.kbs.filter(k => !k.isReadonly && !k.isSystem))
const selectedKb = computed(() => targetOptions.value.find(k => k.id === selectedKbId.value) || null)
const totalSize = computed(() => files.value.reduce((sum, file) => sum + (file.size || 0), 0))

function reset() {
  selectedKbId.value = props.targetId || targetOptions.value[0]?.id || ''
  files.value = []
  if (inputRef.value) inputRef.value.value = ''
}

function pickFiles(event) {
  files.value = Array.from(event.target.files || [])
}

function submit() {
  if (props.busy || !selectedKbId.value || files.value.length === 0) return
  emit('submit', { kbId: selectedKbId.value, files: files.value })
}

watch(() => props.show, (show) => {
  if (show) reset()
})

watch(() => props.targetId, (id) => {
  if (props.show && id) selectedKbId.value = id
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/45 backdrop-blur-sm" @click="emit('close')" />
      <div
        class="relative w-full max-w-[460px] rounded-xl overflow-hidden shadow-xl"
        :class="isDark ? 'bg-d2 border border-bdr shadow-black/50' : 'bg-l2 border border-bdrF'">
        <div class="px-5 py-4 border-b flex items-center justify-between" :class="isDark ? 'border-d4 bg-d1/60' : 'border-bdrF bg-l3/50'">
          <div>
            <h3 class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">导入文档</h3>
            <p class="mt-1 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">支持多文件上传，重复文件会自动重命名</p>
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
            <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">目标知识库</span>
            <select
              v-model="selectedKbId"
              class="mt-1.5 w-full h-9 rounded-lg px-3 text-[12.5px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-main focus:border-brand-400/45' : 'bg-l3 border border-bdrF text-lt-main focus:border-brand-400'">
              <option v-for="kb in targetOptions" :key="kb.id" :value="kb.id">
                {{ kb.name }}
              </option>
            </select>
          </label>

          <div
            class="rounded-xl border border-dashed px-5 py-8 text-center cursor-pointer transition-colors"
            :class="isDark ? 'border-d4 hover:border-brand-400/35 bg-d0/35' : 'border-bdrF hover:border-brand-300 bg-l3/45'"
            @click="inputRef?.click()">
            <input ref="inputRef" type="file" multiple class="hidden" @change="pickFiles" />
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
              :class="isDark ? 'bg-d1' : 'bg-l2'">
              <i class="ri-upload-cloud-line text-[26px]" :class="isDark ? 'text-brand-300' : 'text-brand-500'" />
            </div>
            <p class="text-[12.5px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              {{ files.length ? `已选择 ${files.length} 个文件` : '选择要上传的文件' }}
            </p>
            <p class="mt-1 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ files.length ? `总大小 ${fmtBytes(totalSize)}` : '点击此处打开文件选择器' }}
            </p>
          </div>

          <div v-if="files.length" class="max-h-32 overflow-y-auto custom-scrollbar rounded-lg border" :class="isDark ? 'border-d4' : 'border-bdrF'">
            <div
              v-for="file in files"
              :key="file.name + file.size"
              class="flex items-center gap-2 px-3 py-2 border-b last:border-b-0"
              :class="isDark ? 'border-d4' : 'border-bdrF'">
              <i class="ri-file-line text-[13px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
              <span class="flex-1 min-w-0 truncate text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ file.name }}</span>
              <span class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ fmtBytes(file.size) }}</span>
            </div>
          </div>

          <div
            v-if="targetOptions.length === 0"
            class="rounded-lg border px-3 py-2 text-[11.5px]"
            :class="isDark ? 'text-wt-aux bg-d1 border-d4' : 'text-lt-aux bg-l3 border-bdrF'">
            当前没有可写的用户知识库。系统知识库为只读，不能上传文档。
          </div>

          <div
            v-else-if="selectedKb"
            class="rounded-lg border px-3 py-2 text-[11.5px] flex items-center gap-2"
            :class="isDark ? 'text-wt-aux bg-d1 border-d4' : 'text-lt-aux bg-l3 border-bdrF'">
            <i :class="[selectedKb.icon || 'ri-folder-3-line', 'text-[13px]']" :style="`color:${selectedKb.color || '#6C8AFF'}`" />
            上传到 {{ selectedKb.name }}
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
            :disabled="busy || !selectedKbId || files.length === 0"
            :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'"
            @click="submit">
            <i :class="busy ? 'ri-loader-4-line animate-spin' : 'ri-upload-cloud-line'" class="text-[13px]" />
            上传
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
