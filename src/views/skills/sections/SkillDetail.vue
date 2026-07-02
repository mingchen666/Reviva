<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import md, { parseFrontmatter } from '@/utils/markdown'
import TreeItem from './TreeItem.vue'

const props = defineProps({
  skill: Object,
  isDark: Boolean,
})

const emit = defineEmits(['edit', 'delete'])

const fileTree = ref([])
const expandedDirs = ref({})
const selectedPath = ref('')
const fileContent = ref('')
const fileLoading = ref(false)

async function loadFileTree() {
  if (!window.electronAPI?.skill?.listFiles) return
  const result = await window.electronAPI.skill.listFiles(props.skill.id)
  if (result.success) {
    fileTree.value = result.data
    // If directory is empty or missing, try to install the skill to disk first
    if (!result.data.length && props.skill.id && window.electronAPI?.skill?.install) {
      const installData = {
        ...props.skill,
        promptContent: props.skill.promptContent || props.skill.prompt_content || props.skill.prompt_template || '',
        description: props.skill.desc || props.skill.description || '',
      }
      try {
        await window.electronAPI.skill.install(props.skill.id, JSON.parse(JSON.stringify(installData)))
        const retry = await window.electronAPI.skill.listFiles(props.skill.id)
        if (retry.success) fileTree.value = retry.data
      } catch (e) { /* install failed, show empty state */ }
    }
    setAllExpanded(fileTree.value)
    const first = findFirstPreviewable(fileTree.value)
    if (first) selectFile(first.path, true)
  }
}

function setAllExpanded(items) {
  for (const item of items) {
    if (item.isDirectory) {
      expandedDirs.value[item.path] = true
      if (item.children) setAllExpanded(item.children)
    }
  }
}

function findFirstPreviewable(items) {
  for (const item of items) {
    if (item.isDirectory) {
      const found = findFirstPreviewable(item.children || [])
      if (found) return found
    }
    if (item.previewable) return item
  }
  return null
}

function isExpanded(p) { return expandedDirs.value[p] === true }
function toggleDir(p) { expandedDirs.value[p] = !isExpanded(p) }

async function selectFile(relPath, previewable) {
  if (!previewable) return
  selectedPath.value = relPath
  fileLoading.value = true
  if (!window.electronAPI?.skill?.readFile) { fileLoading.value = false; return }
  const result = await window.electronAPI.skill.readFile(props.skill.id, relPath)
  fileContent.value = result.success ? result.data : ''
  fileLoading.value = false
}

const isMarkdown = computed(() => selectedPath.value.endsWith('.md') || selectedPath.value.endsWith('.markdown'))
const parsed = computed(() => isMarkdown.value ? parseFrontmatter(fileContent.value) : { meta: null, body: '' })
const frontmatter = computed(() => parsed.value.meta)
const renderedMd = computed(() => isMarkdown.value ? md.render(parsed.value.body) : '')

