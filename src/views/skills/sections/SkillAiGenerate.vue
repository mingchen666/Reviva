<script setup>
import { computed, ref } from 'vue'
import { runNoteAiTask } from '@/composables/useNoteAi'
import { useSettingsStore } from '@/stores/settings'

defineProps({ isDark: Boolean })
const emit = defineEmits(['cancel', 'generate'])
const settingsStore = useSettingsStore()

const topic = ref('')
const skillType = ref('general')
const detailDesc = ref('')
const isGenerating = ref(false)
const generatedSkill = ref(null)
const error = ref('')

const skillTypeOptions = [
  { value: 'general', label: '通用', icon: 'ri-sparkling-2-line', color: '#6C8AFF', desc: '根据需求自主设计工作流程' },
  { value: 'summary', label: '摘要', icon: 'ri-file-text-line', color: '#0EA5E9', desc: '提炼内容与核心要点' },
  { value: 'writing', label: '写作', icon: 'ri-quill-pen-line', color: '#A78BFA', desc: '规划、撰写与修改内容' },
  { value: 'research', label: '研究', icon: 'ri-search-eye-line', color: '#4ADE80', desc: '整理问题、证据和结论' },
  { value: 'coding', label: '编程', icon: 'ri-code-s-slash-line', color: '#FACC15', desc: '约束代码分析与实现流程' },
  { value: 'learning', label: '学习', icon: 'ri-book-open-line', color: '#F87171', desc: '讲解、练习和学习反馈' },
]

const selectedType = computed(() => skillTypeOptions.find(item => item.value === skillType.value) || skillTypeOptions[0])

function parseJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型没有返回有效的 Skill 配置')
  return JSON.parse(cleaned.slice(start, end + 1))
}

