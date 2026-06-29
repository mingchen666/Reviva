<script setup>
import { computed } from 'vue'
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
  { key: 'chat', label: '对话默认', icon: 'ri-chat-smile-2-line', desc: '学习台对话与日常问答使用的默认模型' },
  // { key: 'skill', label: 'Skill 生成', icon: 'ri-flashlight-line', desc: '执行 Skill 生成任务（摘要、大纲、闪卡等）时使用的模型' },
  // { key: 'agent', label: 'Agent 规划', icon: 'ri-sparkling-2-line', desc: 'Agent 执行任务规划、推理决策时使用的模型' },
  { key: 'title', label: '对话标题生成', icon: 'ri-heading', desc: '自动生成对话标题时使用的模型' },
  { key: 'translation', label: '翻译模型', icon: 'ri-translate-2', desc: '跨语言翻译与双语对照时使用的模型' },
  // { key: 'embedding', label: '向量嵌入', icon: 'ri-database-2-line', desc: '知识库检索与语义搜索使用的嵌入模型' },
])

function onModelChange(key, value) {
  settingsStore.defaultModels[key] = value
  settingsStore.saveDefaultModels()
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-6">
    <!-- Info Banner -->
    <div class="rounded-xl p-4 flex items-start gap-3" :class="isDark ? 'bg-brand-400/6 border border-brand-400/15' : 'bg-brand-50 border border-brand-100'">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/15' : 'bg-brand-100'">
        <i class="ri-settings-4-line text-[15px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
      </div>
      <div>
        <div class="text-[13px] font-semibold" :class="isDark ? 'text-brand-400' : 'text-brand-600'">默认模型配置</div>
        <div class="text-[12px] mt-1 leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          为不同场景指定默认模型，确保各功能模块使用最适合的 LLM。工作台对话、标题生成、翻译等各有独立默认值。
        </div>
      </div>
    </div>

    <!-- Model Cards Grid -->
    <div class="grid grid-cols-2 gap-4">
      <div v-for="card in modelCards" :key="card.key"
        class="rounded-xl p-4"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2.5 mb-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
            <i :class="`${card.icon} text-[15px]`" style="color: #6C8AFF" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ card.label }}</div>
            <div class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ card.desc }}</div>
          </div>
        </div>
        <NSelect
          :value="settingsStore.defaultModels[card.key]"
          @update:value="v => onModelChange(card.key, v)"
          :options="card.key === 'embedding' ? settingsStore.embeddingModelOptions : settingsStore.chatModelOptions"
          size="small"
          :theme="isDark ? 'dark' : 'light'"
        />
        <div class="text-[10px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          当前: <span class="font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ settingsStore.getModelName(settingsStore.defaultModels[card.key]) }}</span>
        </div>
        <div v-if="getModelCapabilities(settingsStore.defaultModels[card.key]).length" class="flex items-center gap-1 flex-wrap mt-1.5">
          <span v-for="capKey in getModelCapabilities(settingsStore.defaultModels[card.key])" :key="capKey"
            class="ctx-pill" :class="capClass(capKey)" style="font-size:9px;padding:1px 5px">
            <i :class="CAPABILITY_META[capKey].icon" class="text-[8px]" />{{ CAPABILITY_META[capKey].label }}
          </span>
        </div>
      </div>
    </div>

    <!-- Tips -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3">
        <i class="ri-lightbulb-line text-[14px] text-amber-400" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">选择建议</span>
      </div>
      <div class="space-y-2 text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
        <div class="flex items-center gap-2"><i class="ri-chat-smile-2-line text-brand-400 text-[12px]" /><span>对话场景推荐均衡模型，性价比最优</span></div>
        <!-- <div class="flex items-center gap-2"><i class="ri-flashlight-line text-brand-400 text-[12px]" /><span>Skill 生成需要创造力，旗舰模型效果更佳</span></div> -->
        <!-- <div class="flex items-center gap-2"><i class="ri-sparkling-2-line text-agent-400 text-[12px]" /><span>Agent 规划需要强推理能力，推荐 DeepSeek Reasoner 或 Opus</span></div> -->
        <!-- <div class="flex items-center gap-2"><i class="ri-database-2-line text-amber-400 text-[12px]" /><span>嵌入模型建议选 text-embedding-3-large，兼容性最好</span></div> -->
        <div class="flex items-center gap-2"><i class="ri-heading text-rose-400 text-[12px]" /><span>标题生成推荐低成本快速模型（ DeepSeek Chat），无需强推理</span></div>
        <div class="flex items-center gap-2"><i class="ri-translate-2 text-sky-400 text-[12px]" /><span>翻译模型推荐低成本多语言模型（DeepSeek Chat），速度快效果好</span></div>
      </div>
    </div>
  </div>
</template>
