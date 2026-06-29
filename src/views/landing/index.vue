<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const mobileOpen = ref(false)
const visMap = ref(new Set())

const features = [
  {
    icon: 'ri-brain-line',
    title: '智能体系统',
    desc: '创建专属 AI Agent，绑定模型、Skills 与工具，像和真人助手协作一样自然。',
    tags: ['多轮对话', '上下文管理', '流式响应', '角色提示词'],
    accent: '#6C8AFF',
  },
  {
    icon: 'ri-flashlight-line',
    title: 'Skills 市场',
    desc: '一键安装 Prompt 能力模块，即装即用，为 Agent 注入专业技能。',
    tags: ['翻译助手', '文档摘要', '代码审查', '创意写作'],
    accent: '#A78BFA',
  },
  {
    icon: 'ri-database-2-line',
    title: '知识库',
    desc: '导入本地资料，建立结构化知识知识库，Agent 可直接检索引用。',
    tags: ['向量检索', '40+ 格式', '知识库隔离', '批量管理'],
    accent: '#34D399',
  },
  {
    icon: 'ri-chat-smile-2-line',
    title: '学习台',
    desc: '不是被动阅读，而是主动探索——AI 根据你的理解程度动态调整学习路径。',
    tags: ['对话问答', '闪卡记忆', '智能测验', '学习统计'],
    accent: '#F59E0B',
  },
  {
    icon: 'ri-folder-line',
    title: '文档中心',
    desc: '树形目录管理，拖拽上传，统一回收站，误删可还原。',
    tags: ['PDF / DOCX / MD', '拖拽上传', '批量操作', '软删除'],
    accent: '#F472B6',
  },
  {
    icon: 'ri-shield-check-line',
    title: '安全沙箱',
    desc: '授权根目录隔离，Agent 所有文件读写限制在安全区域内。',
    tags: ['路径沙箱', '权限控制', '操作审计', '系统隔离'],
    accent: '#38BDF8',
  },
  {
    icon: 'ri-note-line',
    title: '笔记系统',
    desc: 'Markdown 笔记与文件夹管理，支持嵌套目录，和对话、文档统一回收站。',
    tags: ['Markdown', '文件夹', '软删除', '搜索'],
    accent: '#8B5CF6',
  },
  {
    icon: 'ri-dashboard-3-line',
    title: '仪表盘',
    desc: '一览今日学习进度、活跃 Agent、最近文档和任务状态。',
    tags: ['学习统计', '快捷入口', '最近活动', '任务概览'],
    accent: '#EC4899',
  },
  {
    icon: 'ri-tools-line',
    title: '工具管理',
    desc: '注册自定义工具供 Agent 调用，支持 MCP 协议接入外部工具服务器。',
    tags: ['自定义工具', 'MCP 协议', '参数配置', '调试面板'],
    accent: '#14B8A6',
  },
]

const localReasons = [
  {
    icon: 'ri-lock-line',
    title: '数据不出本机',
    desc: '所有笔记、对话、文档、Agent 配置都存在你自己的磁盘上。不经过任何第三方服务器，不需要信任任何云服务商。',
  },
  {
    icon: 'ri-speed-line',
    title: '零延迟响应',
    desc: '本地 SQLite 查询、本地文件读写、本地索引检索——没有网络往返，没有加载转圈。',
  },
  {
    icon: 'ri-wifi-off-line',
    title: '离线可用',
    desc: '断网不影响笔记编辑、文档浏览、知识库管理。AI 对话需要网络，但其他一切照常工作。',
  },
  {
    icon: 'ri-hard-drive-2-line',
    title: '你的数据你做主',
    desc: '标准 SQLite 数据库 + 普通文件目录。随时可以备份、迁移、用其他工具读取。没有锁定，没有专有格式。',
  },
]

const modules = [
  { icon: 'ri-dashboard-3-line', name: '仪表盘', desc: '学习进度、快捷入口、最近活动' },
  { icon: 'ri-chat-smile-2-line', name: '学习台', desc: 'AI 对话问答、闪卡、测验' },
  { icon: 'ri-sparkling-2-line', name: '智能体', desc: '创建和管理 AI Agent' },
  { icon: 'ri-flashlight-line', name: 'Skills', desc: '能力模块市场' },
  { icon: 'ri-tools-line', name: '工具', desc: '自定义工具管理' },
  { icon: 'ri-database-2-line', name: '知识库', desc: '结构化知识知识库' },
  { icon: 'ri-folder-line', name: '文档', desc: '文件管理与预览' },
  { icon: 'ri-note-line', name: '笔记', desc: 'Markdown 笔记系统' },
  { icon: 'ri-list-check-3', name: '任务', desc: '学习任务跟踪' },
  { icon: 'ri-file-chart-line', name: '输出中心', desc: 'Agent 产出物管理' },
]

