<script setup>
import { computed, ref } from 'vue'

defineProps({ isDark: Boolean, busy: Boolean })
const emit = defineEmits(['cancel', 'import'])

const sessionId = ref('')
const sourceName = ref('')
const preview = ref(null)
const loading = ref(false)
const error = ref('')
const strategy = ref('update')
const originalId = ref('')

const platformConflictUnchanged = computed(() => preview.value?.conflict === 'platform' && preview.value.id === originalId.value)
const validId = computed(() => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(preview.value?.id || ''))
const canImport = computed(() => preview.value && validId.value && !platformConflictUnchanged.value && !loading.value)

async function pickSource(type) {
  error.value = ''
  loading.value = true
  try {
    const picked = await window.electronAPI?.skill?.pickImportSource?.(type)
    if (!picked?.success) {
      if (!picked?.canceled) error.value = picked?.error || '选择文件失败'
      return
    }
    if (!picked.sessionId || !picked.data) throw new Error('无法创建安全导入会话')
    sessionId.value = picked.sessionId
    sourceName.value = picked.sourceName || '已选择的 Skill'
    preview.value = picked.data
    originalId.value = picked.data.id
    strategy.value = picked.data.conflict === 'custom' ? 'update' : 'new'
  } catch (err) {
    sessionId.value = ''
    sourceName.value = ''
    preview.value = null
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function confirmImport() {
  if (!canImport.value) return
  emit('import', {
    sessionId: sessionId.value,
    options: {
      id: preview.value.id,
      name: preview.value.name,
      description: preview.value.description,
      icon: preview.value.icon,
      color: preview.value.color,
      category: preview.value.category,
      strategy: strategy.value,
    },
  })
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="emit('cancel')" />
      <div class="relative rounded-xl overflow-hidden w-full max-w-[620px] max-h-[86vh] flex flex-col"
        :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrL shadow-xl'">
        <div class="px-5 py-3 flex justify-between items-center shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <div class="flex items-center gap-2">
            <i class="ri-upload-cloud-line text-brand-400 text-[15px]" />
            <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">导入 Skill</span>
          </div>
          <button class="w-7 h-7 flex text-[20px] items-center justify-center" :class="isDark ? 'text-wt-aux hover:text-wt-main' : 'text-lt-aux hover:text-lt-main'" title="关闭" @click="emit('cancel')"><i class="ri-close-line " /></button>
        </div>

        <div class="flex-1 overflow-y-auto p-5 space-y-4">
          <div class="grid grid-cols-3 gap-2">
            <button class="h-[76px] flex flex-col items-center justify-center gap-1.5 rounded-lg border transition-colors"
              :class="isDark ? 'border-d4 bg-d0 hover:border-brand-400/40 text-wt-sub' : 'border-bdrF bg-l3 hover:border-brand-300 text-lt-sub'" @click="pickSource('zip')">
              <i class="ri-folder-zip-line text-[20px] text-brand-400" /><span class="text-[11px] font-semibold">ZIP 包</span>
            </button>
            <button class="h-[76px] flex flex-col items-center justify-center gap-1.5 rounded-lg border transition-colors"
              :class="isDark ? 'border-d4 bg-d0 hover:border-brand-400/40 text-wt-sub' : 'border-bdrF bg-l3 hover:border-brand-300 text-lt-sub'" @click="pickSource('folder')">
              <i class="ri-folder-open-line text-[20px] text-amber-400" /><span class="text-[11px] font-semibold">完整文件夹</span>
            </button>
            <button class="h-[76px] flex flex-col items-center justify-center gap-1.5 rounded-lg border transition-colors"
              :class="isDark ? 'border-d4 bg-d0 hover:border-brand-400/40 text-wt-sub' : 'border-bdrF bg-l3 hover:border-brand-300 text-lt-sub'" @click="pickSource('skill')">
              <i class="ri-file-text-line text-[20px] text-emerald-400" /><span class="text-[11px] font-semibold">单个 SKILL.md</span>
            </button>
          </div>

          <div v-if="loading" class="h-40 flex flex-col items-center justify-center gap-2">
            <i class="ri-loader-4-line animate-spin text-[22px] text-brand-400" />
            <span class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">正在解析和校验...</span>
          </div>

          <div v-else-if="preview" class="space-y-3">
            <div class="rounded-lg border p-4" :class="isDark ? 'border-d4 bg-d0' : 'border-bdrF bg-l3'">
              <div class="flex items-start gap-3 mb-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center text-[18px]" :style="{ backgroundColor: preview.color + '18', color: preview.color }">
                  <i v-if="preview.icon?.startsWith('ri-')" :class="preview.icon" />
                  <span v-else>{{ preview.icon }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <input v-model="preview.name" placeholder="Skill 名称"
                    class="w-full h-8 px-3 rounded-lg text-[13px] font-semibold outline-none transition-colors"
                    :class="isDark ? 'bg-d3 border border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-main placeholder-lt-aux focus:border-brand-400'" />
                  <input v-model="preview.description" placeholder="Skill 描述"
                    class="w-full mt-2 h-8 px-3 rounded-lg text-[12px] outline-none transition-colors"
                    :class="isDark ? 'bg-d3 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
                </div>
              </div>
              <label class="block text-[10px] mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">Skill ID</label>
              <input v-model="preview.id" placeholder="my-skill-id"
                class="w-full h-9 px-3 rounded-lg font-mono text-[12px] outline-none transition-colors"
                :class="isDark ? 'bg-d3 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
              <div v-if="preview.id && !validId" class="mt-1 text-[10px] text-red-400">ID 只能使用英文小写、数字和连字符</div>
              <div class="flex items-center gap-3 mt-3 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                <span><i class="ri-file-list-3-line mr-1" />{{ preview.fileCount }} 个条目</span>
                <span class="truncate"><i class="ri-folder-line mr-1" />{{ sourceName }}</span>
              </div>
            </div>

            <div v-if="preview.conflict === 'custom'" class="rounded-lg p-3" :class="isDark ? 'bg-amber-400/8 border border-amber-400/20' : 'bg-amber-50 border border-amber-200'">
              <div class="text-[11px] font-semibold text-amber-500 mb-2">检测到同 ID 的自定义 Skill</div>
              <div class="flex gap-2">
                <button class="px-3 py-1.5 rounded-md text-[10px] border" :class="strategy === 'update' ? 'border-amber-400 text-amber-500' : (isDark ? 'border-d4 text-wt-aux' : 'border-bdrF text-lt-aux')" @click="strategy = 'update'">更新现有</button>
                <button class="px-3 py-1.5 rounded-md text-[10px] border" :class="strategy === 'copy' ? 'border-brand-400 text-brand-400' : (isDark ? 'border-d4 text-wt-aux' : 'border-bdrF text-lt-aux')" @click="strategy = 'copy'">作为副本</button>
              </div>
            </div>

            <div v-if="platformConflictUnchanged" class="rounded-lg px-3 py-2 text-[11px] text-red-400" :class="isDark ? 'bg-red-400/8 border border-red-400/20' : 'bg-red-50 border border-red-200'">
              该 ID 属于内置 Skill，请修改为新的英文 ID 后导入。
            </div>
            <div v-if="preview.issues?.length" class="rounded-lg px-3 py-2 text-[11px] text-amber-500" :class="isDark ? 'bg-amber-400/8 border border-amber-400/20' : 'bg-amber-50 border border-amber-200'">
              {{ preview.issues.join('；') }}。安装时会自动补全规范 frontmatter。
            </div>
          </div>

          <div v-else class="rounded-lg p-3 text-[11px] leading-relaxed" :class="isDark ? 'bg-d0 border border-d4 text-wt-aux' : 'bg-l3 border border-bdrF text-lt-aux'">
            只要求包含 <code class="font-mono text-brand-400">SKILL.md</code>。缺少 config.json 时，Reviva 会根据内容自动生成完整配置。
          </div>

          <div v-if="error" class="rounded-lg px-3 py-2 text-[11px] text-red-400" :class="isDark ? 'bg-red-400/8 border border-red-400/20' : 'bg-red-50 border border-red-200'">{{ error }}</div>
        </div>

        <div class="px-5 py-3 flex justify-end gap-2 shrink-0" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
          <button class="px-3 h-8 text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" @click="emit('cancel')">取消</button>
          <button :disabled="!canImport || busy" class="px-4 h-8 rounded-md text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-40" :class="isDark ? 'bg-brand-400 text-d0' : 'bg-brand-500 text-white'" @click="confirmImport">
            <i :class="busy ? 'ri-loader-4-line animate-spin' : 'ri-download-line'" />{{ busy ? '正在安装' : '确认导入' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>