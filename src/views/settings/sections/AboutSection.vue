<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useAutoUpdate } from '@/composables/useAutoUpdate';
import { getAppVersion } from '@/utils/tools';

const appVersion = getAppVersion();
const router = useRouter();
const appStore = useAppStore();
const isDark = computed(() => appStore.isDark);
const { checking, updateInfo, error, lastCheckStatus, lastCheckMessage, checkForUpdate } =
  useAutoUpdate();

const updateNotice = computed(() => {
  if (checking.value) return '正在检查更新...';
  if (updateInfo.value?.version)
    return `发现新版本 v${updateInfo.value.version}，请在更新弹窗中继续处理。`;
  if (error.value) return '自动更新连接失败，可稍后重试，或使用更新弹窗中的夸克网盘下载。';
  if (lastCheckStatus.value === 'not-available')
    return lastCheckMessage.value || '当前已是最新版本。';
  return '';
});

const gettingStartedItems = [
  {
    label: '连接模型服务',
    desc: '配置 API Key、Base URL 和默认模型，支持云端与本地模型。',
    route: '/settings/models',
  },
  {
    label: '导入学习资料',
    desc: '添加 PDF、DOCX、Markdown、音视频或整个文件夹，在对话中直接引用。',
    route: '/docs-manage',
  },
  {
    label: '配置你的 Agent',
    desc: '设置模型、Skills、工具和权限，然后开始第一次对话。',
    route: '/agents',
  },
  {
    label: '沉淀生成结果',
    desc: '将摘要、闪卡、导图、报告等输出保存到笔记、Wiki 或本地目录，持续复用。',
    route: '/outputs',
  },
];

const releaseNotes = [
  {
    title: 'Reviva 1.0',
    meta: '首个正式版',
    type: 'stable',
    items: [
      '以 Agent 为核心连接资料、知识库、笔记、Skills 与工具。',
      '支持在对话中切换 Agent，并共享已选择的资料上下文。',
      '整合文档处理、音视频解析、知识检索和可视化学习工具。',
      '完善本地优先的数据管理、权限控制与备份能力。',
    ],
  },
  {
    title: '核心能力',
    meta: 'v1.0 已支持',
    type: 'focus',
    items: [
      '围绕本地文档、文件夹、Wiki 知识库和音视频内容与 Agent 对话。',
      '生成测验、闪卡、思维导图、知识图谱、图表、PPT 和研究报告。',
      '接入自定义模型、OCR、语音识别、MCP 与本地网关服务。',
    ],
  },
  {
    title: '使用提示',
    meta: '建议了解',
    type: 'limit',
    items: [
      '自动更新优先使用系统更新通道；网络不可达时会提示备用发布入口。',
      '模型价格、上下文长度和能力标签会随服务商调整，实际调用以服务商为准。',
      '长期使用前建议定期创建完整备份、精简备份或数据库备份。',
    ],
  },
];

const relatedLinks = [
  {
    label: '模型服务',
    desc: '配置服务商、模型和接入方式',
    icon: 'ri-ai-generate-3d-line',
    route: '/settings/models',
  },
  {
    label: '默认模型',
    desc: '设置对话、标题和翻译模型',
    icon: 'ri-robot-2-line',
    route: '/settings/default-models',
  },
  {
    label: '沙箱与权限',
    desc: '检查文件、命令和工具限制',
    icon: 'ri-shield-keyhole-line',
    route: '/settings/sandbox',
  },
];

function go(route) {
  if (!route) return;
  router.push(route);
}

function checkUpdate() {
  checkForUpdate();
}