const workflowSteps = [
  { num: '01', title: '导入资料', desc: '拖入 PDF、笔记、文档，Reviva 自动归类到知识库' },
  { num: '02', title: '创建 Agent', desc: '选择模型、绑定 Skills、设定角色提示词，打造专属助手' },
  { num: '03', title: '对话协作', desc: '基于你的资料进行问答、分析、创作，实时流式响应' },
  { num: '04', title: '产出沉淀', desc: '输出文档、闪卡、思维导图，回到知识库形成闭环' },
]

const archCards = [
  {
    icon: 'ri-server-line',
    title: '多 Provider 适配',
    desc: '支持 6 大模型服务商，Anthropic Claude 和 OpenAI GPT 双适配器架构，自动路由切换。',
    items: ['Anthropic Claude', 'OpenAI GPT', '6 大模型服务商', '自动路由切换'],
  },
  {
    icon: 'ri-puzzle-line',
    title: '可扩展架构',
    desc: '基于 DeepAgents 框架和 MCP 协议，Skills、工具、Agent 均可自由扩展。',
    items: ['DeepAgents 框架', 'MCP 工具协议', '自定义 Skills', 'Sub-Agent 编排'],
  },
  {
    icon: 'ri-database-2-line',
    title: '本地优先存储',
    desc: 'better-sqlite3 驱动的本地数据库，文件系统管理，软删除回收站，数据完全可控。',
    items: ['SQLite 数据库', '文件系统管理', '软删除回收站', '数据导入导出'],
  },
  {
    icon: 'ri-palette-line',
    title: '精致桌面体验',
    desc: 'Electron 30 跨平台，Naive UI 组件库，暗色浅色主题，面板自由拖拽。',
    items: ['暗色 / 浅色主题', '面板自由拖拽', '全局快捷键', '系统通知集成'],
  },
]

let observer = null

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) visMap.value.add(e.target.dataset.aId)
      })
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
  )
  document.querySelectorAll('[data-a-id]').forEach((el) => observer.observe(el))
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

