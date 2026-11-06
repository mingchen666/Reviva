<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const isDark = computed(() => appStore.isDark)

const CAPABILITY_META = {
  tool_calling: { icon: 'ri-tools-line', label: '工具', darkClass: 'text-emerald-400 bg-emerald-400/10', lightClass: 'text-emerald-600 bg-emerald-50' },
  vision: { icon: 'ri-eye-line', label: '视觉', darkClass: 'text-sky-400 bg-sky-400/10', lightClass: 'text-sky-600 bg-sky-50' },
  search: { icon: 'ri-search-line', label: '搜索', darkClass: 'text-amber-400 bg-amber-400/10', lightClass: 'text-amber-600 bg-amber-50' },
  vector: { icon: 'ri-database-2-line', label: '向量', darkClass: 'text-violet-400 bg-violet-400/10', lightClass: 'text-violet-600 bg-violet-50' },
  reranking: { icon: 'ri-sort-desc', label: '重排序', darkClass: 'text-pink-400 bg-pink-400/10', lightClass: 'text-pink-600 bg-pink-50' },
}

function capClass(key) {
  return isDark.value ? CAPABILITY_META[key].darkClass : CAPABILITY_META[key].lightClass
}

function getModelCapabilities(modelId) {
  const caps = settingsStore.modelCapabilitiesMap[modelId]
  if (!caps) return []
  return Object.entries(caps).filter(([, v]) => v).map(([k]) => k)
}

const modelCards = computed(() => [
  { key: 'chat', label: 'Agent默认模型', icon: 'ri-chat-smile-2-line', desc: '学习工作台Agent对话与日常问答使用的默认模型' },
  { key: 'skill', label: 'Skill 生成', icon: 'ri-flashlight-line', desc: 'AI 创建和生成自定义 Skill 时使用的默认模型' },
  // { key: 'agent', label: 'Agent 规划', icon: 'ri-sparkling-2-line', desc: 'Agent 执行任务规划、推理决策时使用的模型' },
  { key: 'vision', label: '视觉理解模型', icon: 'ri-eye-line', desc: '图片、截图、图表理解工具与按需视觉 OCR 使用的模型' },
  { key: 'title', label: '对话标题生成', icon: 'ri-heading', desc: '自动生成对话标题时使用的模型' },
  { key: 'translation', label: '翻译模型', icon: 'ri-translate-2', desc: '语言翻时使用的默认模型' },
  // { key: 'embedding', label: '向量嵌入', icon: 'ri-database-2-line', desc: '知识库检索与语义搜索使用的嵌入模型' },
])

function modelOptionsFor(card) {
  if (card.key === 'embedding') return settingsStore.embeddingModelOptions
  if (card.key === 'vision') return settingsStore.visionModelOptions
  return settingsStore.chatModelOptions
}

function onModelChange(key, value) {
  settingsStore.defaultModels[key] = value
  settingsStore.saveDefaultModels()
}

const openKey = ref(null)
const searchText = ref({})

function isOpen(key) { return openKey.value === key }
function toggleCard(key) {
  if (openKey.value === key) { openKey.value = null; return }
  openKey.value = key
  searchText.value[key] = ''
}
function closeCard() { openKey.value = null }

function normalizedGroups(options) {
  if (!options || !options.length) return []
  const first = options[0]
  if (first.type === 'group' || first.children) {
    return options.map(g => ({ groupLabel: g.label, items: g.children || [] }))
  }
  return [{ groupLabel: '', items: options }]
}

function filteredGroups(card) {
  const groups = normalizedGroups(modelOptionsFor(card))
  const q = (searchText.value[card.key] || '').trim().toLowerCase()
  if (!q) return groups
  return groups
    .map(g => ({
      groupLabel: g.groupLabel,
      items: g.items.filter(item => item.label.toLowerCase().includes(q)),
    }))
    .filter(g => g.items.length)
}

