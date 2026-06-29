<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import logoUrl from '@/assets/logo-light.png'
const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const author = {
  name: '明辰',
  role: 'Reviva 设计与开发',
  bio: 'AI 应该帮人学得更好，而不只是答得更快。Reviva 想做的是把 AI 和学习真正绑在一起——你带着自己的资料来，AI 基于你的上下文回答问题、帮你梳理知识、生成复习材料和学习产出，而不是给你一个脱离语境的通用答案。',
  bioExtra: 'Reviva 是一个面向学习者的 AI 桌面应用，围绕你的资料完成问答、复习和创作输出，所有动作都在同一个本地工作区里连续完成。目前还在早期，欢迎试用反馈。',
  email: '1906837163@qq.com',
}

const focus = ['AI 辅助学习', '资料驱动问答', '学练用一体', '创作工作台']

const social = [
  { name: 'Email', icon: 'ri-mail-line', value: '1906837163@qq.com', url: 'mailto:1906837163@qq.com', color: 'brand', svg: false },
  { name: '抖音', icon: 'ri-tiktok-line', value: 'Reviva 抖音', url: '', color: 'tiktok', svg: false },
  { name: '小红书', icon: 'xiaohongshu', value: 'Reviva 小红书', url: '', color: 'red', svg: true },
  { name: 'Bilibili', icon: 'ri-bilibili-line', value: 'B站账号', url: '', color: 'pink', svg: false }
]

const intent = [
  {
    icon: 'ri-book-open-line',
    title: '带着资料学',
    num: '01',
    desc: '导入 PDF、DOCX、Markdown 等学习资料后，AI 基于你的知识库回答问题。不是通用聊天，而是围绕你在学的内容对话。',
    color: 'brand',
  },
  {
    icon: 'ri-mind-map',
    title: '理解之后练',
    num: '02',
    desc: '学完不等于记住。AI 帮你把资料变成闪卡、测验和导图，从"看过了"到"掌握了"之间，用主动回忆和结构梳理把知识扎牢。',
    color: 'purple',
  },
  {
    icon: 'ri-rocket-line',
    title: '练完之后用',
    num: '03',
    desc: '学习不该止步于笔记。把理解成果继续生成深度研究、播客、PPT 等可交付的内容——从"我学过"到"我产出了"。',
    color: 'emerald',
  }
]

const focusAreas = [
  { title: 'AI 辅助学习', items: ['资料驱动问答', '闪卡与测验', '知识导图梳理'], icon: 'ri-book-open-line', color: 'brand' },
  { title: '学习资料管理', items: ['多格式导入', '上下文检索增强', 'Agent输出联动'], icon: 'ri-file-list-3-line', color: 'purple' },
  { title: '学习成果产出', items: ['深度研究与报告', 'PPT 与播客', '可交付内容生成'], icon: 'ri-rocket-line', color: 'emerald' }
]

const milestones = [
  { icon: 'ri-seedling-line', title: '项目启动', desc: '从"学完就忘、资料散落"的痛点出发，构思一个让 AI 围绕你的资料辅助学习的桌面工具', color: 'brand' },
  { icon: 'ri-flask-line', title: '内测阶段', desc: '资料问答、闪卡测验、创作工作台三条学习主线逐步跑通，小范围收集真实学习反馈', color: 'amber' },
  { icon: 'ri-road-map-line', title: '持续迭代', desc: '补齐学习统计、错误恢复等体验，逐步开放更多学习场景和创作能力', color: 'emerald' }
]

const stats = [
  { label: '开发阶段', value: '内测中', icon: 'ri-flask-line', iconColor: 'text-amber-400' },
  { label: '当前版本', value: 'v0.0.1-beta', icon: 'ri-code-s-slash-line', iconColor: 'text-brand-400' },
  { label: '支持平台', value: 'Windows', icon: 'ri-windows-fill', iconColor: 'text-brand-400' }
]

