<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNotesStore } from '@/stores/notes'
import { useSettingsStore } from '@/stores/settings'
import MsModal from '@/components/MsModal/MsModal.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['update:show'])

const appStore = useAppStore()
const notesStore = useNotesStore()
const settingsStore = useSettingsStore()
const isDark = computed(() => appStore.isDark)

const local = ref({
  noteProviderId: '',
  noteModelId: '',
})

const providerOptions = computed(() =>
  settingsStore.providers
    .filter(p => p.enabled && settingsStore.providerConfigured(p))
    .map(p => ({ id: p.id, name: p.name, icon: p.icon || 'ri-cloud-line' }))
)
const modelOptions = computed(() => {
  const p = settingsStore.providers.find(p => p.id === local.value.noteProviderId)
  if (!p) return []
  return p.models.filter(m => m.tier !== 'embedding' && m.enabled).map(m => ({ id: m.id, name: m.name, tier: m.tier }))
})

function syncProviderAndModel({ preserveModel = false } = {}) {
  if (!local.value.noteProviderId && providerOptions.value[0]) {
    local.value.noteProviderId = providerOptions.value[0].id
  }
  if (!local.value.noteProviderId) {
    local.value.noteModelId = ''
    return
  }

  const availableModels = modelOptions.value
  if (!availableModels.length) {
    local.value.noteModelId = ''
    return
  }

  if (preserveModel && availableModels.some(m => m.id === local.value.noteModelId)) return
  if (availableModels.some(m => m.id === local.value.noteModelId)) return
  local.value.noteModelId = availableModels[0]?.id || ''
}

watch(() => props.show, (v) => {
  if (v) {
    local.value = {
      noteProviderId: notesStore.aiSettings.noteProviderId || '',
      noteModelId: notesStore.aiSettings.noteModelId || '',
    }
    syncProviderAndModel({ preserveModel: true })
  }
})
watch(() => local.value.noteProviderId, (newId, oldId) => {
  if (newId === oldId) return
  syncProviderAndModel()
})

function save() {
  notesStore.updateAiSettings(local.value)
  emit('update:show', false)
}

const openDropdown = ref('')

function toggle(name) { openDropdown.value = openDropdown.value === name ? '' : name }
function closeAll() { openDropdown.value = '' }

function onDocClick(e) {
  if (!e.target.closest?.('.ai-dropdown')) closeAll()
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))

const providerSelected = computed(() => providerOptions.value.find(p => p.id === local.value.noteProviderId))
const modelSelected = computed(() => modelOptions.value.find(m => m.id === local.value.noteModelId))
</script>

