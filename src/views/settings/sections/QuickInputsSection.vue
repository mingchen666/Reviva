<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { QUICK_INPUT_TYPES, useQuickInputsStore } from '@/stores/quickInputs'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import MsModal from '@/components/MsModal/MsModal.vue'

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const quickStore = useQuickInputsStore()
const msg = useMessage()
const mbox = useMessageBox()
const isDark = computed(() => appStore.isDark)

const search = ref('')
const typeFilter = ref('all')
const showModal = ref(false)
const editingId = ref('')
const saving = ref(false)
const typeSelectorOpen = ref(false)
const typeSelectorRef = ref(null)
const form = reactive({ title: '', type: 'command', description: '', content: '', enabled: true })

const typeDescriptions = {
  command: '保存反复使用的完整提问或任务',
  context: '补充学习背景、目标与长期约定',
  format: '规定答案结构、语气与呈现方式',
}
const contentPlaceholders = {
  command: '输入希望反复使用的完整提问或任务。\n例如：请用费曼学习法解释这个知识点，先讲核心概念，再举一个生活中的例子。',
  context: '输入帮助 Agent 理解你的学习背景、目标或习惯的信息。\n例如：我正在准备英语四级考试，基础一般，请优先使用常见词汇并附上中文解释。',
  format: '输入你希望答案采用的结构、语气或呈现方式。\n例如：请按“重点概念、示例、易错点、练习题”四个部分回答。\n再如：请使用 Markdown 表格输出，列为“知识点、定义、示例、易错点”，每行一个知识点。',
}
const typeOptions = Object.entries(QUICK_INPUT_TYPES).map(([value, meta]) => ({ value, ...meta, description: typeDescriptions[value] }))
const selectedTypeOption = computed(() => typeOptions.find(option => option.value === form.type) || typeOptions[0])
const contentPlaceholder = computed(() => contentPlaceholders[form.type] || contentPlaceholders.command)
const fieldClass = computed(() => isDark.value
  ? 'field-control-dark bg-d0 text-wt-main placeholder-wt-dim'
  : 'field-control-light bg-l1 text-lt-main placeholder-lt-aux')
const canReorder = computed(() => !search.value.trim() && typeFilter.value === 'all')
const enabledCount = computed(() => quickStore.items.filter(item => item.enabled).length)
const hasActiveFilter = computed(() => !!search.value.trim() || typeFilter.value !== 'all')
const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase()
  return quickStore.items.filter(item => {
    if (typeFilter.value !== 'all' && item.type !== typeFilter.value) return false
    if (!query) return true
    return [item.title, item.description, item.content].some(value => String(value || '').toLowerCase().includes(query))
  })
})

function resetForm() {
  form.title = ''
  form.type = 'command'
  form.description = ''
  form.content = ''
  form.enabled = true
}

function openCreate() {
  editingId.value = ''
  resetForm()
  typeSelectorOpen.value = false
  showModal.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.title = item.title || ''
  form.type = item.type || 'command'
  form.description = item.description || ''
  form.content = item.content || ''
  form.enabled = item.enabled !== false
  typeSelectorOpen.value = false
  showModal.value = true
}

function selectType(option) {
  form.type = option.value
  typeSelectorOpen.value = false
}

function closeTypeSelectorOnOutside(event) {
  if (typeSelectorOpen.value && !typeSelectorRef.value?.contains(event.target)) typeSelectorOpen.value = false
}

function typeMeta(type) {
  return QUICK_INPUT_TYPES[type] || QUICK_INPUT_TYPES.command
}

function normalizeError(error) {
  const code = error?.code || ''
  if (code === 'QUICK_INPUT_TITLE_REQUIRED') return '请输入快捷输入名称'
  if (code === 'QUICK_INPUT_TITLE_TOO_LONG') return '名称不能超过 20 个字符'
  if (code === 'QUICK_INPUT_CONTENT_REQUIRED') return '请输入快捷输入内容'
  if (code === 'QUICK_INPUT_TYPE_INVALID') return '请选择有效类型'
  if (String(error?.message || '').includes('UNIQUE')) return '名称已存在，请换一个名称'
  return error?.message || '保存失败，请稍后重试'
}

