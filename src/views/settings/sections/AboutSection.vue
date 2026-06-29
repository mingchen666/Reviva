<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const version = ref('--')
const updateNotice = ref('')

const betaChecklist = [
  { label: '模型服务商配置', desc: '确认 API Key、Base URL、默认模型和 Code Plan 服务商是否可用。', route: '/settings/models' },
  { label: '资料导入流程', desc: '用少量 PDF、DOCX、Markdown 或文件夹验证导入、检索和引用。', route: '/docs-manage' },
  { label: 'Agent 执行体验', desc: '检查执行模型、工具权限、执行上限和失败提示是否清楚。', route: '/agents' },
  // { label: '生成结果沉淀', desc: '关注摘要、闪卡、导图、报告等输出是否能稳定保存和复用。', route: '/outputs' },
]

const releaseNotes = [
  {
    title: '当前内测版',
    meta: '0.0.1-beta',
    type: 'preview',
    items: [
      '调整首页和关于页为内测版表达，减少正式发布语气。',
      '内置国内模型服务商，并为主要服务商拆分独立 Code Plan 入口。',
      '保留知识库、文档、Agent、Skills、工具、输出中心等核心入口。',
      '支持在本地工作区内验证导入、对话、生成和导出的完整流程。',
    ],
  },
  {
    title: '近期重点',
    meta: '持续迭代',
    type: 'focus',
    items: [
      '提高模型配置、Agent 健康检查和工具依赖提示的可理解性。',
      '继续收敛内测用户最常用的资料导入、学习台对话和生成输出路径。',
      '补齐错误恢复、任务记录和配置迁移相关的边界体验。',
    ],
  },
  {
    title: '已知限制',
    meta: '内测说明',
    type: 'limit',
    items: [
      '自动检查更新暂未开放；版本信息仅展示当前客户端版本。',
      '模型价格、上下文长度和能力标签会随服务商调整，实际调用以服务商为准。',
      '部分功能仍可能调整入口、名称和默认配置，不建议把内测版当作稳定发行版归档。',
    ],
  },
]

const relatedLinks = [
  { label: '模型服务', desc: '配置服务商、模型和 Code Plan', icon: 'ri-ai-generate-3d-line', route: '/settings/models' },
  { label: '默认模型', desc: '设置对话、标题和翻译模型', icon: 'ri-robot-2-line', route: '/settings/default-models' },
  { label: '沙箱与权限', desc: '检查文件、命令和工具限制', icon: 'ri-shield-keyhole-line', route: '/settings/sandbox' },
  // { label: '隐私政策', desc: '了解数据边界和隐私说明', icon: 'ri-lock-line', route: '/legal/privacy-policy' },
  // { label: '用户协议', desc: '查看软件使用条款', icon: 'ri-scroll-line', route: '/legal/user-agreement' },

]

async function loadVersion() {
  if (!window.electronAPI) return
  try {
    const ver = await window.electronAPI.getVersion()
    version.value = ver || '--'
  } catch (e) {
    console.error('loadVersion error:', e)
  }
}

onMounted(loadVersion)

function go(route) {
  if (!route) return
  router.push(route)
}

function checkUpdate() {
  updateNotice.value = '内测版暂未开放自动检查更新；请以你收到的安装包或发布说明为准。'
}

