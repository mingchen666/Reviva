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
  { key: 'tsundere', label: '傲娇陪练', desc: '嘴上嫌弃，实际认真帮你，带一点反差感', icon: 'ri-sparkling-2-line', color: '#F43F5E' },
  { key: 'exam_trainer', label: '应试教练', desc: '围绕考点、题型、步骤和得分点来讲', icon: 'ri-crosshair-2-line', color: '#0EA5E9' },
]
const styleLabels = Object.fromEntries(answerStyles.map(style => [style.key, style.label]))
const previewTexts = {
  default: { title: '唯物辩证法', body: '唯物辩证法是一种看待变化和联系的方法。它强调事物不是孤立静止的，而是在矛盾运动中不断发展。' },
  study_partner: { title: '我们一起拆一下', body: '你可以先把它理解成一种“看变化”的方法：事情不是一成不变的，矛盾会推动它往前走。我们先抓这个核心就够了。' },
  best_friend: { title: '这题别被名字吓到', body: '听着很哲学，其实没那么玄：世界在变化，变化有原因，原因常常藏在矛盾里。先记这个，后面就顺了。' },
  humorous: { title: '给它翻译成人话', body: '唯物辩证法有点像给世界装了个“变化雷达”：哪里有矛盾，哪里就有剧情；量攒够了，剧情就升级。' },
  gentle_tutor: { title: '慢慢来，先抓主线', body: '这个概念确实有点抽象。我们先不急着背定义，只看一句话：它研究事物如何在联系和矛盾中发展。' },
  strict_mentor: { title: '先把核心概念记准', body: '不要先背大段定义。先掌握三点：联系、矛盾、发展。能用自己的话解释这三点，再去做题。' },
  big_sister: { title: '抓住主干就不难', body: '唯物辩证法的重点不是堆术语，而是判断事物如何变化。你先抓“矛盾推动发展”这条主线，再补三大规律。' },
  tsundere: { title: '这个都能被名字吓住？', body: '好啦，帮你拆开：它就是研究事物怎么变化的。先记住“矛盾推动发展”，别一上来就硬背整段定义。' },
  exam_trainer: { title: '考试看这几个点', body: '答题优先写：联系观点、发展观点、矛盾观点。展开时重点落到“对立统一规律”，这是最常考的核心。' },
}
const currentStyleKey = computed(() => styleLabels[ss.answerStyle] ? ss.answerStyle : 'default')
const currentPreview = computed(() => previewTexts[currentStyleKey.value] || previewTexts.default)
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">
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
            <div class="flex items-start gap-2"><div class="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" :class="isDark?'bg-agent-400/20':'bg-agent-100'"><i class="ri-sparkling-2-line text-[10px]" :class="isDark?'text-agent-400':'text-agent-500'" /></div><div class="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed flex-1" :class="isDark?'bg-d3 text-wt-sub':'bg-l3 text-lt-sub'"><div class="font-semibold mb-1">{{ currentPreview.title }}</div><div class="text-[10px]">{{ currentPreview.body }}</div></div></div>
          </div>
          <div class="h-7 flex items-center justify-center px-3 shrink-0" :class="isDark?'bg-d3 border-t border-d4':'bg-l3 border-t border-bdrF'"><span class="text-[9px]" :class="isDark?'text-wt-dim':'text-lt-aux'">当前风格：{{ styleLabels[currentStyleKey] }}</span></div>
        </div>
      </div>
    </section>
  </div>
</template>
