<script setup>
import { computed, ref, watch } from 'vue'

const defaultIcons = [
  { value: 'ri-folder-3-line', label: '文件夹', keywords: 'folder directory knowledge base' },
  { value: 'ri-folder-open-line', label: '打开文件夹', keywords: 'folder open archive' },
  { value: 'ri-archive-2-line', label: '归档', keywords: 'archive storage box' },
  { value: 'ri-database-2-line', label: '数据库', keywords: 'database data storage' },
  { value: 'ri-book-open-line', label: '书本', keywords: 'book read learning' },
  { value: 'ri-book-2-line', label: '资料书', keywords: 'book manual docs' },
  { value: 'ri-file-list-3-line', label: '清单文档', keywords: 'file list document' },
  { value: 'ri-file-text-line', label: '文本', keywords: 'file text article' },
  { value: 'ri-draft-line', label: '草稿', keywords: 'draft writing note' },
  { value: 'ri-sticky-note-line', label: '便签', keywords: 'note memo sticky' },
  { value: 'ri-quill-pen-line', label: '写作', keywords: 'write pen content' },
  { value: 'ri-article-line', label: '文章', keywords: 'article content news' },
  { value: 'ri-graduation-cap-line', label: '学习', keywords: 'study education course' },
  { value: 'ri-flask-line', label: '实验', keywords: 'lab research science' },
  { value: 'ri-brain-line', label: '思考', keywords: 'brain ai mind' },
  { value: 'ri-lightbulb-line', label: '灵感', keywords: 'idea insight light' },
  { value: 'ri-search-eye-line', label: '研究', keywords: 'search research inspect' },
  { value: 'ri-compass-3-line', label: '探索', keywords: 'explore guide compass' },
  { value: 'ri-briefcase-line', label: '工作', keywords: 'work business project' },
  { value: 'ri-dashboard-3-line', label: '看板', keywords: 'dashboard panel board' },
  { value: 'ri-layout-grid-line', label: '网格', keywords: 'grid layout collection' },
  { value: 'ri-stack-line', label: '堆叠', keywords: 'stack layers' },
  { value: 'ri-code-s-slash-line', label: '代码', keywords: 'code dev programming' },
  { value: 'ri-terminal-box-line', label: '终端', keywords: 'terminal command dev' },
  { value: 'ri-tools-line', label: '工具', keywords: 'tools utility config' },
  { value: 'ri-settings-3-line', label: '设置', keywords: 'settings config system' },
  { value: 'ri-shield-check-line', label: '安全', keywords: 'shield safe security' },
  { value: 'ri-lock-line', label: '私密', keywords: 'lock private secure' },
  { value: 'ri-earth-line', label: '全球', keywords: 'earth global system' },
  { value: 'ri-global-line', label: '网络', keywords: 'global web internet' },
  { value: 'ri-team-line', label: '团队', keywords: 'team users group' },
  { value: 'ri-user-star-line', label: '专家', keywords: 'user expert star' },
  { value: 'ri-calendar-check-line', label: '计划', keywords: 'calendar plan schedule' },
  { value: 'ri-time-line', label: '时间', keywords: 'time history clock' },
  { value: 'ri-bar-chart-box-line', label: '数据图表', keywords: 'chart analytics report' },
  { value: 'ri-pie-chart-2-line', label: '分析', keywords: 'chart analysis data' },
  { value: 'ri-line-chart-line', label: '趋势', keywords: 'trend chart growth' },
  { value: 'ri-map-pin-line', label: '地点', keywords: 'map place location' },
  { value: 'ri-image-line', label: '图片', keywords: 'image media gallery' },
  { value: 'ri-movie-line', label: '视频', keywords: 'movie video media' },
  { value: 'ri-music-2-line', label: '音乐', keywords: 'music audio sound' },
  { value: 'ri-mic-line', label: '录音', keywords: 'audio mic voice' },
  { value: 'ri-heart-line', label: '收藏', keywords: 'heart favorite personal' },
  { value: 'ri-star-line', label: '重点', keywords: 'star important favorite' },
  { value: 'ri-fire-line', label: '热门', keywords: 'hot fire trending' },
  { value: 'ri-seedling-line', label: '成长', keywords: 'growth plant learn' },
  { value: 'ri-sparkling-2-line', label: '精选', keywords: 'spark highlight magic' },
  { value: 'ri-message-3-line', label: '对话', keywords: 'chat message conversation' },
  { value: 'ri-question-answer-line', label: '问答', keywords: 'qa question answer' },
  { value: 'ri-customer-service-2-line', label: '服务', keywords: 'support service help' },
  { value: 'ri-rocket-line', label: '启动', keywords: 'rocket launch fast' },
  { value: 'ri-flag-line', label: '目标', keywords: 'flag goal target' },
  { value: 'ri-medal-line', label: '成就', keywords: 'medal achievement honor' },
  { value: 'ri-vip-crown-line', label: '高级', keywords: 'crown premium vip' },
  { value: 'ri-bank-card-line', label: '财务', keywords: 'finance card money' },
  { value: 'ri-shopping-bag-3-line', label: '业务', keywords: 'shop commerce business' },
  { value: 'ri-hospital-line', label: '医疗', keywords: 'health medical hospital' },
  { value: 'ri-scales-3-line', label: '法务', keywords: 'law legal rule' },
  { value: 'ri-home-4-line', label: '生活', keywords: 'home life personal' },
  { value: 'ri-car-line', label: '出行', keywords: 'car travel transport' },
  { value: 'ri-plane-line', label: '旅行', keywords: 'plane travel trip' },
  { value: 'ri-gamepad-line', label: '游戏', keywords: 'game play fun' },
  { value: 'ri-palette-line', label: '设计', keywords: 'design color art' },
  { value: 'ri-camera-line', label: '摄影', keywords: 'camera photo capture' },
  { value: 'ri-cloud-line', label: '云端', keywords: 'cloud sync online' },
]