function vis(id) {
  return visMap.value.has(id)
}
function scrollTo(id) {
  mobileOpen.value = false
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <div class="lp" :class="isDark ? 'dark' : 'light'">
    <!-- ===== NAV ===== -->
    <header class="nav nav--solid">
      <div class="nav__inner">
        <a class="nav__brand" href="#">
          <img class="nav__logo" src="/logo.png" alt="" />
          <span class="nav__name">Reviva</span>
        </a>
        <nav class="nav__links" :class="{ 'nav__links--open': mobileOpen }">
          <button @click="scrollTo('features')">功能</button>
          <button @click="scrollTo('local')">本地优先</button>
          <button @click="scrollTo('workflow')">工作流</button>
          <button @click="scrollTo('modules')">模块</button>
          <button @click="scrollTo('architecture')">架构</button>
          <button @click="scrollTo('download')">下载</button>
        </nav>
        <div class="nav__right">
          <button class="nav__theme" @click="appStore.isDark = !isDark" :title="isDark ? '浅色模式' : '深色模式'">
            <i :class="isDark ? 'ri-sun-line' : 'ri-moon-line'" />
          </button>
          <a class="nav__gh" href="https://github.com" target="_blank" rel="noopener">
            <i class="ri-github-fill" />
          </a>
          <button class="nav__cta" @click="scrollTo('download')">下载</button>
          <button class="nav__burger" @click="mobileOpen = !mobileOpen">
            <i :class="mobileOpen ? 'ri-close-line' : 'ri-menu-line'" />
          </button>
        </div>
      </div>
    </header>

    <!-- ===== HERO ===== -->
    <section class="hero">
      <div class="hero__inner">
        <div class="hero__text">
          <div class="hero__kicker">
            <span class="hero__dot" />
            本地优先 · 开源免费 · 跨平台
          </div>
          <h1 class="hero__h1">
            你的第二大脑，
            <br />
            在桌面上觉醒
          </h1>
          <p class="hero__p">
            Reviva 是一个
            <strong>本地学习工作平台</strong>
            ——将资料管理、知识库、AI Agent、笔记、文档整合在一个桌面应用里。
            不是又一个聊天窗口，而是一个让知识真正流动起来的学习知识库。
          </p>
          <div class="hero__actions">
            <button class="btn btn--primary" @click="scrollTo('download')">
              <i class="ri-download-2-line" />
              免费下载
            </button>
            <button class="btn btn--outline" @click="scrollTo('features')">
              了解更多
              <i class="ri-arrow-right-line" />
            </button>
          </div>
          <div class="hero__meta">
            <span>
              <i class="ri-windows-fill" />
              Windows
            </span>
            <span>
              <i class="ri-apple-fill" />
              macOS
            </span>
            <span>
              <i class="ri-ubuntu-fill" />
              Linux
            </span>
            <span class="hero__sep">|</span>
            <span>v0.0.1beta</span>
          </div>
        </div>

        <div class="hero__visual">
          <div class="mockup">
            <div class="mockup__bar">
              <span class="mockup__dot mockup__dot--r" />
              <span class="mockup__dot mockup__dot--y" />
              <span class="mockup__dot mockup__dot--g" />
              <span class="mockup__title">Reviva — 学习台</span>
            </div>
            <div class="mockup__body">
              <aside class="mockup__side">
                <div class="mockup__navi mockup__navi--active">
                  <i class="ri-chat-smile-2-line" />
                  <span>学习台</span>
                </div>
                <div class="mockup__navi">
                  <i class="ri-sparkling-2-line" />
                  <span>智能体</span>
                </div>
                <div class="mockup__navi">
                  <i class="ri-flashlight-line" />
                  <span>Skills</span>
                </div>
                <div class="mockup__navi">
                  <i class="ri-database-2-line" />
                  <span>知识库</span>
                </div>
                <div class="mockup__navi">
                  <i class="ri-folder-line" />
                  <span>文档</span>
                </div>
                <div class="mockup__navi">
                  <i class="ri-note-line" />
                  <span>笔记</span>
                </div>
                <div class="mockup__navi">
                  <i class="ri-dashboard-3-line" />
                  <span>仪表盘</span>
                </div>
              </aside>
              <main class="mockup__main">
                <div class="mockup__head">
                  <div class="mockup__avatar"><i class="ri-robot-2-line" /></div>
                  <div>
                    <div class="mockup__agent">Research Agent</div>
                    <div class="mockup__status">在线 · Claude Sonnet · 3 Skills 已加载</div>
                  </div>
                </div>
                <div class="mockup__msgs">
                  <div class="mockup__msg mockup__msg--u">帮我分析这篇论文的核心论点，用中文总结</div>
                  <div class="mockup__msg mockup__msg--a">
                    <span class="typing">
                      <i />
                      <i />
                      <i />
                    </span>
                    正在分析文档内容，已检索知识库中的 3 篇相关文献...
                  </div>
                </div>
                <div class="mockup__ref">
                  <i class="ri-attachment-line" />
                  <span>论文_深度学习综述.pdf</span>
                  <span class="mockup__ref-tag">知识库</span>
                </div>
                <div class="mockup__input">
                  <span>输入消息...</span>
                  <span class="mockup__send"><i class="ri-send-plane-fill" /></span>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== STATEMENT ===== -->
    <section class="statement">
      <div class="statement__inner">
        <p class="statement__text">
          大多数 AI 工具只给你一个对话框。
          <br />
          <strong>Reviva 给你一整个本地学习工作知识库。</strong>
        </p>
      </div>
    </section>

    <!-- ===== FEATURES ===== -->
    <section id="features" class="sec">
      <div class="sec__inner">
        <div class="sec__head" data-a-id="f-head">
          <div class="sec__tag" :class="{ 'fade-up': vis('f-head') }">核心功能</div>
          <h2 class="sec__h2" :class="{ 'fade-up': vis('f-head') }">不只是聊天，是完整的学习链路</h2>
          <p class="sec__p" :class="{ 'fade-up': vis('f-head') }">从资料导入到知识产出，Reviva 覆盖学习的每一个环节</p>
        </div>

        <div class="feat-grid">
          <div
            v-for="(f, i) in features"
            :key="i"
            class="feat"
            :data-a-id="'f-' + i"
            :class="{ 'fade-up': vis('f-' + i) }"
            :style="{ '--d': i * 50 + 'ms', '--accent': f.accent }">
            <div class="feat__icon"><i :class="f.icon" /></div>
            <h3 class="feat__title">{{ f.title }}</h3>
            <p class="feat__desc">{{ f.desc }}</p>
            <div class="feat__tags">
              <span v-for="t in f.tags" :key="t" class="feat__tag">{{ t }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== WHY LOCAL-FIRST ===== -->
    <section id="local" class="sec sec--alt">
      <div class="sec__inner">
        <div class="sec__head" data-a-id="loc-head">
          <div class="sec__tag" :class="{ 'fade-up': vis('loc-head') }">设计理念</div>
          <h2 class="sec__h2" :class="{ 'fade-up': vis('loc-head') }">为什么是本地优先？</h2>
          <p class="sec__p" :class="{ 'fade-up': vis('loc-head') }">你的知识应该住在你的电脑上，而不是别人的服务器里</p>
        </div>

        <div class="loc-grid">
          <div
            v-for="(r, i) in localReasons"
            :key="i"
            class="loc-card"
            :data-a-id="'loc-' + i"
            :class="{ 'fade-up': vis('loc-' + i) }"
            :style="{ '--d': i * 80 + 'ms' }">
            <div class="loc-card__icon"><i :class="r.icon" /></div>
            <h3>{{ r.title }}</h3>
            <p>{{ r.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== WORKFLOW ===== -->
    <section id="workflow" class="sec">
      <div class="sec__inner">
        <div class="sec__head" data-a-id="w-head">
          <div class="sec__tag" :class="{ 'fade-up': vis('w-head') }">使用流程</div>
          <h2 class="sec__h2" :class="{ 'fade-up': vis('w-head') }">从资料到产出，四步完成</h2>
        </div>

        <div class="steps">
          <div
            v-for="(s, i) in workflowSteps"
            :key="i"
            class="step"
            :data-a-id="'w-' + i"
            :class="{ 'fade-up': vis('w-' + i) }"
            :style="{ '--d': i * 80 + 'ms' }">
            <span class="step__num">{{ s.num }}</span>
            <h3 class="step__title">{{ s.title }}</h3>
            <p class="step__desc">{{ s.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== MODULES ===== -->
    <section id="modules" class="sec sec--alt">
      <div class="sec__inner">
        <div class="sec__head" data-a-id="m-head">
          <div class="sec__tag" :class="{ 'fade-up': vis('m-head') }">产品模块</div>
          <h2 class="sec__h2" :class="{ 'fade-up': vis('m-head') }">一个应用，十个模块</h2>
          <p class="sec__p" :class="{ 'fade-up': vis('m-head') }">从仪表盘到回收站，覆盖完整的本地学习工作流</p>
        </div>

        <div class="mod-grid">
          <div
            v-for="(m, i) in modules"
            :key="i"
            class="mod"
            :data-a-id="'m-' + i"
            :class="{ 'fade-up': vis('m-' + i) }"
            :style="{ '--d': i * 40 + 'ms' }">
            <i :class="m.icon" class="mod__icon" />
            <div>
              <span class="mod__name">{{ m.name }}</span>
              <span class="mod__desc">{{ m.desc }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== ARCHITECTURE ===== -->
    <section id="architecture" class="sec">
      <div class="sec__inner">
        <div class="sec__head" data-a-id="a-head">
          <div class="sec__tag" :class="{ 'fade-up': vis('a-head') }">技术架构</div>
          <h2 class="sec__h2" :class="{ 'fade-up': vis('a-head') }">为深度使用而设计</h2>
          <p class="sec__p" :class="{ 'fade-up': vis('a-head') }">
            灵活的插件架构，本地优先的数据策略，企业级的安全隔离
          </p>
        </div>

        <div class="arch-grid">
          <div
            v-for="(a, i) in archCards"
            :key="i"
            class="arch"
            :data-a-id="'a-' + i"
            :class="{ 'fade-up': vis('a-' + i) }"
            :style="{ '--d': i * 80 + 'ms' }">
            <div class="arch__icon"><i :class="a.icon" /></div>
            <h3>{{ a.title }}</h3>
            <p class="arch__desc">{{ a.desc }}</p>
            <ul>
              <li v-for="item in a.items" :key="item">
                <i class="ri-check-line" />
                {{ item }}
              </li>
            </ul>
          </div>
        </div>

        <div class="tech-row" data-a-id="tech" :class="{ 'fade-up': vis('tech') }" style="--d: 100ms">
          <span
            v-for="t in [
              'Electron 30',
              'Vue 3',
              'Vite 5',
              'Pinia',
              'Naive UI',
              'UnoCSS',
              'SQLite',
              'LangChain',
              'better-sqlite3',
              'Axios',
            ]"
            :key="t"
            class="tech-pill">
            {{ t }}
          </span>
        </div>
      </div>
    </section>

    <!-- ===== DOWNLOAD ===== -->
    <section id="download" class="sec sec--cta">
      <div class="sec__inner" data-a-id="cta" :class="{ 'fade-up': vis('cta') }">
        <h2 class="cta__h2">开始你的智能学习之旅</h2>
        <p class="cta__p">免费、开源、跨平台。你的数据永远留在本地。</p>

        <div class="dl-grid">
          <button class="dl-card">
            <i class="ri-windows-fill dl-card__icon" />
            <div>
              <span class="dl-card__os">Windows</span>
              <span class="dl-card__info">64-bit · 95 MB</span>
            </div>
            <i class="ri-download-2-line dl-card__arrow" />
          </button>
          <button class="dl-card">
            <i class="ri-apple-fill dl-card__icon" />
            <div>
              <span class="dl-card__os">macOS</span>
              <span class="dl-card__info">Apple Silicon · 88 MB</span>
            </div>
            <i class="ri-download-2-line dl-card__arrow" />
          </button>
          <button class="dl-card">
            <i class="ri-ubuntu-fill dl-card__icon" />
            <div>
              <span class="dl-card__os">Linux</span>
              <span class="dl-card__info">AppImage · 92 MB</span>
            </div>
            <i class="ri-download-2-line dl-card__arrow" />
          </button>
        </div>

        <div class="cta__gh">
          <i class="ri-github-fill" />
          <span>Star on GitHub — 开源项目，欢迎贡献</span>
        </div>
      </div>
    </section>

    <!-- ===== FOOTER ===== -->
    <footer class="foot">
      <div class="foot__inner">
        <div class="foot__top">
          <div class="foot__brand">
            <img class="foot__logo" src="/logo.png" alt="" />
            <span>Reviva</span>
          </div>
          <div class="foot__cols">
            <div class="foot__col">
              <h4>产品</h4>
              <a href="#">功能介绍</a>
              <a href="#">更新日志</a>
              <a href="#">路线图</a>
            </div>
            <div class="foot__col">
              <h4>资源</h4>
              <a href="#/docs">文档</a>
              <a href="#">GitHub</a>
              <a href="#">API 参考</a>
            </div>
            <div class="foot__col">
              <h4>社区</h4>
              <a href="#">Discord</a>
              <a href="#">讨论区</a>
              <a href="#">反馈</a>
            </div>
            <div class="foot__col">
              <h4>法律</h4>
              <a href="#">隐私政策</a>
              <a href="#">用户协议</a>
              <a href="#">开源许可</a>
            </div>
          </div>
        </div>
        <div class="foot__bottom">
          <span>&copy; 2025 Reviva. 本地优先的智能学习工作平台。</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ===========================
   LANDING PAGE — STANDALONE
   =========================== */

.lp {
  --max-w: 1140px;
  --nav-h: 64px;
  position: fixed;
  inset: 0;
  overflow-x: hidden;
  overflow-y: auto;
  font-family:
    Inter,
    -apple-system,
    'SF Pro Text',
    'Segoe UI',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  scroll-behavior: smooth;
  line-height: 1.6;
}

/* --- Theme --- */
.dark {
  --bg-0: #0c0c10;
  --bg-1: #141418;
  --bg-2: #1c1c22;
  --bg-3: #24242c;
  --bg-card: #18181e;
  --border: #2a2a34;
  --border-h: #3a3a48;
  --t1: #eaeaf0;
  --t2: #a0a0b0;
  --t3: #6a6a7e;
  --t4: #4a4a5e;
  --accent: #6c8aff;
  --accent-soft: rgba(108, 138, 255, 0.1);
  --glass: rgba(12, 12, 16, 0.82);
  --glass-b: rgba(42, 42, 52, 0.5);
  --shadow: 0 2px 16px rgba(0, 0, 0, 0.25);
  --shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.35);
}
.light {
  --bg-0: #f7f6f4;
  --bg-1: #ffffff;
  --bg-2: #f0efed;
  --bg-3: #e8e7e5;
  --bg-card: #ffffff;
  --border: #e0dedb;
  --border-h: #d0cec9;
  --t1: #1a1a24;
  --t2: #5a5a6e;
  --t3: #8a8a9e;
  --t4: #b4b4c0;
  --accent: #4a6cff;
  --accent-soft: rgba(74, 108, 255, 0.07);
  --glass: rgba(255, 255, 255, 0.82);
  --glass-b: rgba(224, 222, 219, 0.5);
  --shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.08);
}

/* --- NAV --- */
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  height: var(--nav-h);
  transition:
    background 0.25s,
    border-color 0.25s,
    box-shadow 0.25s;
  border-bottom: 1px solid transparent;
}
.nav--solid {
  background: var(--glass);
  backdrop-filter: blur(16px) saturate(1.3);
  -webkit-backdrop-filter: blur(16px) saturate(1.3);
  border-color: var(--glass-b);
  box-shadow: var(--shadow);
}
.nav__inner {
  max-width: var(--max-w);
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}
.nav__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--t1);
}
.nav__logo {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--accent);
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 15px;
}
.nav__name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.nav__links {
  display: flex;
  gap: 2px;
}
.nav__links button {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--t2);
  background: none;
  border: none;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}
