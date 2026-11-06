<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import MsModal from '@/components/MsModal/MsModal.vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const message = useMessage()
const messageBox = useMessageBox()

// Modal state
const showBasicModal = ref(false)
const showLargeModal = ref(false)
const showNoFooterModal = ref(false)
const showLockedModal = ref(false)
const showRichModal = ref(false)

const lastResult = ref('—')

// 新手引导 — 模拟数据（复刻 StartupGuideModal 视觉，不依赖 store）
const showGuideModal = ref(false)
const guideSteps = [
  { key: 'workspace', index: 1, title: '设置授权根目录', label: '必须', icon: 'ri-folder-shield-line', color: 'emerald', ready: true, status: '已设置', desc: 'D:\\MindSpace\\Workspace', action: '设置目录' },
  { key: 'models', index: 2, title: '配置模型服务', label: '推荐', icon: 'ri-ai-generate-3d-line', color: 'brand', ready: true, status: '已可用', desc: '已配置 OpenAI、DeepSeek 共 2 个服务商', action: '配置模型' },
  { key: 'defaults', index: 3, title: '确认默认模型', label: '推荐', icon: 'ri-cpu-line', color: 'sky', ready: false, status: '建议检查', desc: '对话: GPT-4o · 标题: GPT-4o-mini · 翻译: 未设置', action: '默认模型' },
  { key: 'agents', index: 4, title: '使用和编辑 Agent', label: '可选', icon: 'ri-sparkling-2-line', color: 'violet', ready: true, status: '可开始', desc: '4 个内置 Agent · 2 个自定义 Agent', action: '查看 Agent', secondaryAction: '创建 Agent' },
]
const guideProgress = 2

function guideIconClass(step) {
  const colorMap = {
    emerald: isDark.value ? 'bg-emerald-400/12 text-emerald-400' : 'bg-emerald-50 text-emerald-600',
    brand: isDark.value ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-600',
    sky: isDark.value ? 'bg-sky-400/12 text-sky-400' : 'bg-sky-50 text-sky-600',
    violet: isDark.value ? 'bg-violet-400/12 text-violet-400' : 'bg-violet-50 text-violet-600',
  }
  return colorMap[step.color] || colorMap.brand
}
function guideCardClass(step) {
  if (step.ready) return isDark.value ? 'bg-d0 border-d4' : 'bg-l2 border-bdrL'
  if (step.key === 'workspace') return isDark.value ? 'bg-emerald-400/6 border-emerald-400/25' : 'bg-emerald-50 border-emerald-100'
  return isDark.value ? 'bg-d0 border-d4' : 'bg-l2 border-bdrL'
}
function guideStatusClass(step) {
  if (step.ready) return isDark.value ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
  if (step.key === 'workspace') return isDark.value ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100'
  return isDark.value ? 'bg-d3 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'
}

// Message tests
function fireMessage(type, withTitle = false) {
  const samples = {
    success: ['操作成功', '文件已保存到指定目录'],
    error: ['操作失败', '无法连接到服务器，请稍后重试'],
    warning: ['注意', '当前未配置授权根目录，部分功能不可用'],
    info: ['提示', '已加入待处理队列，将在后台执行'],
  }
  const [title, content] = samples[type]
  message[type](content, withTitle ? { title } : {})
}

function fireMessageQueue() {
  message.success('第一条：成功消息')
  setTimeout(() => message.info('第二条：信息消息'), 200)
  setTimeout(() => message.warning('第三条：警告消息'), 400)
  setTimeout(() => message.error('第四条：错误消息'), 600)
  setTimeout(() => message.success('第五条：再来一条成功'), 800)
  setTimeout(() => message.info('第六条：超出 5 条上限，最早的会被挤出'), 1000)
}

function fireStickyMessage() {
  message.info('这条消息不会自动消失，需要手动关闭', { duration: 0, title: '持久消息' })
}