async function save() {
  form.title = form.title.trim()
  form.description = form.description.trim()
  form.content = form.content.trim()
  if (!form.title) return msg.warning('请输入快捷输入名称')
  if (form.title.length > 20) return msg.warning('名称不能超过 20 个字符')
  if (!form.content) return msg.warning('请输入快捷输入内容')

  saving.value = true
  try {
    const payload = { ...form }
    if (editingId.value) await quickStore.update(editingId.value, payload)
    else await quickStore.create(payload)
    showModal.value = false
    msg.success(editingId.value ? '快捷输入已更新' : '快捷输入已创建')
  } catch (error) {
    msg.error(normalizeError(error))
  } finally {
    saving.value = false
  }
}

async function toggle(item) {
  try {
    await quickStore.update(item.id, { enabled: !item.enabled })
  } catch (error) {
    msg.error(normalizeError(error))
  }
}

async function remove(item) {
  const confirmed = await mbox.confirm({
    title: '删除快捷输入',
    message: `确定删除「${item.title}」吗？已有消息中的内容快照不会受到影响。`,
    confirmText: '删除',
    variant: 'danger',
  })
  if (!confirmed) return
  try {
    await quickStore.remove(item.id)
    msg.success('快捷输入已删除')
  } catch (error) {
    msg.error(normalizeError(error))
  }
}

async function moveItem(item, delta) {
  const index = quickStore.items.findIndex(candidate => candidate.id === item.id)
  const next = index + delta
  if (index < 0 || next < 0 || next >= quickStore.items.length) return
  const ids = quickStore.items.map(candidate => candidate.id)
  ;[ids[index], ids[next]] = [ids[next], ids[index]]
  try {
    await quickStore.reorder(ids)
  } catch (error) {
    msg.error(error?.message || '排序保存失败')
  }
}

async function toggleFeature() {
  await settingsStore.savePreference('quickInputEnabled', !settingsStore.quickInputEnabled)
}