.nav__links button:hover {
  color: var(--t1);
  background: var(--accent-soft);
}
.nav__right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nav__theme,
.nav__gh {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 17px;
  color: var(--t3);
  background: none;
  border: none;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
  text-decoration: none;
}
.nav__theme:hover,
.nav__gh:hover {
  color: var(--t1);
  background: var(--accent-soft);
}
.nav__gh {
  font-size: 19px;
}
.nav__cta {
  padding: 7px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--accent);
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}
.nav__cta:hover {
  opacity: 0.88;
}
.nav__burger {
  display: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  place-items: center;
  font-size: 20px;
  color: var(--t2);
  background: none;
  border: none;
  cursor: pointer;
}

/* --- HERO --- */
.hero {
  padding-top: calc(var(--nav-h) + 56px);
  padding-bottom: 80px;
  background: var(--bg-0);
}
.hero__inner {
  max-width: var(--max-w);
  margin: 0 auto;
  padding: 0 24px;
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 64px;
  align-items: center;
}
.hero__kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--t3);
  margin-bottom: 20px;
}
.hero__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34d399;
}
.hero__h1 {
  font-size: clamp(32px, 4.2vw, 52px);
  font-weight: 800;
  line-height: 1.18;
  letter-spacing: -0.035em;
  color: var(--t1);
  margin-bottom: 20px;
}
.hero__p {
  font-size: 16px;
  line-height: 1.7;
  color: var(--t2);
  margin-bottom: 32px;
  max-width: 460px;
}
.hero__p strong {
  color: var(--t1);
  font-weight: 600;
}
.hero__actions {
  display: flex;
  gap: 12px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.hero__meta {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: var(--t4);
}
.hero__meta i {
  margin-right: 3px;
}
.hero__sep {
  color: var(--border);
}

/* --- Buttons --- */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}
.btn--primary {
  color: #fff;
  background: var(--accent);
  box-shadow: 0 2px 12px rgba(74, 108, 255, 0.25);
}
.btn--primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(74, 108, 255, 0.3);
}
.btn--primary i {
  font-size: 16px;
}
.btn--outline {
  color: var(--t1);
  background: transparent;
  border: 1px solid var(--border);
}
.btn--outline:hover {
  border-color: var(--border-h);
  background: var(--accent-soft);
}
.btn--outline i {
  font-size: 14px;
}