// MessageBox tests
async function fireConfirm(variant) {
  const config = {
    info: {
      title: '确认操作', subtitle: '请确认后继续',
      message: '此操作将提交当前编辑的内容到服务器，确定要继续吗？',
      variant: 'info', confirmText: '提交',
    },
    warning: {
      title: '警告', subtitle: '此操作有一定风险',
      message: '迁移工作目录会导致应用重启，未保存的数据可能丢失。是否继续？',
      variant: 'warning', confirmText: '继续迁移',
    },
    danger: {
      title: '删除确认', subtitle: '此操作不可撤销',
      message: '永久删除该 Agent 及其所有产出文件吗？删除后无法恢复。',
      variant: 'danger', confirmText: '永久删除',
    },
    success: {
      title: '配置完成', subtitle: '可以开始使用',
      message: '工作目录已配置完毕，所有 Agent 工具已就绪。',
      variant: 'success', confirmText: '开始使用',
    },
  }
  const result = await messageBox.confirm(config[variant])
  lastResult.value = `confirm(${variant}): ${result === true ? '✓ 已确认' : '✗ 已取消'}`
}

async function fireAlert() {
  await messageBox.alert({
    title: '导入完成',
    message: '成功导入 12 个项目，跳过 3 个重复项。',
    variant: 'success',
  })
  lastResult.value = 'alert: ✓ 已知晓'
}

