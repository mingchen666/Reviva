<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const checking = ref(false)
const checkingKeys = ref(new Set())
const lastCheckedAt = ref(null)
const results = ref({})
const installingPythonOfficeLibs = ref(false)
const pythonOfficeInstallResult = ref(null)

const ENV_GROUPS = [
  {
    label: '运行时',
    icon: 'ri-terminal-box-line',
    color: 'brand',
    items: [
      { key: 'python', name: 'Python', desc: 'Python 解释器，部分脚本和 pip 安装方式会用到', url: 'https://www.python.org/downloads/', usedBy: ['执行一些脚本', 'pip 包管理'] },
      { key: 'node', name: 'Node.js', desc: 'JavaScript 运行时', url: 'https://nodejs.org/', usedBy: ['自定义工具脚本'] },
    ],
  },
  {
    label: '包管理',
    icon: 'ri-archive-line',
    color: 'emerald',
    items: [
      { key: 'pip', name: 'pip', desc: 'Python 包管理器', url: 'https://pip.pypa.io/en/stable/installation/', usedBy: ['Python 包安装'] },
      // { key: 'npm', name: 'npm', desc: 'Node.js 包管理器（随 Node 安装）', url: 'https://nodejs.org/', usedBy: ['Node 包安装'] },
      // { key: 'pnpm', name: 'pnpm', desc: '快速、磁盘高效的 Node 包管理器', url: 'https://pnpm.io/installation', usedBy: ['npm升级版(可选)'] },
    ],
  },
  {
    label: '文档与办公',
    icon: 'ri-file-text-line',
    color: 'agent',
    items: [
      { key: 'pandoc', name: 'Pandoc', desc: '通用文档转换工具（Markdown ↔ Word/PDF/HTML）', url: 'https://pandoc.org/installing.html', usedBy: ['文档转换'] },
      { key: 'officecli', name: 'OfficeCLI', desc: 'Office 三件套读取工具，优先使用应用内置版本，失败时回退到系统 officecli', url: 'https://github.com/', usedBy: ['Agent Office 操作技能','office文档读写编辑等'] },
      {
        key: 'pythonOfficeLibs',
        name: 'Office/PDF Python 库',
        desc: '用于 Python 脚本读取和处理 Word、Excel、PPT、PDF（python-docx / openpyxl / python-pptx / pandas / xlrd / pypdf）',
        url: 'https://mirrors.aliyun.com/pypi/simple/',
        usedBy: ['Agent 脚本辅助', 'Office/PDF 解析'],
        installAction: 'pythonOfficeLibs',
        installHint: '一键安装会使用阿里云 PyPI 镜像，并安装到当前用户 Python 环境。',
        versionPrefix: false,
      },
    ],
  },
  {
    label: '媒体与可视化',
    icon: 'ri-movie-line',
    color: 'rose',
    items: [
      { key: 'ffmpeg', name: 'FFmpeg', desc: '视频/音频处理工具链', url: 'https://ffmpeg.org/download.html', usedBy: ['视频剪切', '音频转码'] },
      { key: 'manim', name: 'Manim', desc: '公式与数学可视化动画引擎，优先检测 manim 命令行', url: 'https://docs.manim.community/en/stable/installation.html', usedBy: ['公式动画生成'] },
      { key: 'latex', name: 'LaTeX 引擎', desc: '检测 latex / pdflatex / xelatex，Manim 公式渲染依赖', url: 'https://miktex.org/download', usedBy: ['manim 公式'] },
      { key: 'dvisvgm', name: 'dvisvgm', desc: '将 LaTeX 输出转为 SVG，Manim MathTex/Tex 常用依赖', url: 'https://miktex.org/download', usedBy: ['manim 公式'] },
      { key: 'miktex', name: 'MiKTeX (mpm)', desc: '检测 MiKTeX 包管理器 mpm，Windows 推荐安装项', url: 'https://miktex.org/download', usedBy: ['manim 公式', 'LaTeX 包管理'] },
    ],
  },
  {
    label: '版本控制',
    icon: 'ri-git-branch-line',
    color: 'amber',
    items: [
      { key: 'git', name: 'Git', desc: '版本控制工具', url: 'https://git-scm.com/downloads', usedBy: ['git clone一些仓库等'] },
    ],
  },
]