/* --- MOCKUP --- */
.hero__visual {
  position: relative;
}
.mockup {
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
}
.mockup__bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 14px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
}
.mockup__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.mockup__dot--r {
  background: #ff5f57;
}
.mockup__dot--y {
  background: #ffbd2e;
}
.mockup__dot--g {
  background: #28c840;
}
.mockup__title {
  margin-left: auto;
  margin-right: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--t3);
}
.mockup__body {
  display: flex;
  height: 320px;
}
.mockup__side {
  width: 160px;
  padding: 10px 8px;
  border-right: 1px solid var(--border);
  background: var(--bg-2);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.mockup__navi {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--t3);
}
.mockup__navi i {
  font-size: 14px;
  width: 16px;
  text-align: center;
}
.mockup__navi--active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.mockup__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
}
.mockup__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.mockup__avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent-soft);
  display: grid;
  place-items: center;
  color: var(--accent);
  font-size: 16px;
}
.mockup__agent {
  font-size: 12px;
  font-weight: 600;
  color: var(--t1);
}
.mockup__status {
  font-size: 10px;
  color: var(--t3);
}
.mockup__msgs {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mockup__msg {
  max-width: 75%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 11.5px;
  line-height: 1.5;
}
.mockup__msg--u {
  align-self: flex-end;
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 3px;
}
.mockup__msg--a {
  background: var(--bg-3);
  color: var(--t2);
  border-bottom-left-radius: 3px;
}
.typing {
  display: inline-flex;
  gap: 3px;
  margin-right: 5px;
  vertical-align: middle;
}
.typing i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
  display: block;
  animation: typeBounce 1.2s ease-in-out infinite;
}
.typing i:nth-child(2) {
  animation-delay: 0.2s;
}
.typing i:nth-child(3) {
  animation-delay: 0.4s;
}
.mockup__ref {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  margin-top: 8px;
  border-radius: 6px;
  background: var(--bg-2);
  font-size: 10.5px;
  color: var(--t3);
}
.mockup__ref i {
  font-size: 12px;
}
.mockup__ref-tag {
  margin-left: auto;
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.mockup__input {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--bg-3);
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--t4);
  margin-top: 8px;
}
.mockup__send {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--accent);
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 11px;
}

