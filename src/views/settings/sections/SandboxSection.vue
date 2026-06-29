<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'

const appStore = useAppStore()
const ss = useSettingsStore()
const isDark = computed(() => appStore.isDark)

function saveNum(key) { ss.savePreference(key, ss[key]) }

function toggleAllowFileDelete() { ss.savePreference('allowFileDelete', !ss.allowFileDelete) }
function saveDeleteScope() { ss.savePreference('deleteScope', ss.deleteScope) }

function toggleAllowExecCommand() { ss.savePreference('allowExecCommand', !ss.allowExecCommand) }

const wlInput = ref('')
const blInput = ref('')

const DEFAULT_COMMAND_WHITELIST = [
  'echo',
  'where',
  'which',
  'whoami',
  'hostname',
  'ver',
  'uname',
  'pwd',
  'dir',
  'tree',
  'ls',
  'type',
  'more',
  'cat',
  'findstr',
  'grep',
  'fc',
  'diff',
  'ipconfig',
  'ifconfig',
  'ping',
  'nslookup',
  'dig',
]
const DEFAULT_COMMAND_BLACKLIST = [
  'rm -rf',
  'rm -r',
  'format',
  'del /s',
  'del /q',
  'rmdir /s',
  'rmdir /q',
  'mkfs',
  'dd',
  'shutdown',
  'reboot',
  'reg',
  'regedit',
  'powershell',
  'cmd',
]
const FILE_VIEW_COMMAND_WHITELIST = [
  'attrib',
  'certutil -hashfile',
  'less',
  'head',
  'tail',
  'wc',
  'file',
  'stat',
  'shasum',
  'md5',
]
const NETWORK_COMMAND_WHITELIST = [
  'curl',
  'tracert',
  'traceroute',
]
const FILE_ACTION_COMMAND_WHITELIST = [
  'mkdir',
  'copy',
  'xcopy',
  'ren',
  'move',
  'cp',
  'mv',
]

function mergeUnique(...lists) {
  return [...new Set(lists.flat().map(v => String(v || '').trim().toLowerCase()).filter(Boolean))]
}

function addWhitelist() {
  const v = wlInput.value.trim().toLowerCase()
  if (v && !ss.commandWhitelist.includes(v)) {
    ss.commandWhitelist.push(v)
    ss.savePreference('commandWhitelist', ss.commandWhitelist)
  }
  wlInput.value = ''
}
function removeWhitelist(idx) {
  ss.commandWhitelist.splice(idx, 1)
  ss.savePreference('commandWhitelist', ss.commandWhitelist)
}

function addBlacklist() {
  const v = blInput.value.trim().toLowerCase()
  if (v && !ss.commandBlacklist.includes(v)) {
    ss.commandBlacklist.push(v)
    ss.savePreference('commandBlacklist', ss.commandBlacklist)
  }
  blInput.value = ''
}
function removeBlacklist(idx) {
  ss.commandBlacklist.splice(idx, 1)
  ss.savePreference('commandBlacklist', ss.commandBlacklist)
}

function applyPreset(type) {
  if (type === 'safe') {
    ss.commandWhitelist = [...DEFAULT_COMMAND_WHITELIST]
    ss.commandBlacklist = [...DEFAULT_COMMAND_BLACKLIST]
  } else if (type === 'file-view') {
    ss.commandWhitelist = mergeUnique(DEFAULT_COMMAND_WHITELIST, FILE_VIEW_COMMAND_WHITELIST)
    ss.commandBlacklist = [...DEFAULT_COMMAND_BLACKLIST]
  } else if (type === 'file-action') {
    ss.commandWhitelist = mergeUnique(ss.commandWhitelist, FILE_ACTION_COMMAND_WHITELIST)
    ss.commandBlacklist = [...DEFAULT_COMMAND_BLACKLIST]
  } else if (type === 'network') {
    ss.commandWhitelist = mergeUnique(ss.commandWhitelist, NETWORK_COMMAND_WHITELIST)
    ss.commandBlacklist = [...DEFAULT_COMMAND_BLACKLIST]
  }
  ss.savePreference('commandWhitelist', ss.commandWhitelist)
  ss.savePreference('commandBlacklist', ss.commandBlacklist)
}

