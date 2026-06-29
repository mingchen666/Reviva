<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'

const appStore = useAppStore()
const ss = useSettingsStore()
const isDark = computed(() => appStore.isDark)

const modes = [
  { key: 'system', label: '系统代理', desc: '跟随操作系统设置', icon: 'ri-computer-line' },
  { key: 'custom', label: '自定义代理', desc: '手动指定主机端口', icon: 'ri-equalizer-line' },
  { key: 'direct', label: '直连', desc: '不使用任何代理', icon: 'ri-arrow-right-up-line' },
]

function setProxyMode(key) { ss.savePreference('proxyMode', key) }
function setProxyType(t) { ss.savePreference('proxyType', t) }
function onProxyHostBlur() { ss.savePreference('proxyHost', ss.proxyHost) }
function onProxyPortBlur() { ss.savePreference('proxyPort', ss.proxyPort) }
function toggleProxyAuth() { ss.savePreference('proxyAuth', !ss.proxyAuth) }
function onProxyUserBlur() { ss.savePreference('proxyUser', ss.proxyUser) }
function onProxyPassBlur() { ss.savePreference('proxyPass', ss.proxyPass) }

function resetDefaults() {
  ss.savePreference('proxyMode', 'system')
  ss.savePreference('proxyType', 'http')
  ss.savePreference('proxyHost', '127.0.0.1')
  ss.savePreference('proxyPort', '7890')
  ss.savePreference('proxyAuth', false)
  ss.savePreference('proxyUser', '')
  ss.savePreference('proxyPass', '')
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <!-- Info Banner -->
    <div class="rounded-xl p-3" :class="isDark ? 'bg-blue-400/6 border border-blue-400/20' : 'bg-blue-50/60 border border-blue-100'">
      <div class="flex items-start gap-2">
        <i class="ri-global-line text-blue-400 text-[14px] mt-[1px]" />
        <div class="flex-1">
          <div class="text-[12px] font-semibold mb-0.5" :class="isDark ? 'text-blue-400' : 'text-blue-600'">网络代理</div>
          <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">访问 Anthropic / OpenAI 等国外 API 时需要配置代理。国内服务商可直连。</p>
        </div>
      </div>
    </div>

    <!-- Proxy Mode -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-1">
        <i class="ri-share-line text-blue-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">代理模式</span>
      </div>
      <p class="text-[11px] mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">选择代理工作模式</p>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="m in modes" :key="m.key"
          class="rounded-lg p-3 text-left flex items-center gap-3 transition-all"
          :class="ss.proxyMode === m.key
            ? (isDark ? 'bg-blue-400/10 border border-blue-400/30' : 'bg-blue-50 border border-blue-200')
            : (isDark ? 'border border-d4 hover:border-blue-400/20 bg-d0' : 'border border-bdrF hover:border-blue-200 bg-l2')"
          @click="setProxyMode(m.key)"
        >
          <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
            :class="ss.proxyMode === m.key ? (isDark ? 'border-blue-400' : 'border-blue-500') : (isDark ? 'border-wt-dim' : 'border-lt-aux')">
            <span v-show="ss.proxyMode === m.key" class="w-1.5 h-1.5 rounded-full" :class="isDark ? 'bg-blue-400' : 'bg-blue-500'" />
          </div>
          <i :class="`${m.icon} text-[14px] ${ss.proxyMode === m.key ? (isDark ? 'text-blue-400' : 'text-blue-500') : ''}`" />
          <div class="min-w-0">
            <div class="text-[12px] font-bold" :class="ss.proxyMode === m.key ? (isDark ? 'text-blue-400' : 'text-blue-600') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ m.label }}</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ m.desc }}</div>
          </div>
        </button>
      </div>
    </div>

    <!-- Custom Proxy Config -->
    <div v-show="ss.proxyMode === 'custom'" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-4">
        <i class="ri-settings-3-line text-blue-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">自定义代理</span>
      </div>
      <div class="space-y-3">
        <!-- Protocol -->
        <div>
          <label class="block text-[10px] font-semibold mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">协议类型</label>
          <div class="flex gap-2">
            <button v-for="t in ['http', 'https', 'socks5']" :key="t"
              class="ctx-pill cursor-pointer uppercase"
              :class="ss.proxyType === t
                ? (isDark ? 'text-blue-400 bg-blue-400/10 border border-blue-400/20' : 'text-blue-600 bg-blue-50 border border-blue-100')
                : (isDark ? 'text-wt-aux bg-d0 border border-bdr hover:text-wt-sub' : 'text-lt-aux bg-l2 border border-bdrF hover:text-lt-sub')"
              @click="setProxyType(t)">{{ t }}</button>
          </div>
        </div>
        <!-- Host + Port -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">主机</label>
            <input v-model="ss.proxyHost" type="text" placeholder="127.0.0.1"
              class="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-blue-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-blue-400'"
              @blur="onProxyHostBlur">
          </div>
          <div>
            <label class="block text-[10px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">端口</label>
            <input v-model="ss.proxyPort" type="text" placeholder="7890"
              class="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-blue-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-blue-400'"
              @blur="onProxyPortBlur">
          </div>
        </div>
        <!-- Auth toggle -->
        <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">需要身份验证</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">代理服务器需要用户名密码</div>
          </div>
          <div class="toggle shrink-0 cursor-pointer" :class="ss.proxyAuth ? 'on' : (isDark ? 'off' : 'light-off')" @click="toggleProxyAuth" />
        </div>
        <!-- Auth fields -->
        <div v-if="ss.proxyAuth" class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">用户名</label>
            <input v-model="ss.proxyUser" type="text" placeholder="username"
              class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-blue-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-blue-400'"
              @blur="onProxyUserBlur">
          </div>
          <div>
            <label class="block text-[10px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">密码</label>
            <input v-model="ss.proxyPass" type="password" placeholder="password"
              class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-blue-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-blue-400'"
              @blur="onProxyPassBlur">
          </div>
        </div>
        <div class="flex items-center gap-2 pt-1">
          <button class="px-3 h-8 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
            :class="isDark ? 'bg-blue-400 text-d0 hover:bg-blue-500' : 'bg-blue-500 text-white hover:bg-blue-600'">
            <i class="ri-plug-line text-[12px]" /> 测试代理
          </button>
          <button @click="resetDefaults" class="px-3 h-8 rounded-lg text-[11px] font-medium transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'">恢复默认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toggle{width:32px;height:18px;border-radius:9px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
.toggle::after{content:'';position:absolute;width:14px;height:14px;border-radius:50%;top:2px;left:2px;transition:transform .2s;background:#fff}
.toggle.on{background:var(--brand)}
.toggle.on::after{transform:translateX(14px)}
.toggle.off{background:#555568}
.toggle.light-off{background:#b0b0ba}
</style>