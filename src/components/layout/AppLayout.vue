<script setup>
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useRecycleBinStore } from '@/stores/recycleBin'
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'
import TitleBar from './TitleBar.vue'

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const recycleBinStore = useRecycleBinStore()
const route = useRoute()
const router = useRouter()

const isDark = computed(() => appStore.isDark)

const props = defineProps({
  iconRailWidth: { type: Number, default: 52 },
})

const navItems = [
  { isSvg: false, name: 'Dashboard', icon: 'ri-dashboard-3-line', tip: '首页', route: '/' },
  { isSvg: false, name: 'Learn', icon: 'ri-message-ai-3-line', tip: '学习台', route: '/workchat' },
  { isSvg: false, name: 'Spaces', icon: 'ri-database-2-line', tip: '知识库', route: '/spaces' },
  { isSvg: false, name: 'Docs', icon: 'ri-folder-2-line', tip: '文档', route: '/docs-manage' },
  { isSvg: false, name: 'Wiki', icon: 'ri-book-ai-line', tip: 'Wiki', route: '/wiki' },
  { isSvg: false, name: 'Agents', icon: 'ri-sparkling-2-line', tip: '智能体', route: '/agents' },
  { isSvg: false, name: 'Skills', icon: 'ri-flashlight-line', tip: '技能', route: '/skills' },
  { isSvg: false, name: 'Tools', icon: 'ri-tools-line', tip: '工具', route: '/tools' },
  { isSvg: true, name: 'Notes', icon: 'notebook', tip: '笔记', route: '/notes' },
  { isSvg: false, name: 'Outputs', icon: 'ri-file-chart-line', tip: '输出中心', route: '/outputs' },
  { isSvg: false, name: 'Translate', icon: 'ri-translate-2', tip: '翻译', route: '/translate' },
  { isSvg: false, name: 'RecycleBin', icon: 'ri-delete-bin-line', tip: '回收站', route: '/recycle-bin' },
]

const currentPath = computed(() => route.path)
const accentHex = computed(() => settingsStore.currentAccentHex)

function isActive(item) {
  if (item.route === '/') return currentPath.value === '/'
  return currentPath.value.startsWith(item.route)
}

function isSettingsActive() {
  return currentPath.value.startsWith('/settings')
}

function isProfileActive() {
  return currentPath.value.startsWith('/profile')
}

const themeIcon = computed(() => (isDark.value ? 'ri-sun-line' : 'ri-moon-line'))

function toggleTheme() {
  const next = settingsStore.themeMode === 'dark' ? 'light' : settingsStore.themeMode === 'light' ? 'dark' : 'dark'
  settingsStore.savePreference('themeMode', next)
}
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden">
    <TitleBar />
    <div class="flex flex-1 overflow-hidden">
      <!-- Icon Rail -->
      <nav
        class="flex flex-col shrink-0 border-0 border-r-2 border-solid drag-region"
        :class="isDark ? 'bg-d1 border-bdr' : 'bg-l1 border-bdrL'"
        :style="{ width: props.iconRailWidth + 'px' }">
        <!-- Top nav items -->
        <div class="no-drag flex flex-col gap-1.5 w-full px-[6px] mt-2">
          <button
            v-for="item in navItems"
            :key="item.name"
            class="nav-btn h-9 rounded-lg flex items-center justify-center transition-all"
            :class="
              isActive(item)
                ? isDark
                  ? 'text-wt-main bg-brand-400/12'
                  : 'text-lt-main bg-brand-50'
                : isDark
                  ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4'
                  : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            @click="router.push(item.route)">
            <!-- Active indicator bar -->
            <span
              v-show="isActive(item)"
              class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r"
              :style="{ backgroundColor: accentHex }" />

            <i v-if="!item.isSvg" :class="item.icon" class="text-[20px]" />
            <span v-else><SvgIcon :iconClass="item.icon" :size="18" /></span>
            <span class="tip" :class="isDark ? 'bg-d3 text-wt-main' : 'bg-l3 text-lt-main shadow-sm'">
              {{ item.tip }}
            </span>
            <span
              v-if="item.name === 'RecycleBin' && recycleBinStore.totalCount > 0"
              class="absolute -top-1 -right-1 min-w-[12px] h-[12px] rounded-full bg-red-400 text-white text-[8px] font-bold flex items-center justify-center px-0.5">
              {{ recycleBinStore.totalCount > 99 ? '99+' : recycleBinStore.totalCount }}
            </span>
          </button>
        </div>

        <!-- Bottom nav items -->
        <div class="no-drag flex flex-col gap-1.5 w-full px-[6px] mt-auto mb-2">
          <!-- Theme toggle -->
          <button
            class="nav-btn h-9 rounded-lg flex items-center justify-center transition-all"
            :class="
              isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            @click="toggleTheme()">
            <i :class="themeIcon" class="text-[20px]" />
            <span class="tip" :class="isDark ? 'bg-d3 text-wt-main' : 'bg-l3 text-lt-main shadow-sm'">切换主题</span>
          </button>
          <!-- Settings -->
          <button
            class="nav-btn h-9 rounded-lg flex items-center justify-center transition-all"
            :class="
              isSettingsActive()
                ? isDark
                  ? 'text-wt-main bg-brand-400/12'
                  : 'text-lt-main bg-brand-50'
                : isDark
                  ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4'
                  : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            @click="router.push('/settings')">
            <!-- Active indicator bar -->
            <span
              v-show="isSettingsActive()"
              class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r"
              :style="{ backgroundColor: accentHex }" />
            <i class="ri-settings-3-line text-[20px]" />
            <span class="tip" :class="isDark ? 'bg-d3 text-wt-main' : 'bg-l3 text-lt-main shadow-sm'">设置</span>
          </button>
          <!-- Avatar (Profile entry) -->
          <button
            class="nav-btn w-[28px] h-[28px] rounded-full mx-auto mt-1 transition-all relative"
            :class="isProfileActive() ? 'ring-2 ring-offset-1 scale-105' : 'hover:ring-2 hover:ring-offset-1'"
            :style="{
              background: 'linear-gradient(135deg, var(--brand), #A78BFA)',
              boxShadow: isProfileActive() ? '0 0 0 2px ' + accentHex : '',
            }"
            @click="router.push('/profile')">
            <i class="ri-user-3-line text-[20px]" />
            <span class="tip" :class="isDark ? 'bg-d3 text-wt-main' : 'bg-l3 text-lt-main shadow-sm'">个人中心</span>
          </button>
        </div>
      </nav>

      <!-- Content area -->
      <main class="flex-1 overflow-hidden" :class="isDark ? 'bg-d0' : 'bg-l0'">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.nav-btn {
  position: relative;
}
.nav-btn .tip {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 100;
  font-weight: 500;
}
.nav-btn:hover .tip {
  opacity: 1;
}
</style>
