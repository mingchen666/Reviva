<script setup>
import { computed } from 'vue';
import { useAppStore } from '@/stores/app';
import logoUrl from '@/assets/logo-light.png';
import { getAppVersion } from '@/utils/tools';

const appVersion = getAppVersion();
const appStore = useAppStore();
const isDark = computed(() => appStore.isDark);

/* ── 文案（对齐 README 定位） ── */
const author = {
  name: '明辰',
  role: 'Reviva 设计与开发',
  bio: 'AI 应该帮人学得更好，而不只是答得更快。',
  bioExtra:
    'Reviva 是一个以 Agent 为核心的本地学习工作台——不是带一堆工具的聊天窗口，而是 Agent 理解你的资料、调用工具、遵循权限，把结果变成可复用学习产出的完整工作区。对话、文档、知识库、笔记、复习和创作输出，都在同一个本地空间里连续发生。',
  email: '1906837163@qq.com',
};

const focus = [
  { text: 'Agent 驱动', tone: 'brand' },
  { text: '本地优先', tone: 'purple' },
  { text: '可视化学习', tone: 'emerald' },
  { text: '知识持续捕获', tone: 'amber' },
];

const social = [
  { name: 'Email', icon: 'ri-mail-line', value: '1906837163@qq.com', url: 'mailto:1906837163@qq.com', color: 'brand', svg: false },
  { name: 'GitHub', icon: 'ri-github-fill', value: 'mingchen666/Reviva', url: 'https://github.com/mingchen666/Reviva', color: 'brand', svg: false },
  { name: '抖音', icon: 'ri-tiktok-line', value: 'Reviva 抖音', url: '', color: 'tiktok', svg: false },
  { name: '小红书', icon: 'xiaohongshu', value: 'Reviva 小红书', url: '', color: 'red', svg: true },
  { name: 'Bilibili', icon: 'ri-bilibili-line', value: 'B站账号', url: '', color: 'pink', svg: false },
];

const intent = [
  {
    icon: 'ri-book-open-line',
    num: '01',
    title: '你的资料，就是你的上下文',
    desc: '导入文档、文件夹或 Wiki 知识库，选择 Agent 开始对话。用 @ 快速引用、/ 调用技能，AI 始终围绕你在学的内容回答。',
    color: 'brand',
  },
  {
    icon: 'ri-mind-map',
    num: '02',
    title: '从"看过"到"掌握"',
    desc: 'AI 把资料变成测验、闪卡、导图、知识图谱和图表，用主动回忆和结构梳理把知识扎牢。',
    color: 'purple',
  },
  {
    icon: 'ri-rocket-line',
    num: '03',
    title: '不止学过，还要产出',
    desc: '生成 PPT、播客、深度研究报告等可交付内容，再存回笔记和 Wiki，产出继续喂给下一轮学习。',
    color: 'emerald',
  },
];

const focusAreas = [
  {
    title: 'Agent 协作',
    items: ['多 Agent 切换', '共享上下文', '全局记忆'],
    icon: 'ri-robot-2-line',
    color: 'brand',
  },
  {
    title: '资料与知识库',
    items: ['多格式导入', 'Wiki 知识管理', '上下文检索增强'],
    icon: 'ri-database-2-line',
    color: 'purple',
  },
  {
    title: '学习与创作',
    items: ['测验 / 闪卡 / 导图', 'PPT / 播客 / 图表', '深度研究报告'],
    icon: 'ri-palette-line',
    color: 'emerald',
  },
];

const milestones = [
  {
    icon: 'ri-seedling-line',
    phase: '起点',
    title: '项目启动',
    desc: '从"学完就忘、资料散落、每次从空白对话开始"的痛点出发，构思一个以 Agent 为核心的本地学习工作台',
    color: 'brand',
  },
  {
    icon: 'ri-rocket-line',
    phase: '里程碑',
    title: '1.0 正式发布',
    desc: 'Agent 工作台、资料问答、Wiki 知识库、学习巩固、创作输出形成完整闭环，支持 Windows 与 macOS',
    color: 'emerald',
  },
  {
    icon: 'ri-road-map-line',
    phase: '进行中',
    title: '持续迭代',
    desc: '音视频解析与转写、更多 Agent 技能、学习统计、MCP 工具扩展，逐步开放更多学习场景',
    color: 'purple',
  },
];