<template>
  <MsModal :show="show" @update:show="emit('update:show', $event)" :width="520">
    <template #header>
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center"
          :class="isDark ? 'bg-agent-400/15 border border-agent-400/25' : 'bg-violet-50 border border-violet-100'">
          <i class="ri-magic-line text-[14px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
        </div>
        <div>
          <div class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">笔记 AI 配置</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">配置斜杠命令 / 选中改写使用的模型</div>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <!-- ─── LLM Model ─── -->
      <div class="rounded-xl p-3.5" :class="isDark ? 'bg-d0/60 border border-d4' : 'bg-l2/60 border border-bdrF'">
        <div class="flex items-center gap-2 mb-2.5">
          <i class="ri-cpu-line text-[13px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
          <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">AI 模型</span>
          <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">驱动所有笔记 AI 操作</span>
        </div>

        <div class="space-y-2.5">
          <!-- Provider dropdown -->
          <div class="ai-dropdown relative">
            <div class="text-[10px] font-medium mb-1 uppercase tracking-wider" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">服务商</div>
            <button @click="toggle('provider')"
              class="w-full h-9 px-3 rounded-lg flex items-center gap-2.5 transition-all"
              :class="[
                openDropdown === 'provider'
                  ? (isDark ? 'bg-d3 border border-brand-400/40 ring-2 ring-brand-400/15' : 'bg-l1 border border-brand-300 ring-2 ring-brand-200/40')
                  : (isDark ? 'bg-d3 border border-d4 hover:border-bdr' : 'bg-l1 border border-bdrF hover:border-bdrL'),
              ]">
              <template v-if="providerSelected">
                <i :class="[providerSelected.icon, 'text-[13px]', isDark ? 'text-brand-400' : 'text-brand-500']" />
                <span class="text-[12px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ providerSelected.name }}</span>
              </template>
              <template v-else>
                <i class="ri-cloud-line text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <span class="text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ providerOptions.length ? '请选择服务商' : '未配置服务商' }}</span>
              </template>
              <i class="ri-arrow-down-s-line ml-auto text-[14px] transition-transform"
                :class="[openDropdown === 'provider' ? 'rotate-180' : '', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
            </button>
            <div v-if="openDropdown === 'provider'"
              class="absolute z-20 mt-1.5 w-full rounded-lg shadow-xl overflow-hidden"
              :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l1 border border-bdrL'">
              <div class="max-h-[200px] overflow-y-auto thin-scroll py-1">
                <button v-for="p in providerOptions" :key="p.id"
                  @click="local.noteProviderId = p.id; closeAll()"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                  :class="[local.noteProviderId === p.id ? (isDark ? 'bg-brand-400/12' : 'bg-brand-50') : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')]">
                  <i :class="[p.icon, 'text-[13px]', isDark ? 'text-brand-400' : 'text-brand-500']" />
                  <span class="text-[12px] flex-1 truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ p.name }}</span>
                  <i v-if="local.noteProviderId === p.id" class="ri-check-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
                </button>
                <div v-if="providerOptions.length === 0" class="px-3 py-3 text-center text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                  未配置任何启用的服务商 — 请先在设置中添加
                </div>
              </div>
            </div>
          </div>

          <!-- Model dropdown -->
          <div class="ai-dropdown relative">
            <div class="text-[10px] font-medium mb-1 uppercase tracking-wider" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">模型</div>
            <button @click="local.noteProviderId && toggle('model')" :disabled="!local.noteProviderId"
              class="w-full h-9 px-3 rounded-lg flex items-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              :class="[
                openDropdown === 'model'
                  ? (isDark ? 'bg-d3 border border-brand-400/40 ring-2 ring-brand-400/15' : 'bg-l1 border border-brand-300 ring-2 ring-brand-200/40')
                  : (isDark ? 'bg-d3 border border-d4 hover:border-bdr' : 'bg-l1 border border-bdrF hover:border-bdrL'),
              ]">
              <template v-if="modelSelected">
                <i class="ri-cpu-line text-[13px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
                <span class="text-[12px] font-medium truncate font-mono" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ modelSelected.name }}</span>
              </template>
              <template v-else>
                <i class="ri-cpu-line text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <span class="text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ local.noteProviderId ? '请选择模型' : '请先选择服务商' }}</span>
              </template>
              <i class="ri-arrow-down-s-line ml-auto text-[14px] transition-transform"
                :class="[openDropdown === 'model' ? 'rotate-180' : '', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
            </button>
            <div v-if="openDropdown === 'model'"
              class="absolute z-20 mt-1.5 w-full rounded-lg shadow-xl overflow-hidden"
              :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l1 border border-bdrL'">
              <div class="max-h-[220px] overflow-y-auto thin-scroll py-1">
                <button v-for="m in modelOptions" :key="m.id"
                  @click="local.noteModelId = m.id; closeAll()"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                  :class="[local.noteModelId === m.id ? (isDark ? 'bg-brand-400/12' : 'bg-brand-50') : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')]">
                  <i class="ri-cpu-line text-[12px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
                  <span class="text-[12px] flex-1 font-mono truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ m.name }}</span>
                  <i v-if="local.noteModelId === m.id" class="ri-check-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
                </button>
                <div v-if="modelOptions.length === 0" class="px-3 py-3 text-center text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                  该服务商无可用对话模型
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <button @click="close"
        class="h-8 px-3.5 rounded-md text-[11.5px] font-medium transition-colors"
        :class="isDark ? 'bg-d0 text-wt-aux hover:bg-d4 border border-bdr' : 'bg-l2 text-lt-aux hover:bg-l4 border border-bdrF'">
        取消
      </button>
      <button @click="save"
        class="h-8 px-4 rounded-md text-[11.5px] font-semibold text-white transition-all shadow-sm"
        :style="{ background: 'linear-gradient(90deg, var(--brand), #A78BFA)' }">
        <i class="ri-check-line text-[12px] mr-0.5" /> 保存配置
      </button>
    </template>
  </MsModal>
</template>

<style scoped>
.thin-scroll::-webkit-scrollbar{width:6px}
.thin-scroll::-webkit-scrollbar-thumb{background:rgba(127,127,127,.25);border-radius:3px}
.thin-scroll::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,.4)}
</style>