function onDocPointerDown(e) {
  if (!openKey.value) return
  const card = e.target.closest('[data-model-card]')
  if (card && card.dataset.modelCard === openKey.value) return
  openKey.value = null
}
function onKeydown(e) {
  if (e.key === 'Escape' && openKey.value) openKey.value = null
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-6">
    <div class="rounded-xl p-4 flex items-start gap-3" :class="isDark ? 'bg-brand-400/6 border border-brand-400/15' : 'bg-brand-50 border border-brand-100'">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/15' : 'bg-brand-100'">
        <i class="ri-settings-4-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
      </div>
      <div>
        <div class="fs-body font-semibold" :class="isDark ? 'text-brand-400' : 'text-brand-600'">默认模型配置</div>
        <div class="fs-label mt-1 leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          为不同场景指定默认模型，确保各功能模块使用最适合的 LLM。视觉理解模型用于 Agent 的 vision_analyze 工具兜底；直接发送图片仍需要当前对话模型支持视觉。
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div v-for="card in modelCards" :key="card.key"
        class="rounded-xl p-4"
        :data-model-card="card.key"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2.5 mb-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
            <i :class="card.icon + ' text-[16px]'" style="color: #6C8AFF" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="fs-body font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ card.label }}</div>
            <div class="fs-caption mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ card.desc }}</div>
          </div>
        </div>
        <div class="relative">
          <button type="button"
            @click="toggleCard(card.key)"
            class="w-full h-8 px-3 rounded-md flex items-center gap-2 text-[14px] transition-colors cursor-pointer"
            :class="[
              isDark ? 'bg-d0 text-wt-sub' : 'bg-white text-lt-sub',
              isOpen(card.key)
                ? (isDark ? 'border border-brand-400/40' : 'border border-brand-400')
                : (isDark ? 'border border-d4 hover:border-brand-400/30' : 'border border-bdrF hover:border-brand-300')
            ]">
            <i class="ri-sparkling-line text-[14px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <span class="flex-1 text-left truncate font-medium">{{ settingsStore.getModelName(settingsStore.defaultModels[card.key]) || '未选择模型' }}</span>
            <i class="ri-arrow-down-s-line text-[14px] shrink-0 transition-transform duration-200"
              :class="[isOpen(card.key) ? 'rotate-180' : '', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
          </button>
          <Transition name="ms-drop">
            <div v-if="isOpen(card.key)"
              class="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-md overflow-hidden border shadow-2xl"
              :class="isDark ? 'bg-d2 border-d4' : 'bg-white border-bdrF'">
              <div class="px-2.5 py-2 border-b" :class="isDark ? 'border-d4' : 'border-bdrF'">
                <div class="relative">
                  <i class="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                  <input
                    v-model="searchText[card.key]"
                    type="text"
                    placeholder="搜索模型…"
                    class="w-full h-7 pl-7 pr-2 rounded-md text-[12.5px] outline-none transition-colors border"
                    :class="isDark ? 'bg-d0 border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'"
                    @click.stop
                  />
                </div>
              </div>
              <div class="max-h-[240px] overflow-y-auto thin-scroll py-0.5">
                <div v-if="!filteredGroups(card).length" class="px-3 py-4 text-center text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                  无匹配模型
                </div>
                <template v-for="(grp, gi) in filteredGroups(card)" :key="card.key + '-' + gi">
                  <div v-if="grp.groupLabel"
                    class="text-[12px] font-semibold px-3.5 py-1"
                    :class="[
                      gi > 0 ? (isDark ? 'border-t border-d4' : 'border-t border-bdrF') : '',
                      isDark ? 'text-wt-dim' : 'text-lt-aux'
                    ]">{{ grp.groupLabel }}</div>
                  <button v-for="item in grp.items" :key="item.value"
                    type="button"
                    @click="onModelChange(card.key, item.value); closeCard()"
                    class="w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] font-medium transition-colors text-left"
                    :class="settingsStore.defaultModels[card.key] === item.value
                      ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500')
                      : (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4')">
                    <i class="ri-check-line text-[13px] shrink-0 w-[14px]"
                      :class="settingsStore.defaultModels[card.key] === item.value ? '' : 'opacity-0'" />
                    <span class="flex-1 truncate">{{ item.label }}</span>
                  </button>
                </template>
              </div>
            </div>
          </Transition>
        </div>
        <div v-if="getModelCapabilities(settingsStore.defaultModels[card.key]).length" class="flex items-center gap-1 flex-wrap mt-1.5">
          <span v-for="capKey in getModelCapabilities(settingsStore.defaultModels[card.key])" :key="capKey"
            class="ctx-pill" :class="capClass(capKey)" style="font-size:9px;padding:1px 5px">
            <i :class="CAPABILITY_META[capKey].icon" class="text-[8px]" />{{ CAPABILITY_META[capKey].label }}
          </span>
        </div>
      </div>
    </div>

    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3">
        <i class="ri-lightbulb-line text-[14px] text-amber-400" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">选择建议</span>
      </div>
      <div class="space-y-2 fs-label" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
        <div class="flex items-center gap-2"><i class="ri-chat-smile-2-line text-brand-400 fs-label" /><span>对话场景推荐均衡模型，性价比最优</span></div>
        <div class="flex items-center gap-2"><i class="ri-flashlight-line text-brand-400 fs-label" /><span>Skill 生成需要较强的指令理解和结构化输出能力</span></div>
        <!-- <div class="flex items-center gap-2"><i class="ri-sparkling-2-line text-agent-400 fs-label" /><span>Agent 规划需要强推理能力，推荐 DeepSeek Reasoner 或 Opus</span></div> -->
        <!-- <div class="flex items-center gap-2"><i class="ri-database-2-line text-amber-400 fs-label" /><span>嵌入模型建议选 text-embedding-3-large，兼容性最好</span></div> -->
        <div class="flex items-center gap-2"><i class="ri-eye-line text-sky-400 fs-label" /><span>视觉理解模型需要具备视觉能力，用于图片理解工具、图表分析和少量图片文字提取</span></div>
        <div class="flex items-center gap-2"><i class="ri-heading text-rose-400 fs-label" /><span>标题生成推荐低成本快速模型（ DeepSeek Chat），无需强推理</span></div>
        <div class="flex items-center gap-2"><i class="ri-translate-2 text-sky-400 fs-label" /><span>翻译模型推荐低成本多语言模型（DeepSeek Chat），速度快效果好</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ms-drop-enter-active,
.ms-drop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.ms-drop-enter-from,
.ms-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>