const allKeys = ENV_GROUPS.flatMap(g => g.items.map(i => i.key))

const summary = computed(() => {
  const total = allKeys.length
  const installed = allKeys.filter(k => results.value[k]?.installed).length
  return { total, installed, missing: total - installed }
})

function statusOf(key) {
  const r = results.value[key]
  if (!r) return 'unknown'
  return r.installed ? 'ok' : 'missing'
}

function versionText(item) {
  const version = results.value[item.key]?.version || '?'
  return item.versionPrefix === false ? version : `v${version}`
}

async function checkAll() {
  if (checking.value) return
  checking.value = true
  allKeys.forEach(k => checkingKeys.value.add(k))
  try {
    const res = await window.electronAPI?.checkEnv?.(allKeys)
    if (res?.success) {
      results.value = res.data || {}
      lastCheckedAt.value = new Date()
    }
  } finally {
    checking.value = false
    checkingKeys.value.clear()
  }
}

async function checkOne(key) {
  if (checkingKeys.value.has(key)) return
  checkingKeys.value.add(key)
  try {
    const res = await window.electronAPI?.checkEnv?.([key])
    if (res?.success && res.data?.[key]) {
      results.value = { ...results.value, [key]: res.data[key] }
    }
  } finally {
    checkingKeys.value.delete(key)
  }
}

function openInstall(url) {
  if (!url) return
  window.electronAPI?.openExternal?.(url)
}

async function installPythonOfficeLibs() {
  if (installingPythonOfficeLibs.value) return
  installingPythonOfficeLibs.value = true
  pythonOfficeInstallResult.value = null
  checkingKeys.value.add('pythonOfficeLibs')
  try {
    const installer = window.electronAPI?.installPythonOfficeLibs
    if (!installer) {
      pythonOfficeInstallResult.value = { success: false, error: '当前应用未暴露 Python Office 库安装接口。' }
      return
    }
    const res = await installer()
    pythonOfficeInstallResult.value = res
    if (res?.check) {
      results.value = { ...results.value, pythonOfficeLibs: res.check }
    } else {
      const checkRes = await window.electronAPI?.checkEnv?.(['pythonOfficeLibs'])
      if (checkRes?.success && checkRes.data?.pythonOfficeLibs) {
        results.value = { ...results.value, pythonOfficeLibs: checkRes.data.pythonOfficeLibs }
      }
    }
  } finally {
    checkingKeys.value.delete('pythonOfficeLibs')
    installingPythonOfficeLibs.value = false
  }
}

function copyCmd(text) {
  navigator.clipboard?.writeText(text)
}

function colorClass(color, isDark, kind = 'text') {
  const map = {
    brand: { text: isDark ? 'text-brand-400' : 'text-brand-500', bg: isDark ? 'bg-brand-400/10 border-brand-400/20' : 'bg-brand-50 border-brand-100' },
    emerald: { text: isDark ? 'text-emerald-400' : 'text-emerald-600', bg: isDark ? 'bg-emerald-400/10 border-emerald-400/20' : 'bg-emerald-50 border-emerald-100' },
    agent: { text: isDark ? 'text-agent-400' : 'text-agent-500', bg: isDark ? 'bg-agent-400/10 border-agent-400/20' : 'bg-violet-50 border-violet-100' },
    rose: { text: isDark ? 'text-rose-400' : 'text-rose-500', bg: isDark ? 'bg-rose-400/10 border-rose-400/20' : 'bg-rose-50 border-rose-100' },
    amber: { text: isDark ? 'text-amber-400' : 'text-amber-600', bg: isDark ? 'bg-amber-400/10 border-amber-400/20' : 'bg-amber-50 border-amber-100' },
  }
  return map[color]?.[kind] || ''
}