onMounted(() => {
  quickStore.load().catch(() => {})
  document.addEventListener('pointerdown', closeTypeSelectorOnOutside, true)
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', closeTypeSelectorOnOutside, true))
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-5 space-y-3">
    <section class="rounded-xl p-4 flex items-start gap-3" :class="isDark ? 'bg-blue-400/6 border border-blue-400/15' : 'bg-blue-50 border border-blue-100'">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-blue-400/15' : 'bg-blue-100'">
        <i class="ri-at-line text-[15px]" :class="isDark ? 'text-blue-400' : 'text-blue-600'" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-[13px] font-semibold" :class="isDark ? 'text-blue-400' : 'text-blue-700'">@ 快捷输入</div>
        <div class="mt-1 space-y-1 text-[12px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          <p>在聊天中输入 @，即可搜索并选择常用内容；选择后显示为 @名称胶囊，发送时自动展开，重试和编辑重发仍使用当时的内容快照。数据保存在当前授权根目录中，此功能默认关闭。</p>
          <p><b>快捷指令</b>适合保存反复使用的完整提问或任务；<b>背景信息</b>用于补充学习背景、目标与长期约定；<b>输出格式</b>用于规定答案结构、语气与呈现方式。</p>
        </div>
      </div>
      <button type="button" class="toggle mt-0.5 shrink-0" :class="settingsStore.quickInputEnabled ? 'on' : (isDark ? 'off' : 'light-off')" @click="toggleFeature" :aria-label="settingsStore.quickInputEnabled ? '关闭快捷输入' : '启用快捷输入'" />
    </section>

    <section class="rounded-lg overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b" :class="isDark ? 'border-d4' : 'border-bdrL'">
        <div class="search-field flex items-center gap-2 min-w-[210px] flex-1 h-8 px-2.5 rounded-md" :class="isDark ? 'bg-d0' : 'bg-l1'">
          <i class="ri-search-line text-[13px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
          <input v-model="search" class="min-w-0 flex-1 border-0 p-0 bg-transparent outline-none shadow-none text-[12px]" :class="isDark ? 'text-wt-main placeholder-wt-dim' : 'text-lt-main placeholder-lt-aux'" placeholder="搜索名称、描述或内容" />
        </div>
        <div class="segmented-control" :class="isDark ? 'bg-d0' : 'bg-l1'">
          <button type="button" :class="typeFilter === 'all' ? 'active' : ''" @click="typeFilter = 'all'">全部</button>
          <button v-for="option in typeOptions" :key="option.value" type="button" :class="typeFilter === option.value ? 'active' : ''" @click="typeFilter = option.value">{{ option.label.replace('快捷', '') }}</button>
        </div>
        <span class="text-[10.5px] tabular-nums" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ enabledCount }}/{{ quickStore.items.length }} 启用</span>
        <button type="button" class="h-8 px-3 rounded-md text-[14px] font-medium flex items-center gap-1.5" :class="isDark ? 'bg-brand-400 text-white hover:bg-brand-300' : 'bg-brand-600 text-white hover:bg-brand-700'" @click="openCreate">
          <i class="ri-add-line text-[18px]" /> 新建
        </button>
      </div>

      <div v-if="!filteredItems.length" class="px-5 py-12 text-center">
        <i class="ri-at-line text-[26px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <div class="mt-2 text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ hasActiveFilter ? '没有匹配的快捷输入' : '暂无快捷输入' }}</div>
        <div class="mt-1 text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ hasActiveFilter ? '请尝试其他关键词或类型' : '创建后，在聊天输入 @ 即可搜索' }}</div>
      </div>

      <div v-else class="divide-y" :class="isDark ? 'divide-d4' : 'divide-bdrL'">
        <div v-for="(item, index) in filteredItems" :key="item.id" class="flex items-center gap-3 px-4 py-3 transition-colors" :class="isDark ? 'hover:bg-white/3' : 'hover:bg-white/70'">
          <div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0" :class="isDark ? 'bg-blue-400/10 text-blue-400' : 'bg-blue-50 text-blue-600'">
            <i :class="typeMeta(item.type).icon" class="text-[15px]" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 min-w-0">
              <span class="quick-item-title text-[12.5px] truncate" :class="isDark ? 'is-dark' : ''">@{{ item.title }}</span>
              <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px]" :class="isDark ? 'bg-d4 text-wt-sub' : 'bg-l4 text-lt-aux'">{{ typeMeta(item.type).label }}</span>
            </div>
            <div class="mt-1 text-[11px] truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-aux'" :title="item.description || item.content">{{ item.description || item.content }}</div>
          </div>
          <button type="button" class="toggle shrink-0" :class="item.enabled ? 'on' : (isDark ? 'off' : 'light-off')" :aria-label="item.enabled ? '停用' : '启用'" @click="toggle(item)" />
          <div class="flex items-center gap-0.5 shrink-0">
            <button type="button" class="icon-btn" title="上移" :class="isDark ? 'text-wt-dim hover:bg-white/6' : 'text-lt-aux hover:bg-l4'" :disabled="!canReorder || index === 0" @click="moveItem(item, -1)"><i class="ri-arrow-up-line" /></button>
            <button type="button" class="icon-btn" title="下移" :class="isDark ? 'text-wt-dim hover:bg-white/6' : 'text-lt-aux hover:bg-l4'" :disabled="!canReorder || index === filteredItems.length - 1" @click="moveItem(item, 1)"><i class="ri-arrow-down-line" /></button>
            <button type="button" class="icon-btn" title="编辑" :class="isDark ? 'text-wt-dim hover:bg-white/6' : 'text-lt-aux hover:bg-l4'" @click="openEdit(item)"><i class="ri-edit-line" /></button>
            <button type="button" class="icon-btn" title="删除" :class="isDark ? 'text-wt-dim hover:bg-red-400/10 hover:text-red-300' : 'text-lt-aux hover:bg-red-50 hover:text-red-500'" @click="remove(item)"><i class="ri-delete-bin-line" /></button>
          </div>
        </div>
      </div>
    </section>

    <MsModal v-if="showModal" v-model:show="showModal" :width="560" :show-footer="true">
      <template #header><span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ editingId ? '编辑快捷输入' : '新建快捷输入' }}</span></template>
      <div class="space-y-3.5">
        <label class="block"><span class="field-label" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">名称</span><input v-model="form.title" maxlength="20" class="field-input" :class="fieldClass" placeholder="例如：论文润色" /></label>
        <div>
          <span class="field-label" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">类型</span>
          <div ref="typeSelectorRef" class="type-select relative">
            <button
              type="button"
              class="type-select-trigger"
              :class="isDark ? 'field-control-dark bg-d0 text-wt-sub' : 'field-control-light bg-l1 text-lt-sub'"
              :aria-expanded="typeSelectorOpen"
              @click="typeSelectorOpen = !typeSelectorOpen">
              <span class="type-select-icon" :class="`type-select-icon--${selectedTypeOption.value}`"><i :class="selectedTypeOption.icon" /></span>
              <span class="min-w-0 flex-1 text-left">
                <b>{{ selectedTypeOption.label }}</b>
                <small>{{ selectedTypeOption.description }}</small>
              </span>
              <i class="ri-arrow-down-s-line type-select-chevron" :class="typeSelectorOpen ? 'open' : ''" />
            </button>
            <div v-if="typeSelectorOpen" class="type-select-menu" :class="isDark ? 'bg-d2 border-d4' : 'bg-white border-bdrF'">
              <button
                v-for="option in typeOptions"
                :key="option.value"
                type="button"
                class="type-select-option"
                :class="[
                  isDark ? 'text-wt-sub' : 'text-lt-sub',
                  form.type === option.value ? (isDark ? 'selected-dark' : 'selected-light') : (isDark ? 'hover:bg-white/5' : 'hover:bg-l3'),
                ]"
                @click="selectType(option)">
                <span class="type-select-icon" :class="`type-select-icon--${option.value}`"><i :class="option.icon" /></span>
                <span class="min-w-0 flex-1 text-left"><b>{{ option.label }}</b><small>{{ option.description }}</small></span>
                <i v-if="form.type === option.value" class="ri-check-line text-[14px] text-brand-400" />
              </button>
            </div>
          </div>
        </div>
        <label class="block"><span class="field-label" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">描述 <em>可选</em></span><input v-model="form.description" class="field-input" :class="fieldClass" maxlength="100" placeholder="用于菜单搜索和辅助说明" /></label>
        <label class="block"><span class="field-label" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">实际内容</span><textarea v-model="form.content" rows="8" class="field-input resize-y leading-relaxed" :class="fieldClass" :placeholder="contentPlaceholder" /></label>
        <div class="flex items-center justify-between gap-3 py-1">
          <div><div class="text-[11.5px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">创建后启用</div><div class="mt-0.5 text-[10px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">停用的条目不会出现在 @ 搜索结果中</div></div>
          <button type="button" class="toggle shrink-0" :class="form.enabled ? 'on' : (isDark ? 'off' : 'light-off')" @click="form.enabled = !form.enabled" :aria-label="form.enabled ? '停用此快捷输入' : '启用此快捷输入'" />
        </div>
      </div>
      <template #footer>
        <button type="button" class="modal-btn secondary" :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l3'" @click="showModal = false">取消</button>
        <button type="button" class="modal-btn primary" :disabled="saving" @click="save">{{ saving ? '保存中...' : '保存' }}</button>
      </template>
    </MsModal>
  </div>
