<script setup>
import { ref, computed } from 'vue'

const props = defineProps({ isDark: Boolean })
const emit = defineEmits(['cancel', 'generate'])

const step = ref('input') // input | preview | done
const topic = ref('')
const skillType = ref('summary')
const detailDesc = ref('')
const isGenerating = ref(false)
const generatedSkill = ref(null)

const skillTypeOptions = [
  { value: 'summary', label: '摘要', icon: 'ri-file-text-line', color: '#6C8AFF', desc: '生成内容要点摘要' },
  { value: 'outline', label: '大纲', icon: 'ri-list-check-2', color: '#4ADE80', desc: '生成结构化大纲' },
  { value: 'flashcards', label: '闪卡', icon: 'ri-stack-line', color: '#FACC15', desc: '生成问答闪卡组' },
  { value: 'quizzes', label: '测验题', icon: 'ri-question-line', color: '#F87171', desc: '生成测验题目集' },
  { value: 'mindmap', label: '思维导图', icon: 'ri-mind-map', color: '#0EA5E9', desc: '生成知识结构导图' },
  { value: 'cram_sheet', label: '速记版', icon: 'ri-flashlight-line', color: '#A78BFA', desc: '生成考前速记笔记' },
]

const selectedTypeInfo = computed(() => skillTypeOptions.find(o => o.value === skillType.value))

function startGenerate() {
  if (!topic.value.trim()) return
  isGenerating.value = true
  step.value = 'preview'
  // Simulate AI generation
  setTimeout(() => {
    const typeInfo = selectedTypeInfo.value
    generatedSkill.value = {
      name: `${topic.value.trim()}${typeInfo.label}`,
      desc: `基于「${topic.value.trim()}」自动生成的${typeInfo.desc}能力`,
      icon: typeInfo.icon,
      color: typeInfo.color,
      promptTemplate: `你是一个专业的${typeInfo.desc}生成器。针对用户提供的 {{input}} 内容，按照以下要求生成${typeInfo.label}：\n\n1. 确保内容准确、结构清晰\n2. 使用 Markdown 格式输出\n3. 重点突出核心概念与关键信息\n4. 如有 {{topic}} 相关领域知识，优先引用`,
      outputTypes: ['Markdown'],
      detail: detailDesc.value || `自动生成的${typeInfo.desc}，适用于${topic.value.trim()}相关内容处理。`,
      builtin: false,
    }
    isGenerating.value = false
  }, 2000)
}

function confirmGenerate() {
  if (!generatedSkill.value) return
  emit('generate', generatedSkill.value)
}