function open(url) {
  if (!url) return
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url).catch(console.error)
  } else if (/^mailto:/i.test(url)) {
    window.location.href = url
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

// 统一四色体系：brand / purple / emerald / amber
function toneClass(tone) {
  const dark = {
    brand: 'bg-brand-400/10 text-brand-400 border-brand-400/20',
    purple: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    emerald: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    amber: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  }
  const light = {
    brand: 'bg-brand-50 text-brand-600 border-brand-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  }
  return (isDark.value ? dark : light)[tone] || dark.brand
}

// 社交图标：各平台品牌色
function socialIconStyle(color) {
  const dark = {
    brand: 'text-brand-400',
    tiktok: 'text-white',
    red: 'text-red-400',
    pink: 'text-pink-400',
  }
  const light = {
    brand: 'text-brand-600',
    tiktok: 'text-gray-800',
    red: 'text-red-600',
    pink: 'text-pink-600',
  }
  return (isDark.value ? dark : light)[color] || dark.brand
}

// 重点方向：三组各用 brand/purple/emerald
function focusColor(color) {
  const t = toneClass(color)
  const parts = t.split(' ')
  return { icon: parts[1], bg: parts[0], pill: t }
}

// 开发历程
function milestoneColor(color) {
  return toneClass(color)
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-6 lg:px-8 py-6 space-y-5">

    <!-- Author Hero -->
    <div class="rounded-xl p-5 overflow-hidden relative" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-400 via-purple-500 to-emerald-400"></div>
      <div class="flex items-start gap-4 pt-1">
        <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0">
          <img :src="logoUrl" alt="" class="w-16 h-16 rounded-2xl">
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <h2 class="text-[21px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ author.name }}</h2>
            <span class="ctx-pill border" :class="toneClass('purple')">开发者</span>
          </div>
          <p class="text-[12px] mb-3 font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ author.role }}</p>
          <div class="flex items-center gap-3 text-[11px] mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            <a @click.prevent="open(`mailto:${author.email}`)" class="flex items-center gap-1 hover:underline cursor-pointer">
              <i class="ri-mail-line text-[12px]" />
              {{ author.email }}
            </a>
          </div>
          <p class="text-[12px] leading-relaxed mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            {{ author.bio }}
          </p>
          <p class="text-[12px] leading-relaxed mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            {{ author.bioExtra }}
          </p>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="(tag, i) in focus" :key="tag"
              class="ctx-pill border"
              :class="toneClass(['brand', 'purple', 'emerald', 'amber'][i])">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Stats + Contact -->
    <div class="grid grid-cols-2 gap-4">
      <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-3">
          <i class="ri-bar-chart-box-line text-brand-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">产品状态</span>
        </div>
        <div class="space-y-2">
          <div v-for="stat in stats" :key="stat.label"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5"
            :class="isDark ? 'bg-d0' : 'bg-l2'">
            <i :class="[stat.icon, 'text-[16px]', stat.iconColor]" />
            <div class="flex-1 min-w-0">
              <span class="block text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ stat.label }}</span>
              <span class="block text-[12px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ stat.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-3">
          <i class="ri-links-line text-purple-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联系方式</span>
        </div>
        <div class="space-y-0.5">
          <div v-for="item in social" :key="item.name"
            class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-colors"
            :class="[
              item.url ? 'cursor-pointer hover:bg-white/4' : '',
              isDark ? (item.url ? 'hover:bg-white/4' : '') : (item.url ? 'hover:bg-l4' : '')
            ]"
            @click="item.url && open(item.url)">
            <svg-icon v-if="item.svg" :icon-class="item.icon" :size="16" :class="socialIconStyle(item.color)" />
            <i v-else :class="[item.icon, 'text-[16px]', socialIconStyle(item.color)]" />
            <span class="flex-1 min-w-0">
              <span class="block text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.name }}</span>
              <span class="block text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.value }}</span>
            </span>
            <i v-if="item.url" class="ri-arrow-right-up-line text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          </div>
        </div>
      </div>
    </div>

    <!-- Design Intent -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-4">
        <i class="ri-lightbulb-flash-line text-brand-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">设计意图</span>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div v-for="item in intent" :key="item.title"
          class="rounded-lg p-3.5"
          :class="isDark ? 'bg-d0' : 'bg-l2'">
            <div class="flex items-center gap-2.5 mb-2.5">
              <i :class="[item.icon, 'text-[18px]', toneClass(item.color).split(' ')[1]]" />
              <span class="text-[10px] font-mono font-bold" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.num }}</span>
            </div>
            <h4 class="text-[13px] font-bold mb-1.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ item.title }}</h4>
            <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ item.desc }}</p>
          </div>
      </div>
    </div>

    <!-- Focus + Milestones -->
    <div class="grid grid-cols-2 gap-4">
      <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-4">
          <i class="ri-focus-3-line text-purple-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">重点方向</span>
        </div>
        <div class="space-y-2.5">
          <div v-for="area in focusAreas" :key="area.title"
            class="rounded-lg p-3" :class="isDark ? 'bg-d0' : 'bg-l2'">
            <div class="flex items-center gap-2 mb-2">
              <i :class="[area.icon, 'text-[15px]', focusColor(area.color).icon]" />
              <span class="text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ area.title }}</span>
            </div>
            <div class="flex flex-wrap gap-1.5 pl-8">
              <span v-for="item in area.items" :key="item"
                class="ctx-pill border" :class="focusColor(area.color).pill">{{ item }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-4">
          <i class="ri-road-map-line text-emerald-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">开发历程</span>
        </div>
        <div class="space-y-2.5">
          <div v-for="m in milestones" :key="m.title"
            class="rounded-lg p-3 flex items-start gap-3"
            :class="isDark ? 'bg-d0' : 'bg-l2'">
            <i :class="[m.icon, 'text-[16px]', milestoneColor(m.color).split(' ')[1]]" />
            <div class="min-w-0">
              <span class="block text-[12px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ m.title }}</span>
              <span class="block text-[11px] leading-relaxed mt-0.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ m.desc }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-center gap-2 pt-2">
      <div class="h-px flex-1" :class="isDark ? 'bg-bdr' : 'bg-bdrF'"></div>
      <p class="text-[10px] px-3" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        © 2026 Reviva · {{ author.name }} · 用心打磨中
      </p>
      <div class="h-px flex-1" :class="isDark ? 'bg-bdr' : 'bg-bdrF'"></div>
    </div>
  </div>
</template>