<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const leftOpen = ref(true)
const leftW = ref(260)
const rightOpen = ref(true)
const rightW = ref(280)
const leftTab = ref('chats')
const centerTab = ref('chat')
const activeChatId = ref(3)
const showCtx = ref(false)
const renamingId = ref(null)
const renameVal = ref('')
const inputText = ref('')

const kbInfo = ref({ name: '高等数学', icon: 'ri-calculator-line', color: '#6C8AFF', docs: 24 })

const checkedDocs = ref([])
const docList = ref([
  { id: 'd1', name: '第一章 函数与极限.pdf', type: 'pdf', size: '2.3 MB' },
  { id: 'd2', name: '微分方程笔记.md', type: 'md', size: '45 KB' },
  { id: 'd3', name: '期末复习大纲.docx', type: 'docx', size: '120 KB' },
  { id: 'd4', name: '错题集.txt', type: 'txt', size: '8 KB' },
  { id: 'd5', name: '第二章 导数与应用.pdf', type: 'pdf', size: '3.1 MB' },
])

const chatList = ref([
  { id: 1, name: '函数极限核心概念', time: '10分钟前', preview: '请帮我总结第一章函数与极限的核心概念...' },
  { id: 2, name: '积分错题分析', time: '1小时前', preview: '分析这道极限题的错误原因...' },
  { id: 3, name: '微分方程总结', time: '昨天', preview: '帮我整理微分方程的求解步骤...' },
  { id: 4, name: '阅读理解技巧', time: '昨天', preview: '阅读理解有哪些解题策略...' },
  { id: 5, name: '复习计划制定', time: '3天前', preview: '帮我制定期末复习计划...' },
])

const noteList = ref([
  { id: 1, title: '极限定义笔记', time: '10分钟前', preview: '数列极限与函数极限的定义...' },
  { id: 2, title: '微分方程求解步骤', time: '1小时前', preview: '一阶线性、二阶常系数...' },
  { id: 3, title: '间断点分类总结', time: '昨天', preview: '第一类与第二类间断点...' },
])

const debateList = ref([
  { id: 1, topic: '极限是否一定存在', r1: '理性派', r2: '怀疑派', rounds: 3, time: '昨天' },
  { id: 2, topic: '连续性 vs 可导性', r1: '求导派', r2: '连续派', rounds: 5, time: '2天前' },
])

const studioTools = [
  {
    name: '摘要',
    icon: 'ri-file-text-line',
    bg: 'bg-brand-400/8',
    color: 'text-brand-400',
    border: 'border-brand-400/20',
  },
  {
    name: '大纲',
    icon: 'ri-list-unordered',
    bg: 'bg-brand-400/8',
    color: 'text-brand-400',
    border: 'border-brand-400/20',
  },
  {
    name: '闪卡',
    icon: 'ri-stack-line',
    bg: 'bg-emerald-400/8',
    color: 'text-emerald-400',
    border: 'border-emerald-400/20',
  },
  {
    name: '测验',
    icon: 'ri-questionnaire-line',
    bg: 'bg-amber-400/8',
    color: 'text-amber-400',
    border: 'border-amber-400/20',
  },
  { name: '脑图', icon: 'ri-mind-map', bg: 'bg-agent-400/8', color: 'text-agent-400', border: 'border-agent-400/20' },
  {
    name: '速记',
    icon: 'ri-flashlight-line',
    bg: 'bg-amber-400/8',
    color: 'text-amber-400',
    border: 'border-amber-400/20',
  },
  { name: '辩论', icon: 'ri-group-line', bg: 'bg-agent-400/8', color: 'text-agent-400', border: 'border-agent-400/20' },
  {
    name: '播客',
    icon: 'ri-broadcast-line',
    bg: 'bg-brand-400/8',
    color: 'text-brand-400',
    border: 'border-brand-400/20',
  },
]

const artifactList = ref([
  {
    id: 1,
    title: '函数极限摘要',
    type: '摘要',
    icon: 'ri-file-text-line',
    bg: 'bg-brand-400/8',
    color: 'text-brand-400',
    time: '10分钟前',
  },
  {
    id: 2,
    title: '微分方程思维导图',
    type: '脑图',
    icon: 'ri-mind-map',
    bg: 'bg-agent-400/8',
    color: 'text-agent-400',
    time: '1小时前',
  },
  {
    id: 3,
    title: '闪卡集：极限定义',
    type: '闪卡',
    icon: 'ri-stack-line',
    bg: 'bg-emerald-400/8',
    color: 'text-emerald-400',
    time: '昨天',
  },
])