async function firePrompt() {
  const result = await messageBox.prompt({
    title: '重命名',
    subtitle: '为该文件夹起一个新名字',
    placeholder: '输入新名称...',
    defaultValue: '未命名',
    variant: 'info',
    confirmText: '保存',
    validate: (val) => {
      if (!val) return '名称不能为空'
      if (val.length > 20) return '名称不能超过 20 个字符'
      if (/[<>:"/\\|?*]/.test(val)) return '名称包含非法字符'
      return true
    },
  })
  lastResult.value = result === null ? 'prompt: ✗ 已取消' : `prompt: 输入「${result}」`
}
</script>

<template>
  <div class="h-full overflow-y-auto" :class="isDark ? 'bg-d0' : 'bg-l0'">
    <div class="max-w-5xl mx-auto px-8 py-8 space-y-6">

      <!-- Header -->
      <div class="flex items-start gap-4">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          :class="isDark ? 'bg-gradient-to-br from-brand-400/20 to-agent-400/10 border border-brand-400/20' : 'bg-gradient-to-br from-brand-50 to-agent-50 border border-brand-100'">
          <i class="ri-test-tube-line text-[26px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        </div>
        <div class="flex-1 min-w-0">
          <h1 class="text-[20px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">组件测试 · UI Sandbox</h1>
          <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            测试 MsModal / MsMessageBox / MsMessage 三个全局组件的视觉与交互效果。切换深浅主题查看适配情况。
          </p>
        </div>
        <button @click="appStore.toggleTheme?.()"
          class="h-9 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors"
          :class="isDark ? 'bg-d3 border border-bdr text-wt-sub hover:bg-d4' : 'bg-l2 border border-bdrL text-lt-sub hover:bg-l3'">
          <i :class="isDark ? 'ri-sun-line' : 'ri-moon-line'" class="text-[13px]" />
          {{ isDark ? '浅色主题' : '深色主题' }}
        </button>
      </div>

      <!-- Last result -->
      <div class="rounded-xl px-4 py-3 flex items-center gap-2.5"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <i class="ri-terminal-box-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">最近一次操作结果：</span>
        <span class="text-[12px] font-mono" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ lastResult }}</span>
      </div>

      <!-- MsMessage -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-1 h-4 rounded-full bg-emerald-400" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">MsMessage · 消息提示</span>
        </div>
        <p class="text-[11px] mb-4" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">右上角浮窗，3 秒自动消失，鼠标悬停时暂停计时。</p>

        <div class="grid grid-cols-4 gap-2">
          <button @click="fireMessage('success')"
            class="h-10 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 transition-colors"
            :class="isDark ? 'bg-emerald-400/12 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100'">
            <i class="ri-checkbox-circle-fill text-[14px]" />Success
          </button>
          <button @click="fireMessage('info')"
            class="h-10 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 transition-colors"
            :class="isDark ? 'bg-brand-400/12 text-brand-400 border border-brand-400/20 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-600 border border-brand-100 hover:bg-brand-100'">
            <i class="ri-information-fill text-[14px]" />Info
          </button>
          <button @click="fireMessage('warning')"
            class="h-10 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 transition-colors"
            :class="isDark ? 'bg-amber-400/12 text-amber-400 border border-amber-400/20 hover:bg-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100'">
            <i class="ri-alert-fill text-[14px]" />Warning
          </button>
          <button @click="fireMessage('error')"
            class="h-10 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 transition-colors"
            :class="isDark ? 'bg-red-400/12 text-red-400 border border-red-400/20 hover:bg-red-400/20' : 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100'">
            <i class="ri-error-warning-fill text-[14px]" />Error
          </button>
        </div>

        <div class="grid grid-cols-4 gap-2 mt-2">
          <button @click="fireMessage('success', true)" class="h-9 rounded-lg text-[11px] font-medium transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-emerald-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-emerald-300'">
            带标题 · Success
          </button>
          <button @click="fireMessageQueue" class="h-9 rounded-lg text-[11px] font-medium transition-colors col-span-2"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-brand-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-brand-300'">
            <i class="ri-stack-line text-[12px] mr-1" />连续触发 6 条（测试上限 5）
          </button>
          <button @click="fireStickyMessage" class="h-9 rounded-lg text-[11px] font-medium transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-amber-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-amber-300'">
            <i class="ri-pushpin-line text-[12px] mr-1" />持久消息
          </button>
        </div>
      </section>

      <!-- MsMessageBox -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-1 h-4 rounded-full bg-amber-400" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">MsMessageBox · 确认弹窗</span>
        </div>
        <p class="text-[11px] mb-4" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">居中模态，支持 confirm / alert / prompt 三种类型。返回结果显示在顶部状态栏。</p>

        <div class="grid grid-cols-4 gap-2">
          <button @click="fireConfirm('info')"
            class="h-10 rounded-lg text-[11.5px] font-medium transition-colors"
            :class="isDark ? 'bg-brand-400/12 text-brand-400 border border-brand-400/20 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-600 border border-brand-100 hover:bg-brand-100'">
            <i class="ri-information-line text-[12px] mr-1" />Info Confirm
          </button>
          <button @click="fireConfirm('warning')"
            class="h-10 rounded-lg text-[11.5px] font-medium transition-colors"
            :class="isDark ? 'bg-amber-400/12 text-amber-400 border border-amber-400/20 hover:bg-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100'">
            <i class="ri-alert-line text-[12px] mr-1" />Warning Confirm
          </button>
          <button @click="fireConfirm('danger')"
            class="h-10 rounded-lg text-[11.5px] font-medium transition-colors"
            :class="isDark ? 'bg-red-400/12 text-red-400 border border-red-400/20 hover:bg-red-400/20' : 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100'">
            <i class="ri-delete-bin-line text-[12px] mr-1" />Danger Confirm
          </button>
          <button @click="fireConfirm('success')"
            class="h-10 rounded-lg text-[11.5px] font-medium transition-colors"
            :class="isDark ? 'bg-emerald-400/12 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100'">
            <i class="ri-checkbox-circle-line text-[12px] mr-1" />Success Confirm
          </button>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-2">
          <button @click="fireAlert"
            class="h-9 rounded-lg text-[11px] font-medium transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-emerald-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-emerald-300'">
            <i class="ri-megaphone-line text-[12px] mr-1" />Alert（单按钮）
          </button>
          <button @click="firePrompt"
            class="h-9 rounded-lg text-[11px] font-medium transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-brand-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-brand-300'">
            <i class="ri-input-cursor-move text-[12px] mr-1" />Prompt（带校验输入）
          </button>
        </div>
      </section>

      <!-- MsModal -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-1 h-4 rounded-full bg-brand-400" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">MsModal · 通用模态框</span>
        </div>
        <p class="text-[11px] mb-4" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">通过 slot（header / 默认 / footer）自定义内容。支持设置宽度、是否可关闭、点击遮罩是否关闭。</p>

        <div class="grid grid-cols-4 gap-2">
          <button @click="showBasicModal = true"
            class="h-10 rounded-lg text-[11.5px] font-medium transition-colors"
            :class="isDark ? 'bg-brand-400/12 text-brand-400 border border-brand-400/20 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-600 border border-brand-100 hover:bg-brand-100'">
            <i class="ri-window-line text-[12px] mr-1" />基础弹窗
          </button>
          <button @click="showLargeModal = true"
            class="h-10 rounded-lg text-[11.5px] font-medium transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-brand-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-brand-300'">
            <i class="ri-expand-diagonal-line text-[12px] mr-1" />大宽度（720）
          </button>
          <button @click="showNoFooterModal = true"
            class="h-10 rounded-lg text-[11.5px] font-medium transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-brand-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-brand-300'">
            <i class="ri-layout-row-line text-[12px] mr-1" />无 Footer
          </button>
          <button @click="showLockedModal = true"
            class="h-10 rounded-lg text-[11.5px] font-medium transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-brand-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-brand-300'">
            <i class="ri-lock-line text-[12px] mr-1" />锁定（不可关闭）
          </button>
        </div>

        <div class="grid grid-cols-1 gap-2 mt-2">
          <button @click="showRichModal = true"
            class="h-10 rounded-lg text-[11.5px] font-medium transition-colors"
            :class="isDark ? 'bg-agent-400/12 text-agent-400 border border-agent-400/20 hover:bg-agent-400/20' : 'bg-violet-50 text-violet-600 border border-violet-100 hover:bg-violet-100'">
            <i class="ri-magic-line text-[12px] mr-1" />富内容弹窗（含表单 / 列表 / 长文本，测试滚动）
          </button>
        </div>
      </section>

      <!-- Combo test -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-1 h-4 rounded-full bg-agent-400" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">组合测试 · z-index 层叠</span>
        </div>
        <p class="text-[11px] mb-4" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">在 MsModal 中弹出 MsMessageBox，并触发 MsMessage，验证三个组件的层级关系（70 / 60 / 80）。</p>

        <button @click="showRichModal = true; setTimeout(() => fireConfirm('warning'), 400); setTimeout(() => message.success('底层消息'), 800)"
          class="h-10 px-4 rounded-lg text-[11.5px] font-medium transition-colors"
          :class="isDark ? 'bg-agent-400 text-d0 hover:bg-agent-500' : 'bg-violet-500 text-white hover:bg-violet-600'">
          <i class="ri-stack-fill text-[12px] mr-1" />一键触发三层叠加测试
        </button>
      </section>

      <!-- StartupGuide · 新手引导（模拟数据） -->
      <section class="rounded-xl p-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-1 h-4 rounded-full bg-emerald-400" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">新手引导 · StartupGuideModal</span>
        </div>
        <p class="text-[11px] mb-4" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">复刻应用启动时的新手引导弹窗，使用模拟数据预览效果。</p>
        <button @click="showGuideModal = true"
          class="h-10 px-4 rounded-lg text-[11.5px] font-medium transition-colors"
          :class="isDark ? 'bg-brand-400/12 text-brand-300 border border-brand-400/20 hover:bg-brand-400/18' : 'bg-brand-50 text-brand-600 border border-brand-100 hover:bg-brand-100'">
          <i class="ri-compass-3-line text-[12px] mr-1" />打开新手引导
        </button>
      </section>
    </div>

    <!-- ─── Modal Instances ─── -->

    <!-- Basic -->
    <MsModal v-model:show="showBasicModal" :width="480">
      <template #header>
        <div class="flex items-center gap-2">
          <i class="ri-information-line text-[15px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          <span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">基础弹窗</span>
        </div>
      </template>
      <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
        这是一个标准尺寸（480px）的 MsModal 弹窗，包含完整的 header、body 和 footer。点击右上角关闭按钮、ESC 键或点击遮罩区域都可以关闭。
      </p>
      <template #footer="{ close }">
        <button @click="close"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'bg-d4 text-wt-sub border border-bdr hover:bg-d0' : 'bg-l3 text-lt-sub border border-bdrF hover:bg-l4'">关闭</button>
        <button @click="close; message.success('已确认')"
          class="h-8 px-4 rounded-lg text-[11px] font-semibold transition-colors bg-brand-500 text-white hover:bg-brand-600">确认</button>
      </template>
    </MsModal>

    <!-- Large -->
    <MsModal v-model:show="showLargeModal" :width="720">
      <template #header>
        <div class="flex items-center gap-2">
          <i class="ri-expand-diagonal-line text-[15px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          <span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">大宽度弹窗 · 720px</span>
        </div>
      </template>
      <div class="grid grid-cols-2 gap-4">
        <div v-for="i in 6" :key="i" class="rounded-lg p-3" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
          <div class="text-[12px] font-semibold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">卡片 {{ i }}</div>
          <p class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">用于测试两列布局，验证较宽弹窗在桌面端的表现。</p>
        </div>
      </div>
      <template #footer="{ close }">
        <button @click="close" class="h-8 px-4 rounded-lg text-[11px] font-medium bg-brand-500 text-white hover:bg-brand-600">完成</button>
      </template>
    </MsModal>

    <!-- No footer -->
    <MsModal v-model:show="showNoFooterModal" :width="420" :show-footer="false">
      <template #header>
        <span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">无 Footer 弹窗</span>
      </template>
      <div class="text-center py-4">
        <div class="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3" :class="isDark ? 'bg-emerald-400/12' : 'bg-emerald-50'">
          <i class="ri-checkbox-circle-fill text-[32px] text-emerald-400" />
        </div>
        <p class="text-[13px] font-semibold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">操作完成</p>
        <p class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">该弹窗没有 footer，使用 X 按钮或 ESC 关闭。</p>
      </div>
    </MsModal>

    <!-- Locked -->
    <MsModal v-model:show="showLockedModal" :width="400" :closable="false" :close-on-overlay="false">
      <template #header>
        <div class="flex items-center gap-2">
          <i class="ri-lock-line text-[15px] text-amber-400" />
          <span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">锁定弹窗</span>
        </div>
      </template>
      <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
        该弹窗没有关闭按钮、点击遮罩不关闭、ESC 不关闭。必须通过 footer 按钮关闭。常用于强制引导流程。
      </p>
      <template #footer>
        <button @click="showLockedModal = false"
          class="h-8 px-4 rounded-lg text-[11px] font-semibold transition-colors bg-amber-500 text-white hover:bg-amber-600">我已知晓，关闭</button>
      </template>
    </MsModal>

    <!-- Rich content -->
    <MsModal v-model:show="showRichModal" :width="540" max-height="80vh">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center"
            :class="isDark ? 'bg-agent-400/12' : 'bg-violet-50'">
            <i class="ri-magic-line text-[16px]" :class="isDark ? 'text-agent-400' : 'text-violet-500'" />
          </div>
          <div class="min-w-0">
            <div class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">富内容弹窗</div>
            <div class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">表单 + 列表 + 长文本</div>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <!-- Form -->
        <div>
          <label class="text-[11px] font-medium mb-1.5 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">名称</label>
          <input type="text" placeholder="输入名称..."
            class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'">
        </div>

        <div>
          <label class="text-[11px] font-medium mb-1.5 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">描述</label>
          <textarea rows="3" placeholder="详细描述..."
            class="w-full px-3 py-2 rounded-lg text-[12px] outline-none transition-colors resize-none"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
        </div>

        <!-- List -->
        <div>
          <div class="text-[11px] font-medium mb-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">最近项目</div>
          <div class="space-y-1.5">
            <div v-for="i in 4" :key="i" class="flex items-center gap-2.5 px-3 py-2 rounded-lg"
              :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/12' : 'bg-brand-50'">
                <i class="ri-folder-3-fill text-[13px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[12px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">项目 {{ i }}</div>
                <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">2 小时前 · 12 文件</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Long text to test scroll -->
        <div>
          <div class="text-[11px] font-medium mb-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">长内容（测试 body 滚动）</div>
          <p v-for="i in 4" :key="i" class="text-[11px] leading-relaxed mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            这是第 {{ i }} 段长文本，用于测试 MsModal body 区域的滚动效果。MsModal 的 maxHeight 默认为 85vh，当内容超出时 body 会出现细滚动条。Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, voluptatum.
          </p>
        </div>
      </div>

      <template #footer="{ close }">
        <button @click="close"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'bg-d4 text-wt-sub border border-bdr hover:bg-d0' : 'bg-l3 text-lt-sub border border-bdrF hover:bg-l4'">取消</button>
        <button @click="close; message.success('已保存', { title: '成功' })"
          class="h-8 px-4 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1.5"
          :class="isDark ? 'bg-agent-400 text-d0 hover:bg-agent-500' : 'bg-violet-500 text-white hover:bg-violet-600'">
          <i class="ri-save-line text-[11px]" />保存
        </button>
      </template>
    </MsModal>
    <!-- StartupGuide modal (mock data) -->
    <MsModal v-model:show="showGuideModal" :width="660" max-height="88vh" :show-footer="true" :close-on-overlay="false" :closable="false">
      <template #header>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/12' : 'bg-brand-50'">
            <i class="ri-compass-3-line text-[19px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">欢迎使用 Reviva</div>
            <div class="text-[10.5px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">按这个顺序完成基础配置，后续对话、资料和 Agent 才能稳定工作</div>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div class="rounded-xl px-4 py-3 flex items-center gap-3" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrL'">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" :class="isDark ? 'bg-d3' : 'bg-l3'">
            <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ guideProgress }}/3</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-3">
              <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">基础准备</span>
              <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">根目录必须设置，其他可稍后完善</span>
            </div>
            <div class="h-1.5 rounded-full mt-2 overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
              <div class="h-full rounded-full bg-brand-400 transition-all duration-300" :style="{ width: `${(guideProgress / 3) * 100}%` }" />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div v-for="step in guideSteps" :key="step.key" class="rounded-xl border p-3 min-w-0" :class="guideCardClass(step)">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="guideIconClass(step)">
                <i :class="[step.icon, 'text-[16px]']" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[12px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ step.index }}. {{ step.title }}</span>
                  <span class="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full" :class="step.key === 'workspace' && !step.ready ? (isDark ? 'bg-amber-400/12 text-amber-400' : 'bg-amber-50 text-amber-600') : (isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux')">{{ step.label }}</span>
                </div>
                <div class="mt-1.5">
                  <span class="ctx-pill text-[9px]" :class="guideStatusClass(step)">
                    <i :class="[step.ready ? 'ri-check-line' : 'ri-time-line', 'text-[8px]']" />
                    {{ step.status }}
                  </span>
                </div>
                <p class="mt-2 text-[10.5px] leading-relaxed line-clamp-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ step.desc }}</p>
                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <button class="h-7 px-3 rounded-lg text-[10.5px] font-medium inline-flex items-center gap-1.5 transition-colors" :class="isDark ? 'bg-brand-400/12 text-brand-300 hover:bg-brand-400/18' : 'bg-brand-50 text-brand-600 hover:bg-brand-100'" @click="showGuideModal = false">
                    <i class="ri-arrow-right-line text-[11px]" />{{ step.action }}
                  </button>
                  <button v-if="step.secondaryAction" class="h-7 px-3 rounded-lg text-[10.5px] font-medium inline-flex items-center gap-1.5 transition-colors" :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4' : 'bg-l3 text-lt-sub hover:bg-l4'" @click="showGuideModal = false">
                    <i class="ri-add-line text-[11px]" />{{ step.secondaryAction }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-xl px-3 py-2.5 flex items-start gap-2.5" :class="isDark ? 'bg-d0 border border-d4 text-wt-aux' : 'bg-l2 border border-bdrL text-lt-aux'">
          <i class="ri-lightbulb-line text-amber-400 text-[14px] mt-[1px] shrink-0" />
          <div class="text-[10.5px] leading-relaxed">内置 Agent 配好模型后即可使用；需要更贴合自己流程时，可以在 Agent 页面编辑工具权限、提示词、模型和执行限制。</div>
        </div>
      </div>

      <template #footer>
        <button class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors" :class="isDark ? 'text-wt-sub hover:text-wt-main' : 'text-lt-sub hover:text-lt-main'" @click="showGuideModal = false">稍后再说</button>
        <button class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5" :class="isDark ? 'bg-emerald-400 text-d0 hover:bg-emerald-500' : 'bg-emerald-500 text-white hover:bg-emerald-600'" @click="showGuideModal = false">
          <i class="ri-folder-settings-line text-[11px]" />先设置根目录
        </button>
      </template>
    </MsModal>

  </div>
</template>
