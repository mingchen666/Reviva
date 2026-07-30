<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import MainContent from '@/components/layout/MainContent.vue'
import { getAppVersion } from '@/utils/tools'

const appVersion = getAppVersion()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const userStore = useUserStore()
const isDark = computed(() => appStore.isDark)
const accentHex = computed(() => settingsStore.currentAccentHex)

const navGroups = [
  { label: '模型', keys: ['default-models', 'models', 'speech-models', 'ocr'] },
  { label: '工作台', keys: ['directory', 'environment',  'sandbox'] },
  { label: '记录与统计', keys: ['memory', 'learning-memory', 'usage'] },
  { label: '界面与桌面', keys: ['theme', 'preference', 'shortcuts', 'quick-inputs', 'notifications'] },
  { label: '数据与系统', keys: ['local-gateway', 'data', 'about', 'author'] },//['network', 'data', 'about']
]

const sectionMap = {
  'default-models': { name: '默认模型', icon: 'ri-cloudy-line', color: 'brand', hint: '为对话、Skill、Agent、翻译等指定默认模型' },
  models: { name: '模型服务', icon: 'ri-ai-generate-3d-line', color: 'agent', hint: '配置 LLM 服务商与模型启用' },
  'speech-models': { name: '语音模型配置', icon: 'ri-mic-line', color: 'amber', hint: '配置语音转文本服务；文本转语音将在后续版本开放' },
  // network: { name: '网络与代理', icon: 'ri-global-line', color: 'blue', hint: '代理设置 · 中国用户访问国外 API 必备' },
  directory: { name: '目录与权限', icon: 'ri-folder-shield-line', color: 'emerald', hint: '设置 Agent 可访问的目录与权限范围' },
  environment: { name: '环境管理', icon: 'ri-tools-line', color: 'emerald', hint: '检测 Python / Node / FFmpeg / Pandoc 等系统依赖' },
  ocr: { name: 'OCR 模型配置', icon: 'ri-scan-2-line', color: 'emerald', hint: '配置 PaddleOCR、MinerU等服务商' },
  sandbox: { name: '沙箱与限流', icon: 'ri-shield-check-line', color: 'amber', hint: 'Agent 沙箱执行环境的全局配置' },
  memory: { name: '记忆管理', icon: 'ri-brain-line', color: 'rose', hint: '管理 Agent 与对话使用的长期记忆' },
  'learning-memory': { name: '成长画像', icon: 'ri-seedling-line', color: 'brand', hint: '管理长期学习、能力与协作偏好的个性化画像' },
  usage: { name: '用量统计', icon: 'ri-line-chart-line', color: 'emerald', hint: '查看 Token 消耗与成本' },
  theme: { name: '主题配置', icon: 'ri-palette-line', color: 'agent', hint: '界面主题、颜色模式与自定义 CSS' },
  preference: { name: '偏好配置', icon: 'ri-equalizer-line', color: 'agent', hint: '回答风格等使用偏好' },
  shortcuts: { name: '系统快捷键', icon: 'ri-keyboard-line', color: 'brand', hint: '全局与应用内键盘快捷键' },
  'quick-inputs': { name: '快捷输入', icon: 'ri-at-line', color: 'brand', hint: '管理聊天中的 @ 快捷输入' },
  notifications: { name: '通知与启动', icon: 'ri-notification-3-line', color: 'amber', hint: '声音通知、托盘与开机自启' },
  'local-gateway': { name: '网关服务', icon: 'ri-router-line', color: 'brand', hint: '通过 HTTP 对外开放 Reviva 能力' },
  data: { name: '数据与备份', icon: 'ri-database-2-line', color: 'emerald', hint: '导出导入配置、缓存清理与数据迁移' },
  about: { name: '系统版本', icon: 'ri-information-line', color: 'rose', hint: '版本、更新日志与系统信息' },
  author: { name: '关于作者', icon: 'ri-user-heart-line', color: 'brand', hint: '作者、开发意图与联系信息' },
}