function toneClass(tone) {
  const dark = {
    brand: 'bg-brand-400/10 text-brand-400 border-brand-400/20',
    emerald: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    amber: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    rose: 'bg-rose-400/10 text-rose-400 border-rose-400/20',
  };
  const light = {
    brand: 'bg-brand-50 text-brand-600 border-brand-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  };
  const palette = isDark.value ? dark : light;
  return palette[tone] || palette.brand;
}

function releaseTone(type) {
  if (type === 'stable') return toneClass('emerald');
  if (type === 'focus') return toneClass('brand');
  return toneClass('amber');
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <!-- ═══ Hero ═══ -->
    <div
      class="rounded-xl p-5"
      :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
    >
      <div class="flex items-start gap-4">
        <div
          class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          :class="isDark ? 'bg-d0' : 'bg-l2'"
        >
          <img
            class="h-12 w-12 rounded-xl"
            :src="isDark ? './logo-dark.png' : './logo-light.png'"
            alt="Reviva"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h2
                  class="text-[21px] font-bold"
                  :class="isDark ? 'text-wt-main' : 'text-lt-main'"
                >
                  Reviva
                </h2>
                <span
                  class="ctx-pill"
                  :class="
                    isDark
                      ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/20'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  "
                  >正式版</span
                >
                <span
                  class="ctx-pill font-mono"
                  :class="
                    isDark
                      ? 'bg-d0 text-wt-sub border border-bdr'
                      : 'bg-l2 text-lt-sub border border-bdrF'
                  "
                  >v{{ appVersion }}</span
                >
              </div>
              <p
                class="text-[12px] leading-relaxed mt-2 max-w-3xl"
                :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
              >
                以 Agent 为核心的本地学习工作台。资料、对话、知识库、笔记和创作输出，在同一个桌面空间里连续完成。
              </p>
            </div>
            <button
              class="h-8 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 shrink-0 border transition-colors"
              :disabled="checking"
              :class="
                isDark
                  ? 'bg-d0 border-bdr text-wt-sub hover:border-brand-400/30 disabled:opacity-60'
                  : 'bg-l2 border-bdrF text-lt-sub hover:border-brand-200 disabled:opacity-60'
              "
              @click="checkUpdate"
            >
              <i class="ri-refresh-line text-[12px]" :class="checking ? 'animate-spin' : ''" />
              {{ checking ? '检查中' : '检查更新' }}
            </button>
          </div>
          <div
            v-if="updateNotice"
            class="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-lg text-[11px]"
            :class="
              isDark
                ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                : 'bg-amber-50 text-amber-700 border border-amber-100'
            "
          >
            <i class="ri-information-line text-[12px]" />
            <span>{{ updateNotice }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ 数据与隐私（原"关于 Reviva 1.0"，不再重复产品介绍） ═══ -->
    <div
      class="rounded-xl p-4"
      :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
    >
      <div class="flex items-start gap-3">
        <div
          class="w-9 h-9 rounded-lg flex items-center justify-center border shrink-0"
          :class="toneClass('brand')"
        >
          <i class="ri-lock-2-line text-[16px]" />
        </div>
        <div class="min-w-0">
          <h3
            class="text-[13px] font-bold mb-1.5"
            :class="isDark ? 'text-wt-main' : 'text-lt-main'"
          >
            数据与隐私
          </h3>
          <p
            class="text-[12px] leading-relaxed"
            :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
          >
            对话、文档、笔记、知识库和 Agent 配置主要存储在本机工作区与 SQLite
            数据库中，可自由迁移、备份或删除。文件工具通过授权根目录和虚拟文件系统访问，减少误触敏感路径。是否向云端发送请求，取决于你配置的模型、OCR、语音和检索服务——使用前请留意对应服务商的数据政策与计费方式。
          </p>
        </div>
      </div>
    </div>

    <!-- ═══ 版本更新 + 快速开始 / 相关入口 ═══ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div
        class="lg:col-span-2 rounded-xl p-4"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
      >
        <div class="flex items-center justify-between gap-3 mb-4">
          <div class="flex items-center gap-2">
            <i class="ri-history-line text-brand-400 text-[14px]" />
            <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
              >版本更新</span
            >
          </div>
          <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
            >v{{ appVersion }} 版本要点与使用提示</span
          >
        </div>

        <div class="space-y-4">
          <div
            v-for="log in releaseNotes"
            :key="log.title"
            class="rounded-lg p-3"
            :class="isDark ? 'bg-d0' : 'bg-l2'"
          >
            <div class="flex items-center gap-2 mb-2">
              <span
                class="text-[12px] font-bold"
                :class="isDark ? 'text-wt-main' : 'text-lt-main'"
                >{{ log.title }}</span
              >
              <span class="ctx-pill" :class="releaseTone(log.type)">{{ log.meta }}</span>
            </div>
            <ul class="space-y-1.5">
              <li
                v-for="entry in log.items"
                :key="entry"
                class="flex items-start gap-2 text-[11px] leading-relaxed"
                :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
              >
                <span
                  class="w-1 h-1 rounded-full mt-2 shrink-0"
                  :class="isDark ? 'bg-wt-dim' : 'bg-lt-aux'"
                />
                <span>{{ entry }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <!-- 快速开始 -->
        <div
          class="rounded-xl p-4"
          :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
        >
          <div class="flex items-center gap-2 mb-3">
            <i class="ri-checkbox-circle-line text-emerald-400 text-[14px]" />
            <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
              >快速开始</span
            >
          </div>
          <div class="space-y-2">
            <button
              v-for="(item, idx) in gettingStartedItems"
              :key="item.label"
              class="w-full rounded-lg px-3 py-2 text-left transition-colors"
              :class="isDark ? 'bg-d0 hover:bg-white/4' : 'bg-l2 hover:bg-l4'"
              @click="go(item.route)"
            >
              <div class="flex items-center gap-2">
                <span
                  class="text-[10px] font-mono font-bold shrink-0"
                  :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
                  >{{ idx + 1 }}</span
                >
                <span
                  class="text-[11px] font-semibold"
                  :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
                  >{{ item.label }}</span
                >
              </div>
              <span
                class="block text-[10px] leading-snug mt-0.5 pl-5"
                :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
                >{{ item.desc }}</span
              >
            </button>
          </div>
        </div>

        <!-- 相关入口 -->
        <div
          class="rounded-xl p-4"
          :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
        >
          <div class="flex items-center gap-2 mb-3">
            <i class="ri-link text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
            <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
              >相关入口</span
            >
          </div>
          <div class="grid gap-1">
            <button
              v-for="item in relatedLinks"
              :key="item.label"
              class="w-full flex items-start gap-2.5 py-2 px-2 rounded-lg text-left transition-colors"
              :class="isDark ? 'hover:bg-white/4' : 'hover:bg-l4'"
              @click="go(item.route)"
            >
              <i
                :class="`${item.icon} text-[13px] mt-0.5 ${isDark ? 'text-wt-aux' : 'text-lt-aux'}`"
              />
              <span class="flex-1 min-w-0">
                <span
                  class="block text-[11px] font-medium"
                  :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
                  >{{ item.label }}</span
                >
                <span
                  class="block text-[10px] mt-0.5"
                  :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
                  >{{ item.desc }}</span
                >
              </span>
              <i
                class="ri-arrow-right-up-line text-[14px] mt-0.5"
                :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
              />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Footer ═══ -->
    <p class="text-center text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      Reviva Desktop · v{{ appVersion }} · 本地优先 · AGPL-3.0 · 持续更新
    </p>
  </div>
</template>