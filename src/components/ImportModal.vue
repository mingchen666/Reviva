<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSpacesStore } from '@/stores/spaces'

const props = defineProps({
  show: Boolean,
})
const emit = defineEmits(['update:show'])

const appStore = useAppStore()
const spacesStore = useSpacesStore()

const isDark = computed(() => appStore.isDark)
const targetSpaceId = ref(spacesStore.spaces[0]?.id || 'new')
const newSpaceName = ref('')
const folderMode = ref('same') // same / split
const fileQueue = ref([])
const isDragging = ref(false)

function handleDrop(e) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files) addFiles(files)
}

function handleFileSelect() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = '.pdf,.docx,.txt,.md,.markdown'
  input.onchange = (e) => {
    if (e.target.files) addFiles(e.target.files)
  }
  input.click()
}

function handleFolderSelect() {
  const input = document.createElement('input')
  input.type = 'file'
  input.webkitdirectory = true
  input.onchange = (e) => {
    if (e.target.files) addFiles(e.target.files)
  }
  input.click()
}

function addFiles(fileList) {
  const supported = ['pdf', 'docx', 'txt', 'md', 'markdown']
  for (const file of fileList) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (supported.includes(ext)) {
      fileQueue.value.push({
        id: Date.now() + Math.random(),
        name: file.name,
        type: ext,
        size: file.size,
        path: file.path || '',
        status: 'pending',
        progress: 0,
      })
    }
  }
}

function removeFromQueue(id) {
  fileQueue.value = fileQueue.value.filter((f) => f.id !== id)
}

async function startImport() {
  if (fileQueue.value.length === 0) return

  let spaceId = targetSpaceId.value
  if (spaceId === 'new') {
    const name = newSpaceName.value || '新知识库'
    spacesStore.addSpace({ name })
    spaceId = spacesStore.spaces[spacesStore.spaces.length - 1].id
  }

  for (const file of fileQueue.value) {
    file.status = 'uploading'
    file.progress = 0

    // Simulate upload
    for (let i = 0; i <= 100; i += 20) {
      await new Promise((r) => setTimeout(r, 200))
      file.progress = i
    }

    file.status = 'done'
    spacesStore.addDocToSpace(spaceId, {
      name: file.name,
      type: file.type,
      size: file.size,
      status: 'pending',
    })
  }

  fileQueue.value = []
  emit('update:show', false)
}

const statusLabels = { pending: '待上传', uploading: '上传中', done: '完成', failed: '失败' }
</script>

<template>
  <n-modal
    v-model:show="props.show"
    preset="card"
    title="导入资料"
    style="max-width: 560px; max-height: 80vh"
    :bordered="!isDark"
    @update:show="emit('update:show', $event)">
    <!-- Drop Zone -->
    <div
      class="rounded-xl p-6 text-center cursor-pointer border-2 border-dashed transition-all mb-4"
      :class="
        isDragging
          ? isDark
            ? 'border-brand-400 bg-brand-400/5'
            : 'border-brand-400 bg-brand-50'
          : isDark
            ? 'border-d4 bg-d3 hover:border-brand-400/30'
            : 'border-bdrF bg-l3 hover:border-brand-200'
      "
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
      @click="handleFileSelect">
      <i class="ri-cloud-line text-[32px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
      <p class="mt-2 text-[13px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">拖拽文件到此处</p>
      <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">支持 PDF / DOCX / TXT / Markdown</p>
    </div>

    <!-- Select buttons -->
    <div class="flex items-center gap-2 mb-4">
      <button
        class="flex-1 px-3 py-2.5 rounded-xl text-[12px] font-medium flex items-center justify-center gap-2"
        :class="
          isDark
            ? 'bg-d3 border border-bdr hover:border-brand-400/30 text-wt-sub'
            : 'bg-l3 border border-bdrF hover:border-brand-200 text-lt-sub'
        "
        @click="handleFileSelect">
        <i class="ri-file-line text-[14px]" />
        选择文件
      </button>
      <button
        class="flex-1 px-3 py-2.5 rounded-xl text-[12px] font-medium flex items-center justify-center gap-2"
        :class="
          isDark
            ? 'bg-d3 border border-bdr hover:border-brand-400/30 text-wt-sub'
            : 'bg-l3 border border-bdrF hover:border-brand-200 text-lt-sub'
        "
        @click="handleFolderSelect">
        <i class="ri-folder-3-line text-[14px]" />
        选择文件夹
      </button>
    </div>

    <!-- Target Space -->
    <div class="mb-4">
      <div class="text-[11px] font-semibold mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">目标知识库</div>
      <n-select
        v-model:value="targetSpaceId"
        :options="[
          ...spacesStore.spaces.map((s) => ({ label: s.name, value: s.id })),
          { label: '新建知识库', value: 'new' },
        ]"
        size="small" />
      <n-input
        v-if="targetSpaceId === 'new'"
        v-model:value="newSpaceName"
        placeholder="新知识库名称"
        size="small"
        class="mt-2" />
    </div>

    <!-- File Queue -->
    <div v-if="fileQueue.length > 0" class="mb-4">
      <div class="text-[11px] font-semibold mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
        文件队列（{{ fileQueue.length }}）
      </div>
      <div class="max-h-[200px] overflow-y-auto space-y-1.5">
        <div
          v-for="file in fileQueue"
          :key="file.id"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg"
          :class="isDark ? 'bg-d3' : 'bg-l3'">
          <i class="ri-file-line text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
          <div class="flex-1 min-w-0">
            <div class="text-[11px] truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ file.name }}</div>
            <div
              v-if="file.status === 'uploading'"
              class="mt-1 h-1 rounded-full overflow-hidden"
              :class="isDark ? 'bg-d4' : 'bg-l4'">
              <div class="h-full bg-brand-400 rounded-full transition-all" :style="`width: ${file.progress}%`" />
            </div>
          </div>
          <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            {{ statusLabels[file.status] }}
          </span>
          <button
            v-if="file.status === 'pending'"
            class="text-[10px]"
            :class="isDark ? 'text-wt-dim hover:text-red-400' : 'text-lt-aux hover:text-red-400'"
            @click="removeFromQueue(file.id)">
            <i class="ri-close-line" />
          </button>
        </div>
      </div>
    </div>

    <template #action>
      <div class="flex justify-end gap-2">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" :disabled="fileQueue.length === 0" @click="startImport">
          开始导入 ({{ fileQueue.length }})
        </n-button>
      </div>
    </template>
  </n-modal>
</template>
