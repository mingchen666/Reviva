<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAgentsStore } from '@/stores/agents'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import MainContent from '@/components/layout/MainContent.vue'
import SkillDetail from './sections/SkillDetail.vue'
import SkillMarket from './sections/SkillMarket.vue'
import SkillList from './sections/SkillList.vue'
import SkillEdit from './sections/SkillEdit.vue'
import SkillImport from './sections/SkillImport.vue'
import SkillAiGenerate from './sections/SkillAiGenerate.vue'

const appStore = useAppStore()
const agentsStore = useAgentsStore()
const msg = useMessage()
const mbox = useMessageBox()
const isDark = computed(() => appStore.isDark)
const customSkills = computed(() => agentsStore.customSkills)

const selectedSkill = ref(null)
const activeTab = ref('builtin')
const marketCat = ref('全部')
const showEdit = ref(false)
const showImport = ref(false)
const showAi = ref(false)
const modalSkill = ref(null)
const importBusy = ref(false)
const saveBusy = ref(false)

function openMine() {
  activeTab.value = 'mine'
  selectedSkill.value = null
}

function startCreate() {
  modalSkill.value = {
    id: '', englishName: '', name: '', desc: '', icon: 'ri-brain-line', color: '#6C8AFF', category: '其他',
    promptContent: '', outputTypes: [], allowedTools: [], _isNew: true,
  }
  showEdit.value = true
}

async function startEditSkill() {
  if (!selectedSkill.value) return
  const clone = JSON.parse(JSON.stringify(selectedSkill.value))
  const file = await window.electronAPI?.skill?.readFile?.(clone.id, 'SKILL.md')
  clone.promptContent = file?.success ? file.data : (clone.promptContent || clone.prompt_content || '')
  clone.englishName = clone.id
  clone._isNew = false
  modalSkill.value = clone
  showEdit.value = true
}

async function saveSkill() {
  if (!modalSkill.value || saveBusy.value) return
  const skill = JSON.parse(JSON.stringify(modalSkill.value))
  if (!skill.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.id)) return msg.warning('请输入合法的英文 Skill ID')
  if (!skill.name?.trim()) return msg.warning('请输入显示名称')
  if (!skill.promptContent?.trim()) return msg.warning('请填写 SKILL.md 内容')
  saveBusy.value = true
  try {
    if (skill._isNew) await agentsStore.addSkill(skill)
    else await agentsStore.updateSkill(skill.id, skill)
    selectedSkill.value = agentsStore.customSkills.find(item => item.id === skill.id) || null
    showEdit.value = false
    modalSkill.value = null
    msg.success(skill._isNew ? 'Skill 创建成功' : 'Skill 已保存')
  } catch (err) {
    msg.error(err.message || '保存失败')
  } finally {
    saveBusy.value = false
  }
}

function handleGenerated(skill) {
  showAi.value = false
  modalSkill.value = JSON.parse(JSON.stringify({ ...skill, _isNew: true }))
  showEdit.value = true
}

async function handleImport(payload) {
  if (importBusy.value) return
  importBusy.value = true
  try {
    const result = await agentsStore.importSkill(payload.sessionId, payload.options)
    if (!result?.success) throw new Error(result?.error || '导入失败')
    const id = result.data?.id || payload.options.id
    selectedSkill.value = agentsStore.customSkills.find(item => item.id === id) || null
    showImport.value = false
    msg.success('Skill 导入成功')
  } catch (err) {
    msg.error(err.message || '导入失败')
  } finally {
    importBusy.value = false
  }
}

