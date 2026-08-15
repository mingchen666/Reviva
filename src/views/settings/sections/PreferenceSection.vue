<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'

const appStore = useAppStore()
const ss = useSettingsStore()
const isDark = computed(() => appStore.isDark)

const answerStyles = [
  { key: 'default', label: '默认', desc: '保持自然教学语气，不额外套用人格', icon: 'ri-magic-line', color: '#9CA3AF' },
  { key: 'study_partner', label: '学伴', desc: '像一起学习的同桌，轻松陪你理解问题', icon: 'ri-book-open-line', color: '#6C8AFF' },
  { key: 'best_friend', label: '死党', desc: '熟人式陪学，会吐槽、鼓励，也会拉你一把', icon: 'ri-emotion-laugh-line', color: '#EC4899' },
  { key: 'humorous', label: '幽默风趣', desc: '用轻松比喻和小段子降低学习压力', icon: 'ri-chat-smile-2-line', color: '#F59E0B' },
  { key: 'gentle_tutor', label: '温柔助教', desc: '耐心、细致、情绪稳定，适合慢慢讲', icon: 'ri-hand-heart-line', color: '#4ADE80' },
  { key: 'strict_mentor', label: '严厉导师', desc: '直接指出问题，督促你改正和完成练习', icon: 'ri-focus-3-line', color: '#F87171' },
  { key: 'big_sister', label: '御姐导师', desc: '成熟、可靠、有掌控感，讲解清楚不啰嗦', icon: 'ri-vip-crown-line', color: '#A78BFA' },
  { key: 'tsundere', label: '傲娇陪练', desc: '嘴上嫌弃，实际认真帮你，带一点反差感', icon: 'ri-sparkling-line', color: '#F43F5E' },
  { key: 'exam_trainer', label: '应试教练', desc: '围绕考点、题型、步骤和得分点来讲', icon: 'ri-crosshair-2-line', color: '#0EA5E9' },
]
const styleLabels = Object.fromEntries(answerStyles.map(style => [style.key, style.label]))
const previewTexts = {
  default: { title: '唯物辩证法', body: '唯物辩证法是一种看待变化和联系的方法。它强调事物不是孤立静止的，而是在矛盾运动中不断发展。' },
  study_partner: { title: '我们一起拆一下', body: '你可以先把它理解成一种"看变化"的方法：事情不是一成不变的，矛盾会推动它往前走。我们先抓这个核心就够了。' },
  best_friend: { title: '这题别被名字吓到', body: '听着很哲学，其实没那么玄：世界在变化，变化有原因，原因常常藏在矛盾里。先记这个，后面就顺了。' },
  humorous: { title: '给它翻译成人话', body: '唯物辩证法有点像给世界装了个"变化雷达"：哪里有矛盾，哪里就有剧情；量攒够了，剧情就升级。' },
  gentle_tutor: { title: '慢慢来，先抓主线', body: '这个概念确实有点抽象。我们先不急着背定义，只看一句话：它研究事物如何在联系和矛盾中发展。' },
  strict_mentor: { title: '先把核心概念记准', body: '不要先背大段定义。先掌握三点：联系、矛盾、发展。能用自己的话解释这三点，再去做题。' },
  big_sister: { title: '抓住主干就不难', body: '唯物辩证法的重点不是堆术语，而是判断事物如何变化。你先抓"矛盾推动发展"这条主线，再补三大规律。' },
  tsundere: { title: '这个都能被名字吓住？', body: '好啦，帮你拆开：它就是研究事物怎么变化的。先记住"矛盾推动发展"，别一上来就硬背整段定义。' },
  exam_trainer: { title: '考试看这几个点', body: '答题优先写：联系观点、发展观点、矛盾观点。展开时重点落到"对立统一规律"，这是最常考的核心。' },
}
const currentStyleKey = computed(() => styleLabels[ss.answerStyle] ? ss.answerStyle : 'default')
const currentPreview = computed(() => previewTexts[currentStyleKey.value] || previewTexts.default)
const chatNavigationEnabled = computed(() => ss.chatNavigationEnabled !== false)
const navigationStyles = [
  {
    key: 'directory',
    label: '摘要目录',
    tag: '推荐',
    desc: '点击右上角按钮展开面板，按轮次列出提问与 AI 摘要，点击跳转。',
    traits: ['按需展开', '信息完整', '适合长对话'],
    icon: 'ri-list-unordered',
  },
  {
    key: 'minimap',
    label: '对话缩略图',
    tag: null,
    desc: '右侧常驻一条竖向轨道，每轮显示为一条横线；悬停预览内容，点击跳转。',
    traits: ['始终可见', '一目了然', '适合频繁跳转'],
    icon: 'ri-code-view',
  },
]
const currentNavigationStyle = computed(() => ss.chatNavigationStyle === 'minimap' ? 'minimap' : 'directory')
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">

    <!-- ======== AI 回答风格 ======== -->
    <section>
      <div class="flex items-center gap-2 mb-4">
        <div class="w-1 h-4 rounded-full bg-rose-400" />
        <span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">AI 回答风格</span>
        <span class="text-[10px] ml-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">学习台与 Agent 的教学语气和陪伴人格</span>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="rounded-xl p-3 overflow-y-auto thin-scroll" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-1.5 mb-2"><i class="ri-equalizer-line text-[12px] text-rose-400" /><span class="text-[10px] font-semibold" :class="isDark?'text-wt-sub':'text-lt-sub'">选择风格</span></div>
          <div class="space-y-0.5">
            <button v-for="style in answerStyles" :key="style.key" class="w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg text-left transition-all" :class="ss.answerStyle===style.key?(isDark?'bg-agent-400/8 border border-agent-400/20':'bg-agent-50 border border-agent-100'):(isDark?'border border-transparent hover:border-d4 hover:bg-white/2':'border border-transparent hover:border-bdrF hover:bg-l4/50')" @click="ss.savePreference('answerStyle', style.key)">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="ss.answerStyle===style.key?(isDark?'bg-white/6':'bg-white'):(isDark?'bg-d0':'bg-l2')"><i :class="`${style.icon} text-[14px]`" :style="`color:${style.color}`" /></div>
              <div class="flex-1 min-w-0"><div class="text-[12px] font-semibold" :class="ss.answerStyle===style.key?(isDark?'text-agent-400':'text-agent-500'):(isDark?'text-wt-sub':'text-lt-sub')">{{ style.label }}</div><div class="text-[10px] leading-snug" :class="isDark?'text-wt-dim':'text-lt-aux'">{{ style.desc }}</div></div>
              <div v-if="ss.answerStyle===style.key" class="w-2 h-2 rounded-full bg-agent-400 shrink-0" />
            </button>
          </div>
        </div>

        <div class="rounded-xl overflow-hidden flex flex-col" :class="isDark ? 'border border-d4' : 'border border-bdrF'">
          <div class="h-9 flex items-center gap-2 px-3 shrink-0" :class="isDark ? 'bg-d3 border-b border-d4' : 'bg-l3 border-b border-bdrF'"><div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">学习台 · 预览</span><span class="text-[10px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">唯物辩证法知识库</span></div>
          <div class="p-3 space-y-2 flex-1 overflow-y-auto thin-scroll" :class="isDark ? 'bg-d0' : 'bg-l2'">
            <div class="flex items-start gap-2"><div class="w-5 h-5 rounded-full bg-brand-400/20 flex items-center justify-center shrink-0"><i class="ri-user-line text-[10px] text-brand-400" /></div><div class="rounded-lg px-2.5 py-1.5 text-[11px]" :class="isDark?'bg-brand-400/8 text-brand-200':'bg-brand-50 text-brand-600'">什么是唯物辩证法？</div></div>
            <div class="flex items-start gap-2"><div class="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" :class="isDark?'bg-agent-400/20':'bg-agent-100'"><i class="ri-sparkling-line text-[10px]" :class="isDark?'text-agent-400':'text-agent-500'" /></div><div class="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed flex-1" :class="isDark?'bg-d3 text-wt-sub':'bg-l3 text-lt-sub'"><div class="font-semibold mb-1">{{ currentPreview.title }}</div><div class="text-[10px]">{{ currentPreview.body }}</div></div></div>
          </div>
          <div class="h-7 flex items-center justify-center px-3 shrink-0" :class="isDark?'bg-d3 border-t border-d4':'bg-l3 border-t border-bdrF'"><span class="text-[9px]" :class="isDark?'text-wt-dim':'text-lt-aux'">当前风格：{{ styleLabels[currentStyleKey] }}</span></div>
        </div>
      </div>
    </section>

    <!-- ======== 对话导航 ======== -->
    <section>
      <div class="flex items-center gap-2 mb-4">
        <div class="w-1 h-4 rounded-full bg-brand-400" />
        <span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">对话导航</span>
        <span class="text-[10px] ml-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">在聊天区内快速回到任一轮提问</span>
      </div>

      <div class="rounded-xl overflow-hidden border" :class="isDark ? 'border-d4 bg-d3' : 'border-bdrF bg-l3'">
        <!-- 开关行 -->
        <div class="flex items-center gap-3 px-4 py-3.5 border-b" :class="isDark ? 'border-d4' : 'border-bdrF'">
          <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="chatNavigationEnabled ? (isDark ? 'bg-brand-400/14 text-brand-300' : 'bg-brand-50 text-brand-600') : (isDark ? 'bg-d0 text-wt-dim' : 'bg-l2 text-lt-aux')">
            <i class="ri-navigation-line text-[17px]" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5 text-[12.5px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              启用对话导航
              <span class="px-1.5 py-0.5 rounded text-[9px] font-medium" :class="chatNavigationEnabled ? (isDark ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600') : (isDark ? 'bg-d0 text-wt-dim' : 'bg-l2 text-lt-aux')">{{ chatNavigationEnabled ? '已开启' : '已关闭' }}</span>
            </span>
            <span class="block mt-0.5 text-[10.5px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ chatNavigationEnabled ? '在聊天区右侧提供问答定位；不会改变 Agent 的上下文或消息内容。' : '聊天区不会显示目录或缩略图；你选择的样式会被保留。' }}</span>
          </span>
          <button
            type="button"
            role="switch"
            :aria-checked="chatNavigationEnabled"
            :aria-label="chatNavigationEnabled ? '关闭对话导航' : '开启对话导航'"
            :title="chatNavigationEnabled ? '关闭对话导航' : '开启对话导航'"
            class="w-10 h-6 rounded-full p-0.5 shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70 focus-visible:ring-offset-2"
            :class="chatNavigationEnabled ? 'bg-brand-500' : (isDark ? 'bg-d0 border border-d4' : 'bg-l4 border border-bdrF')"
            @click="ss.savePreference('chatNavigationEnabled', !chatNavigationEnabled)">
            <span class="block w-5 h-5 rounded-full bg-white shadow-sm transition-transform" :class="chatNavigationEnabled ? 'translate-x-4' : 'translate-x-0'" />
          </button>
        </div>

        <!-- 样式选择 -->
        <div class="p-3 sm:p-4">
          <div class="flex items-center justify-between gap-3 mb-3">
            <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">选择呈现方式</span>
          </div>

          <div class="flex flex-col sm:flex-row items-stretch" :class="{ 'pointer-events-none opacity-50': !chatNavigationEnabled }">

            <!-- 摘要目录 -->
            <button
              type="button"
              :disabled="!chatNavigationEnabled"
              class="relative flex-1 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed"
              :class="currentNavigationStyle === 'directory'
                ? (isDark ? 'border-brand-400/50 bg-brand-400/6' : 'border-brand-300 bg-brand-50/50')
                : (isDark ? 'border-d4 bg-transparent hover:border-d4/80 hover:bg-white/2' : 'border-bdrF bg-transparent hover:border-bdrF/80 hover:bg-l4/40')"
              @click="ss.savePreference('chatNavigationStyle', 'directory')">
              <div class="flex items-center gap-2.5">
                <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  :class="currentNavigationStyle === 'directory'
                    ? (isDark ? 'bg-brand-400/15 text-brand-300' : 'bg-brand-100 text-brand-600')
                    : (isDark ? 'bg-d0 text-wt-aux' : 'bg-l2 text-lt-aux')">
                  <i class="ri-list-unordered text-[16px]" />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="text-[12.5px] font-bold" :class="currentNavigationStyle === 'directory' ? (isDark ? 'text-brand-300' : 'text-brand-700') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">摘要目录</span>
                    <span class="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wide uppercase" :class="isDark ? 'bg-brand-400/15 text-brand-300' : 'bg-brand-100 text-brand-600'">推荐</span>
                  </div>
                </div>
                <span v-if="currentNavigationStyle === 'directory'"
                  class="shrink-0 px-2 py-0.5 rounded-full text-[9.5px] font-bold"
                  :class="isDark ? 'bg-brand-400/15 text-brand-300' : 'bg-brand-100 text-brand-600'">当前启用</span>
              </div>
              <p class="mt-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">点击右上角按钮展开面板，按轮次列出提问与 AI 摘要，点击跳转。</p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <span v-for="trait in ['按需展开', '信息完整', '适合长对话']" :key="trait"
                  class="px-2 py-0.5 rounded-full text-[9.5px] font-medium"
                  :class="currentNavigationStyle === 'directory'
                    ? (isDark ? 'bg-brand-400/10 text-brand-300/90' : 'bg-brand-100/70 text-brand-700')
                    : (isDark ? 'bg-d0 text-wt-dim' : 'bg-l2 text-lt-aux')">{{ trait }}</span>
              </div>
            </button>

            <!-- 分割线：桌面端竖线 / 移动端横线 -->
            <div class="hidden sm:block w-px shrink-0 mx-3 self-stretch" :class="isDark ? 'bg-d4' : 'bg-bdrF'" />
            <div class="sm:hidden h-px w-full my-3 shrink-0" :class="isDark ? 'bg-d4' : 'bg-bdrF'" />

            <!-- 对话缩略图 -->
            <button
              type="button"
              :disabled="!chatNavigationEnabled"
              class="relative flex-1 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed"
              :class="currentNavigationStyle === 'minimap'
                ? (isDark ? 'border-brand-400/50 bg-brand-400/6' : 'border-brand-300 bg-brand-50/50')
                : (isDark ? 'border-d4 bg-transparent hover:border-d4/80 hover:bg-white/2' : 'border-bdrF bg-transparent hover:border-bdrF/80 hover:bg-l4/40')"
              @click="ss.savePreference('chatNavigationStyle', 'minimap')">
              <div class="flex items-center gap-2.5">
                <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  :class="currentNavigationStyle === 'minimap'
                    ? (isDark ? 'bg-brand-400/15 text-brand-300' : 'bg-brand-100 text-brand-600')
                    : (isDark ? 'bg-d0 text-wt-aux' : 'bg-l2 text-lt-aux')">
                  <i class="ri-code-view text-[16px]" />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="text-[12.5px] font-bold" :class="currentNavigationStyle === 'minimap' ? (isDark ? 'text-brand-300' : 'text-brand-700') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">对话缩略图</span>
                  </div>
                </div>
                <span v-if="currentNavigationStyle === 'minimap'"
                  class="shrink-0 px-2 py-0.5 rounded-full text-[9.5px] font-bold"
                  :class="isDark ? 'bg-brand-400/15 text-brand-300' : 'bg-brand-100 text-brand-600'">当前启用</span>
              </div>
              <p class="mt-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">右侧常驻一条竖向轨道，每轮显示为一条横线；悬停预览内容，点击跳转。</p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <span v-for="trait in ['始终可见', '一目了然', '适合频繁跳转']" :key="trait"
                  class="px-2 py-0.5 rounded-full text-[9.5px] font-medium"
                  :class="currentNavigationStyle === 'minimap'
                    ? (isDark ? 'bg-brand-400/10 text-brand-300/90' : 'bg-brand-100/70 text-brand-700')
                    : (isDark ? 'bg-d0 text-wt-dim' : 'bg-l2 text-lt-aux')">{{ trait }}</span>
              </div>
            </button>

          </div>

          <p v-if="!chatNavigationEnabled" class="mt-3 text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            重新开启后，将恢复为当前选中的 {{ currentNavigationStyle === 'directory' ? '摘要目录' : '对话缩略图' }}。
          </p>
        </div>
      </div>
    </section>
  </div>
</template>