</template>

<style scoped>
.toggle { position: relative; width: 32px; height: 18px; border-radius: 9px; background: #cbd5e1; transition: background .18s ease; }
.toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: white; box-shadow: 0 1px 2px #0002; transition: transform .18s ease; }
.toggle.on { background: var(--brand); }
.toggle.on::after { transform: translateX(14px); }
.toggle.off { background: #475467; }
.toggle.light-off { background: #cbd5e1; }
.icon-btn { width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; transition: background .15s; }
.icon-btn:disabled { opacity: .3; cursor: not-allowed; }
.quick-item-title { color: #3a56d4; font-weight: 700; }
.quick-item-title.is-dark { color: #9aa8ff; }
.search-field { transition: box-shadow .14s ease, background .14s ease; }
.search-field:focus-within { box-shadow: inset 0 0 0 1px rgba(var(--brand-rgb),.5); }
.segmented-control { display: inline-flex; align-items: center; height: 32px; padding: 2px; border-radius: 6px; }
.segmented-control button { height: 26px; padding: 0 8px; border-radius: 4px; color: #98a2b3; font-size: 10.5px; font-weight: 500; transition: color .14s ease, background .14s ease; }
.segmented-control button.active { color: var(--brand); background: rgba(var(--brand-rgb),.12); }
.field-label { display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; }
.field-label em { margin-left: 4px; font-style: normal; font-weight: 400; color: #98a2b3; }
.field-input { width: 100%; min-height: 34px; padding: 7px 9px; appearance: none; border: 0; border-radius: 5px; outline: none; font-size: 12px; transition: box-shadow .14s ease; }
.field-input:focus { box-shadow: inset 0 0 0 1px var(--brand), 0 0 0 3px rgba(var(--brand-rgb),.12); }
.type-select-trigger { width: 100%; min-height: 48px; padding: 7px 9px; display: flex; align-items: center; gap: 9px; border: 0; border-radius: 6px; outline: none; transition: box-shadow .14s ease; }
.type-select-trigger:focus-visible { box-shadow: inset 0 0 0 1px var(--brand), 0 0 0 3px rgba(var(--brand-rgb),.12); }
.field-control-dark { box-shadow: inset 0 0 0 1px rgba(255,255,255,.1); }
.field-control-light { box-shadow: inset 0 0 0 1px rgba(26,26,46,.12); }
.type-select-trigger b, .type-select-option b { display: block; font-size: 11.5px; font-weight: 600; }
.type-select-trigger small, .type-select-option small { display: block; margin-top: 2px; color: #98a2b3; font-size: 9.5px; line-height: 1.35; }
.type-select-icon { width: 29px; height: 29px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 14px; }
.type-select-icon--command { color: #4a6cff; background: rgba(74,108,255,.1); }
.type-select-icon--context { color: #8b5cf6; background: rgba(139,92,246,.1); }
.type-select-icon--format { color: #f59e0b; background: rgba(245,158,11,.1); }
.type-select-chevron { flex-shrink: 0; color: #98a2b3; font-size: 16px; transition: transform .14s ease; }
.type-select-chevron.open { transform: rotate(180deg); }
.type-select-menu { position: absolute; z-index: 20; top: calc(100% + 5px); left: 0; right: 0; padding: 4px; border: 1px solid; border-radius: 7px; box-shadow: 0 12px 28px rgba(0,0,0,.18); }
.type-select-option { width: 100%; min-height: 48px; padding: 7px; display: flex; align-items: center; gap: 9px; border-radius: 5px; transition: background .14s ease; }
.type-select-option.selected-dark { background: rgba(var(--brand-rgb),.12); }
.type-select-option.selected-light { background: rgba(var(--brand-rgb),.08); }
.modal-btn { height: 31px; padding: 0 14px; border-radius: 5px; font-size: 12px; font-weight: 600; }
.modal-btn.secondary { background: transparent; }
.modal-btn.primary { color: white; background: var(--brand); }
.modal-btn:disabled { opacity: .55; cursor: not-allowed; }
</style>