async function deleteSkill() {
  const skill = selectedSkill.value
  if (!skill || skill.source === 'platform' || skill.builtin) return
  const refs = [
    ...agentsStore.agents.filter(agent => agent.skills?.includes(skill.id)).map(agent => agent.name),
    ...agentsStore.customSubAgents.filter(agent => agent.skills?.includes(skill.id)).map(agent => agent.name),
  ]
  const confirmed = await mbox.confirm({
    title: refs.length ? '解除绑定并删除' : '确认删除 Skill',
    subtitle: refs.length ? `正在被 ${refs.length} 个 Agent 使用` : '此操作不可撤销',
    message: refs.length ? `删除「${skill.name}」会同时从 ${refs.join('、')} 中解除绑定。` : `永久删除「${skill.name}」及其全部文件？`,
    variant: 'danger', confirmText: refs.length ? '解除绑定并删除' : '确认删除', cancelText: '取消',
  })
  if (!confirmed) return
  try {
    const result = await agentsStore.removeSkill(skill.id, { force: refs.length > 0 })
    if (!result?.success) throw new Error(result?.error || '删除失败')
    selectedSkill.value = null
    msg.success('Skill 已删除')
  } catch (err) {
    msg.error(err.message || '删除失败')
  }
}
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <LeftPanel :width="260" :resizable="false">
      <div class="h-10 flex items-center px-3 shrink-0 gap-1" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
        <button class="flex-1 h-7 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors" :class="activeTab === 'builtin' ? (isDark ? 'bg-d3 text-wt-main' : 'bg-l3 text-lt-main') : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')" @click="activeTab = 'builtin'; selectedSkill = null">
          <i class="ri-shield-star-line text-[12px]" />内置
        </button>
        <button class="flex-1 h-7 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors" :class="activeTab === 'mine' ? (isDark ? 'bg-d3 text-wt-main' : 'bg-l3 text-lt-main') : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')" @click="openMine">
          <i class="ri-user-settings-line text-[12px]" />自定义
        </button>
      </div>

      <div v-if="activeTab === 'builtin'" class="flex-1 overflow-y-auto p-3">
        <div class="px-2 py-2.5 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          <div class="font-semibold mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ agentsStore.platformSkills.length }} 个内置 Skills</div>
          跟随应用更新并保持只读，可直接绑定到 Agent。
        </div>
      </div>

      <div v-else class="flex-1 flex flex-col min-h-0">
        <div class="px-3 py-2 flex items-center gap-1.5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <button class="flex-1 h-7 rounded-md text-[12.5px] font-semibold flex items-center justify-center gap-1" :class="isDark ? 'bg-agent-400/10 text-agent-400 hover:bg-agent-400/15' : 'bg-agent-50 text-agent-600 hover:bg-agent-100'" title="AI 创建 Skill" @click="showAi = true"><i class="ri-sparkling-2-line" />AI 创建</button>
          <button class="flex-1 h-7 rounded-md flex items-center gap-1 justify-center" :class="isDark ? 'bg-d3 hover:text-wt-main' : 'bg-l3 hover:text-lt-main'" title="导入 Skill" @click="showImport = true"><i class="ri-upload-cloud-line text-[14px]" /> 导入</button>
          <button class="flex-1 h-7 rounded-md flex items-center gap-1 justify-center" :class="isDark ? 'bg-d3 hover:text-wt-main' : 'bg-l3 hover:text-lt-main'" title="手动创建 Skill" @click="startCreate"><i class="ri-add-line text-[16px]" /> 创建</button>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
          <SkillList v-for="skill in customSkills" :key="skill.id" :skill="skill" :selected="selectedSkill?.id === skill.id" :is-dark="isDark" @click="selectedSkill = skill" />
          <div v-if="!customSkills.length" class="py-10 px-4 text-center text-[11px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">还没有自定义 Skill</div>
        </div>
      </div>
    </LeftPanel>

    <MainContent padding="p-0">
      <SkillMarket v-if="activeTab === 'builtin'" :is-dark="isDark" v-model:active-cat="marketCat" />

      <template v-else>
        <SkillDetail v-if="selectedSkill" :key="selectedSkill.id" :skill="selectedSkill" :is-dark="isDark" @edit="startEditSkill" @delete="deleteSkill" />
        <div v-else class="flex-1 flex flex-col overflow-hidden">
          <div class="h-10 flex items-center px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
            <i class="ri-flashlight-line text-brand-400 text-[14px] mr-2" /><span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">自定义 Skills</span>
            <span class="ml-2 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">当前工作区</span>
          </div>
          <div class="flex-1 overflow-y-auto">
            <div class="max-w-4xl mx-auto px-8 py-12">
              <h1 class="text-[20px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">让 Agent 按你的方式工作</h1>
              <p class="mt-2 text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">用一句话创建 Skill，或导入包含 SKILL.md 的 ZIP、文件夹和单个文件。Reviva 会自动补齐 config.json 并检查与内置能力的冲突。</p>
              <div class="mt-8 divide-y" :class="isDark ? 'divide-d4 border-y border-d4' : 'divide-bdrL border-y border-bdrL'">
                <button class="w-full py-4 flex items-center gap-4 text-left group" @click="showAi = true"><i class="ri-sparkling-2-line w-9 h-9 rounded-lg flex items-center justify-center text-[18px] text-agent-400" :class="isDark ? 'bg-agent-400/8' : 'bg-agent-50'" /><div class="flex-1"><div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">AI 创建</div><div class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">描述需求，生成完整 SKILL.md 后进入编辑确认</div></div><i class="ri-arrow-right-s-line" :class="isDark ? 'text-wt-dim group-hover:text-wt-sub' : 'text-lt-aux group-hover:text-lt-sub'" /></button>
                <button class="w-full py-4 flex items-center gap-4 text-left group" @click="showImport = true"><i class="ri-upload-cloud-line w-9 h-9 rounded-lg flex items-center justify-center text-[18px] text-brand-400" :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'" /><div class="flex-1"><div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">导入已有 Skill</div><div class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">支持 ZIP、完整文件夹和单个 SKILL.md</div></div><i class="ri-arrow-right-s-line" :class="isDark ? 'text-wt-dim group-hover:text-wt-sub' : 'text-lt-aux group-hover:text-lt-sub'" /></button>
                <button class="w-full py-4 flex items-center gap-4 text-left group" @click="startCreate"><i class="ri-code-s-slash-line w-9 h-9 rounded-lg flex items-center justify-center text-[18px] text-emerald-400" :class="isDark ? 'bg-emerald-400/8' : 'bg-emerald-50'" /><div class="flex-1"><div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">手动创建</div><div class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">直接编辑 ID、展示信息和 SKILL.md</div></div><i class="ri-arrow-right-s-line" :class="isDark ? 'text-wt-dim group-hover:text-wt-sub' : 'text-lt-aux group-hover:text-lt-sub'" /></button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </MainContent>

    <SkillEdit v-if="showEdit && modalSkill" :edit-skill="modalSkill" :is-dark="isDark" @cancel="showEdit = false; modalSkill = null" @save="saveSkill" />
    <SkillImport v-if="showImport" :is-dark="isDark" :busy="importBusy" @cancel="showImport = false" @import="handleImport" />
    <SkillAiGenerate v-if="showAi" :is-dark="isDark" @cancel="showAi = false" @generate="handleGenerated" />
  </div>
</template>