const activeSection = computed(() => {
  const path = route.path
  const prefix = '/settings/'
  if (path.startsWith(prefix)) {
    const section = path.slice(prefix.length)
    if (sectionMap[section]) return section
  }
  return 'default-models'
})

const currentSectionInfo = computed(() => sectionMap[activeSection.value])

</script>

<template>
  <div class="flex h-full overflow-hidden">
    <LeftPanel :width="260" :resizable="false">
      <!-- Module Header -->
      <div class="h-10 flex items-center px-4" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">设置</span>
      </div>

      <!-- Grouped Section Nav -->
      <div class="flex-1 overflow-y-auto px-2 py-1">
        <template v-for="g in navGroups" :key="g.label">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-[0.1em] px-3 pt-1 pb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ g.label }}</div>
            <div class="space-y-0.5">
              <button
                v-for="k in g.keys"
                :key="k"
                class="section-nav-item w-full flex items-center gap-2 px-2.5 py-[6px] rounded-md relative"
                :class="activeSection === k
                  ? (isDark ? 'bg-white/6 text-wt-main' : 'bg-l3 text-lt-main')
                  : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')"
                @click="router.push('/settings/' + k)"
              >
                <span v-show="activeSection === k" class="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r" :style="{ backgroundColor: accentHex }" />
                <div class="w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0" :class="activeSection === k ? (isDark ? 'bg-d0' : 'bg-l2') : ''">
                  <i :class="`${sectionMap[k].icon} text-[15px] ${activeSection === k ? (isDark ? 'text-brand-400' : 'text-brand-500') : ''}`" />
                </div>
                <span class="text-[14px] font-medium flex-1 text-left">{{ sectionMap[k].name }}</span>
                <span v-if="sectionMap[k].badge" class="text-[10px] font-semibold px-1.5 py-[1px] rounded" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ sectionMap[k].badge }}</span>
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- Cloud Connection Status暂时隐藏 -->
      <div v-if="false" class="mx-3 my-2 rounded-lg p-2.5" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrL'">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-semibold uppercase tracking-wider" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">云端连接</span>
          <button class="text-[10px]" :class="isDark ? 'text-wt-dim hover:text-wt-aux' : 'text-lt-aux hover:text-lt-sub'" @click="userStore.setConnStatus('connecting'); setTimeout(() => userStore.setConnStatus('connected'), 800)">
            <i class="ri-refresh-line text-[10px]" />
          </button>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full shrink-0" :class="userStore.connStatus === 'connected' ? 'bg-emerald-400' : userStore.connStatus === 'error' ? 'bg-red-400' : userStore.connStatus === 'connecting' ? 'bg-blue-400' : 'bg-wt-dim'" />
          <span class="text-[11px] font-medium" :class="userStore.connStatus === 'connected' ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : userStore.connStatus === 'error' ? (isDark ? 'text-red-400' : 'text-red-500') : userStore.connStatus === 'connecting' ? (isDark ? 'text-blue-400' : 'text-blue-500') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
            {{ userStore.connStatus === 'connecting' ? '连接中...' : userStore.connStatus === 'connected' ? '已连接' : userStore.connStatus === 'error' ? '连接异常' : '未登录' }}
          </span>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-4 py-2 flex items-center justify-between" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
        <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">v{{appVersion}}</span>
        <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">© Reviva</span>
      </div>
    </LeftPanel>

    <!-- Main Content -->
    <MainContent padding="p-0">
      <div class="h-full flex flex-col">
        <!-- Section Header -->
        <div class="h-10 flex items-center justify-between px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <div class="flex items-center gap-2 min-w-0">
            <i :class="`${currentSectionInfo?.icon} text-[14px] ${isDark ? 'text-wt-aux' : 'text-lt-aux'}`" />
            <span class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ currentSectionInfo?.name }}</span>
          </div>
          <span class="text-[11px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ currentSectionInfo?.hint }}</span>
        </div>

        <!-- Section Content via router-view -->
        <div class="flex-1 overflow-y-auto">
          <router-view />
        </div>
      </div>
    </MainContent>
  </div>
</template>