</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <!-- Info Banner -->
    <div class="rounded-xl p-3" :class="isDark ? 'bg-amber-400/6 border border-amber-400/20' : 'bg-amber-50/60 border border-amber-100'">
      <div class="flex items-start gap-2">
        <i class="ri-shield-keyhole-line text-amber-400 text-[14px] mt-[1px]" />
        <div class="flex-1">
          <div class="text-[12px] font-semibold mb-0.5" :class="isDark ? 'text-amber-400' : 'text-amber-600'">沙箱保护机制</div>
          <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">以下设置为全局默认值。每个 Agent 任务执行时受这些限制保护，防止过度资源消耗与异常行为。标记 <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">已生效</span> 的设置已接入 Agent 运行时强制执行。</p>
        </div>
      </div>
    </div>

    <!-- Execution Limits + Resource Throttling -->
    <div class="grid grid-cols-2 gap-3">
      <!-- Execution Limits -->
      <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-4">
          <i class="ri-refresh-line text-brand-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">执行限制</span>
        </div>
        <div class="space-y-3">
          <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">最大迭代次数</span>
                <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">已生效</span>
              </div>
              <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">超过后强制终止，0 = 不限制</div>
            </div>
            <input v-model.number="ss.maxIter" type="number" min="0"
              class="w-16 h-8 px-2 rounded-md text-[12px] text-center outline-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'"
              @blur="saveNum('maxIter')">
            <span class="text-[10px] w-6" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">步</span>
          </div>
          <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">最大任务时长</span>
                <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-dim border border-d4' : 'bg-l4 text-lt-aux border border-bdrF'">配置项</span>
              </div>
              <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">当前保留配置，运行超时由 Agent 运行时控制</div>
            </div>
            <input v-model.number="ss.maxTaskMin" type="number"
              class="w-16 h-8 px-2 rounded-md text-[12px] text-center outline-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'"
              @blur="saveNum('maxTaskMin')">
            <span class="text-[10px] w-8" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">分钟</span>
          </div>
          <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">工具调用上限</span>
                <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">已生效</span>
              </div>
              <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">每轮对话工具调用次数上限</div>
            </div>
            <input v-model.number="ss.toolCallLimit" type="number"
              class="w-16 h-8 px-2 rounded-md text-[12px] text-center outline-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'"
              @blur="saveNum('toolCallLimit')">
            <span class="text-[10px] w-8" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">次/轮</span>
          </div>
          <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">模型调用上限</span>
                <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">已生效</span>
              </div>
              <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">每轮对话模型调用次数上限</div>
            </div>
            <input v-model.number="ss.modelCallLimit" type="number"
              class="w-16 h-8 px-2 rounded-md text-[12px] text-center outline-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'"
              @blur="saveNum('modelCallLimit')">
            <span class="text-[10px] w-8" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">次/轮</span>
          </div>
        </div>
      </div>

      <!-- Resource Throttling -->
      <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-4">
          <i class="ri-speed-line text-emerald-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">资源限流</span>
        </div>
        <div class="space-y-3">
          <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
            <i class="ri-global-line text-[13px] text-blue-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联网搜索</span>
                <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">已生效</span>
              </div>
              <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">每任务上限</div>
            </div>
            <input v-model.number="ss.searchLimit" type="number"
              class="w-16 h-8 px-2 rounded-md text-[12px] text-center outline-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'"
              @blur="saveNum('searchLimit')">
            <span class="text-[10px] w-6" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">次</span>
          </div>
          <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
            <i class="ri-folder-line text-[13px] text-emerald-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">文件操作</span>
                <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">已生效</span>
              </div>
              <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">每任务上限（删除、Office 读取、PPT 导出等本地工具）</div>
            </div>
            <input v-model.number="ss.fileOpLimit" type="number"
              class="w-16 h-8 px-2 rounded-md text-[12px] text-center outline-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'"
              @blur="saveNum('fileOpLimit')">
            <span class="text-[10px] w-6" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">次</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Agent Security Policy -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-4">
        <i class="ri-shield-keyhole-line text-red-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Agent 安全策略</span>
      </div>
      <div class="space-y-1">
        <!-- Allow File Delete -->
        <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
          <i class="ri-delete-bin-line text-[14px] text-red-400" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">允许文件删除</span>
              <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">已生效</span>
            </div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">全局开关：关闭后所有 Agent 都不能删除文件</div>
          </div>
          <div class="toggle shrink-0 cursor-pointer" :class="ss.allowFileDelete ? 'on' : (isDark ? 'off' : 'light-off')" @click="toggleAllowFileDelete" />
        </div>
        <!-- Delete Scope -->
        <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
          <i class="ri-folder-shield-2-line text-[14px] text-amber-400" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">删除范围限制</span>
              <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">已生效</span>
            </div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">Agent 可删除文件的目录范围，outputs 可位于任意授权子目录</div>
          </div>
          <select v-model="ss.deleteScope" @change="saveDeleteScope"
            class="h-8 px-2 rounded-md text-[11px] outline-none cursor-pointer"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'">
            <option value="outputs-only">仅任意层级 outputs/</option>
            <option value="workspace">整个工作区</option>
          </select>
        </div>
        <!-- Protected Paths Info -->
        <div class="flex items-start gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
          <i class="ri-lock-line text-[14px] text-emerald-400 mt-[1px]" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">受保护路径</span>
              <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">已生效</span>
            </div>
            <div class="text-[10px] leading-relaxed mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              以下路径始终禁止删除操作：<span class="font-mono">/memories/</span>、<span class="font-mono">/skills/</span>、<span class="font-mono">/.reviva/</span>、<span class="font-mono">/agents/*/memory/</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Command Execution Security -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-4">
        <i class="ri-terminal-box-line text-violet-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">通用命令执行安全</span>
      </div>
      <div class="space-y-3">
        <!-- Global toggle -->
        <div class="flex items-center gap-3 py-2 px-2 rounded-lg" :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
          <i class="ri-terminal-line text-[14px] text-violet-400" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">允许执行命令</span>
              <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">已生效</span>
            </div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">全局开关：关闭后 Agent 不能使用 exec_command；开启后仍禁止管道、重定向和多命令串联</div>
          </div>
          <div class="toggle shrink-0 cursor-pointer" :class="ss.allowExecCommand ? 'on' : (isDark ? 'off' : 'light-off')" @click="toggleAllowExecCommand" />
        </div>

        <!-- Whitelist -->
        <div class="py-2 px-2 rounded-lg" :class="isDark ? 'bg-d0/60' : 'bg-l2/60'">
          <div class="flex items-center gap-1.5 mb-2">
            <i class="ri-check-double-line text-[12px] text-emerald-400" />
            <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">白名单</span>
            <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">命令名或命令前缀；建议优先放开只读或范围明确的命令</span>
          </div>
          <div class="flex flex-wrap gap-1.5 mb-2">
            <span v-for="(cmd, idx) in ss.commandWhitelist" :key="idx"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono cursor-pointer transition-colors"
              :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-red-400/15 hover:text-red-400 hover:border-red-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-red-50 hover:text-red-500 hover:border-red-200'"
              @click="removeWhitelist(idx)">
              {{ cmd }} <i class="ri-close-line text-[9px]" />
            </span>
            <span v-if="ss.commandWhitelist.length === 0" class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">无白名单限制（仍受黑名单和控制符限制）</span>
          </div>
          <div class="flex items-center gap-1.5">
            <input v-model="wlInput" type="text" placeholder="输入命令名或前缀，如 dir / type / copy"
              class="flex-1 h-7 px-2 rounded-md text-[11px] outline-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder:text-wt-dim' : 'bg-l2 border border-bdrF text-lt-sub placeholder:text-lt-aux'"
              @keydown.enter="addWhitelist">
            <button @click="addWhitelist" class="h-7 px-2.5 rounded-md text-[10px] font-medium transition-colors"
              :class="isDark ? 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'">
              <i class="ri-add-line text-[11px]" />
            </button>
          </div>
        </div>

        <!-- Blacklist -->
        <div class="py-2 px-2 rounded-lg" :class="isDark ? 'bg-d0/60' : 'bg-l2/60'">
          <div class="flex items-center gap-1.5 mb-2">
            <i class="ri-forbid-line text-[12px] text-red-400" />
            <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">黑名单</span>
            <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">始终禁止的命令前缀（优先级高于白名单）</span>
          </div>
          <div class="flex flex-wrap gap-1.5 mb-2">
            <span v-for="(cmd, idx) in ss.commandBlacklist" :key="idx"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono cursor-pointer transition-colors"
              :class="isDark ? 'bg-red-400/10 text-red-400 border border-red-400/20 hover:bg-d4 hover:text-wt-aux hover:border-bdr' : 'bg-red-50 text-red-500 border border-red-100 hover:bg-l4 hover:text-lt-aux hover:border-bdrF'"
              @click="removeBlacklist(idx)">
              {{ cmd }} <i class="ri-close-line text-[9px]" />
            </span>
            <span v-if="ss.commandBlacklist.length === 0" class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">无黑名单规则</span>
          </div>
          <div class="flex items-center gap-1.5">
            <input v-model="blInput" type="text" placeholder="输入命令前缀如 rm -rf"
              class="flex-1 h-7 px-2 rounded-md text-[11px] outline-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder:text-wt-dim' : 'bg-l2 border border-bdrF text-lt-sub placeholder:text-lt-aux'"
              @keydown.enter="addBlacklist">
            <button @click="addBlacklist" class="h-7 px-2.5 rounded-md text-[10px] font-medium transition-colors"
              :class="isDark ? 'bg-red-400/10 text-red-400 hover:bg-red-400/20 border border-red-400/20' : 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-100'">
              <i class="ri-add-line text-[11px]" />
            </button>
          </div>
        </div>

        <!-- Presets -->
        <div class="flex items-center gap-2 pt-1">
          <span class="text-[10px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">快速预设：</span>
          <button @click="applyPreset('safe')" class="px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors"
            :class="isDark ? 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'">
            <i class="ri-shield-line text-[10px] mr-0.5" /> 安全默认
          </button>
          <button @click="applyPreset('file-view')" class="px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors"
            :class="isDark ? 'bg-violet-400/10 text-violet-400 hover:bg-violet-400/20 border border-violet-400/20' : 'bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-100'">
            <i class="ri-folder-search-line text-[10px] mr-0.5" /> 文件查看
          </button>
          <button @click="applyPreset('file-action')" class="px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors"
            :class="isDark ? 'bg-sky-400/10 text-sky-400 hover:bg-sky-400/20 border border-sky-400/20' : 'bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-100'">
            <i class="ri-file-copy-line text-[10px] mr-0.5" /> 文件操作
          </button>
          <button @click="applyPreset('network')" class="px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors"
            :class="isDark ? 'bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 border border-amber-400/20' : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100'">
            <i class="ri-wifi-line text-[10px] mr-0.5" /> 网络/下载
          </button>
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
.ctx-pill{display:inline-flex;padding:1px 4px;border-radius:3px;font-weight:600;line-height:1.3}
</style>
