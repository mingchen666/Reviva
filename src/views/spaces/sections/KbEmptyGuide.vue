<script setup>
defineProps({
  isDark: { type: Boolean, default: false },
  activeScope: { type: String, default: 'mine' },
})

const emit = defineEmits(['create'])

// 将能力点精简为适合行内展示的短文本
const capabilities = [
  { icon: 'ri-file-search-line', text: '原文语义追溯' },
  { icon: 'ri-cloud-line', text: '云端自动索引' },
  { icon: 'ri-coins-line', text: '10积分/次检索' },
]

const steps = [
  { no: '01', title: '创建知识库', desc: '按项目或主题隔离资料空间' },
  { no: '02', title: '导入文档', desc: '支持 PDF / MD / DOCX 等格式' },
  { no: '03', title: '检索问答', desc: '在对话中 @知识库 即可调用' },
]
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-6">
    <div class="mx-auto w-full max-w-[760px] space-y-4">

      <!-- Hero: 单栏聚焦 + 内联能力标签 -->
      <section
        class="rounded-xl border px-6 py-8 sm:px-8 sm:py-10"
        :class="isDark ? 'border-white/[0.08] bg-[#0C101B]' : 'border-slate-200 bg-white shadow-sm'">

        <div class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold mb-5"
          :class="isDark
            ? 'border-white/[0.08] bg-white/[0.04] text-slate-300'
            : 'border-slate-200 bg-slate-50 text-slate-600'">
          <i class="ri-cloud-line text-[12px]" />
          MindSpace 云端知识库
        </div>

        <h2 class="text-[24px] sm:text-[28px] font-bold leading-snug tracking-tight max-w-[600px]"
          :class="isDark ? 'text-white' : 'text-slate-950'">
          用云端知识库管理资料<br />让检索回答更贴近原文
        </h2>

        <p class="mt-3 text-[14px] leading-relaxed max-w-[560px]"
          :class="isDark ? 'text-slate-400' : 'text-slate-500'">
          上传课程资料、项目文档或产品手册后，系统自动完成解析、索引与托管。后续在对话中随时调用，获取有据可查的精准回答。
        </p>

        <!-- 操作区 + 内联能力标签 (合并为一行/两行流式布局) -->
        <div class="mt-7 flex flex-wrap items-center gap-x-3 gap-y-3">
          <button
            v-if="activeScope === 'mine'"
            class="h-9 px-4 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.98]"
            :class="isDark
              ? 'bg-white text-slate-950 hover:bg-slate-200'
              : 'bg-slate-950 text-white hover:bg-slate-800 shadow-sm'"
            @click="emit('create')">
            <i class="ri-add-line text-[15px]" />
            新建知识库
          </button>

          <!-- 分隔线 (当按钮存在时) -->
          <div v-if="activeScope === 'mine'" 
            class="w-px h-4 mx-1 hidden sm:block" 
            :class="isDark ? 'bg-white/10' : 'bg-slate-300'" />

          <!-- 能力标签组：不再是卡片，而是轻量级 Tag -->
          <div class="flex flex-wrap items-center gap-2">
            <span
              v-for="item in capabilities"
              :key="item.text"
              class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium whitespace-nowrap"
              :class="isDark
                ? 'border-white/[0.08] bg-white/[0.03] text-slate-300'
                : 'border-slate-200 bg-slate-50 text-slate-600'">
              <i :class="[item.icon, 'text-[13px]', isDark ? 'text-slate-400' : 'text-slate-500']" />
              {{ item.text }}
            </span>
          </div>
        </div>

        <!-- 补充说明 (可选，增强信息完整性) -->
        <p class="mt-4 text-[12px] flex items-center gap-1.5" :class="isDark ? 'text-slate-500' : 'text-slate-400'">
          <i class="ri-shield-check-line text-emerald-500 text-[13px]" />
          系统预置知识库可直接查看，无需消耗积分
        </p>
      </section>

      <!-- Steps: 横向流程条 -->
      <section
        class="rounded-xl border px-5 py-4"
        :class="isDark ? 'border-white/[0.08] bg-[#0C101B]' : 'border-slate-200 bg-white shadow-sm'">

        <div class="flex items-center justify-between mb-4">
          <h3 class="text-[14px] font-bold" :class="isDark ? 'text-white' : 'text-slate-900'">使用流程</h3>
          <span class="text-[12px]" :class="isDark ? 'text-slate-500' : 'text-slate-400'">
            {{ activeScope === 'system' ? '选择左侧系统知识库即可查看文档' : '三步即可上手' }}
          </span>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div
            v-for="(step, i) in steps"
            :key="i"
            class="relative rounded-lg border px-4 py-3 flex items-start gap-3"
            :class="isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-slate-100 bg-slate-50/50'">

            <span class="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold"
              :class="i === 0
                ? (isDark ? 'bg-brand-500/15 text-brand-300' : 'bg-blue-100 text-blue-600')
                : (isDark ? 'bg-white/[0.06] text-slate-500' : 'bg-slate-200 text-slate-400')">
              {{ step.no }}
            </span>

            <div class="min-w-0">
              <p class="text-[13px] font-semibold" :class="isDark ? 'text-white' : 'text-slate-900'">{{ step.title }}</p>
              <p class="mt-0.5 text-[11px] leading-snug" :class="isDark ? 'text-slate-500' : 'text-slate-400'">{{ step.desc }}</p>
            </div>

            <i
              v-if="i < steps.length - 1"
              class="ri-arrow-right-s-line absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 text-[16px] hidden md:block"
              :class="isDark ? 'text-slate-600' : 'text-slate-300'" />
          </div>
        </div>
      </section>

    </div>
  </div>
</template>

<style scoped>
@keyframes kb-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

section {
  animation: kb-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
}
section:nth-child(2) { animation-delay: 0.05s; }

@media (prefers-reduced-motion: reduce) {
  section { animation: none !important; }
}
</style>