function toneClass(tone) {
  const dark = {
    brand: 'bg-brand-400/10 text-brand-400 border-brand-400/20',
    emerald: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    amber: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    rose: 'bg-rose-400/10 text-rose-400 border-rose-400/20',
  }
  const light = {
    brand: 'bg-brand-50 text-brand-600 border-brand-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  }
  const palette = isDark.value ? dark : light
  return palette[tone] || palette.brand
}

function releaseTone(type) {
  if (type === 'preview') return toneClass('brand')
  if (type === 'focus') return toneClass('emerald')
  return toneClass('amber')
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <div class="rounded-xl p-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-start gap-4">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" :class="isDark ? 'bg-d0' : 'bg-l2'">
          <img class="h-12 w-12 rounded-xl" :src="isDark ? './logo-dark.png' : './logo-light.png'" alt="Reviva">
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-[21px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Reviva</h2>
                <span class="ctx-pill" :class="isDark ? 'bg-amber-400/10 text-amber-300 border border-amber-400/20' : 'bg-amber-50 text-amber-700 border border-amber-100'">Beta Preview</span>
                <span class="ctx-pill font-mono" :class="isDark ? 'bg-d0 text-wt-sub border border-bdr' : 'bg-l2 text-lt-sub border border-bdrF'">v{{ version }}</span>
              </div>
              <p class="text-[12px] leading-relaxed mt-2 max-w-3xl" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                Reviva 是面向个人学习和知识工作的桌面应用。内测阶段先聚焦一个目标：让资料、对话、笔记、Agent 和生成结果能在同一个本地工作区里连续起来。
              </p>
            </div>
            <button class="h-8 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 shrink-0 border transition-colors"
              :class="isDark ? 'bg-d0 border-bdr text-wt-sub hover:border-brand-400/30' : 'bg-l2 border-bdrF text-lt-sub hover:border-brand-200'"
              @click="checkUpdate">
              <i class="ri-refresh-line text-[12px]" /> 检查更新
            </button>
          </div>
          <div v-if="updateNotice" class="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-lg text-[11px]"
            :class="isDark ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-700 border border-amber-100'">
            <i class="ri-information-line text-[12px]" />
            <span>{{ updateNotice }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-lg flex items-center justify-center border shrink-0" :class="toneClass('brand')">
          <i class="ri-flask-line text-[16px]" />
        </div>
        <div class="min-w-0">
          <h3 class="text-[13px] font-bold mb-1.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">关于当前内测</h3>
          <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            Reviva 仍处在小范围内测阶段，当前版本优先验证资料导入、知识库、Agent 对话、生成输出和本地工作流是否顺畅。资料、配置和生成结果以本机工作区为主；使用云端模型或服务时，请以对应服务商的规则和计费为准。遇到可复现的问题、卡住的流程或不清楚的文案，可以保留任务记录、模型配置和操作路径，后续会更容易排查。
          </p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center justify-between gap-3 mb-4">
          <div class="flex items-center gap-2">
            <i class="ri-history-line text-brand-400 text-[14px]" />
            <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">内测更新日志</span>
          </div>
          <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">按当前内测状态整理</span>
        </div>

        <div class="space-y-4">
          <div v-for="log in releaseNotes" :key="log.title" class="rounded-lg p-3" :class="isDark ? 'bg-d0' : 'bg-l2'">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-[12px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ log.title }}</span>
              <span class="ctx-pill" :class="releaseTone(log.type)">{{ log.meta }}</span>
            </div>
            <ul class="space-y-1.5">
              <li v-for="entry in log.items" :key="entry" class="flex items-start gap-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                <span class="w-1 h-1 rounded-full mt-2 shrink-0" :class="isDark ? 'bg-wt-dim' : 'bg-lt-aux'" />
                <span>{{ entry }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-3">
            <i class="ri-checkbox-circle-line text-emerald-400 text-[14px]" />
            <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">建议验证</span>
          </div>
          <div class="space-y-2">
            <button v-for="item in betaChecklist" :key="item.label" class="w-full rounded-lg px-3 py-2 text-left transition-colors"
              :class="isDark ? 'bg-d0 hover:bg-white/4' : 'bg-l2 hover:bg-l4'"
              @click="go(item.route)">
              <span class="block text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.label }}</span>
              <span class="block text-[10px] leading-snug mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.desc }}</span>
            </button>
          </div>
        </div>

        <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-3">
            <i class="ri-link text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
            <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">相关入口</span>
          </div>
          <div class="grid gap-1">
            <button v-for="item in relatedLinks" :key="item.label" class="w-full flex items-start gap-2.5 py-2 px-2 rounded-lg text-left transition-colors" :class="isDark ? 'hover:bg-white/4' : 'hover:bg-l4'" @click="go(item.route)">
              <i :class="`${item.icon} text-[13px] mt-0.5 ${isDark ? 'text-wt-aux' : 'text-lt-aux'}`" />
              <span class="flex-1 min-w-0">
                <span class="block text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.label }}</span>
                <span class="block text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.desc }}</span>
              </span>
              <i class="ri-arrow-right-up-line text-[14px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <p class="text-center text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">Reviva Desktop · 内测版本 · 请勿将预览功能视为稳定承诺</p>
  </div>
</template>