const props = defineProps({
  modelValue: { type: String, default: 'ri-folder-3-line' },
  isDark: { type: Boolean, default: false },
  icons: { type: Array, default: () => [] },
  inlineColumns: { type: Number, default: 8 },
  inlineRows: { type: Number, default: 2 },
})

const emit = defineEmits(['update:modelValue'])

const query = ref('')
const showDialog = ref(false)

function normalizeIcon(item) {
  if (typeof item === 'string') {
    return {
      value: item,
      label: item.replace(/^ri-/, '').replace(/-(line|fill)$/, '').replace(/-/g, ' '),
      keywords: item,
    }
  }
  return {
    value: item.value,
    label: item.label || item.value,
    keywords: item.keywords || '',
  }
}

const iconItems = computed(() => {
  const source = props.icons.length ? props.icons : defaultIcons
  const items = source.map(normalizeIcon).filter(item => item.value)
  if (props.modelValue && !items.some(item => item.value === props.modelValue)) {
    items.unshift(normalizeIcon(props.modelValue))
  }
  return items
})

const currentIcon = computed(() => iconItems.value.find(item => item.value === props.modelValue) || normalizeIcon(props.modelValue || 'ri-folder-3-line'))

const inlineSlots = computed(() => Math.max(props.inlineColumns * props.inlineRows, 1))

const inlineIcons = computed(() => {
  const iconLimit = Math.max(inlineSlots.value - 2, 0)
  const items = iconItems.value.filter(item => item.value !== props.modelValue)
  return [currentIcon.value, ...items].slice(0, iconLimit)
})

const filteredIcons = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return iconItems.value
  return iconItems.value.filter((item) => {
    const haystack = `${item.value} ${item.label} ${item.keywords}`.toLowerCase()
    return haystack.includes(q)
  })
})

function selectIcon(icon, close = false) {
  emit('update:modelValue', icon.value)
  if (close) showDialog.value = false
}

watch(showDialog, (open) => {
  if (!open) query.value = ''
})
</script>

