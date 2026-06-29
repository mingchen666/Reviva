<script setup>
import { ref } from 'vue'

const props = defineProps({
  isDark: Boolean,
})

const emit = defineEmits(['cancel', 'import'])

const isDragging = ref(false)
const importQueue = ref([])
const parseStatus = ref('idle') // idle | parsing | done | error

function handleDrop(e) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files) processZipFiles(files)
}

function handleFileSelect() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip'
  input.onchange = (e) => {
    if (e.target.files) processZipFiles(e.target.files)
  }
  input.click()
}

function processZipFiles(fileList) {
  for (const file of fileList) {
    if (file.name.endsWith('.zip')) {
      importQueue.value.push({
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        path: file.path || '',
        status: 'pending',
      })
    }
  }
}

function removeFromQueue(id) {
  importQueue.value = importQueue.value.filter(f => f.id !== id)
}

function startImport() {
  if (importQueue.value.length === 0) return
  parseStatus.value = 'parsing'
  // Simulate parsing — in real app, use JSZip to extract skill.json
  setTimeout(() => {
    parseStatus.value = 'done'
    // For demo, create a placeholder skill from each zip
    for (const file of importQueue.value) {
      emit('import', {
        name: file.name.replace('.zip', ''),
        desc: '从 ZIP 导入的 Skill',
        icon: 'ri-flashlight-line',
        color: '#6C8AFF',
        promptTemplate: '请基于 {{input}} 生成内容',
        outputTypes: ['Markdown'],
        detail: '从 ZIP 文件导入的 Skill，包含自定义提示词模板和资源配置。',
      })
    }
    importQueue.value = []
    parseStatus.value = 'idle'
  }, 1500)
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="emit('cancel')" />
      <div class="relative rounded-2xl overflow-hidden w-full max-w-[480px] max-h-[80vh] flex flex-col"
        :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrL shadow-xl'">

        <!-- Header -->
        <div class="px-5 py-3 flex justify-between items-center shrink-0"
          :class="isDark ? 'border-b border-d4 bg-d4/30' : 'border-b border-bdrL bg-l4/30'">
          <div class="flex items-center gap-2">
            <i class="ri-upload-cloud-line text-brand-400 text-[14px]" />
            <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">导入 Skill</span>
          </div>
          <button @click="emit('cancel')" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"><i class="ri-close-line text-[14px]" /></button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto">
          <div class="p-5 space-y-4">

            <!-- Drop Zone -->
            <div class="rounded-xl p-6 text-center cursor-pointer border-2 border-dashed transition-all"
              :class="isDragging ? (isDark ? 'border-brand-400 bg-brand-400/5' : 'border-brand-400 bg-brand-50') : (isDark ? 'border-d4 bg-d3 hover:border-brand-400/30' : 'border-bdrF bg-l3 hover:border-brand-200')"
              @dragover.prevent="isDragging = true" @dragleave="isDragging = false" @drop.prevent="handleDrop" @click="handleFileSelect">
              <i class="ri-upload-cloud-line text-[28px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
              <p class="mt-2 text-[13px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">拖拽 ZIP 文件到此处</p>
              <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">ZIP 内需包含 skill.json 定义文件</p>
            </div>

            <!-- ZIP Structure Guide -->
            <div class="rounded-xl p-3" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-2"><i class="ri-folder-zip-line text-brand-400 text-[13px]" /><span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">ZIP 结构约定</span></div>
              <div class="text-[11px] leading-relaxed font-mono" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                <div>├── skill.json <span class="text-[10px] opacity-60">（Skill 定义，必须）</span></div>
                <div>├── templates/ <span class="text-[10px] opacity-60">（提示词模板文件，可选）</span></div>
                <div>└── resources/ <span class="text-[10px] opacity-60">（附件资源，可选）</span></div>
              </div>
            </div>

            <!-- Queue -->
            <div v-if="importQueue.length > 0" class="space-y-1.5">
              <div class="text-[11px] font-semibold mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">文件队列（{{ importQueue.length }}）</div>
              <div v-for="file in importQueue" :key="file.id"
                class="flex items-center gap-2.5 px-3 py-2 rounded-lg" :class="isDark ? 'bg-d3' : 'bg-l3'">
                <i class="ri-folder-zip-line text-[12px] text-brand-400" />
                <div class="flex-1 min-w-0">
                  <div class="text-[11px] truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ file.name }}</div>
                </div>
                <button v-if="file.status === 'pending'" class="text-[10px]" :class="isDark ? 'text-wt-dim hover:text-red-400' : 'text-lt-aux hover:text-red-400'" @click="removeFromQueue(file.id)"><i class="ri-close-line" /></button>
              </div>
            </div>

          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 flex justify-end gap-2 shrink-0"
          :class="isDark ? 'border-t border-d4 bg-d4/30' : 'border-t border-bdrL bg-l4/30'">
          <button @click="emit('cancel')" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
          <button :disabled="importQueue.length === 0 || parseStatus === 'parsing'" @click="startImport"
            class="px-4 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
            :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
            <i class="ri-upload-cloud-line text-[12px]" /> 开始导入 ({{ importQueue.length }})
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>