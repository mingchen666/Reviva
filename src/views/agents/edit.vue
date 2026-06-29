<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useAgentsStore } from '@/stores/agents'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const agentsStore = useAgentsStore()

const isDark = computed(() => appStore.isDark)
const isEdit = computed(() => !!route.params.id)

const form = ref({
  name: '',
  description: '',
  icon: 'ri-sparkling-2-line',
  color: '#A78BFA',
  architecture: 'react',
  maxIterations: 10,
  planningModel: '',
  reflectPersist: false,
  complexityClassifier: false,
  systemPrompt: '',
  permissions: {
    fileRead: false,
    fileWrite: false,
    fileRename: false,
    kbSearch: true,
  },
  tools: ['kb_search'],
  skills: [],
  subAgents: [],
})

// Load existing agent data for editing
if (isEdit.value) {
  const existing = agentsStore.agents.find(a => a.id === route.params.id)
  if (existing) {
    form.value = { ...form.value, ...existing, maxIterations: existing.maxIter ?? existing.maxIterations ?? form.value.maxIterations }
  }
}

const availableTools = [
  { key: 'web_search_tavily', label: 'Tavily 搜索', icon: 'ri-search-line' },
  { key: 'web_search_searxng', label: 'SearXNG 搜索', icon: 'ri-search-eye-line' },
  { key: 'web_search_bing', label: 'Bing 搜索', icon: 'ri-microsoft-line' },
  { key: 'file_read', label: '文件读取', icon: 'ri-file-text-line' },
  { key: 'file_write', label: '文件写入', icon: 'ri-edit-line' },
  { key: 'pptx_export_local', label: 'PPTX 导出', icon: 'ri-file-ppt-line' },
  { key: 'file_rename', label: '文件重命名', icon: 'ri-price-tag-3-line' },
  { key: 'file_list', label: '文件列表', icon: 'ri-folder-open-line' },
  { key: 'kb_search', label: '知识库检索', icon: 'ri-database-2-line' },
]

const availableSkills = [
  { key: 'summary', label: '摘要' },
  { key: 'outline', label: '大纲' },
  { key: 'flashcards', label: '闪卡' },
  { key: 'flashcard-generator', label: '闪卡生成器' },
  { key: 'quizzes', label: '测验题' },
  { key: 'quiz-generator', label: '测验生成器' },
  { key: 'mindmap', label: '思维导图' },
  { key: 'cram_sheet', label: '速记版' },
]

const availableSubAgents = [
  { key: 'Reader', label: 'Reader' },
  { key: 'Summarizer', label: 'Summarizer' },
  { key: 'Quiz', label: 'Quiz' },
  { key: 'Review Planner', label: 'Review Planner' },
  { key: 'researcher', label: 'Researcher' },
  { key: 'local-analyst', label: 'Local Analyst' },
  { key: 'writer', label: 'Writer' },
  { key: 'reviewer', label: 'Reviewer' },
  { key: 'flashcard-generator', label: 'Flashcard Generator' },
  { key: 'quiz-generator', label: 'Quiz Generator' },
  { key: 'study-planner', label: 'Study Planner' },
]

function toggleTool(key) {
  const idx = form.value.tools.indexOf(key)
  if (idx > -1) form.value.tools.splice(idx, 1)
  else form.value.tools.push(key)
}

function toggleSkill(key) {
  const idx = form.value.skills.indexOf(key)
  if (idx > -1) form.value.skills.splice(idx, 1)
  else form.value.skills.push(key)
}

function toggleSubAgent(key) {
  const idx = form.value.subAgents.indexOf(key)
  if (idx > -1) form.value.subAgents.splice(idx, 1)
  else form.value.subAgents.push(key)
}