<template>
  <div>
    <div
      class="grid gap-1.5"
      :style="{ gridTemplateColumns: `repeat(${inlineColumns}, minmax(0, 1fr))` }">
      <button
        v-for="icon in inlineIcons"
        :key="icon.value"
        class="w-full h-9 rounded-md border flex items-center justify-center transition-colors"
        :title="icon.label"
        :aria-label="icon.label"
        :class="
          modelValue === icon.value
            ? isDark
              ? 'bg-brand-400/12 border-brand-400/25 text-brand-300'
              : 'bg-blue-50 border-blue-200 text-blue-700'
            : isDark
              ? 'bg-d0 border-d4 text-wt-aux hover:text-wt-sub hover:bg-white/5'
              : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-white'
        "
        type="button"
        @click="selectIcon(icon)">
        <i :class="[icon.value, 'text-[15px]']" />
      </button>

      <button
        class="col-span-2 w-full h-9 rounded-md border flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors"
        :class="isDark
          ? 'bg-d0 border-d4 text-wt-aux hover:text-wt-sub hover:bg-white/5'
          : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'"
        type="button"
        title="更多图标"
        aria-label="更多图标"
        @click="showDialog = true">
        <i class="ri-more-line text-[16px]" />
        <span>更多图标</span>
      </button>
    </div>

    <Teleport to="body">
      <div v-if="showDialog" class="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/45 backdrop-blur-sm" @click="showDialog = false" />
        <div
          class="relative w-full max-w-[520px] rounded-xl overflow-hidden shadow-xl"
          :class="isDark ? 'bg-d2 border border-bdr shadow-black/50' : 'bg-white border border-slate-200'">
          <div
            class="px-5 py-4 border-b flex items-center justify-between"
            :class="isDark ? 'border-d4 bg-d1/60' : 'border-slate-100 bg-slate-50'">
            <div>
              <h3 class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-slate-900'">选择图标</h3>
              <p class="mt-1 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-slate-500'">搜索并选择知识库图标</p>
            </div>
            <button
              class="w-7 h-7 rounded-md flex items-center justify-center"
              :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'"
              type="button"
              @click="showDialog = false">
              <i class="ri-close-line text-[15px]" />
            </button>
          </div>

          <div class="p-5">
            <div class="relative">
              <i
                class="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-[13px]"
                :class="isDark ? 'text-wt-dim' : 'text-slate-400'" />
              <input
                v-model="query"
                class="w-full h-9 rounded-md border pl-8 pr-8 text-[12px] outline-none transition-colors"
                :class="isDark
                  ? 'bg-d0 border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/45'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500'"
                placeholder="搜索图标名称或场景"
                spellcheck="false" />
              <button
                v-if="query"
                class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center"
                :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'"
                type="button"
                @click="query = ''">
                <i class="ri-close-line text-[13px]" />
              </button>
            </div>

            <div
              class="mt-4 max-h-[300px] overflow-y-auto custom-scrollbar rounded-md border p-2 grid grid-cols-8 sm:grid-cols-10 gap-1.5"
              :class="isDark ? 'border-d4 bg-d0/55' : 'border-slate-200 bg-slate-50/80'">
              <button
                v-for="icon in filteredIcons"
                :key="icon.value"
                class="h-9 rounded-md flex items-center justify-center transition-colors"
                :title="icon.label"
                :aria-label="icon.label"
                :class="
                  modelValue === icon.value
                    ? isDark
                      ? 'bg-brand-400/12 text-brand-300 ring-1 ring-brand-400/25'
                      : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                    : isDark
                      ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-white'
                "
                type="button"
                @click="selectIcon(icon, true)">
                <i :class="[icon.value, 'text-[16px]']" />
              </button>

              <div
                v-if="filteredIcons.length === 0"
                class="col-span-8 sm:col-span-10 h-24 flex flex-col items-center justify-center text-center"
                :class="isDark ? 'text-wt-dim' : 'text-slate-400'">
                <i class="ri-search-eye-line text-[20px]" />
                <span class="mt-1 text-[11px]">没有匹配图标</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
