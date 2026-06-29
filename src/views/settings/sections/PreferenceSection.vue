<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'

const appStore = useAppStore()
const ss = useSettingsStore()
const isDark = computed(() => appStore.isDark)
const showCustomColor = computed(() => ss.accentColor === 'custom')
const accentOptions = ss.ACCENT_PRESETS

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
const styleLabels = Object.fromEntries(answerStyles.map(s => [s.key, s.label]))
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
    <!-- ══ 外观 ══ -->
    <div>
      <div class="flex items-center gap-2 mb-4"><div class="w-1 h-4 rounded-full bg-agent-400" /><span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">外观</span></div>
      <!-- Theme mode 暂时隐藏-->
      <div v-if="false" class="rounded-xl p-4 mb-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <label class="section-title mb-3" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">主题模式</label>
        <div class="grid grid-cols-3 gap-2">
          <button @click="ss.savePreference('themeMode', 'dark')" class="rounded-lg p-3 text-center transition-all" :class="ss.themeMode==='dark'?(isDark?'bg-agent-400/10 border-2 border-agent-400/40':'bg-agent-50 border-2 border-agent-200'):(isDark?'border border-d4 hover:border-agent-400/20':'border border-bdrF hover:border-agent-200')">
            <i class="ri-moon-fill text-[18px] mb-1" :class="ss.themeMode==='dark'?(isDark?'text-agent-400':'text-agent-500'):(isDark?'text-wt-aux':'text-lt-aux')" /><div class="text-[11px] font-semibold" :class="ss.themeMode==='dark'?(isDark?'text-agent-400':'text-agent-500'):(isDark?'text-wt-sub':'text-lt-sub')">暗色</div>
          </button>
          <button @click="ss.savePreference('themeMode', 'light')" class="rounded-lg p-3 text-center transition-all" :class="ss.themeMode==='light'?(isDark?'bg-agent-400/10 border-2 border-agent-400/40':'bg-agent-50 border-2 border-agent-200'):(isDark?'border border-d4 hover:border-agent-400/20':'border border-bdrF hover:border-agent-200')">
            <i class="ri-sun-fill text-[18px] mb-1" :class="ss.themeMode==='light'?(isDark?'text-agent-400':'text-agent-500'):(isDark?'text-wt-aux':'text-lt-aux')" /><div class="text-[11px] font-semibold" :class="ss.themeMode==='light'?(isDark?'text-agent-400':'text-agent-500'):(isDark?'text-wt-sub':'text-lt-sub')">浅色</div>
          </button>
          <button @click="ss.savePreference('themeMode', 'system')" class="rounded-lg p-3 text-center transition-all" :class="ss.themeMode==='system'?(isDark?'bg-agent-400/10 border-2 border-agent-400/40':'bg-agent-50 border-2 border-agent-200'):(isDark?'border border-d4 hover:border-agent-400/20':'border border-bdrF hover:border-agent-200')">
            <i class="ri-computer-fill text-[18px] mb-1" :class="ss.themeMode==='system'?(isDark?'text-agent-400':'text-agent-500'):(isDark?'text-wt-aux':'text-lt-aux')" /><div class="text-[11px] font-semibold" :class="ss.themeMode==='system'?(isDark?'text-agent-400':'text-agent-500'):(isDark?'text-wt-sub':'text-lt-sub')">跟随系统</div>
          </button>
        </div>
      </div>
      <!-- Accent Color -->
      <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center justify-between mb-3"><label class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">主题颜色</label><span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">影响按钮、链接、标签、高亮等全局色彩</span></div>
        <div class="flex gap-2 items-center flex-wrap">
          <button v-for="c in accentOptions" :key="c.key" @click="ss.savePreference('accentColor', c.key)" class="group flex flex-col items-center gap-1 py-1.5 px-1.5 rounded-lg transition-all" :class="ss.accentColor===c.key&&!showCustomColor?(isDark?'bg-white/6':'bg-white shadow-sm'):(isDark?'hover:bg-white/4':'hover:bg-l4')">
            <span class="w-6 h-6 rounded-full transition-all" :class="ss.accentColor===c.key&&!showCustomColor?'ring-2 ring-offset-1 scale-110':''" :style="'background:'+c.hex+';'+(ss.accentColor===c.key&&!showCustomColor?(isDark?'--tw-ring-color:rgba(255,255,255,0.4);--tw-ring-offset-color:#252530':'--tw-ring-color:rgba(0,0,0,0.15);--tw-ring-offset-color:#f5f4f3'):'')" />
            <span class="text-[10px] font-medium transition-colors" :class="ss.accentColor===c.key&&!showCustomColor?(isDark?'text-wt-main':'text-lt-main'):(isDark?'text-wt-dim':'text-lt-aux')">{{ c.label }}</span>
          </button>
          <button @click="ss.savePreference('accentColor', 'custom')" class="group flex flex-col items-center gap-1 py-1.5 px-2 rounded-lg transition-all" :class="showCustomColor?(isDark?'bg-white/6':'bg-white shadow-sm'):(isDark?'hover:bg-white/4':'hover:bg-l4')">
            <span class="w-6 h-6 rounded-full transition-all relative" :class="showCustomColor?'ring-2 ring-offset-1 scale-110':''" :style="'background:'+ss.customAccentHex+';'+(showCustomColor?(isDark?'--tw-ring-color:rgba(255,255,255,0.4);--tw-ring-offset-color:#252530':'--tw-ring-color:rgba(0,0,0,0.15);--tw-ring-offset-color:#f5f4f3'):'')">
              <i v-if="!showCustomColor" class="ri-add-line text-[10px] text-white/80 absolute inset-0 flex items-center justify-center" />
            </span>
            <span class="text-[10px] font-medium" :class="showCustomColor?(isDark?'text-wt-main':'text-lt-main'):(isDark?'text-wt-dim':'text-lt-aux')">自定义</span>
          </button>
        </div>
        <div v-if="showCustomColor" class="mt-3 pt-3 flex items-center gap-3" :class="isDark?'border-t border-d4':'border-t border-bdrF'">
          <label class="text-[11px] font-medium shrink-0" :class="isDark?'text-wt-sub':'text-lt-sub'">自定义色值</label>
          <input type="color" :value="ss.customAccentHex" @input="ss.savePreference('customAccentHex', $event.target.value)" class="w-8 h-8 rounded-md cursor-pointer border-0 p-0" :class="isDark?'bg-d0':'bg-l2'" />
          <input type="text" :value="ss.customAccentHex" @change="ss.savePreference('customAccentHex', $event.target.value)" placeholder="#FF6B6B" class="w-24 h-8 px-2 rounded-md text-[11px] font-mono outline-none" :class="isDark?'bg-d0 border border-d4 text-wt-sub focus:border-agent-400/40':'bg-l2 border border-bdrF text-lt-sub focus:border-agent-400'" />
          <span class="w-5 h-5 rounded-full shrink-0" :style="'background:'+ss.customAccentHex" />
        </div>
      </div>
    </div>

    <!-- ══ 显示 暂时隐藏 ══ -->
    <div v-if="false">
      <div class="flex items-center gap-2 mb-4"><div class="w-1 h-4 rounded-full bg-brand-400" /><span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">显示</span></div>
      <div class="grid grid-cols-2 gap-4">
        <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-2.5"><i class="ri-text text-[13px] text-brand-400" /><label class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">字体大小</label></div>
          <div class="grid grid-cols-3 gap-1.5">
            <button v-for="f in [{key:'small',label:'小'},{key:'medium',label:'中'},{key:'large',label:'大'}]" :key="f.key" @click="ss.savePreference('fontSize', f.key)" class="h-8 rounded-md text-[11px] font-medium transition-all" :class="ss.fontSize===f.key?(isDark?'bg-brand-400/10 text-brand-400 border border-brand-400/30':'bg-brand-50 text-brand-500 border border-brand-200'):(isDark?'border border-d4 text-wt-aux hover:border-brand-400/20':'border border-bdrF text-lt-aux hover:border-brand-200')">{{ f.label }}</button>
          </div>
          <div class="text-[10px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">中为推荐默认值</div>
        </div>
        <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-2.5"><i class="ri-translate-2 text-[13px] text-brand-400" /><label class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">界面语言</label></div>
          <div class="grid grid-cols-2 gap-1.5">
            <button @click="ss.savePreference('langPref', 'zh')" class="h-8 rounded-md text-[11px] font-medium transition-all flex items-center justify-center gap-1.5" :class="ss.langPref==='zh'?(isDark?'bg-brand-400/10 text-brand-400 border border-brand-400/30':'bg-brand-50 text-brand-500 border border-brand-200'):(isDark?'border border-d4 text-wt-aux hover:border-brand-400/20':'border border-bdrF text-lt-aux hover:border-brand-200')"><span>中文</span></button>
            <button @click="ss.savePreference('langPref', 'en')" class="h-8 rounded-md text-[11px] font-medium transition-all flex items-center justify-center gap-1.5" :class="ss.langPref==='en'?(isDark?'bg-brand-400/10 text-brand-400 border border-brand-400/30':'bg-brand-50 text-brand-500 border border-brand-200'):(isDark?'border border-d4 text-wt-aux hover:border-brand-400/20':'border border-bdrF text-lt-aux hover:border-brand-200')"><span>English</span></button>
          </div>
          <div class="text-[10px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">切换后需重启应用生效</div>
        </div>
      </div>
      <div class="rounded-xl p-4 mt-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="space-y-1">
          <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark?'hover:bg-white/2':'hover:bg-l4/50'"><i class="ri-sparkling-line text-[13px] text-brand-400" /><div class="flex-1 min-w-0"><span class="text-[12px] font-medium" :class="isDark?'text-wt-sub':'text-lt-sub'">界面动画</span><span class="text-[10px] ml-2" :class="isDark?'text-wt-dim':'text-lt-aux'">面板过渡、消息进入等动效</span></div><div @click="ss.savePreference('animations', !ss.animations)" class="toggle" :class="ss.animations?'on':(isDark?'off':'light-off')" /></div>
          <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark?'hover:bg-white/2':'hover:bg-l4/50'"><i class="ri-eye-line text-[13px] text-amber-400" /><div class="flex-1 min-w-0"><span class="text-[12px] font-medium" :class="isDark?'text-wt-sub':'text-lt-sub'">减少运动</span><span class="text-[10px] ml-2" :class="isDark?'text-wt-dim':'text-lt-aux'">禁用所有滚动与缩放动效（无障碍）</span></div><div @click="ss.savePreference('reducedMotion', !ss.reducedMotion)" class="toggle" :class="ss.reducedMotion?'on':(isDark?'off':'light-off')" /></div>
        </div>
      </div>
    </div>

    <!-- ══ AI 回答风格 ══ -->
    <div>
      <div class="flex items-center gap-2 mb-4"><div class="w-1 h-4 rounded-full bg-rose-400" /><span class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">AI 回答风格</span><span class="text-[10px] ml-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">学习台与 Agent 的教学语气和陪伴人格</span></div>
      <div class="grid grid-cols-2 gap-4">
        <!-- Style selector -->
        <div class="rounded-xl p-3 overflow-y-auto thin-scroll" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-1.5 mb-2"><i class="ri-equalizer-line text-[12px] text-rose-400" /><span class="text-[10px] font-semibold" :class="isDark?'text-wt-sub':'text-lt-sub'">选择风格</span></div>
          <div class="space-y-0.5">
            <button v-for="s in answerStyles" :key="s.key" @click="ss.savePreference('answerStyle', s.key)" class="w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg text-left transition-all" :class="ss.answerStyle===s.key?(isDark?'bg-agent-400/8 border border-agent-400/20':'bg-agent-50 border border-agent-100'):(isDark?'border border-transparent hover:border-d4 hover:bg-white/2':'border border-transparent hover:border-bdrF hover:bg-l4/50')">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="ss.answerStyle===s.key?(isDark?'bg-white/6':'bg-white'):(isDark?'bg-d0':'bg-l2')"><i :class="`${s.icon} text-[14px]`" :style="'color:'+s.color" /></div>
              <div class="flex-1 min-w-0"><div class="text-[12px] font-semibold" :class="ss.answerStyle===s.key?(isDark?'text-agent-400':'text-agent-500'):(isDark?'text-wt-sub':'text-lt-sub')">{{ s.label }}</div><div class="text-[10px] leading-snug" :class="isDark?'text-wt-dim':'text-lt-aux'">{{ s.desc }}</div></div>
              <div v-if="ss.answerStyle===s.key" class="shrink-0"><div class="w-2 h-2 rounded-full bg-agent-400" /></div>
            </button>
          </div>
        </div>
        <!-- Preview -->
        <div class="rounded-xl overflow-hidden flex flex-col" :class="isDark ? 'border border-d4' : 'border border-bdrF'">
          <div class="h-9 flex items-center gap-2 px-3 shrink-0" :class="isDark ? 'bg-d3 border-b border-d4' : 'bg-l3 border-b border-bdrF'"><div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">学习台 · 预览</span><span class="text-[10px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">唯物辩证法知识库</span></div>
          <div class="p-3 space-y-2 flex-1 overflow-y-auto thin-scroll" :class="isDark ? 'bg-d0' : 'bg-l2'">
            <div class="flex items-start gap-2"><div class="w-5 h-5 rounded-full bg-brand-400/20 flex items-center justify-center shrink-0"><i class="ri-user-line text-[10px] text-brand-400" /></div><div class="rounded-lg px-2.5 py-1.5 text-[11px]" :class="isDark?'bg-brand-400/8 text-brand-200':'bg-brand-50 text-brand-600'">什么是唯物辩证法？</div></div>
            <div class="flex items-start gap-2"><div class="w-5 h-5 rounded-full shrink-0" :class="isDark?'bg-agent-400/20':'bg-agent-100'"><i class="ri-sparkling-2-line text-[10px]" :class="isDark?'text-agent-400':'text-agent-500'" /></div><div class="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed flex-1" :class="isDark?'bg-d3 text-wt-sub':'bg-l3 text-lt-sub'"><div class="font-semibold mb-1">{{ currentPreview.title }}</div><div class="text-[10px]">{{ currentPreview.body }}</div></div></div>
          </div>
          <div class="h-7 flex items-center justify-center px-3 shrink-0" :class="isDark?'bg-d3 border-t border-d4':'bg-l3 border-t border-bdrF'"><span class="text-[9px]" :class="isDark?'text-wt-dim':'text-lt-aux'">当前风格：{{ styleLabels[currentStyleKey] }}</span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em }
.toggle { width: 32px; height: 18px; border-radius: 9px; position: relative; cursor: pointer; transition: background .2s; flex-shrink: 0 }
.toggle::after { content: ''; position: absolute; width: 14px; height: 14px; border-radius: 50%; top: 2px; left: 2px; transition: transform .2s; background: #fff }
.toggle.on { background: var(--brand) }
.toggle.on::after { transform: translateX(14px) }
.toggle.off { background: #555568 }
.toggle.light-off { background: #b0b0ba }
</style>
