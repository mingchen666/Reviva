<script setup>
import { ref, computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'

const props = defineProps({
  editSub: Object,
  isDark: Boolean,
})

const emit = defineEmits(['cancel', 'save'])
const agentsStore = useAgentsStore()

const iconOptions = [
  'ri-team-line', 'ri-book-open-line', 'ri-file-text-line', 'ri-question-line',
  'ri-calendar-check-line', 'ri-code-s-slash-line', 'ri-brain-line', 'ri-search-line',
  'ri-translate-2', 'ri-calculator-line', 'ri-sparkling-2-line', 'ri-pen-nib-line',
  'ri-lightbulb-line', 'ri-magic-line', 'ri-cpu-line', 'ri-eye-line',
  'ri-chat-1-line', 'ri-microscope-line', 'ri-bar-chart-line', 'ri-compass-3-line',
  'ri-heart-line', 'ri-shield-check-line', 'ri-rocket-line', 'ri-leaf-line',
]
const colorOptions = ['#6C8AFF', '#4ADE80', '#FACC15', '#F87171', '#A78BFA', '#3B82F6', '#EC4899', '#38BDF8', '#14B8A6', '#FB923C']

const descValue = computed({
  get: () => props.editSub.desc || props.editSub.description || '',
  set: (v) => { props.editSub.desc = v; props.editSub.description = v }
})

const availableTools = computed(() => agentsStore.enabledTools.map(t => ({ id: t.id, name: t.name })))
const availableSkills = computed(() => agentsStore.skillList.map(s => ({ id: s.id, name: s.name })))

function toggleTool(toolId) {
  const idx = props.editSub.tools.indexOf(toolId)
  if (idx >= 0) props.editSub.tools.splice(idx, 1)
  else props.editSub.tools.push(toolId)
}

function toggleSkill(skillId) {
  const idx = props.editSub.skills.indexOf(skillId)
  if (idx >= 0) props.editSub.skills.splice(idx, 1)
  else props.editSub.skills.push(skillId)
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
            <i class="ri-team-line text-amber-400 text-[14px]" />
            <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ editSub.id ? '编辑 · ' + editSub.name : '新建 SubAgent' }}</span>
          </div>
          <button @click="emit('cancel')" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"><i class="ri-close-line text-[14px]" /></button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto">
          <div class="px-5 py-4 space-y-4">

            <!-- Basic Info -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-profile-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">基础信息</span></div>
              <div class="space-y-3">
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">名称 <span class="text-red-400">*</span></label>
                  <input v-model="editSub.name" type="text" placeholder="如 Reader、Analyzer..." class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-amber-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-amber-400'">
                </div>
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">描述</label>
                  <textarea v-model="descValue" rows="2" placeholder="描述这个子智能体的职责..." class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-amber-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-amber-400'"></textarea>
                </div>
                <div class="flex gap-4">
                  <div>
                    <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">图标</label>
                    <div class="flex gap-1.5 flex-wrap">
                      <button v-for="ic in iconOptions" :key="ic" @click="editSub.icon = ic" class="w-8 h-8 rounded-lg flex items-center justify-center transition-all" :class="editSub.icon === ic ? (isDark ? 'bg-amber-400/12 border border-amber-400/30' : 'bg-amber-50 border border-amber-100') : (isDark ? 'border border-d4 hover:border-amber-400/30' : 'border border-bdrF hover:border-amber-200')">
                        <i :class="ic + ' text-[14px] ' + (editSub.icon === ic ? (isDark ? 'text-amber-400' : 'text-amber-500') : (isDark ? 'text-wt-aux' : 'text-lt-aux'))" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">颜色</label>
                    <div class="flex gap-1.5 flex-wrap">
                      <button v-for="c in colorOptions" :key="c" @click="editSub.color = c" class="w-6 h-6 rounded-full transition-all" :class="editSub.color === c ? 'ring-2 ring-offset-2 scale-110' : ''" :style="'background-color:' + c + ';' + (editSub.color === c ? (isDark ? '--tw-ring-offset-color:#252530;--tw-ring-color:rgba(255,255,255,0.4)' : '--tw-ring-offset-color:#f5f4f3;--tw-ring-color:rgba(255,255,255,0.8)') : '')" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Prompt -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-chat-smile-2-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">系统提示词</span></div>
              <textarea v-model="editSub.prompt" rows="4" placeholder="定义该子智能体的行为指令，如：你是一个专业的摘要助手，擅长从长文本中提取关键信息..." class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-amber-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-amber-400'"></textarea>
            </div>

            <!-- Tool Binding -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><i class="ri-tools-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">可用工具</span></div>
                <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ editSub.tools?.length ||0}} 个</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="t in availableTools" :key="t.id" @click="toggleTool(t.id)" class="ctx-pill cursor-pointer transition-all"
                  :class="editSub.tools?.includes(t.id) ? (isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-500 border border-emerald-100') : (isDark ? 'bg-d4 text-wt-dim border border-bdr hover:text-wt-sub' : 'bg-l4 text-lt-aux border border-bdrF hover:text-lt-sub')">
                  {{ t.name }}
                </button>
                <div v-if="availableTools.length === 0" class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无已启用的工具</div>
              </div>
            </div>

            <!-- Skill Binding -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><i class="ri-flashlight-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">可用 Skills</span></div>
                <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ editSub.skills?.length |0}} 个</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="s in availableSkills" :key="s.id" @click="toggleSkill(s.id)" class="ctx-pill cursor-pointer transition-all"
                  :class="editSub.skills?.includes(s.id) ? (isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100') : (isDark ? 'bg-d4 text-wt-dim border border-bdr hover:text-wt-sub' : 'bg-l4 text-lt-aux border border-bdrF hover:text-lt-sub')">
                  {{ s.name }}
                </button>
                <div v-if="availableSkills.length === 0" class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无已启用的 Skills</div>
              </div>
            </div>

          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 flex justify-end gap-2 shrink-0"
          :class="isDark ? 'border-t border-d4 bg-d4/30' : 'border-t border-bdrL bg-l4/30'">
          <button @click="emit('cancel')" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
          <button @click="emit('save')" class="px-4 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors" :class="isDark ? 'bg-amber-400 text-d0 hover:bg-amber-500' : 'bg-amber-500 text-white hover:bg-amber-600'"><i class="ri-check-line text-[12px]" /> 保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>