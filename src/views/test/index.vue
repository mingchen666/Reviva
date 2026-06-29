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
  </div>
</template>