function reset() {
  step.value = 'input'
  topic.value = ''
  detailDesc.value = ''
  isGenerating.value = false
  generatedSkill.value = null
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="emit('cancel')" />
      <div class="relative rounded-2xl overflow-hidden w-full max-w-[560px] max-h-[85vh] flex flex-col"
        :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrL shadow-xl'">

        <!-- Header -->
        <div class="px-5 py-3 flex justify-between items-center shrink-0"
          :class="isDark ? 'border-b border-d4 bg-d4/30' : 'border-b border-bdrL bg-l4/30'">
          <div class="flex items-center gap-2">
            <i class="ri-sparkling-2-line text-agent-400 text-[14px]" />
            <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">AI 生成 Skill</span>
          </div>
          <button @click="emit('cancel')" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"><i class="ri-close-line text-[14px]" /></button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto">
          <div class="p-5 space-y-4">

            <!-- Step: Input -->
            <div v-if="step === 'input'">
              <!-- Info -->
              <div class="rounded-xl p-3 mb-4 flex items-start gap-2.5" :class="isDark ? 'bg-agent-400/6 border border-agent-400/15' : 'bg-agent-50 border border-agent-100'">
                <i class="ri-sparkling-2-line text-[14px] text-agent-400 mt-0.5" />
                <div class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  描述你想要的 Skill，AI 会自动生成提示词模板和配置。适用于快速创建学习摘要、大纲、闪卡等生成能力。
                </div>
              </div>

              <!-- Topic -->
              <div>
                <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">Skill 主题 *</label>
                <input v-model="topic" type="text" placeholder="例如：考研数学、英语阅读、线性代数..."
                  class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors"
                  :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-agent-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-agent-400'" />
              </div>

              <!-- Skill Type Selection -->
              <div>
                <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">生成类型</label>
                <div class="grid grid-cols-3 gap-2">
                  <button v-for="opt in skillTypeOptions" :key="opt.value" @click="skillType = opt.value"
                    class="rounded-lg p-2.5 cursor-pointer transition-all border-2 text-center"
                    :style="skillType === opt.value && isDark && opt?.color ? { borderColor: opt.color } : {}"
                    :class="skillType === opt.value
                      ? (isDark ? '' : 'border-agent-400 bg-agent-50')
                      : (isDark ? 'border-d4 bg-d0 hover:border-bdr' : 'border-bdrF bg-l2 hover:border-bdrL')">
                    <i :class="`${opt.icon} text-[14px]`" :style="`color:${opt.color}`" />
                    <div class="text-[11px] font-semibold mt-1" :class="skillType === opt.value ? (isDark ? 'text-wt-main' : 'text-lt-main') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ opt.label }}</div>
                    <div class="text-[9px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ opt.desc }}</div>
                  </button>
                </div>
              </div>

              <!-- Detail description -->
              <div>
                <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">补充描述（可选）</label>
                <textarea v-model="detailDesc" rows="3" placeholder="补充说明 Skill 的具体要求、适用场景..."
                  class="w-full px-3 py-2.5 rounded-lg text-[12px] outline-none resize-none transition-colors"
                  :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-agent-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-agent-400'" />
              </div>
            </div>

            <!-- Step: Generating -->
            <div v-if="step === 'preview' && isGenerating" class="flex flex-col items-center justify-center py-16">
              <div class="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 animate-pulse" :class="isDark ? 'bg-agent-400/10' : 'bg-agent-50'">
                <i class="ri-sparkling-2-line text-[24px] text-agent-400" />
              </div>
              <p class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">AI 正在生成 Skill...</p>
              <p class="text-[11px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">基于「{{ topic }}」主题和{{ selectedTypeInfo?.label }}类型</p>
            </div>

            <!-- Step: Preview result -->
            <div v-if="step === 'preview' && !isGenerating && generatedSkill" class="space-y-4">
              <div class="rounded-xl p-4" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    :class="isDark ? 'bg-agent-400/10 border border-agent-400/20' : 'bg-agent-50 border border-agent-100'">
                    <i :class="`${generatedSkill.icon} text-[20px]`" :style="`color:${generatedSkill.color}`" />
                  </div>
                  <div>
                    <div class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ generatedSkill.name }}</div>
                    <div class="text-[11px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ generatedSkill.desc }}</div>
                  </div>
                </div>
              </div>

              <!-- Prompt template preview -->
              <div>
                <div class="flex items-center gap-1.5 mb-1.5">
                  <i class="ri-code-line text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
                  <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">提示词模板</span>
                </div>
                <div class="rounded-lg p-3 text-[11px] leading-relaxed whitespace-pre-wrap font-mono" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'">{{ generatedSkill.promptTemplate }}</div>
              </div>

              <!-- Output types -->
              <div class="flex items-center gap-2">
                <span class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">输出格式:</span>
                <span v-for="fmt in generatedSkill.outputTypes" :key="fmt" class="ctx-pill" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">{{ fmt }}</span>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2">
                <button @click="reset"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  :class="isDark ? 'bg-d3 text-wt-sub border border-bdr hover:bg-d4' : 'bg-l3 text-lt-sub border border-bdrF hover:bg-l4'">
                  <i class="ri-refresh-line text-[12px]" /> 重新生成
                </button>
                <button @click="step = 'input'"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  :class="isDark ? 'bg-d3 text-wt-aux border border-bdr hover:text-wt-sub' : 'bg-l3 text-lt-aux border border-bdrF hover:text-lt-sub'">
                  <i class="ri-edit-line text-[12px]" /> 修改参数
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 flex justify-end gap-2 shrink-0"
          :class="isDark ? 'border-t border-d4 bg-d4/30' : 'border-t border-bdrL bg-l4/30'">
          <button @click="emit('cancel')"
            class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
            :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
          <button v-if="step === 'input'" :disabled="!topic.trim()" @click="startGenerate"
            class="px-4 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
            :class="isDark ? 'bg-agent-400 text-d0 hover:bg-agent-500' : 'bg-agent-500 text-white hover:bg-agent-600'">
            <i class="ri-sparkling-2-line text-[12px]" /> 开始生成
          </button>
          <button v-if="step === 'preview' && !isGenerating && generatedSkill" @click="confirmGenerate"
            class="px-4 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
            :class="isDark ? 'bg-emerald-400 text-d0 hover:bg-emerald-500' : 'bg-emerald-500 text-white hover:bg-emerald-600'">
            <i class="ri-check-line text-[12px]" /> 确认并保存
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>