/* --- STATEMENT --- */
.statement {
  padding: 80px 24px;
  background: var(--bg-1);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.statement__inner {
  max-width: 700px;
  margin: 0 auto;
  text-align: center;
}
.statement__text {
  font-size: clamp(20px, 2.8vw, 28px);
  line-height: 1.5;
  color: var(--t2);
  font-weight: 400;
}
.statement__text strong {
  color: var(--t1);
  font-weight: 700;
}

/* --- SECTIONS --- */
.sec {
  padding: 96px 24px;
  background: var(--bg-0);
}
.sec--alt {
  background: var(--bg-1);
}
.sec__inner {
  max-width: var(--max-w);
  margin: 0 auto;
}
.sec__head {
  text-align: center;
  margin-bottom: 56px;
}
.sec__tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
  margin-bottom: 14px;
}
.sec__h2 {
  font-size: clamp(26px, 3.2vw, 38px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--t1);
  margin-bottom: 10px;
}
.sec__p {
  font-size: 15px;
  color: var(--t2);
  max-width: 500px;
  margin: 0 auto;
}

/* --- FEATURE GRID --- */
.feat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.feat {
  padding: 32px 28px;
  background: var(--bg-0);
  transition: background 0.2s;
}
.feat:hover {
  background: var(--bg-2);
}
.feat__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 18px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  margin-bottom: 18px;
}
.feat__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--t1);
  margin-bottom: 8px;
}
.feat__desc {
  font-size: 13px;
  line-height: 1.65;
  color: var(--t2);
  margin-bottom: 14px;
}
.feat__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.feat__tag {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--t3);
  background: var(--bg-3);
}