onMounted(() => loadFileTree())
watch(() => props.skill?.id, () => { fileTree.value = []; selectedPath.value = ''; fileContent.value = ''; loadFileTree() })
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- Header bar -->
    <div class="h-10 flex items-center justify-between px-5 shrink-0"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2.5">
        <span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ skill.name }}</span>
        <span v-if="skill.source === 'platform'" class="ctx-pill" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">平台</span>
        <span v-else-if="skill.builtin" class="ctx-pill" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">内置</span>
        <span v-else class="ctx-pill" :class="isDark ? 'bg-agent-400/8 text-agent-400 border border-agent-400/20' : 'bg-agent-50 text-agent-500 border border-agent-100'">自定义</span>
        <span v-if="skill.author" class="ctx-pill" :class="isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF'">
          {{ skill.author }}
        </span>
        <span v-if="skill.usedBy && skill.usedBy.length" class="ctx-pill" :class="isDark ? 'bg-agent-400/8 text-agent-400 border border-agent-400/20' : 'bg-agent-50 text-agent-500 border border-agent-100'">
          {{ skill.usedBy.length }} Agent 使用
        </span>
      </div>
      <div v-if="!skill.builtin && skill.source !== 'platform'" class="flex items-center gap-1.5">
        <button @click="emit('edit')" class="ctx-pill cursor-pointer" :class="isDark ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20 hover:bg-brand-400/15' : 'text-brand-500 bg-brand-50 border border-brand-100 hover:bg-brand-100'"><i class="ri-edit-line text-[10px]" /> 编辑</button>
        <button @click="emit('delete')" class="ctx-pill cursor-pointer" :class="isDark ? 'text-red-400 bg-red-400/8 border border-red-400/20 hover:bg-red-400/15' : 'text-red-500 bg-red-50 border border-red-100 hover:bg-red-100'"><i class="ri-delete-bin-line text-[10px]" /> 删除</button>
      </div>
    </div>

    <!-- Body: padding around the split panels so they don't touch edges -->
    <div class="flex-1 overflow-hidden p-3">
      <div class="h-full flex overflow-hidden rounded-xl"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <!-- LEFT: file content -->
        <div class="flex-1 flex flex-col overflow-hidden min-w-0">
          <!-- Path breadcrumb -->
          <div class="h-7 flex items-center px-4 shrink-0"
            :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
            <span class="text-[11px] font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ skill.id }}/{{ selectedPath }}</span>
          </div>
          <!-- Content with inner scroll -->
          <div class="flex-1 overflow-y-auto min-h-0 px-5 py-4 thin-scroll">
            <div v-if="fileLoading" class="flex items-center justify-center py-12">
              <i class="ri-loader-4-line text-[18px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            </div>
            <div v-else-if="selectedPath && isMarkdown && fileContent" class="max-w-5xl markdown-content markdown-content--compact" :class="isDark ? 'markdown-content--dark' : 'markdown-content--light'">
              <!-- Frontmatter card -->
              <div v-if="frontmatter" class="fm-card mb-5 rounded-xl p-4" :class="isDark ? 'bg-d0/80 border border-bdr' : 'bg-l2 border border-bdrF'">
                <div class="flex items-center gap-1.5 mb-3">
                  <i class="ri-settings-3-line text-[12px] text-brand-400" />
                  <span class="text-[11px] font-bold tracking-wide uppercase" :class="isDark ? 'text-brand-400' : 'text-brand-500'">Frontmatter</span>
                </div>
                <div class="grid grid-cols-2 gap-x-6 gap-y-2">
                  <template v-for="(val, key) in frontmatter" :key="key">
                    <div class="flex flex-col">
                      <span class="text-[10px] font-medium uppercase tracking-wider" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ key }}</span>
                      <span class="text-[12px] mt-0.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ val }}</span>
                    </div>
                  </template>
                </div>
              </div>
              <!-- Markdown body -->
              <div v-html="renderedMd" />
            </div>
            <div v-else-if="selectedPath && !isMarkdown && fileContent">
              <pre class="code-block rounded-xl text-[12px] leading-[1.6] font-mono overflow-x-auto thin-scroll"
                :class="isDark ? 'bg-d0 text-wt-sub' : 'bg-l2 text-lt-sub'">{{ fileContent }}</pre>
            </div>
            <div v-else class="flex items-center justify-center py-12">
              <p class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">从右侧目录选择文件</p>
            </div>
          </div>
        </div>

        <!-- RIGHT: file tree (wider) -->
        <div class="w-[260px] shrink-0 flex flex-col overflow-hidden min-h-0"
          :class="isDark ? 'border-l border-d4' : 'border-l border-bdrL'">
          <div class="h-7 flex items-center px-4 shrink-0"
            :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
            <i class="ri-folder-open-line text-[11px] text-brand-400" />
            <span class="text-[11px] font-medium ml-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ skill.id }}/</span>
          </div>
          <div class="flex-1 overflow-y-auto min-h-0 py-1.5 px-2 thin-scroll">
            <TreeItem v-for="item in fileTree" :key="item.path"
              :item="item" :is-dark="isDark" :depth="0"
              :expanded="isExpanded(item.path)"
              :selected-path="selectedPath"
              @toggle-dir="toggleDir"
              @select-file="selectFile" />
            <div v-if="!fileTree.length" class="py-6 text-center">
              <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">目录未安装到磁盘</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Scrollbar: only visible on hover, thin and subtle */
.thin-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }
.thin-scroll:hover { scrollbar-color: rgba(108,138,255,0.25) rgba(108,138,255,0.08); }
.thin-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
.thin-scroll::-webkit-scrollbar-track { background: transparent; }
.thin-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
.thin-scroll:hover::-webkit-scrollbar-thumb { background: rgba(108,138,255,0.25); }

/* Code block for json/js/py etc */
.code-block {
  padding: 16px 20px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  tab-size: 2;
}

/* Frontmatter card */
.fm-card { backdrop-filter: blur(4px); }

</style>