const stats = [
  { label: '发布状态', value: '正式版 · Stable', icon: 'ri-shield-check-line', iconColor: 'text-emerald-400' },
  { label: '当前版本', value: `v${appVersion}`, icon: 'ri-code-s-slash-line', iconColor: 'text-brand-400' },
  { label: '支持平台', value: 'Windows / macOS', icon: 'ri-computer-line', iconColor: 'text-purple-400' },
  { label: '开源协议', value: 'AGPL-3.0 + 商用', icon: 'ri-open-source-line', iconColor: 'text-amber-400' },
];

/* ── 工具函数 ── */
function open(url) {
  if (!url) return;
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url).catch(console.error);
  } else if (/^mailto:/i.test(url)) {
    window.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function toneClass(tone) {
  const dark = {
    brand: 'bg-brand-400/10 text-brand-400 border-brand-400/20',
    purple: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    emerald: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    amber: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  };
  const light = {
    brand: 'bg-brand-50 text-brand-600 border-brand-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (isDark.value ? dark : light)[tone] || dark.brand;
}

function toneText(tone) {
  const dark = { brand: 'text-brand-400', purple: 'text-purple-400', emerald: 'text-emerald-400', amber: 'text-amber-400' };
  const light = { brand: 'text-brand-600', purple: 'text-purple-600', emerald: 'text-emerald-600', amber: 'text-amber-600' };
  return (isDark.value ? dark : light)[tone] || dark.brand;
}

function socialIconStyle(color) {
  const dark = { brand: 'text-brand-400', tiktok: 'text-white', red: 'text-red-400', pink: 'text-pink-400' };
  const light = { brand: 'text-brand-600', tiktok: 'text-gray-800', red: 'text-red-600', pink: 'text-pink-600' };
  return (isDark.value ? dark : light)[color] || dark.brand;
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 lg:px-8 py-6 space-y-5">

    <!-- ═══ Author Hero ═══ -->
    <div
      class="rounded-xl p-5 overflow-hidden relative"
      :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
    >
      <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-400 via-purple-500 to-emerald-400" />

      <div class="flex items-start gap-4 pt-1">
        <div class="w-16 h-16 rounded-2xl overflow-hidden shrink-0">
          <img :src="logoUrl" alt="" class="w-16 h-16 rounded-2xl" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <h2 class="text-[21px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              {{ author.name }}
            </h2>
            <span class="ctx-pill border" :class="toneClass('purple')">开发者</span>
          </div>
          <p class="text-[12px] mb-3 font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            {{ author.role }}
          </p>

          <div class="flex items-center gap-3 text-[11px] mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            <a
              @click.prevent="open(`mailto:${author.email}`)"
              class="flex items-center gap-1 hover:underline cursor-pointer"
            >
              <i class="ri-mail-line text-[12px]" />
              {{ author.email }}
            </a>
          </div>

          <!-- 理念：稍大稍重 -->
          <p class="text-[13px] leading-relaxed font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            {{ author.bio }}
          </p>
          <!-- 产品简介：辅助色、控行宽 -->
          <p class="text-[12px] leading-relaxed mb-3 max-w-xl" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            {{ author.bioExtra }}
          </p>

          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="tag in focus"
              :key="tag.text"
              class="ctx-pill border"
              :class="toneClass(tag.tone)"
            >
              {{ tag.text }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ 设计意图 ═══ -->
    <div
      class="rounded-xl p-4"
      :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
    >
      <div class="flex items-center gap-2 mb-4">
        <i class="ri-lightbulb-flash-line text-brand-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">设计意图</span>
        <span class="ml-auto text-[10px] tracking-wide" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
  导入 → 巩固 → 产出 → 沉淀
        </span>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="item in intent"
          :key="item.title"
          class="rounded-lg p-3.5"
          :class="isDark ? 'bg-d0' : 'bg-l2'"
        >
          <div class="flex items-center justify-between mb-2.5">
            <i :class="[item.icon, 'text-[18px]', toneText(item.color)]" />
            <span class="text-[10px] font-mono font-bold" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ item.num }}
            </span>
          </div>
          <h4 class="text-[13px] font-bold mb-1.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
            {{ item.title }}
          </h4>
          <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            {{ item.desc }}
          </p>
        </div>
      </div>
    </div>

    <!-- ═══ 产品状态 + 联系方式 ═══ -->
    <div class="grid grid-cols-2 gap-4">
      <div
        class="rounded-xl p-4"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
      >
        <div class="flex items-center gap-2 mb-3">
          <i class="ri-bar-chart-box-line text-brand-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">产品状态</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="stat in stats"
            :key="stat.label"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5"
            :class="isDark ? 'bg-d0' : 'bg-l2'"
          >
            <i :class="[stat.icon, 'text-[16px]', stat.iconColor]" />
            <div class="flex-1 min-w-0">
              <span class="block text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                {{ stat.label }}
              </span>
              <span class="block text-[12px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                {{ stat.value }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        class="rounded-xl p-4"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
      >
        <div class="flex items-center gap-2 mb-3">
          <i class="ri-links-line text-purple-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联系方式</span>
        </div>
        <div class="space-y-0.5">
          <div
            v-for="item in social"
            :key="item.name"
            class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-colors"
            :class="[
              item.url ? 'cursor-pointer' : 'opacity-60',
              isDark ? (item.url ? 'hover:bg-white/4' : '') : item.url ? 'hover:bg-l4' : ''
            ]"
            @click="item.url && open(item.url)"
          >
            <svg-icon
              v-if="item.svg"
              :icon-class="item.icon"
              :size="16"
              :class="socialIconStyle(item.color)"
            />
            <i v-else :class="[item.icon, 'text-[16px]', socialIconStyle(item.color)]" />
            <span class="flex-1 min-w-0">
              <span class="block text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                {{ item.name }}
              </span>
              <span class="block text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                {{ item.value }}
              </span>
            </span>
            <i
              v-if="item.url"
              class="ri-arrow-right-up-line text-[14px]"
              :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ 重点方向 + 开发历程 ═══ -->
    <div class="grid grid-cols-2 gap-4">
      <div
        class="rounded-xl p-4"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
      >
        <div class="flex items-center gap-2 mb-4">
          <i class="ri-focus-3-line text-purple-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">重点方向</span>
        </div>
        <div class="space-y-2.5">
          <div
            v-for="area in focusAreas"
            :key="area.title"
            class="rounded-lg p-3"
            :class="isDark ? 'bg-d0' : 'bg-l2'"
          >
            <div class="flex items-center gap-2 mb-2">
              <i :class="[area.icon, 'text-[15px]', toneText(area.color)]" />
              <span class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                {{ area.title }}
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5 pl-7">
              <span
                v-for="item in area.items"
                :key="item"
                class="ctx-pill border"
                :class="toneClass(area.color)"
              >
                {{ item }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        class="rounded-xl p-4"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
      >
        <div class="flex items-center gap-2 mb-4">
          <i class="ri-road-map-line text-emerald-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">开发历程</span>
        </div>
        <div class="space-y-2.5">
          <div
            v-for="m in milestones"
            :key="m.title"
            class="rounded-lg p-3 flex items-start gap-3"
            :class="isDark ? 'bg-d0' : 'bg-l2'"
          >
            <i :class="[m.icon, 'text-[16px] mt-0.5', toneText(m.color)]" />
            <div class="min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  {{ m.title }}
                </span>
                <span class="ctx-pill border text-[9px]" :class="toneClass(m.color)">
                  {{ m.phase }}
                </span>
              </div>
              <span class="block text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                {{ m.desc }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Footer ═══ -->
    <div class="flex items-center justify-center gap-2 pt-2">
      <div class="h-px flex-1" :class="isDark ? 'bg-bdr' : 'bg-bdrF'" />
      <p class="text-[10px] px-3" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        © 2026 Reviva · {{ author.name }} · v{{ appVersion }} · AGPL-3.0
      </p>
      <div class="h-px flex-1" :class="isDark ? 'bg-bdr' : 'bg-bdrF'" />
    </div>
  </div>
</template>