/* --- LOCAL-FIRST --- */
.loc-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.loc-card {
  padding: 32px 28px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-0);
  transition: border-color 0.2s;
}
.loc-card:hover {
  border-color: var(--border-h);
}
.loc-card__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(52, 211, 153, 0.1);
  color: #34d399;
  display: grid;
  place-items: center;
  font-size: 18px;
  margin-bottom: 18px;
}
.loc-card h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--t1);
  margin-bottom: 8px;
}
.loc-card p {
  font-size: 13px;
  line-height: 1.65;
  color: var(--t2);
}

/* --- WORKFLOW STEPS --- */
.steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
.step {
  position: relative;
  padding: 28px 24px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-1);
}
.step__num {
  display: block;
  font-size: 32px;
  font-weight: 800;
  color: var(--accent);
  opacity: 0.2;
  margin-bottom: 12px;
  letter-spacing: -0.04em;
}
.step__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--t1);
  margin-bottom: 6px;
}
.step__desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--t2);
}

/* --- MODULES --- */
.mod-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}
.mod {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-0);
  transition:
    border-color 0.2s,
    background 0.2s;
}
.mod:hover {
  border-color: var(--border-h);
  background: var(--bg-2);
}
.mod__icon {
  font-size: 20px;
  color: var(--accent);
  flex-shrink: 0;
}
.mod__name {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--t1);
}
.mod__desc {
  display: block;
  font-size: 11px;
  color: var(--t3);
  margin-top: 1px;
}

/* --- ARCHITECTURE --- */
.arch-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 40px;
}
.arch {
  padding: 28px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  transition: border-color 0.2s;
}
.arch:hover {
  border-color: var(--border-h);
}
.arch__icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
  font-size: 17px;
  margin-bottom: 16px;
}
.arch h3 {
  font-size: 15px;
  font-weight: 700;
  color: var(--t1);
  margin-bottom: 8px;
}
.arch__desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--t2);
  margin-bottom: 14px;
}
.arch ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.arch li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--t2);
}
.arch li i {
  color: #34d399;
  font-size: 13px;
}

/* Tech pills */
.tech-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.tech-pill {
  padding: 6px 16px;
  border-radius: 100px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--t2);
  background: var(--bg-2);
  border: 1px solid var(--border);
}

/* --- CTA / DOWNLOAD --- */
.sec--cta {
  background: var(--bg-1);
  text-align: center;
  border-top: 1px solid var(--border);
}
.cta__h2 {
  font-size: clamp(26px, 3.2vw, 38px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--t1);
  margin-bottom: 10px;
}
.cta__p {
  font-size: 15px;
  color: var(--t2);
  margin-bottom: 40px;
}
.dl-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  max-width: 680px;
  margin: 0 auto 32px;
}
.dl-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.dl-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
.dl-card__icon {
  font-size: 24px;
  color: var(--t2);
  flex-shrink: 0;
}
.dl-card__os {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--t1);
}
.dl-card__info {
  display: block;
  font-size: 11px;
  color: var(--t3);
  margin-top: 1px;
}
.dl-card__arrow {
  margin-left: auto;
  font-size: 18px;
  color: var(--t4);
  transition: color 0.2s;
}
.dl-card:hover .dl-card__arrow {
  color: var(--accent);
}
.cta__gh {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--t3);
}
.cta__gh i {
  font-size: 18px;
}

