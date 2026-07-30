<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useTasksStore } from '@/stores/tasks'
import { useOutputsStore } from '@/stores/outputs'

const appStore = useAppStore()
const tasksStore = useTasksStore()
const outputsStore = useOutputsStore()
const router = useRouter()

const ROUTE_STUDY = '/workchat'
const ROUTE_SPACES = '/docs-manage'

const isDark = computed(() => appStore.isDark)

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

const greeting = computed(getGreeting)

const todayLabel = computed(() => {
  const d = new Date()
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`
})

const tasks = computed(() => (Array.isArray(tasksStore.tasks) ? tasksStore.tasks : []))
const outputs = computed(() => (Array.isArray(outputsStore.outputs) ? outputsStore.outputs : []))

/* ---------- 滚动显现指令 ---------- */
const vReveal = {
  mounted(el) {
    if (prefersReducedMotion) {
      el.classList.add('is-in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    )
    io.observe(el)
  },
}

/* 工作路径：对齐 README Learning Loop，Agent 居中 */
const workflowSteps = [
  { icon: 'ri-folder-2-line', label: '导入', desc: '文档、音视频、网页，统一进来' },
  { icon: 'ri-message-ai-3-line', label: 'Agent 对话', desc: '选择 Agent 与上下文，围绕资料提问' },
  { icon: 'ri-quill-pen-ai-line', label: '生成成果', desc: '测验、闪卡、导图、播客、研究报告' },
  { icon: 'ri-bookmark-3-line', label: '沉淀复用', desc: '存进笔记与 Wiki，下次接着学' },
]

const recentTasks = computed(() =>
  tasks.value.slice(0, 3).map((task) => ({
    id: task.id,
    name: task.name || '未命名任务',
    type: task.type,
    status: task.status,
    time: formatTime(task.createdAt),
    agent: task.agentId || (task.type === 'skill' ? 'Skill' : task.type === 'upload' ? '资料导入' : '未指定 Agent'),
  })),
)

const recentOutputs = computed(() =>
  outputs.value.slice(0, 3).map((output) => ({
    id: output.id,
    name: output.name || '未命名结果',
    type: output.type,
    typeLabel: typeLabel(output.type),
    format: output.format || '未标注格式',
    time: formatTime(output.createdAt),
    source: output.category === 'agent' ? 'Agent' : '学习台',
  })),
)

function typeIcon(type) {
  const icons = {
    agent: 'ri-sparkling-2-line',
    skill: 'ri-flashlight-line',
    upload: 'ri-upload-cloud-2-line',
    summary: 'ri-file-text-line',
    outline: 'ri-list-check-3',
    flashcards: 'ri-stack-line',
    quiz: 'ri-question-line',
    quizzes: 'ri-question-line',
    mindmap: 'ri-mind-map',
    cram_sheet: 'ri-file-paper-2-line',
  }
  return icons[type] || 'ri-file-3-line'
}

function typeTone(type) {
  if (type === 'agent') return 'tone-agent'
  if (type === 'upload' || type === 'summary' || type === 'mindmap') return 'tone-brand'
  if (type === 'quiz' || type === 'quizzes') return 'tone-error'
  if (type === 'flashcards' || type === 'cram_sheet') return 'tone-warning'
  return 'tone-output'
}

function typeLabel(type) {
  const labels = {
    summary: '摘要',
    outline: '大纲',
    flashcards: '闪卡',
    quiz: '测验题',
    quizzes: '测验题',
    mindmap: '思维导图',
    cram_sheet: '速记表',
  }
  return labels[type] || type || '其他结果'
}

function statusTone(status) {
  if (status === 'running' || status === 'processing') return 'status-running'
  if (status === 'done' || status === 'completed') return 'status-completed'
  if (status === 'pending') return 'status-pending'
  if (status === 'cancelled') return 'status-cancelled'
  return 'status-failed'
}

function statusLabel(status) {
  const labels = {
    running: '进行中',
    processing: '进行中',
    done: '已完成',
    completed: '已完成',
    failed: '失败',
    pending: '等待中',
    cancelled: '已取消',
  }
  return labels[status] || '状态未知'
}

function formatTime(value) {
  if (!value) return '时间未知'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return '时间未知'

  const diff = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return minutes + ' 分钟前'

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + ' 小时前'

  const days = Math.floor(hours / 24)
  if (days < 7) return days + ' 天前'
  return new Date(timestamp).toLocaleDateString('zh-CN')
}
</script>

<template>
  <div class="dashboard-home" :class="isDark ? 'dashboard-home--dark' : 'dashboard-home--light'">
    <main class="dashboard-shell">
      <header class="welcome-bar reveal" v-reveal>
        <div>
          <p class="welcome-title">
            {{ greeting }}，<span class="welcome-date">{{ todayLabel }}</span>
          </p>
          <p class="welcome-note">你的本地 Agent 学习工作空间。</p>
        </div>
      </header>

      <section class="hero-section" aria-labelledby="dashboard-hero-title">
        <div class="hero-copy reveal" v-reveal>
          <h1 id="dashboard-hero-title">让每份资料，都变成<em>你的学习成果</em>。</h1>
          <p>
            Reviva 将资料库、Wiki 知识库、Agent、技能与创作工具放进同一个本地工作空间。不是又一个聊天框——Agent
            理解你的资料、调用工具，把结果变成可复习、可复用的成果。
          </p>
          <div class="hero-actions">
            <button class="hero-cta hero-cta--primary" type="button" @click="router.push(ROUTE_STUDY)">
              <i class="ri-message-ai-3-line" aria-hidden="true" />
              打开学习台
            </button>
            <button class="hero-cta" type="button" @click="router.push(ROUTE_SPACES)">
              <i class="ri-upload-cloud-2-line" aria-hidden="true" />
              导入资料
            </button>
          </div>
        </div>

        <ol class="workflow-path reveal" v-reveal :style="{ '--reveal-delay': '140ms' }" aria-label="Reviva 学习路径">
          <li v-for="(step, index) in workflowSteps" :key="step.label" class="workflow-step">
            <div class="workflow-marker">
              <span class="workflow-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <i :class="step.icon" aria-hidden="true" />
            </div>
            <div class="workflow-copy">
              <strong>{{ step.label }}</strong>
              <span>{{ step.desc }}</span>
            </div>
          </li>
        </ol>
      </section>

      <section class="continuation-section" aria-labelledby="continuation-title">
        <div class="section-heading reveal" v-reveal>
          <div>
            <h2 id="continuation-title">继续学习</h2>
            <p>最近的任务与成果都在这里，随时接着上次的进度往下走。</p>
          </div>
        </div>

        <div class="activity-grid">
          <section
            class="activity-panel activity-panel--tasks reveal"
            v-reveal
            aria-labelledby="recent-tasks-title">
            <header class="activity-header">
              <div>
                <p class="activity-caption">任务</p>
                <h3 id="recent-tasks-title">最近运行</h3>
              </div>
              <button class="section-link" type="button" @click="router.push('/tasks')">
                查看任务
                <i class="ri-arrow-right-line" aria-hidden="true" />
              </button>
            </header>

            <div v-if="recentTasks.length" class="activity-list">
              <article
                v-for="(task, index) in recentTasks"
                :key="task.id"
                class="activity-row"
                role="button"
                tabindex="0"
                :style="{ '--row-delay': index * 70 + 'ms' }"
                :aria-label="`查看任务：${task.name}`"
                @click="router.push('/tasks')"
                @keyup.enter="router.push('/tasks')">
                <div class="activity-icon" :class="typeTone(task.type)" aria-hidden="true">
                  <i :class="typeIcon(task.type)" />
                </div>
                <div class="activity-main">
                  <h4>{{ task.name }}</h4>
                  <p>{{ task.agent }}</p>
                </div>
                <div class="activity-meta">
                  <span class="status-badge" :class="statusTone(task.status)">
                    <span aria-hidden="true" />
                    {{ statusLabel(task.status) }}
                  </span>
                  <time>{{ task.time }}</time>
                </div>
                <i class="ri-arrow-right-s-line activity-goto" aria-hidden="true" />
              </article>
            </div>

            <div v-else class="empty-state">
              <i class="ri-chat-new-line" aria-hidden="true" />
              <p>还没有任务记录。</p>
              <span>打开学习台，选择一份资料和 Agent 开始对话，新的任务会出现在这里。</span>
            </div>
          </section>

          <section
            class="activity-panel activity-panel--outputs reveal"
            v-reveal
            :style="{ '--reveal-delay': '120ms' }"
            aria-labelledby="recent-outputs-title">
            <header class="activity-header">
              <div>
                <p class="activity-caption">成果</p>
                <h3 id="recent-outputs-title">最近生成</h3>
              </div>
              <button class="section-link" type="button" @click="router.push('/outputs')">
                查看输出
                <i class="ri-arrow-right-line" aria-hidden="true" />
              </button>
            </header>

            <div v-if="recentOutputs.length" class="activity-list">
              <article
                v-for="(output, index) in recentOutputs"
                :key="output.id"
                class="activity-row"
                role="button"
                tabindex="0"
                :style="{ '--row-delay': index * 70 + 'ms' }"
                :aria-label="`查看输出：${output.name}`"
                @click="router.push('/outputs')"
                @keyup.enter="router.push('/outputs')">
                <div class="activity-icon" :class="typeTone(output.type)" aria-hidden="true">
                  <i :class="typeIcon(output.type)" />
                </div>
                <div class="activity-main">
                  <h4>{{ output.name }}</h4>
                  <p>{{ output.typeLabel }} · {{ output.format }} · {{ output.source }}</p>
                </div>
                <div class="activity-meta activity-meta--time-only">
                  <time>{{ output.time }}</time>
                </div>
                <i class="ri-arrow-right-s-line activity-goto" aria-hidden="true" />
              </article>
            </div>

            <div v-else class="empty-state">
              <i class="ri-file-add-line" aria-hidden="true" />
              <p>还没有学习成果。</p>
              <span>测验、闪卡、思维导图、知识图谱、播客等成果会在生成后汇集到这里。</span>
            </div>
          </section>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
:global(html),
:global(body) {
  overflow-x: clip;
}

.dashboard-home {
  --home-page: var(--ui-bg-0);
  --home-surface: var(--ui-bg-2);
  --home-surface-muted: var(--ui-bg-3);
  --home-surface-strong: var(--ui-bg-4);
  --home-text: var(--ui-text-main);
  --home-text-sub: var(--ui-text-sub);
  --home-text-aux: var(--ui-text-sub);
  --home-text-dim: var(--ui-text-sub);
  --home-rule: var(--ui-border-panel);
  --home-rule-card: var(--ui-border-card);
  --home-accent: var(--brand);
  --home-accent-rgb: var(--brand-rgb);
  --home-agent: var(--agent-color);
  --home-output: var(--output-color);
  --home-success: var(--success);
  --home-warning: var(--warning);
  --home-error: var(--error);
  --home-accent-soft: color-mix(in srgb, var(--home-accent) 10%, transparent);
  --home-accent-rule: color-mix(in srgb, var(--home-accent) 24%, transparent);
  --home-focus: var(--ui-border-focus);
  --home-font: var(--ui-font-family);
  --home-font-display: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", var(--home-font);
  --home-space-1: 0.25rem;
  --home-space-2: 0.5rem;
  --home-space-3: 0.75rem;
  --home-space-4: 1rem;
  --home-space-5: 1.25rem;
  --home-space-6: 1.5rem;
  --home-space-8: 2rem;
  --home-space-10: 2.5rem;
  --home-space-12: 3rem;
  --home-space-16: 4rem;
  --home-text-xs: 0.6875rem;
  --home-text-sm: 0.75rem;
  --home-text-md: 0.875rem;
  --home-text-lg: 1.125rem;
  --home-text-xl: 1.5rem;
  --home-text-display: clamp(2.125rem, 4.4vw, 4.25rem);
  --home-radius-small: var(--ui-radius-small, 0.375rem);
  --home-radius-control: var(--ui-radius-control, 0.5rem);
  --home-radius-panel: var(--ui-radius-card, 0.75rem);
  --home-radius-pill: 999px;
  --home-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --home-duration: 180ms;

  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow-x: clip;
  overflow-y: auto;
  background:
    radial-gradient(56rem 32rem at 88% -10%, color-mix(in srgb, var(--home-accent) 8%, transparent), transparent 68%),
    radial-gradient(44rem 30rem at -12% 24%, color-mix(in srgb, var(--home-agent) 6%, transparent), transparent 70%),
    var(--home-page);
  color: var(--home-text);
  font-family: var(--home-font);
}

.dashboard-home--dark {
  color-scheme: dark;
}

.dashboard-home--light {
  color-scheme: light;
}

.dashboard-home *,
.dashboard-home *::before,
.dashboard-home *::after {
  box-sizing: inherit;
}

.dashboard-shell {
  width: min(100%, 76rem);
  min-width: 0;
  margin: 0 auto;
  padding: var(--home-space-8) var(--home-space-8) var(--home-space-16);
}

/* ---------- 滚动显现 ---------- */
.reveal {
  opacity: 0;
  transform: translateY(14px);
  transition:
    opacity 0.62s var(--home-ease-out),
    transform 0.62s var(--home-ease-out);
  transition-delay: var(--reveal-delay, 0ms);
}

.reveal.is-in {
  opacity: 1;
  transform: none;
}

/* ---------- 顶栏 ---------- */
.welcome-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--home-space-6);
  padding-bottom: var(--home-space-8);
  border-bottom: 1px solid var(--home-rule);
}

.welcome-title,
.welcome-note,
.hero-copy p,
.section-heading p,
.activity-caption,
.activity-main p,
.empty-state p,
.empty-state span {
  margin: 0;
}

.welcome-title {
  color: var(--home-text);
  font-size: var(--home-text-md);
  font-weight: 650;
}

.welcome-date {
  margin-left: var(--home-space-1);
  color: var(--home-text-dim);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.welcome-note {
  margin-top: var(--home-space-1);
  color: var(--home-text-aux);
  font-size: var(--home-text-sm);
}

/* ---------- Hero ---------- */
.hero-section {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(20rem, 0.8fr);
  gap: var(--home-space-16);
  align-items: end;
  padding: var(--home-space-12) 0 var(--home-space-16);
}

.hero-copy {
  min-width: 0;
  max-width: 46rem;
}

.hero-copy h1 {
  min-width: 0;
  margin: 0;
  color: var(--home-text);
  font-family: var(--home-font-display);
  font-size: var(--home-text-display);
  font-weight: 620;
  line-height: 1.2;
  letter-spacing: 0.01em;
  overflow-wrap: anywhere;
}

.hero-copy h1 em {
  font-style: normal;
  background-image: linear-gradient(
    to top,
    color-mix(in srgb, var(--home-accent) 26%, transparent) 0.16em,
    transparent 0.16em
  );
}

.hero-copy p {
  max-width: 41rem;
  margin-top: var(--home-space-6);
  color: var(--home-text-sub);
  font-size: var(--home-text-lg);
  line-height: 1.85;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--home-space-3);
  margin-top: var(--home-space-8);
}

.hero-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--home-space-2);
  min-height: 2.5rem;
  padding: 0 var(--home-space-5);
  border: 1px solid var(--home-rule-card);
  border-radius: var(--home-radius-control);
  background: var(--home-surface);
  color: var(--home-text-sub);
  font: inherit;
  font-size: var(--home-text-md);
  font-weight: 620;
  cursor: pointer;
  transition:
    transform var(--home-duration) var(--home-ease-out),
    box-shadow var(--home-duration) var(--home-ease-out),
    border-color var(--home-duration) var(--home-ease-out),
    color var(--home-duration) var(--home-ease-out),
    filter var(--home-duration) var(--home-ease-out);
}

.hero-cta i {
  font-size: 1.0625rem;
}

.hero-cta:hover {
  transform: translateY(-1px);
  border-color: var(--home-accent-rule);
  color: var(--home-accent);
  box-shadow: 0 10px 22px -14px color-mix(in srgb, var(--home-accent) 45%, transparent);
}

.hero-cta:active {
  transform: translateY(0);
}

.hero-cta--primary {
  border-color: transparent;
  background: var(--home-accent);
  color: var(--home-page);
}

.hero-cta--primary:hover {
  color: var(--home-page);
  filter: brightness(1.07);
  box-shadow: 0 12px 26px -12px color-mix(in srgb, var(--home-accent) 60%, transparent);
}

.hero-cta:focus-visible,
.activity-row:focus-visible {
  outline: 2px solid var(--home-focus);
  outline-offset: 2px;
}

/* ---------- 工作路径 ---------- */
.workflow-path {
  position: relative;
  display: grid;
  gap: 0;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--home-accent-rule);
}

.workflow-step {
  display: grid;
  grid-template-columns: 3.25rem minmax(0, 1fr);
  gap: var(--home-space-4);
  min-width: 0;
  padding: var(--home-space-4) 0;
  border-bottom: 1px solid var(--home-rule);
}

.workflow-marker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--home-space-2);
  color: var(--home-accent);
}

.workflow-marker i {
  font-size: var(--home-text-lg);
  transition: transform 0.25s var(--home-ease-out);
}

.workflow-step:hover .workflow-marker i {
  transform: translateY(-1px) scale(1.16);
}

.workflow-index {
  color: var(--home-text-dim);
  font-size: var(--home-text-xs);
  font-variant-numeric: tabular-nums;
  transition: color var(--home-duration) var(--home-ease-out);
}

.workflow-step:hover .workflow-index {
  color: var(--home-accent);
}

.workflow-copy {
  display: grid;
  grid-template-columns: 4.75rem minmax(0, 1fr);
  gap: var(--home-space-3);
  align-items: baseline;
  min-width: 0;
}

.workflow-copy strong {
  color: var(--home-text);
  font-size: var(--home-text-md);
}

.workflow-copy span {
  color: var(--home-text-aux);
  font-size: var(--home-text-sm);
  line-height: 1.55;
}

/* ---------- 继续学习 ---------- */
.continuation-section {
  padding-top: var(--home-space-12);
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--home-space-6);
  margin-bottom: var(--home-space-6);
}

.section-heading h2 {
  min-width: 0;
  margin: 0;
  color: var(--home-text);
  font-size: var(--home-text-xl);
  font-weight: 700;
  letter-spacing: -0.025em;
  overflow-wrap: anywhere;
}

.section-heading p {
  margin-top: var(--home-space-2);
  color: var(--home-text-aux);
  font-size: var(--home-text-sm);
  line-height: 1.6;
}

.activity-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
  gap: var(--home-space-6);
}

.activity-panel {
  min-width: 0;
  overflow: clip;
  border: 1px solid var(--home-rule-card);
  border-radius: var(--home-radius-panel);
  background: var(--home-surface);
}

.activity-panel--tasks {
  border-top-color: var(--home-accent);
}

.activity-panel--outputs {
  border-top-color: var(--home-output);
}

.activity-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--home-space-4);
  min-height: 4.5rem;
  padding: var(--home-space-4) var(--home-space-5);
  border-bottom: 1px solid var(--home-rule-card);
  background: var(--home-surface-muted);
}

.activity-caption {
  margin-bottom: var(--home-space-1);
  color: var(--home-text-dim);
  font-size: var(--home-text-xs);
}

.activity-header h3 {
  margin: 0;
  color: var(--home-text);
  font-size: var(--home-text-md);
  font-weight: 680;
}

.section-link {
  display: inline-flex;
  align-items: center;
  gap: var(--home-space-2);
  min-height: 2rem;
  padding: 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--home-accent);
  font: inherit;
  font-size: var(--home-text-sm);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color var(--home-duration) var(--home-ease-out),
    border-color var(--home-duration) var(--home-ease-out),
    opacity var(--home-duration) var(--home-ease-out);
}

.section-link i {
  transition: transform var(--home-duration) var(--home-ease-out);
}

.section-link:hover {
  border-bottom-color: var(--home-accent);
}

.section-link:hover i {
  transform: translateX(3px);
}

.section-link:active {
  opacity: 0.7;
}

.section-link:disabled {
  border-bottom-color: transparent;
  opacity: 0.55;
  cursor: not-allowed;
}

.section-link:focus-visible {
  outline: 2px solid var(--home-focus);
  outline-offset: var(--home-space-1);
  border-radius: var(--home-radius-small);
}

.activity-list {
  display: grid;
}

.activity-panel:not(.is-in) .activity-row {
  opacity: 0;
}

.activity-panel.is-in .activity-row {
  animation: home-row-in 0.55s var(--home-ease-out) both;
  animation-delay: var(--row-delay, 0ms);
}

@keyframes home-row-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.activity-row {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr) auto 1.5rem;
  gap: var(--home-space-3);
  align-items: center;
  min-width: 0;
  min-height: 4.75rem;
  padding: var(--home-space-4) var(--home-space-5);
  cursor: pointer;
  transition: background-color var(--home-duration) var(--home-ease-out);
}

.activity-row:hover {
  background: color-mix(in srgb, var(--home-accent) 4%, transparent);
}

.activity-row + .activity-row {
  border-top: 1px solid var(--home-rule-card);
}

.activity-icon {
  --row-accent: var(--home-output);
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--home-radius-control);
  background: color-mix(in srgb, var(--row-accent) 10%, transparent);
  color: var(--row-accent);
  font-size: var(--home-text-lg);
  transition: transform 0.25s var(--home-ease-out);
}

.activity-row:hover .activity-icon {
  transform: scale(1.1);
}

.tone-brand {
  --row-accent: var(--home-accent);
}

.tone-agent {
  --row-accent: var(--home-agent);
}

.tone-output {
  --row-accent: var(--home-output);
}

.tone-warning {
  --row-accent: var(--home-warning);
}

.tone-error {
  --row-accent: var(--home-error);
}

.activity-main {
  min-width: 0;
}

.activity-main h4 {
  overflow: hidden;
  margin: 0;
  color: var(--home-text);
  font-size: var(--home-text-md);
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-main p {
  overflow: hidden;
  margin-top: var(--home-space-1);
  color: var(--home-text-aux);
  font-size: var(--home-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-meta {
  display: grid;
  justify-items: end;
  gap: var(--home-space-2);
  min-width: 4.75rem;
}

.activity-meta time {
  color: var(--home-text-dim);
  font-size: var(--home-text-xs);
  white-space: nowrap;
}

.activity-meta--time-only {
  align-self: center;
}

.activity-goto {
  justify-self: end;
  color: var(--home-text-dim);
  font-size: var(--home-text-lg);
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity var(--home-duration) var(--home-ease-out),
    transform var(--home-duration) var(--home-ease-out),
    color var(--home-duration) var(--home-ease-out);
}

.activity-row:hover .activity-goto,
.activity-row:focus-visible .activity-goto {
  opacity: 1;
  transform: none;
  color: var(--home-accent);
}

.status-badge {
  --status-color: var(--home-error);
  display: inline-flex;
  align-items: center;
  gap: var(--home-space-2);
  padding: var(--home-space-1) var(--home-space-2);
  border: 1px solid color-mix(in srgb, var(--status-color) 28%, transparent);
  border-radius: var(--home-radius-pill);
  background: color-mix(in srgb, var(--status-color) 8%, transparent);
  color: var(--status-color);
  font-size: var(--home-text-xs);
  white-space: nowrap;
}

.status-badge > span {
  width: var(--home-space-1);
  height: var(--home-space-1);
  border-radius: 50%;
  background: currentColor;
}

.status-running > span {
  animation: home-status-pulse 1.6s ease-in-out infinite;
}

@keyframes home-status-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--status-color) 45%, transparent);
  }
  50% {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-color) 0%, transparent);
  }
}

.status-running {
  --status-color: var(--home-accent);
}

.status-completed {
  --status-color: var(--home-success);
}

.status-pending {
  --status-color: var(--home-warning);
}

.status-cancelled {
  --status-color: var(--home-text-aux);
}

.status-failed {
  --status-color: var(--home-error);
}

.empty-state {
  display: grid;
  place-items: center;
  min-height: 14.25rem;
  padding: var(--home-space-10);
  text-align: center;
}

.empty-state i {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: var(--home-space-4);
  border-radius: 50%;
  background: color-mix(in srgb, var(--home-text-dim) 8%, transparent);
  color: var(--home-text-dim);
  font-size: var(--home-text-xl);
  animation: home-breathe 3.4s ease-in-out infinite;
}

@keyframes home-breathe {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.8;
  }
  50% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

.empty-state p {
  color: var(--home-text-sub);
  font-size: var(--home-text-md);
  font-weight: 650;
}

.empty-state span {
  max-width: 24rem;
  margin-top: var(--home-space-2);
  color: var(--home-text-aux);
  font-size: var(--home-text-sm);
  line-height: 1.65;
}

@media (max-width: 65rem) {
  .dashboard-shell {
    padding-inline: var(--home-space-6);
  }

  .hero-section {
    grid-template-columns: minmax(0, 1.08fr) minmax(18rem, 0.92fr);
    gap: var(--home-space-10);
  }

  .workflow-copy {
    grid-template-columns: 4.25rem minmax(0, 1fr);
  }
}

@media (max-width: 48rem) {
  .dashboard-shell {
    padding: var(--home-space-6) var(--home-space-5) var(--home-space-12);
  }

  .hero-section {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--home-space-10);
    align-items: start;
    padding: var(--home-space-8) 0 var(--home-space-12);
  }

  .hero-copy p {
    font-size: var(--home-text-md);
  }

  .workflow-path {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-left: 1px solid var(--home-rule);
  }

  .workflow-step {
    display: block;
    padding: var(--home-space-4);
    border-right: 1px solid var(--home-rule);
  }

  .workflow-marker {
    margin-bottom: var(--home-space-3);
  }

  .workflow-copy {
    display: block;
  }

  .workflow-copy strong,
  .workflow-copy span {
    display: block;
  }

  .workflow-copy span {
    margin-top: var(--home-space-1);
  }

  .activity-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 32.5rem) {
  .dashboard-shell {
    padding-inline: var(--home-space-4);
  }

  .welcome-bar {
    align-items: flex-start;
  }

  .welcome-note {
    display: none;
  }

  .hero-copy h1 {
    font-size: clamp(1.875rem, 10vw, 2.75rem);
  }

  .activity-header,
  .activity-row {
    padding-inline: var(--home-space-4);
  }

  .activity-row {
    grid-template-columns: 2.25rem minmax(0, 1fr);
  }

  .activity-meta {
    grid-column: 2;
    grid-template-columns: auto 1fr;
    justify-items: start;
    min-width: 0;
  }

  .activity-goto {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .activity-panel:not(.is-in) .activity-row {
    opacity: 1;
  }

  .activity-panel.is-in .activity-row {
    animation: none;
  }

  .status-running > span,
  .empty-state i {
    animation: none;
  }

  .section-link,
  .hero-cta,
  .activity-row {
    transition-duration: 50ms;
  }
}
</style>