const ctxItems = ref([
  { type: 'kb', icon: 'ri-database-2-line', color: 'brand', name: '高等数学' },
  { type: 'file', icon: 'ri-file-pdf-2-line', color: 'emerald', name: '第一章 函数与极限.pdf' },
])

const artifactMenuOpen = ref(null)

function fileIcon(type) {
  return type === 'pdf'
    ? 'ri-file-pdf-2-line'
    : type === 'md'
      ? 'ri-markdown-line'
      : type === 'docx'
        ? 'ri-file-word-2-line'
        : 'ri-file-text-line'
}
function fileIconColor(type) {
  return type === 'pdf'
    ? 'text-red-400'
    : type === 'md'
      ? 'text-emerald-400'
      : type === 'docx'
        ? 'text-amber-400'
        : 'text-brand-400'
}
function toggleCheck(doc) {
  const i = checkedDocs.value.findIndex((d) => d.id === doc.id)
  if (i >= 0) checkedDocs.value.splice(i, 1)
  else checkedDocs.value.push(doc)
}
function isDocChecked(doc) {
  return checkedDocs.value.some((d) => d.id === doc.id)
}
function startRename(c) {
  renamingId.value = c.id
  renameVal.value = c.name
}
function finishRename(c) {
  if (renameVal.value.trim()) c.name = renameVal.value.trim()
  renamingId.value = null
}
function deleteChat(id) {
  chatList.value = chatList.value.filter((c) => c.id !== id)
  if (activeChatId.value === id && chatList.value.length > 0) activeChatId.value = chatList.value[0].id
}
function removeCtx(idx) {
  ctxItems.value.splice(idx, 1)
}
</script>