/* --- FOOTER --- */
.foot {
  padding: 48px 24px 24px;
  border-top: 1px solid var(--border);
  background: var(--bg-0);
}
.foot__inner {
  max-width: var(--max-w);
  margin: 0 auto;
}
.foot__top {
  display: flex;
  justify-content: space-between;
  gap: 48px;
  margin-bottom: 40px;
}
.foot__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--t1);
  flex-shrink: 0;
}
.foot__logo {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--accent);
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 14px;
}
.foot__cols {
  display: flex;
  gap: 48px;
}
.foot__col h4 {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--t1);
  margin-bottom: 14px;
}
.foot__col a {
  display: block;
  font-size: 13px;
  color: var(--t3);
  text-decoration: none;
  margin-bottom: 8px;
  transition: color 0.15s;
}
.foot__col a:hover {
  color: var(--t1);
}
.foot__bottom {
  padding-top: 20px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--t4);
}

/* --- ANIMATIONS --- */
.fade-up {
  animation: fadeUp 0.5s ease both;
  animation-delay: var(--d, 0ms);
}
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes typeBounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  30% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

/* ===========================
   RESPONSIVE BREAKPOINTS
   =========================== */

/* Tablet: <= 1024px */
@media (max-width: 1024px) {
  .hero__inner {
    grid-template-columns: 1fr;
    gap: 48px;
    text-align: center;
  }
  .hero__p {
    max-width: none;
  }
  .hero__actions {
    justify-content: center;
  }
  .hero__meta {
    justify-content: center;
  }
  .hero__visual {
    max-width: 640px;
    margin: 0 auto;
  }

  .feat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .loc-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .steps {
    grid-template-columns: repeat(2, 1fr);
  }
  .mod-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .arch-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .dl-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .foot__top {
    flex-direction: column;
    gap: 32px;
  }
}

/* Mobile: <= 768px */
@media (max-width: 768px) {
  .lp {
    --nav-h: 56px;
  }

  .nav__links {
    display: none;
    position: fixed;
    top: var(--nav-h);
    left: 0;
    right: 0;
    background: var(--glass);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--glass-b);
    flex-direction: column;
    padding: 8px 16px;
    z-index: 199;
  }
  .nav__links--open {
    display: flex;
  }
  .nav__links button {
    padding: 12px 14px;
    text-align: left;
    border-radius: 8px;
    font-size: 14px;
  }
  .nav__burger {
    display: grid;
  }
  .nav__cta {
    display: none;
  }

  .hero {
    padding-top: calc(var(--nav-h) + 40px);
    padding-bottom: 56px;
  }
  .hero__h1 {
    font-size: 30px;
  }
  .hero__p {
    font-size: 14px;
  }

  .mockup__body {
    height: 240px;
  }
  .mockup__side {
    width: 120px;
  }
  .mockup__navi {
    padding: 5px 8px;
    font-size: 10px;
  }
  .mockup__navi i {
    font-size: 12px;
  }

  .statement {
    padding: 56px 24px;
  }

  .sec {
    padding: 64px 20px;
  }
  .sec--alt {
    padding: 64px 20px;
  }
  .sec__head {
    margin-bottom: 36px;
  }

  .feat-grid {
    grid-template-columns: 1fr;
  }
  .feat {
    padding: 24px 20px;
  }

  .loc-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .steps {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .step {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    gap: 0 16px;
    padding: 20px;
  }
  .step__num {
    grid-row: 1 / 3;
    align-self: center;
    font-size: 24px;
    margin-bottom: 0;
  }
  .step__title {
    margin-bottom: 2px;
  }
  .step__desc {
    font-size: 12px;
  }

  .mod-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .arch-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .arch {
    padding: 22px;
  }

  .dl-grid {
    grid-template-columns: 1fr;
    max-width: 340px;
  }

  .foot__top {
    flex-direction: column;
    gap: 28px;
  }
  .foot__cols {
    flex-wrap: wrap;
    gap: 28px;
  }
  .foot__bottom {
    text-align: center;
  }
}

/* Small mobile: <= 480px */
@media (max-width: 480px) {
  .hero__h1 {
    font-size: 26px;
  }
  .hero__actions {
    flex-direction: column;
  }
  .hero__actions .btn {
    width: 100%;
    justify-content: center;
  }
  .hero__meta {
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
  }

  .mockup__side {
    display: none;
  }
  .mockup__body {
    height: 200px;
  }

  .statement__text {
    font-size: 18px;
  }

  .sec__h2 {
    font-size: 22px;
  }

  .mod-grid {
    grid-template-columns: 1fr;
  }

  .foot__cols {
    gap: 20px;
  }
  .foot__col {
    min-width: 120px;
  }
}
</style>