function save() {
  if (!form.value.name) return
  form.value.architecture = 'react'
  form.value.reflectPersist = false
  form.value.complexityClassifier = false
  if (isEdit.value) {
    agentsStore.updateAgent(route.params.id, form.value)
  } else {
    agentsStore.addAgent(form.value)
  }
  router.push('/agents')
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-6 lg:px-8 py-5">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <button class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'hover:bg-d3 text-wt-aux' : 'hover:bg-l3 text-lt-aux'" @click="router.push('/agents')">
          <i class="ri-arrow-left-line text-[16px]" />
        </button>
        <h1 class="text-[20px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ isEdit ? '编辑 Agent' : '创建 Agent' }}</h1>
      </div>
      <div class="flex items-center gap-2">
        <n-button @click="router.push('/agents')">取消</n-button>
        <n-button type="primary" @click="save">保存</n-button>
      </div>
    </div>

    <div class="space-y-6">
      <!-- Basic Info -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <h3 class="text-[14px] font-semibold mb-4" :class="isDark ? 'text-wt-main' : 'text-lt-main'">基础信息</h3>
        <n-form label-placement="top">
          <div class="grid grid-cols-2 gap-4">
            <n-form-item label="名称（必填）">
              <n-input v-model:value="form.name" placeholder="Agent 名称" />
            </n-form-item>
            <n-form-item label="描述（可选）">
              <n-input v-model:value="form.description" placeholder="功能简介" />
            </n-form-item>
          </div>
        </n-form>
      </section>

      <!-- Runtime limits -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <h3 class="text-[14px] font-semibold mb-4 flex items-center gap-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
          <i class="ri-timer-line text-brand-400 text-[14px]" />运行限制
        </h3>
        <n-form label-placement="top">
          <n-form-item label="最大迭代次数">
            <n-input-number v-model:value="form.maxIterations" :min="0" :max="200" placeholder="0 = 不限制" style="width: 200px" />
          </n-form-item>
        </n-form>
      </section>

      <!-- System Prompt -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <h3 class="text-[14px] font-semibold mb-4" :class="isDark ? 'text-wt-main' : 'text-lt-main'">系统提示词</h3>
        <n-input
          v-model:value="form.systemPrompt"
          type="textarea"
          placeholder="定义 Agent 的行为逻辑、人设、工作流程..."
          :rows="8"
        />
      </section>

      <!-- Permissions -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <h3 class="text-[14px] font-semibold mb-4" :class="isDark ? 'text-wt-main' : 'text-lt-main'">权限配置</h3>
        <div class="space-y-3">
          <div v-for="(label, key) in { fileRead: '文件读取权限', fileWrite: '文件写入权限', fileRename: '文件重命名权限', kbSearch: '知识库检索权限' }" :key="key" class="flex items-center justify-between py-2">
            <div>
              <span class="text-[13px]" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ label }}</span>
              <span v-if="key === 'kbSearch'" class="text-[10px] ml-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">默认开启</span>
            </div>
            <n-switch v-model:value="form.permissions[key]" />
          </div>
        </div>
        <div class="mt-3 px-3 py-2 rounded-lg text-[11px]" :class="isDark ? 'bg-d3 text-wt-aux' : 'bg-l3 text-lt-aux'">
          所有文件操作仅限授权根目录内
        </div>
      </section>

      <!-- Tools -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <h3 class="text-[14px] font-semibold mb-4" :class="isDark ? 'text-wt-main' : 'text-lt-main'">工具配置</h3>
        <div class="grid grid-cols-2 gap-2">
          <div
            v-for="tool in availableTools"
            :key="tool.key"
            class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
            :class="form.tools.includes(tool.key)
              ? (isDark ? 'bg-brand-400/10 border border-brand-400/20' : 'bg-brand-50 border border-brand-100')
              : (isDark ? 'bg-d3 border border-transparent hover:border-d4' : 'bg-l3 border border-transparent hover:border-bdrF')"
            @click="toggleTool(tool.key)"
          >
            <div
              class="w-5 h-5 rounded flex items-center justify-center text-[10px]"
              :class="form.tools.includes(tool.key) ? 'bg-brand-400 text-white' : (isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux')"
            >
              <i v-if="form.tools.includes(tool.key)" class="ri-check-line" />
            </div>
            <i :class="`${tool.icon} text-[14px] ${form.tools.includes(tool.key) ? (isDark ? 'text-brand-400' : 'text-brand-600') : (isDark ? 'text-wt-aux' : 'text-lt-aux')}`" />
            <span class="text-[12px]" :class="form.tools.includes(tool.key) ? (isDark ? 'text-brand-400' : 'text-brand-600') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ tool.label }}</span>
          </div>
        </div>
      </section>

      <!-- Skills -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <h3 class="text-[14px] font-semibold mb-4" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Skills 配置</h3>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="skill in availableSkills"
            :key="skill.key"
            class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all"
            :class="form.skills.includes(skill.key)
              ? (isDark ? 'bg-brand-400/10 border border-brand-400/20' : 'bg-brand-50 border border-brand-100')
              : (isDark ? 'bg-d3 border border-transparent' : 'bg-l3 border border-transparent')"
            @click="toggleSkill(skill.key)"
          >
            <div
              class="w-4 h-4 rounded flex items-center justify-center text-[9px]"
              :class="form.skills.includes(skill.key) ? 'bg-brand-400 text-white' : (isDark ? 'bg-d4' : 'bg-l4')"
            >
              <i v-if="form.skills.includes(skill.key)" class="ri-check-line" />
            </div>
            <span class="text-[12px]" :class="form.skills.includes(skill.key) ? (isDark ? 'text-brand-400' : 'text-brand-600') : (isDark ? 'text-wt-aux' : 'text-lt-aux')">{{ skill.label }}</span>
          </div>
        </div>
      </section>

      <!-- SubAgents -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <h3 class="text-[14px] font-semibold mb-4" :class="isDark ? 'text-wt-main' : 'text-lt-main'">SubAgents 配置</h3>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="sub in availableSubAgents"
            :key="sub.key"
            class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all"
            :class="form.subAgents.includes(sub.key)
              ? (isDark ? 'bg-agent-400/10 border border-agent-400/20' : 'bg-agent-50 border border-agent-100')
              : (isDark ? 'bg-d3 border border-transparent' : 'bg-l3 border border-transparent')"
            @click="toggleSubAgent(sub.key)"
          >
            <div
              class="w-4 h-4 rounded flex items-center justify-center text-[9px]"
              :class="form.subAgents.includes(sub.key) ? 'bg-agent-400 text-white' : (isDark ? 'bg-d4' : 'bg-l4')"
            >
              <i v-if="form.subAgents.includes(sub.key)" class="ri-check-line" />
            </div>
            <span class="text-[12px]" :class="form.subAgents.includes(sub.key) ? (isDark ? 'text-agent-400' : 'text-agent-500') : (isDark ? 'text-wt-aux' : 'text-lt-aux')">{{ sub.label }}</span>
          </div>
        </div>
      </section>

      <!-- Save Button -->
      <div class="flex justify-end gap-3 pt-2 pb-8">
        <n-button @click="router.push('/agents')">取消</n-button>
        <n-button type="primary" size="large" @click="save">{{ isEdit ? '保存修改' : '创建 Agent' }}</n-button>
      </div>
    </div>
  </div>
</template>