<template>
  <div class="flex h-full">
    <!-- ═══ LEFT PANEL ═══ -->
    <div
      class="shrink-0 overflow-hidden transition-all duration-200"
      :class="isDark ? 'bg-d1' : 'bg-l1'"
      :style="{
        width: leftOpen ? leftW + 'px' : '0px',
        borderRight: leftOpen ? `1px solid ${isDark ? '#2e2e3a' : '#dddcd9'}` : 'none',
      }">
      <div class="h-full flex flex-col" style="min-width: 180px">
        <!-- KB Header -->
        <div
          class="px-3 py-2.5 flex items-center gap-2"
          :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <button
            class="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
            :class="
              isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/6' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            title="返回知识库列表">
            <i class="ri-arrow-left-s-line text-[15px]" />
          </button>
          <div
            class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-d0 border border-bdr' : 'bg-l2 border border-bdrF'">
            <i :class="kbInfo.icon + ' text-[13px]'" :style="'color:' + kbInfo.color" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              {{ kbInfo.name }}
            </div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ kbInfo.docs }} 文档</div>
          </div>
        </div>

        <!-- Inner Tabs -->
        <div class="flex" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <button
            @click="leftTab = 'docs'"
            class="flex-1 py-2 text-[12px] font-medium text-center transition-colors relative"
            :class="
              leftTab === 'docs'
                ? isDark
                  ? 'text-wt-main'
                  : 'text-lt-main'
                : isDark
                  ? 'text-wt-aux hover:text-wt-sub'
                  : 'text-lt-aux hover:text-lt-sub'
            ">
            <i class="ri-file-text-line text-[12px] mr-1" />
            文档
            <span
              v-show="leftTab === 'docs'"
              class="absolute bottom-0 left-[20%] right-[20%] h-[2px] rounded-t-md bg-brand-400" />
          </button>
          <button
            @click="leftTab = 'chats'"
            class="flex-1 py-2 text-[12px] font-medium text-center transition-colors relative"
            :class="
              leftTab === 'chats'
                ? isDark
                  ? 'text-wt-main'
                  : 'text-lt-main'
                : isDark
                  ? 'text-wt-aux hover:text-wt-sub'
                  : 'text-lt-aux hover:text-lt-sub'
            ">
            <i class="ri-chat-3-line text-[12px] mr-1" />
            对话
            <span
              v-show="leftTab === 'chats'"
              class="absolute bottom-0 left-[20%] right-[20%] h-[2px] rounded-t-md bg-brand-400" />
          </button>
        </div>

        <!-- Docs Tab -->
        <div v-show="leftTab === 'docs'" class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          <div v-show="checkedDocs.length > 0" class="px-2 pb-1.5 flex items-center justify-between">
            <span
              class="ctx-pill"
              :class="
                isDark
                  ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20'
                  : 'bg-brand-50 text-brand-500 border border-brand-100'
              ">
              已选 {{ checkedDocs.length }} 个
            </span>
            <button
              @click="checkedDocs = []"
              class="text-[11px]"
              :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
              清空
            </button>
          </div>
          <div
            v-for="doc in docList"
            :key="doc.id"
            class="flex items-center gap-2 py-[6px] px-2.5 rounded-lg cursor-pointer transition-colors"
            :class="
              isDocChecked(doc)
                ? isDark
                  ? 'bg-brand-400/6'
                  : 'bg-brand-50'
                : isDark
                  ? 'hover:bg-white/4'
                  : 'hover:bg-l4'
            "
            @click="toggleCheck(doc)">
            <div
              class="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors"
              :class="isDocChecked(doc) ? 'bg-brand-400 border-brand-400' : isDark ? 'border-wt-dim' : 'border-lt-aux'">
              <i v-if="isDocChecked(doc)" class="ri-check-line text-[10px] text-white" />
            </div>
            <i :class="[fileIcon(doc.type), fileIconColor(doc.type), 'text-[14px] shrink-0']" />
            <div class="flex-1 min-w-0">
              <span
                class="text-[12px] truncate block"
                :class="
                  isDocChecked(doc)
                    ? isDark
                      ? 'text-brand-400'
                      : 'text-brand-500'
                    : isDark
                      ? 'text-wt-sub'
                      : 'text-lt-sub'
                ">
                {{ doc.name }}
              </span>
            </div>
            <span class="text-[10px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ doc.size }}</span>
          </div>
        </div>

        <!-- Chats Tab -->
        <div v-show="leftTab === 'chats'" class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          <div
            v-for="chat in chatList"
            :key="chat.id"
            @click="activeChatId = chat.id"
            class="group py-2 px-2.5 rounded-lg cursor-pointer transition-colors"
            :class="
              activeChatId === chat.id
                ? isDark
                  ? 'bg-brand-400/8'
                  : 'bg-brand-50'
                : isDark
                  ? 'hover:bg-white/4'
                  : 'hover:bg-l4'
            ">
            <div class="flex items-start gap-2">
              <i
                class="ri-chat-3-line text-[13px] mt-0.5 shrink-0"
                :class="
                  activeChatId === chat.id
                    ? isDark
                      ? 'text-brand-400'
                      : 'text-brand-500'
                    : isDark
                      ? 'text-wt-dim'
                      : 'text-lt-aux'
                " />
              <div class="flex-1 min-w-0">
                <template v-if="renamingId !== chat.id">
                  <span
                    class="text-[12px] font-medium truncate block"
                    :class="
                      activeChatId === chat.id
                        ? isDark
                          ? 'text-brand-400'
                          : 'text-brand-500'
                        : isDark
                          ? 'text-wt-sub'
                          : 'text-lt-sub'
                    ">
                    {{ chat.name }}
                  </span>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ chat.time }}</span>
                    <span class="text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                      {{ chat.preview }}
                    </span>
                  </div>
                </template>
                <template v-else>
                  <input
                    v-model="renameVal"
                    @keydown.enter="finishRename(chat)"
                    @keydown.escape="renamingId = null"
                    @click.stop
                    @blur="finishRename(chat)"
                    class="h-6 w-full px-1 rounded text-[12px] outline-none"
                    :class="
                      isDark
                        ? 'bg-d0 border border-brand-400/40 text-wt-sub'
                        : 'bg-l2 border border-brand-200 text-lt-sub'
                    " />
                </template>
              </div>
              <div
                class="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 mt-0.5 transition-opacity">
                <button
                  @click.stop="startRename(chat)"
                  class="p-1 rounded transition-colors"
                  :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"
                  title="重命名">
                  <i class="ri-pencil-line text-[11px]" />
                </button>
                <button
                  @click.stop="deleteChat(chat.id)"
                  class="p-1 rounded transition-colors"
                  :class="isDark ? 'text-wt-dim hover:text-red-400' : 'text-lt-aux hover:text-red-500'"
                  title="删除">
                  <i class="ri-delete-bin-6-line text-[11px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Left Toggle -->
    <div
      class="shrink-0 flex items-center justify-center cursor-pointer z-30 transition-colors"
      style="width: 24px"
      :class="isDark ? 'bg-d2' : 'bg-l2'"
      @click="leftOpen = !leftOpen">
      <div
        class="w-6 h-12 rounded-lg flex items-center justify-center transition-all"
        :class="
          isDark
            ? 'bg-d3 text-wt-aux hover:bg-brand-400/8 hover:text-wt-sub'
            : 'bg-l3 text-lt-aux hover:bg-brand-50 hover:text-lt-sub'
        ">
        <i :class="leftOpen ? 'ri-arrow-left-s-line' : 'ri-arrow-right-s-line'" class="text-[14px]" />
      </div>
    </div>

    <!-- ═══ MAIN WORKSPACE ═══ -->
    <main class="flex-1 flex flex-col min-w-0" :class="isDark ? 'bg-d2' : 'bg-l2'">
      <!-- Header Tabs -->
      <div
        class="h-10 flex items-center px-4 gap-1 shrink-0"
        :class="isDark ? 'border-b border-d4 bg-d2' : 'border-b border-bdrL bg-l2'">
        <button
          @click="centerTab = 'chat'"
          class="px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
          :class="
            centerTab === 'chat'
              ? isDark
                ? 'text-wt-main bg-white/6'
                : 'text-lt-main bg-l3'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub'
                : 'text-lt-aux hover:text-lt-sub'
          ">
          <i class="ri-chat-3-line text-[12px] mr-1" />
          消息对话
        </button>
        <button
          @click="centerTab = 'notes'"
          class="px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
          :class="
            centerTab === 'notes'
              ? isDark
                ? 'text-wt-main bg-white/6'
                : 'text-lt-main bg-l3'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub'
                : 'text-lt-aux hover:text-lt-sub'
          ">
          <i class="ri-booklet-line text-[12px] mr-1" />
          笔记列表
        </button>
        <button
          @click="centerTab = 'debate'"
          class="px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
          :class="
            centerTab === 'debate'
              ? isDark
                ? 'text-wt-main bg-white/6'
                : 'text-lt-main bg-l3'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub'
                : 'text-lt-aux hover:text-lt-sub'
          ">
          <i class="ri-group-line text-[12px] mr-1" />
          虚拟辩论场
        </button>
      </div>

      <!-- ═══ Chat Tab ═══ -->
      <div v-show="centerTab === 'chat'" class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <!-- User message -->
          <div class="flex justify-end">
            <div class="max-w-[68%]">
              <div
                class="px-4 py-3 rounded-2xl rounded-tr-md text-[13px] leading-relaxed text-white"
                style="background: linear-gradient(135deg, #6c8aff, #4a6cff)">
                帮我整理微分方程的求解步骤，包括一阶和二阶的常见类型
              </div>
            </div>
          </div>

          <!-- AI response -->
          <div class="flex gap-3 max-w-[82%]">
            <div
              class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
              :class="isDark ? 'bg-brand-400/12 border border-brand-400/20' : 'bg-brand-50 border border-brand-100'">
              <i class="ri-robot-2-line text-brand-400 text-[13px]" />
            </div>
            <div class="flex-1 min-w-0">
              <div
                class="px-4 py-3 rounded-xl text-[13px] leading-relaxed"
                :class="isDark ? 'bg-d3 border border-bdr text-wt-main' : 'bg-l3 border border-bdrF text-lt-main'">
                <p class="mb-3"><strong class="text-brand-400">一阶微分方程</strong></p>
                <p class="mb-2">
                  1.
                  <span class="highlight-tag">可分离变量</span>
                  ：dy/dx = f(x)g(y)
                </p>
                <p class="mb-2">
                  2.
                  <span class="highlight-tag">一阶线性</span>
                  ：dy/dx + P(x)y = Q(x)
                </p>
                <p class="mb-3">
                  3.
                  <span class="highlight-tag">齐次方程</span>
                  ：dy/dx = f(y/x)
                </p>
                <p class="mb-3"><strong class="text-brand-400">二阶常系数方程</strong></p>
                <p>
                  标准形：y'' + py' + qy = 0
                  <br />
                  三种情况：不等实根、相等实根、复根
                  <br />
                  <span class="text-brand-400 cursor-pointer hover:underline text-[12px]">[高等数学 p.45]</span>
                </p>
              </div>
              <div class="flex gap-1 mt-2.5 flex-wrap">
                <button
                  class="ctx-pill cursor-pointer"
                  :class="
                    isDark
                      ? 'text-wt-aux bg-d3 border border-bdr hover:text-brand-400 hover:border-brand-400/30'
                      : 'text-lt-aux bg-l3 border border-bdrF hover:text-brand-500 hover:border-brand-200'
                  ">
                  <i class="ri-file-text-line text-[10px]" />
                  摘要
                </button>
                <button
                  class="ctx-pill cursor-pointer"
                  :class="
                    isDark
                      ? 'text-wt-aux bg-d3 border border-bdr hover:text-brand-400 hover:border-brand-400/30'
                      : 'text-lt-aux bg-l3 border border-bdrF hover:text-brand-500 hover:border-brand-200'
                  ">
                  <i class="ri-list-unordered text-[10px]" />
                  大纲
                </button>
                <button
                  class="ctx-pill cursor-pointer"
                  :class="
                    isDark
                      ? 'text-wt-aux bg-d3 border border-bdr hover:text-brand-400 hover:border-brand-400/30'
                      : 'text-lt-aux bg-l3 border border-bdrF hover:text-brand-500 hover:border-brand-200'
                  ">
                  <i class="ri-stack-line text-[10px]" />
                  闪卡
                </button>
                <button
                  class="ctx-pill cursor-pointer"
                  :class="
                    isDark
                      ? 'text-wt-aux bg-d3 border border-bdr hover:text-brand-400 hover:border-brand-400/30'
                      : 'text-lt-aux bg-l3 border border-bdrF hover:text-brand-500 hover:border-brand-200'
                  ">
                  <i class="ri-mind-map text-[10px]" />
                  脑图
                </button>
                <button
                  class="ctx-pill cursor-pointer"
                  :class="
                    isDark
                      ? 'text-wt-aux bg-d3 border border-bdr hover:text-brand-400 hover:border-brand-400/30'
                      : 'text-lt-aux bg-l3 border border-bdrF hover:text-brand-500 hover:border-brand-200'
                  ">
                  <i class="ri-flashlight-line text-[10px]" />
                  速记
                </button>
              </div>
            </div>
          </div>

          <!-- User message 2 (agent call) -->
          <div class="flex justify-end">
            <div class="max-w-[68%]">
              <div
                class="px-4 py-3 rounded-2xl rounded-tr-md text-[13px] leading-relaxed text-white"
                style="background: linear-gradient(135deg, #6c8aff, #4a6cff)">
                @错题分析助手 lim(x→0) sin(1/x) = 0 对吗？
              </div>
            </div>
          </div>

          <!-- Agent response -->
          <div class="flex gap-3 max-w-[82%]">
            <div
              class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 border-[1.5px]"
              :class="isDark ? 'bg-agent-400/12 border-agent-400/30' : 'bg-agent-50 border-agent-100'">
              <i class="ri-sparkling-2-line text-agent-400 text-[13px]" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1.5">
                <span
                  class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  :class="isDark ? 'bg-agent-400/8 text-agent-400' : 'bg-agent-50 text-agent-500'">
                  错题分析助手
                </span>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded"
                  :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">
                  ReAct
                </span>
              </div>
              <div
                class="px-4 py-3 rounded-xl text-[13px] leading-relaxed"
                :class="
                  isDark
                    ? 'bg-d3 border border-bdr border-l-2 border-l-agent-400 text-wt-main'
                    : 'bg-l3 border border-bdrF border-l-2 border-l-agent-400 text-lt-main'
                ">
                <p class="mb-1">
                  &#10060;
                  <span class="text-red-400 font-medium">错误：</span>
                  lim(x→0) sin(1/x) = 0
                </p>
                <p class="mb-2">
                  &#9989;
                  <span class="text-emerald-400 font-medium">正确：</span>
                  极限不存在
                </p>
                <p>
                  <strong :class="isDark ? 'text-agent-400' : 'text-agent-500'">建议</strong>
                  ：复习振荡间断点概念
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Input area -->
        <div class="px-4 pb-3 pt-1 relative">
          <!-- Context picker popup -->
          <div
            v-if="showCtx"
            class="absolute bottom-full mb-2 left-4 w-[340px] rounded-xl overflow-hidden z-50"
            :class="
              isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/40' : 'bg-l2 border border-bdrL shadow-xl'
            ">
            <div class="p-2.5" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
              <input
                type="text"
                placeholder="搜索知识库、文件..."
                class="w-full h-8 rounded-lg px-3 text-[12px] outline-none"
                :class="
                  isDark
                    ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40'
                    : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'
                " />
            </div>
            <div class="max-h-44 overflow-y-auto p-2 space-y-0.5">
              <div
                class="text-[10px] font-bold uppercase tracking-wider px-2 py-1"
                :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                云端知识库
              </div>
              <div
                class="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-[12px]"
                :class="isDark ? 'hover:bg-brand-400/6 text-wt-sub' : 'hover:bg-brand-50 text-lt-sub'">
                <i class="ri-database-2-line text-blue-400 text-[13px]" />
                高等数学
              </div>
            </div>
          </div>

          <div
            class="rounded-xl p-3"
            :class="
              isDark
                ? 'bg-d3 border border-bdr focus-within:border-brand-400/30'
                : 'bg-l3 border border-bdrF focus-within:border-brand-400'
            ">
            <!-- Context pills -->
            <div v-if="ctxItems.length > 0" class="flex flex-wrap gap-1.5 mb-2">
              <button
                v-for="(item, idx) in ctxItems"
                :key="item.name"
                class="ctx-pill cursor-pointer"
                :class="
                  item.type === 'kb'
                    ? isDark
                      ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20'
                      : 'bg-brand-50 text-brand-500 border border-brand-100'
                    : isDark
                      ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20'
                      : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                ">
                <i :class="[item.icon, 'text-[11px]']" />
                <span class="truncate max-w-[100px]">{{ item.name }}</span>
                <i class="ri-close-line ml-0.5 text-[10px] opacity-40 hover:opacity-100" @click="removeCtx(idx)" />
              </button>
            </div>
            <textarea
              v-model="inputText"
              class="w-full bg-transparent outline-none resize-none text-[13px] leading-relaxed"
              :class="isDark ? 'text-wt-main placeholder-wt-dim' : 'text-lt-main placeholder-lt-aux'"
              rows="2"
              placeholder="输入问题，/ 唤起技能，@ 调用 Agent..." />
            <div class="flex justify-between items-end mt-1.5">
              <div class="flex gap-0.5 items-center">
                <button
                  @click="showCtx = !showCtx"
                  class="ctx-pill cursor-pointer"
                  :class="
                    showCtx
                      ? isDark
                        ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20'
                        : 'bg-brand-50 text-brand-500 border border-brand-100'
                      : isDark
                        ? 'text-wt-aux border border-bdr hover:text-wt-sub'
                        : 'text-lt-aux border border-bdrF hover:text-lt-sub'
                  ">
                  <i class="ri-add-line text-[10px]" />
                  资料上下文
                </button>
                <div class="w-px h-3 mx-1" :class="isDark ? 'bg-bdr' : 'bg-bdrF'" />
                <button
                  class="p-1.5 rounded-md"
                  :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
                  <i class="ri-at-line text-[14px]" />
                </button>
                <button
                  class="ctx-pill"
                  :class="isDark ? 'text-wt-aux border border-bdr' : 'text-lt-aux border border-bdrF'">
                  <i class="ri-cpu-line text-[10px]" />
                  GPT-4o
                </button>
              </div>
              <button
                class="px-3.5 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5"
                :class="isDark ? 'bg-wt-main text-d0 hover:bg-wt-sub' : 'bg-lt-main text-l0 hover:bg-lt-sub'">
                发送
                <i class="ri-send-plane-line text-[11px]" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Notes Tab ═══ -->
      <div v-show="centerTab === 'notes'" class="flex-1 overflow-y-auto p-5">
        <div class="grid grid-cols-2 xl:grid-cols-3 gap-3">
          <div
            class="rounded-xl cursor-pointer flex flex-col items-center justify-center h-[160px]"
            :class="
              isDark
                ? 'border border-dashed border-d4 hover:border-brand-400/30'
                : 'border border-dashed border-bdrL hover:border-brand-200'
            ">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center mb-2" :class="isDark ? 'bg-d3' : 'bg-l3'">
              <i class="ri-add-line text-[18px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
            </div>
            <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">新建笔记</span>
          </div>
          <div
            v-for="n in noteList"
            :key="n.id"
            class="rounded-xl p-4 h-[160px] flex flex-col cursor-pointer"
            :class="
              isDark
                ? 'bg-d3 border border-bdr hover:border-brand-400/20'
                : 'bg-l3 border border-bdrF hover:border-brand-200'
            ">
            <div class="flex items-center gap-2 mb-2">
              <i class="ri-booklet-line text-brand-400 text-[14px]" />
              <span class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                {{ n.title }}
              </span>
            </div>
            <p class="text-[12px] flex-1 line-clamp-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              {{ n.preview }}
            </p>
            <span class="text-[10px] mt-auto pt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ n.time }}</span>
          </div>
        </div>
      </div>

      <!-- ═══ Debate Tab ═══ -->
      <div v-show="centerTab === 'debate'" class="flex-1 overflow-y-auto p-5">
        <div class="flex items-center justify-between mb-4">
          <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">辩论记录</span>
          <button
            class="ctx-pill cursor-pointer"
            :class="
              isDark
                ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20'
                : 'text-brand-500 bg-brand-50 border border-brand-100'
            ">
            <i class="ri-add-line text-[10px]" />
            新建辩论
          </button>
        </div>
        <div class="space-y-3">
          <div
            v-for="d in debateList"
            :key="d.id"
            class="rounded-xl p-4 cursor-pointer"
            :class="
              isDark
                ? 'bg-d3 border border-bdr hover:border-brand-400/20'
                : 'bg-l3 border border-bdrF hover:border-brand-200'
            ">
            <div class="flex items-center gap-2 mb-2">
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                :class="isDark ? 'bg-agent-400/8 text-agent-400' : 'bg-agent-50 text-agent-500'">
                AI
              </span>
              <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">vs</span>
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                :class="isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500'">
                AI
              </span>
              <span
                class="text-[10px] px-1.5 py-0.5 rounded"
                :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">
                {{ d.rounds }} 轮
              </span>
            </div>
            <h4 class="text-[13px] font-semibold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              {{ d.topic }}
            </h4>
            <div class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ d.r1 }} vs {{ d.r2 }} · {{ d.time }}
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Right Toggle -->
    <div
      class="shrink-0 flex items-center justify-center cursor-pointer z-30 transition-colors"
      style="width: 24px"
      :class="isDark ? 'bg-d2' : 'bg-l2'"
      @click="rightOpen = !rightOpen">
      <div
        class="w-6 h-12 rounded-lg flex items-center justify-center transition-all"
        :class="
          isDark
            ? 'bg-d3 text-wt-aux hover:bg-brand-400/8 hover:text-wt-sub'
            : 'bg-l3 text-lt-aux hover:bg-brand-50 hover:text-lt-sub'
        ">
        <i :class="rightOpen ? 'ri-arrow-right-s-line' : 'ri-arrow-left-s-line'" class="text-[14px]" />
      </div>
    </div>

    <!-- ═══ RIGHT PANEL ═══ -->
    <div
      class="shrink-0 overflow-hidden transition-all duration-200"
      :class="isDark ? 'bg-d1' : 'bg-l1'"
      :style="{
        width: rightOpen ? rightW + 'px' : '0px',
        borderLeft: rightOpen ? `1px solid ${isDark ? '#2e2e3a' : '#dddcd9'}` : 'none',
      }">
      <div class="h-full flex flex-col" style="min-width: 180px">
        <!-- Studio Tools -->
        <div class="px-4 pt-4 pb-3" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <div class="flex items-center gap-2 mb-3">
            <i class="ri-tools-line text-[13px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
            <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">创作工具</span>
          </div>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="t in studioTools"
              :key="t.name"
              class="flex flex-col items-center justify-center p-2 rounded-xl transition-all group"
              :class="
                isDark
                  ? 'border border-transparent hover:border-brand-400/20 hover:bg-brand-400/6'
                  : 'border border-transparent hover:border-brand-200 hover:bg-brand-50/50'
              ">
              <div
                class="w-8 h-8 rounded-lg flex items-center justify-center text-[18px] mb-1 transition-transform group-hover:scale-110"
                :class="[t.bg, t.color]">
                <i :class="t.icon" />
              </div>
              <span
                class="text-[10px] font-medium"
                :class="isDark ? 'text-wt-aux group-hover:text-wt-sub' : 'text-lt-aux group-hover:text-lt-sub'">
                {{ t.name }}
              </span>
            </button>
          </div>
        </div>

        <!-- Artifacts -->
        <div class="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          <div class="flex items-center justify-between px-1 mb-1">
            <span
              class="text-[11px] font-bold uppercase tracking-wider"
              :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              生成结果
            </span>
            <button
              class="text-[10px]"
              :class="isDark ? 'text-brand-400 hover:text-brand-500' : 'text-brand-500 hover:text-brand-600'">
              管理
            </button>
          </div>
          <div
            v-for="a in artifactList"
            :key="a.id"
            class="rounded-xl p-3 cursor-pointer transition-all group relative"
            :class="
              isDark
                ? 'bg-d3 border border-bdr hover:border-brand-400/20'
                : 'bg-l3 border border-bdrF hover:border-brand-200'
            ">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="[a.bg, a.color]">
                <i :class="a.icon + ' text-[18px]'" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[12px] font-semibold truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  {{ a.title }}
                </div>
                <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ a.time }}</div>
              </div>
            </div>
            <div
              class="flex items-center justify-between pt-2 mt-1"
              :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
              <button
                class="text-[11px] font-medium"
                :class="
                  isDark
                    ? 'text-wt-aux hover:text-brand-400 hover:bg-brand-400/6 px-2 py-1 rounded-md'
                    : 'text-lt-aux hover:text-brand-500 hover:bg-brand-50 px-2 py-1 rounded-md'
                ">
                查看
              </button>
              <div class="relative">
                <button
                  @click="artifactMenuOpen = artifactMenuOpen === a.id ? null : a.id"
                  class="p-1 rounded"
                  :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
                  <i class="ri-more-2-fill text-[12px]" />
                </button>
                <div
                  v-if="artifactMenuOpen === a.id"
                  class="absolute right-0 top-8 w-[100px] rounded-xl overflow-hidden z-40"
                  :class="
                    isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/40' : 'bg-l2 border border-bdrL shadow-xl'
                  ">
                  <button
                    class="w-full px-3 py-2 text-[11px] text-left transition-colors flex items-center gap-2"
                    :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'">
                    <i class="ri-pencil-line text-[10px]" />
                    重命名
                  </button>
                  <button
                    class="w-full px-3 py-2 text-[11px] text-left transition-colors flex items-center gap-2"
                    :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'">
                    <i class="ri-share-forward-line text-[10px]" />
                    分享
                  </button>
                  <button
                    class="w-full px-3 py-2 text-[11px] text-left transition-colors flex items-center gap-2"
                    :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'">
                    <i class="ri-download-line text-[10px]" />
                    下载
                  </button>
                  <div class="h-px mx-2" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />
                  <button
                    class="w-full px-3 py-2 text-[11px] text-left transition-colors flex items-center gap-2"
                    :class="isDark ? 'text-red-400 hover:bg-red-400/8' : 'text-red-500 hover:bg-red-50'">
                    <i class="ri-delete-bin-6-line text-[10px]" />
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.highlight-tag {
  background: rgba(108, 138, 255, 0.12);
  color: #6c8aff;
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 13px;
}
.ctx-pill {
  font-size: 11px;
  border-radius: 6px;
  padding: 3px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
