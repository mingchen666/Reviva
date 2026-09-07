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

const versionHighlights = [
  '多 Agent 协作：对话中切换 Agent，共享上下文与全局记忆。',
  '围绕资料对话：本地文档、文件夹、Wiki 知识库与音视频皆可引用。',
  '可视化学习与创作：测验、闪卡、导图、知识图谱、PPT 与研究报告。',
  '知识持续沉淀：输出回流笔记、Wiki 与本地目录，形成学习闭环。',
  '本地优先与可控：自有模型、权限沙箱、数据备份与迁移。',
];

const versionTips = [
  '自动更新优先走系统通道；网络不可达时可从备用入口下载。',
  '模型价格与能力以服务商为准，长期使用前建议定期备份。',
];
function go(route) {
  if (!route) return;
  router.push(route);
}

function checkUpdate() {
  checkForUpdate();
}

function openExternal(url) {
  if (!url) return;
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url).catch(console.error);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
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

    <!-- ═══ 版本更新 ═══ -->
    <div class="rounded-xl p-4"
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

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- 亮点 -->
          <div class="rounded-lg p-3" :class="isDark ? 'bg-d0' : 'bg-l2'">
            <div class="flex items-center gap-1.5 mb-2.5">
              <i class="ri-sparkling-2-fill text-emerald-400 text-[13px]" />
              <span class="text-[11px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">版本亮点</span>
            </div>
            <ul class="space-y-1.5">
              <li
                v-for="item in versionHighlights"
                :key="item"
                class="flex items-start gap-2 text-[11px] leading-relaxed"
                :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
              >
                <span class="w-1 h-1 rounded-full mt-2 shrink-0 bg-emerald-400/70" />
                <span>{{ item }}</span>
              </li>
            </ul>
          </div>
          <!-- 使用提示 -->
          <div class="rounded-lg p-3" :class="isDark ? 'bg-d0' : 'bg-l2'">
            <div class="flex items-center gap-1.5 mb-2.5">
              <i class="ri-lightbulb-line text-amber-400 text-[13px]" />
              <span class="text-[11px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">使用提示</span>
            </div>
            <ul class="space-y-1.5">
              <li
                v-for="item in versionTips"
                :key="item"
                class="flex items-start gap-2 text-[11px] leading-relaxed"
                :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
              >
                <span class="w-1 h-1 rounded-full mt-2 shrink-0" :class="isDark ? 'bg-amber-400/70' : 'bg-amber-400'" />
                <span>{{ item }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

    <!-- ═══ 反馈与交流 ═══ -->
    <div
      class="rounded-xl p-4"
      :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
    >
      <div class="flex items-start gap-3">
        <div
          class="w-9 h-9 rounded-lg flex items-center justify-center border shrink-0"
          :class="toneClass('emerald')"
        >
          <i class="ri-feedback-line text-[16px]" />
        </div>
        <div class="min-w-0 flex-1">
          <h3
            class="text-[13px] font-bold mb-1.5"
            :class="isDark ? 'text-wt-main' : 'text-lt-main'"
          >
            反馈与交流
          </h3>
          <p
            class="text-[12px] leading-relaxed mb-3"
            :class="isDark ? 'text-wt-aux' : 'text-lt-aux'"
          >
            使用中遇到问题、有功能建议或合作意向，欢迎反馈与联系。可以提交 Issue、加入用户交流群，或直接联系作者。
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              class="h-8 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 border transition-colors"
              :class="isDark ? 'bg-d0 border-bdr text-wt-sub hover:border-brand-400/30' : 'bg-l2 border-bdrF text-lt-sub hover:border-brand-200'"
              @click="openExternal('https://github.com/mingchen666/Reviva/issues')"
            >
              <i class="ri-bug-line text-[12px]" />
              提交反馈
            </button>
            <!-- 交流群：点击在浏览器打开群二维码图片，请替换为真实图片 URL -->
            <button
              class="h-8 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 border transition-colors"
              :class="isDark ? 'bg-d0 border-bdr text-wt-sub hover:border-emerald-400/30' : 'bg-l2 border-bdrF text-lt-sub hover:border-emerald-200'"
              @click="openExternal('https://github.com/mingchen666/Reviva/raw/main/docs/images/wx-group.jpg')"
            >
              <i class="ri-group-line text-[12px]" />
              加入交流群
            </button>
            <button
              class="h-8 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 border transition-colors"
              :class="isDark ? 'bg-d0 border-bdr text-wt-sub hover:border-purple-400/30' : 'bg-l2 border-bdrF text-lt-sub hover:border-purple-200'"
              @click="go('/settings/author')"
            >
              <i class="ri-user-heart-line text-[12px]" />
              联系作者
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