const formattedTime = computed(() => {
  if (!lastCheckedAt.value) return '未检测'
  const t = lastCheckedAt.value
  const Y = t.getFullYear()
  const M = String(t.getMonth() + 1).padStart(2, '0')
  const D = String(t.getDate()).padStart(2, '0')
  const h = String(t.getHours()).padStart(2, '0')
  const m = String(t.getMinutes()).padStart(2, '0')
  const s = String(t.getSeconds()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m}:${s}`
})

onMounted(() => { checkAll() })
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <!-- Info Banner + Summary -->
    <div class="rounded-xl p-3" :class="isDark ? 'bg-emerald-400/6 border border-emerald-400/20' : 'bg-emerald-50/60 border border-emerald-100'">
      <div class="flex items-start gap-2">
        <i class="ri-tools-line text-emerald-400 text-[14px] mt-[1px]" />
        <div class="flex-1 min-w-0">
          <div class="text-[12px] font-semibold mb-0.5" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">系统环境检测</div>
          <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            Reviva 部分能力（视频处理、公式动画、Office 操作、文档转换等）依赖系统级工具。此处检测本机环境，未安装项可通过"安装指南"快速获取下载链接。
          </p>
        </div>
      </div>
    </div>

    <!-- Summary Bar -->
    <div class="rounded-xl p-4 flex items-center gap-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-3 flex-1">
        <div class="flex items-center gap-1.5">
          <div class="w-2 h-2 rounded-full bg-emerald-400" />
          <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">已安装</span>
          <span class="text-[14px] font-bold" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">{{ summary.installed }}</span>
        </div>
        <div class="w-px h-4" :class="isDark ? 'bg-d4' : 'bg-bdrF'" />
        <div class="flex items-center gap-1.5">
          <div class="w-2 h-2 rounded-full bg-red-400" />
          <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">未安装</span>
          <span class="text-[14px] font-bold" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ summary.missing }}</span>
        </div>
        <div class="w-px h-4" :class="isDark ? 'bg-d4' : 'bg-bdrF'" />
        <div class="flex items-center gap-1.5">
          <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">总计 {{ summary.total }} 项</span>
        </div>
        <div class="w-px h-4" :class="isDark ? 'bg-d4' : 'bg-bdrF'" />
        <div class="flex items-center gap-1.5">
          <i class="ri-time-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formattedTime }}</span>
        </div>
      </div>
      <button @click="checkAll" :disabled="checking"
        class="env-refresh-btn h-8 px-3 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-all disabled:cursor-not-allowed relative overflow-hidden"
        :class="[
          checking ? 'is-checking' : '',
          isDark ? 'bg-brand-400/10 text-brand-400 hover:bg-brand-400/20 border border-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100 border border-brand-100'
        ]">
        <!-- Animated progress sweep while checking -->
        <span v-if="checking" class="absolute inset-0 sweep-bar pointer-events-none"
          :class="isDark ? 'bg-brand-400/15' : 'bg-brand-100/80'" />
        <span v-if="checking" class="relative flex items-center gap-1.5">
          <span class="loader-ring" :style="{ '--ring-color': isDark ? '#6C8AFF' : '#4A6CFF' }" />
          检测中...
        </span>
        <span v-else class="relative flex items-center gap-1.5">
          <i class="ri-refresh-line text-[12px]" />
          重新检测
        </span>
      </button>
    </div>

    <!-- Env Groups -->
    <div v-for="g in ENV_GROUPS" :key="g.label" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-4">
        <i :class="`${g.icon} text-[14px] ${colorClass(g.color, isDark)}`" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ g.label }}</span>
      </div>
      <div class="space-y-2">
        <div v-for="item in g.items" :key="item.key"
          class="flex items-center gap-3 py-2.5 px-3 rounded-lg"
          :class="isDark ? 'bg-d0/60 border border-d4 hover:bg-d0' : 'bg-l2/60 border border-bdrF hover:bg-l2'">
          <!-- Status Dot -->
          <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 relative"
            :class="statusOf(item.key) === 'ok'
              ? (isDark ? 'bg-emerald-400/10 border border-emerald-400/20' : 'bg-emerald-50 border border-emerald-100')
              : statusOf(item.key) === 'missing'
                ? (isDark ? 'bg-red-400/10 border border-red-400/20' : 'bg-red-50 border border-red-100')
                : (isDark ? 'bg-d4 border border-d4' : 'bg-l4 border border-bdrF')">
            <span v-if="checkingKeys.has(item.key)" class="loader-ring" :style="{ '--ring-color': isDark ? '#6C8AFF' : '#4A6CFF' }" />
            <template v-else>
              <i v-if="statusOf(item.key) === 'ok'" class="ri-check-line text-[14px]" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'" />
              <i v-else-if="statusOf(item.key) === 'missing'" class="ri-close-line text-[14px]" :class="isDark ? 'text-red-400' : 'text-red-500'" />
              <i v-else class="ri-question-line text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            </template>
          </div>

          <!-- Name + Desc -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5 flex-wrap">
              <span class="text-[12.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ item.name }}</span>
              <span v-if="statusOf(item.key) === 'ok'" class="ctx-pill text-[9px]"
                :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">
                {{ versionText(item) }}
              </span>
              <span v-else-if="statusOf(item.key) === 'missing'" class="ctx-pill text-[9px]"
                :class="isDark ? 'bg-red-400/10 text-red-400 border border-red-400/20' : 'bg-red-50 text-red-500 border border-red-100'">
                未安装
              </span>
              <span v-else class="ctx-pill text-[9px]"
                :class="isDark ? 'bg-d4 text-wt-dim border border-d4' : 'bg-l4 text-lt-aux border border-bdrF'">
                检测中
              </span>
            </div>
            <div class="text-[10.5px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.desc }}</div>
            <div v-if="item.installHint" class="mt-1 text-[9.5px] leading-relaxed" :class="isDark ? 'text-wt-dim/80' : 'text-lt-aux/90'">
              {{ item.installHint }}
            </div>
            <div v-if="statusOf(item.key) === 'missing' && results[item.key]?.raw"
              class="mt-1 text-[9.5px] font-mono leading-snug px-1.5 py-1 rounded whitespace-pre-wrap break-all"
              :class="isDark ? 'bg-red-400/8 text-red-300/80 border border-red-400/15' : 'bg-red-50/70 text-red-600/80 border border-red-100'"
              :title="results[item.key].raw">
              {{ results[item.key].raw.length > 140 ? results[item.key].raw.slice(0, 140) + '…' : results[item.key].raw }}
            </div>
            <div v-if="statusOf(item.key) === 'ok' && results[item.key]?.via"
              class="mt-0.5 text-[9px] font-mono" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/80'">
              ✓ via <span :class="isDark ? 'text-emerald-400/80' : 'text-emerald-600/80'">{{ results[item.key].via }}</span>
            </div>
            <div v-if="item.usedBy?.length" class="flex items-center gap-1 mt-1 flex-wrap">
              <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">可用于：</span>
              <span v-for="(u, i) in item.usedBy" :key="i" class="text-[9px] px-1.5 py-[1px] rounded font-mono"
                :class="isDark ? 'bg-d4/80 text-wt-aux' : 'bg-l4 text-lt-aux'">{{ u }}</span>
            </div>
            <div v-if="item.key === 'pythonOfficeLibs' && pythonOfficeInstallResult"
              class="mt-1.5 text-[9.5px] leading-snug px-1.5 py-1 rounded whitespace-pre-wrap break-all"
              :class="pythonOfficeInstallResult.success
                ? (isDark ? 'bg-emerald-400/8 text-emerald-300/85 border border-emerald-400/15' : 'bg-emerald-50/70 text-emerald-700/85 border border-emerald-100')
                : (isDark ? 'bg-red-400/8 text-red-300/85 border border-red-400/15' : 'bg-red-50/70 text-red-600/85 border border-red-100')">
              {{ pythonOfficeInstallResult.success ? '安装完成，导入检测已通过。' : (pythonOfficeInstallResult.error || '安装失败') }}
              <span v-if="pythonOfficeInstallResult.command" class="block font-mono mt-0.5">{{ pythonOfficeInstallResult.command }}</span>
              <span v-if="!pythonOfficeInstallResult.success && (pythonOfficeInstallResult.stderr || pythonOfficeInstallResult.stdout || pythonOfficeInstallResult.detail)" class="block font-mono mt-0.5">
                {{ (pythonOfficeInstallResult.stderr || pythonOfficeInstallResult.stdout || pythonOfficeInstallResult.detail).slice(-260) }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1.5 shrink-0">
            <button @click="checkOne(item.key)" :disabled="checkingKeys.has(item.key)" title="重新检测"
              class="w-7 h-7 rounded-md flex items-center justify-center transition-colors disabled:opacity-50"
              :class="isDark ? 'bg-d4/50 text-wt-aux hover:bg-d4 hover:text-wt-sub' : 'bg-l4/70 text-lt-aux hover:bg-l4 hover:text-lt-sub'">
              <i class="ri-refresh-line text-[12px]" :class="checkingKeys.has(item.key) ? 'animate-spin' : ''" />
            </button>
            <button v-if="item.installAction === 'pythonOfficeLibs' && statusOf(item.key) !== 'ok'"
              @click="installPythonOfficeLibs"
              :disabled="installingPythonOfficeLibs"
              title="使用阿里云 PyPI 镜像一键安装"
              class="h-7 px-2.5 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              :class="isDark ? 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'">
              <span v-if="installingPythonOfficeLibs" class="loader-ring" :style="{ '--ring-color': isDark ? '#34D399' : '#059669' }" />
              <i v-else class="ri-download-cloud-line text-[11px]" />
              {{ installingPythonOfficeLibs ? '安装中' : '一键安装' }}
            </button>
            <button v-if="statusOf(item.key) !== 'ok'" @click="openInstall(item.url)" title="打开安装指南"
              class="h-7 px-2.5 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors"
              :class="isDark ? 'bg-brand-400/10 text-brand-400 hover:bg-brand-400/20 border border-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100 border border-brand-100'">
              <i class="ri-download-line text-[11px]" /> 安装指南
            </button>
            <button v-else @click="openInstall(item.url)" title="官网"
              class="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
              :class="isDark ? 'bg-d4/50 text-wt-aux hover:bg-d4 hover:text-wt-sub' : 'bg-l4/70 text-lt-aux hover:bg-l4 hover:text-lt-sub'">
              <i class="ri-external-link-line text-[12px]" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tip -->
    <div class="rounded-xl p-3" :class="isDark ? 'bg-d3/50 border border-bdr' : 'bg-l3/50 border border-bdrF'">
      <div class="flex items-start gap-2">
        <i class="ri-lightbulb-line text-amber-400 text-[12px] mt-[2px]" />
        <p class="text-[10.5px] leading-relaxed flex-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          安装新工具后需重新启动应用或重新检测才能识别。若已安装但仍显示未安装，请检查工具是否已加入系统 <span class="font-mono px-1 rounded" :class="isDark ? 'bg-d0 text-wt-aux' : 'bg-l2 text-lt-sub'">PATH</span> 环境变量。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ctx-pill { display: inline-flex; padding: 1px 5px; border-radius: 3px; font-weight: 600; line-height: 1.4; }
.section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }

/* Loader ring (spinning) */
.loader-ring {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid transparent;
  border-top-color: var(--ring-color, #6C8AFF);
  border-right-color: var(--ring-color, #6C8AFF);
  animation: ring-spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes ring-spin {
  to { transform: rotate(360deg); }
}

/* Refresh button checking state */
.env-refresh-btn.is-checking {
  animation: btn-pulse 1.4s ease-in-out infinite;
}
@keyframes btn-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(108, 138, 255, 0.35); }
  50% { box-shadow: 0 0 0 4px rgba(108, 138, 255, 0); }
}

/* Sweeping bar across button */
.sweep-bar {
  transform: translateX(-100%);
  animation: sweep 1.2s ease-in-out infinite;
  width: 100%;
}
@keyframes sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