async function generate() {
  if (!topic.value.trim() || isGenerating.value) return
  isGenerating.value = true
  generatedSkill.value = null
  error.value = ''
  try {
    const response = await runNoteAiTask({
      systemPrompt: '你是 Agent Skill 设计器。根据用户需求创建一个可直接使用的 SKILL.md。只输出一个 JSON 对象，不要代码围栏或解释。字段必须是 id、name、description、icon、color、category、skillMarkdown。id 只能包含英文小写字母、数字和连字符；icon 使用以 ri- 开头的 Remix Icon CSS 类名（例如 ri-brain-line），禁止使用 emoji；color 使用十六进制颜色；category 使用简短中文分类。skillMarkdown 必须包含 YAML frontmatter，其中 name 与 id 完全一致，description 非空；正文要具体说明触发场景、工作流程、约束和输出要求。不要声称拥有用户没有提供的工具或权限。',
      userPrompt: `用户需求：${topic.value.trim()}\n能力方向：${selectedType.value.label}，${selectedType.value.desc}\n补充要求：${detailDesc.value.trim() || '无'}\n请生成完整、具体、可执行的 Skill。`,
      model: settingsStore.defaultModels?.skill || settingsStore.defaultModels?.chat || '',
      maxTokens: 12000,
      temperature: 0.45,
    })
    const data = parseJson(response)
    const id = String(data.id || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!id) throw new Error('模型未生成合法的 Skill ID')
    let skillMarkdown = String(data.skillMarkdown || '').trim()
    if (!skillMarkdown) throw new Error('模型未生成 SKILL.md')
    if (!skillMarkdown.startsWith('---')) skillMarkdown = `---\nname: ${id}\ndescription: ${JSON.stringify(String(data.description || data.name || topic.value))}\n---\n\n${skillMarkdown}`
    generatedSkill.value = {
      id,
      englishName: id,
      name: String(data.name || topic.value.trim()),
      desc: String(data.description || selectedType.value.desc),
      icon: /^ri-[a-z0-9-]+$/i.test(String(data.icon || '')) ? String(data.icon) : selectedType.value.icon,
      color: /^#[0-9a-f]{6}$/i.test(data.color || '') ? data.color : selectedType.value.color,
      category: data.category || '其他',
      promptContent: skillMarkdown,
      promptTemplate: skillMarkdown,
      outputTypes: [],
      builtin: false,
      _isNew: true,
    }
  } catch (err) {
    error.value = err.message || '生成失败'
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="emit('cancel')" />
      <div class="relative rounded-xl overflow-hidden w-full max-w-[600px] max-h-[86vh] flex flex-col" :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrL shadow-xl'">
        <div class="px-5 py-3 flex justify-between items-center shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <div class="flex items-center gap-2"><i class="ri-sparkling-2-line text-agent-400 text-[15px]" /><span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">AI 创建 Skill</span></div>
          <button class="w-7 h-7 text-[20px] flex items-center justify-center" :class="isDark ? 'text-wt-aux hover:text-wt-main' : 'text-lt-aux hover:text-lt-main'" title="关闭" @click="emit('cancel')"><i class="ri-close-line" /></button>
        </div>

        <div class="flex-1 overflow-y-auto p-5 space-y-4">
          <div v-if="!generatedSkill">
            <label class="block text-[11px] font-semibold mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">你希望 Agent 学会什么？</label>
            <textarea v-model="topic" rows="4" autofocus placeholder="例如：帮我创建一个学习笔记 Skill，读取相关文档，认真学习，然后再创建笔记。" class="w-full px-3 py-2.5 rounded-lg text-[12px] outline-none resize-none leading-relaxed" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-agent-400/40' : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-agent-400'" />

            <label class="block text-[11px] font-semibold mt-4 mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">能力方向</label>
            <div class="grid grid-cols-3 gap-2">
              <button v-for="item in skillTypeOptions" :key="item.value" class="h-[58px] rounded-lg border flex items-center gap-2 px-3 text-left transition-colors" :class="skillType === item.value ? (isDark ? 'border-agent-400/50 bg-agent-400/8' : 'border-agent-300 bg-agent-50') : (isDark ? 'border-d4 bg-d0 hover:border-bdr' : 'border-bdrF bg-l3 hover:border-bdrL')" @click="skillType = item.value">
                <i :class="item.icon + ' text-[15px]'" :style="{ color: item.color }" />
                <div><div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ item.label }}</div><div class="text-[9px] mt-0.5 line-clamp-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.desc }}</div></div>
              </button>
            </div>

            <label class="block text-[11px] font-semibold mt-4 mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">补充要求 <span class="font-normal opacity-60">可选</span></label>
            <textarea v-model="detailDesc" rows="2" placeholder="指定语气、步骤、输出格式或不能做的事情" class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim' : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux'" />
          </div>

          <div v-if="isGenerating" class="h-56 flex flex-col items-center justify-center gap-3">
            <div class="w-11 h-11 rounded-lg flex items-center justify-center animate-pulse" :class="isDark ? 'bg-agent-400/10' : 'bg-agent-50'"><i class="ri-sparkling-2-line text-[22px] text-agent-400" /></div>
            <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">正在设计 Skill...</span>
          </div>

          <div v-if="generatedSkill && !isGenerating" class="space-y-3">
            <div class="rounded-lg border p-4" :class="isDark ? 'border-d4 bg-d0' : 'border-bdrF bg-l3'">
              <div class="flex items-start gap-3"><div class="w-10 h-10 rounded-lg flex items-center justify-center text-[20px]" :style="{ backgroundColor: generatedSkill.color + '18' }">{{ generatedSkill.icon }}</div><div class="min-w-0"><div class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ generatedSkill.name }}</div><div class="text-[11px] mt-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ generatedSkill.desc }}</div></div></div>
              <div class="flex gap-2 mt-3"><span class="ctx-pill font-mono text-brand-400">{{ generatedSkill.id }}</span><span class="ctx-pill" :class="isDark ? 'text-emerald-400 bg-emerald-400/8' : 'text-emerald-600 bg-emerald-50'">{{ generatedSkill.category }}</span></div>
            </div>
            <div><div class="text-[10px] font-semibold mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">SKILL.md 预览</div><pre class="max-h-[250px] overflow-auto rounded-lg p-3 whitespace-pre-wrap text-[10px] leading-relaxed font-mono" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l3 border border-bdrF text-lt-sub'">{{ generatedSkill.promptContent }}</pre></div>
          </div>

          <div v-if="error" class="rounded-lg px-3 py-2 text-[11px] text-red-400" :class="isDark ? 'bg-red-400/8 border border-red-400/20' : 'bg-red-50 border border-red-200'">{{ error }}</div>
        </div>

        <div class="px-5 py-3 flex justify-end gap-2 shrink-0" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
          <button class="px-3 h-8 text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" @click="generatedSkill ? (generatedSkill = null) : emit('cancel')">{{ generatedSkill ? '重新生成' : '取消' }}</button>
          <button v-if="!generatedSkill" :disabled="!topic.trim() || isGenerating" class="px-4 h-8 rounded-md text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-40" :class="isDark ? 'bg-agent-400 text-d0' : 'bg-agent-500 text-white'" @click="generate"><i :class="isGenerating ? 'ri-loader-4-line animate-spin' : 'ri-sparkling-2-line'" />开始生成</button>
          <button v-else class="px-4 h-8 rounded-md text-[12px] font-semibold flex items-center gap-1.5" :class="isDark ? 'bg-brand-400 text-d0' : 'bg-brand-500 text-white'" @click="emit('generate', generatedSkill)"><i class="ri-edit-line" />进入编辑</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
