<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import MsModal from '@/components/MsModal/MsModal.vue'
import { useWorkspaceDirectoryManager } from '@/composables/useWorkspaceDirectoryManager'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const {
  workspaceState,
  activeWorkspace,
  pendingWorkspace,
  workspaces,
  workDirRoot,
  isReady,
  verifying,
  verifyResult,
  showChangeModeModal,
  showMigrateModal,
  showRestartPrompt,
  showRestartModal,
  requiresImmediateRestart,
  pendingNewPath,
  migrating,
  migrateResult,
  restarting,
  cleaningMigration,
  canCleanupFailedMigration,
  relaunchApp,
  dismissRestartPrompt,
  selectNewDir,
  firstTimeSetup,
  createIndependentWorkspace,
  openExistingWorkspace,
  prepareMigration,
  confirmMigration,
  cleanupFailedMigration,
  cancelMigration,
  switchWorkspace,
  cancelPendingSwitch,
  verify,
} = useWorkspaceDirectoryManager()
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <!-- Auth Root Directory -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-1">
        <i class="ri-folder-shield-line text-emerald-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">授权根目录（工作空间）</span>
        <span
          v-if="!isReady"
          class="ctx-pill ml-auto"
          :class="
            isDark
              ? 'bg-red-400/8 text-red-400 border border-red-400/20'
              : 'bg-red-50 text-red-500 border border-red-100'
          ">
          必填
        </span>
        <span
          v-else
          class="ctx-pill ml-auto"
          :class="
            isDark
              ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20'
              : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
          ">
          已配置
        </span>
      </div>
      <p class="text-[11px] mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
        Agent 所有文件操作仅限此目录下的 docs/、notes/ 和 agents/ 等子目录。选择后将自动创建目录结构。
      </p>

      <!-- "What is this?" friendly explainer -->
      <div
        class="mb-3 rounded-lg p-3 flex items-start gap-2.5"
        :class="isDark ? 'bg-brand-400/6 border border-brand-400/15' : 'bg-brand-50/60 border border-brand-100'">
        <i
          class="ri-lightbulb-flash-line text-[14px] mt-[1px] shrink-0"
          :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        <div class="text-[11px] leading-relaxed space-y-1" :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">
          <div class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-main'">这是什么？</div>
          <div>
            Reviva 把所有文档、笔记、Agent 产出、技能配置都保存在一个统一的工作目录中，称为
            <span class="font-semibold" :class="isDark ? 'text-brand-400' : 'text-brand-500'">「授权根目录（工作空间）」</span>
            。它同时是 Agent 文件读写的安全沙箱——Agent 只能在此目录范围内操作，无法访问外部文件。
          </div>
          <div>
            选择后会自动创建
            <span class="font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-main'">
              docs/ · notes/ · agents/ · skills/ · .reviva/等
            </span>
            子目录。建议选一个有较大可用知识库、便于备份的位置（例如个人文档分区）。
          </div>
        </div>
      </div>

      <!-- Restart prompt (shown after init/migration succeeds) -->
      <div
        v-if="showRestartPrompt"
        class="mb-3 rounded-lg p-3 flex items-start gap-2.5"
        :class="isDark ? 'bg-amber-400/8 border border-amber-400/20' : 'bg-amber-50 border border-amber-200'">
        <i
          class="ri-restart-line text-[14px] mt-[1px] shrink-0"
          :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
        <div class="flex-1 min-w-0">
          <div class="text-[11.5px] font-semibold mb-0.5" :class="isDark ? 'text-amber-400' : 'text-amber-700'">
            建议立即重启应用
          </div>
          <div class="text-[10.5px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            已选择“{{ pendingWorkspace?.name || '新的授权根目录' }}”。数据库连接和文件监听将在重启后切换，当前会话仍使用原授权根目录。
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            v-if="!requiresImmediateRestart"
            @click="dismissRestartPrompt"
            class="h-7 px-2.5 rounded-lg text-[10.5px] font-medium transition-colors"
            :class="
              isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            ">
            稍后
          </button>
          <button
            @click="relaunchApp"
            :disabled="restarting"
            class="h-7 px-3 rounded-lg text-[10.5px] font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
            :class="
              isDark
                ? 'bg-amber-400/15 text-amber-400 hover:bg-amber-400/25 border border-amber-400/30'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            ">
            <i v-if="restarting" class="ri-loader-4-line animate-spin text-[10px]" />
            <i v-else class="ri-restart-line text-[10px]" />
            {{ restarting ? '重启中...' : '立即重启' }}
          </button>
        </div>
      </div>

      <!-- Path display + actions -->
      <div class="flex items-center gap-2 mb-2 flex-wrap">
        <div
          class="flex-1 min-w-[200px] flex items-center gap-2 px-3 h-9 rounded-lg"
          :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
          <i class="ri-folder-line text-[14px] text-emerald-400" />
          <span class="text-[12px] font-mono truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            {{ workDirRoot || '未设置' }}
          </span>
        </div>
        <!-- Edit/Select button -->
        <button
          v-if="isReady"
          @click="selectNewDir"
          class="h-9 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1"
          :class="
            isDark
              ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20 hover:bg-brand-400/18'
              : 'bg-brand-50 text-brand-600 border border-brand-100 hover:bg-brand-100'
          ">
          <i class="ri-edit-line text-[12px]" />
          更改
        </button>
        <button
          v-else
          @click="firstTimeSetup"
          class="h-9 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1"
          :class="
            isDark
              ? 'bg-d0 border border-d4 text-wt-sub hover:border-brand-400/30'
              : 'bg-l2 border border-bdrF text-lt-sub hover:border-brand-200'
          ">
          <i class="ri-folder-open-line text-[12px]" />
          选择
        </button>
        <button
          v-if="isReady"
          @click="verify"
          :disabled="verifying || !isReady"
          class="h-9 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 disabled:opacity-40"
          :class="
            isDark
              ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/18'
              : 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100'
          ">
          <i class="ri-checkbox-circle-line text-[12px]" />
          {{ verifying ? '验证中...' : '验证' }}
        </button>
      </div>

      <!-- Verify result -->
      <div
        v-if="verifyResult"
        class="flex items-center gap-1.5 text-[10px]"
        :class="
          verifyResult.ok
            ? isDark
              ? 'text-emerald-400'
              : 'text-emerald-600'
            : isDark
              ? 'text-red-400'
              : 'text-red-500'
        ">
        <i :class="verifyResult.ok ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'" class="text-[11px]" />
        <span>{{ verifyResult.message }}</span>
      </div>
      <div
        v-else-if="isReady"
        class="flex items-center gap-1.5 text-[10px]"
        :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <i class="ri-information-line text-[11px]" />
        <span>目录结构: .reviva/ · docs/ · notes/ · agents/ · skills/等</span>
      </div>

      <!-- Authorized roots / workspaces — keep the original card, append management here -->
      <div v-if="workspaces.length" class="mt-3 pt-3 border-t" :class="isDark ? 'border-d4' : 'border-bdrF'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-stack-line text-brand-400 text-[12px]" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">已授权根目录</span>
          <span class="text-[9.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">各工作空间数据完全独立</span>
        </div>
        <div class="space-y-1.5">
          <div v-for="workspace in workspaces" :key="workspace.id"
            class="flex items-center gap-2 px-2.5 py-2 rounded-lg"
            :class="workspace.id === workspaceState.activeWorkspaceId
              ? (isDark ? 'bg-emerald-400/6 border border-emerald-400/15' : 'bg-emerald-50/70 border border-emerald-100')
              : (isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF')">
            <i :class="workspace.available === false ? 'ri-folder-warning-line text-red-400' : 'ri-folder-line text-emerald-400'" class="text-[13px] shrink-0" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="text-[10.5px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ workspace.name }}</span>
                <span v-if="workspace.id === workspaceState.activeWorkspaceId" class="text-[8.5px] px-1.5 py-0.5 rounded-full"
                  :class="isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'">当前</span>
                <span v-if="workspace.id === workspaceState.pendingWorkspaceId" class="text-[8.5px] px-1.5 py-0.5 rounded-full"
                  :class="isDark ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600'">待重启切换</span>
              </div>
              <div class="text-[9.5px] font-mono truncate" :class="workspace.available === false ? 'text-red-400' : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
                {{ workspace.available === false ? (workspace.error || workspace.rootPath) : workspace.rootPath }}
              </div>
            </div>
            <button v-if="workspace.id !== workspaceState.activeWorkspaceId && workspace.id !== workspaceState.pendingWorkspaceId"
              @click="switchWorkspace(workspace)" :disabled="workspace.available === false"
              class="h-7 px-2.5 rounded-lg text-[9.5px] font-medium transition-colors disabled:opacity-40"
              :class="isDark ? 'text-brand-400 hover:bg-brand-400/10' : 'text-brand-600 hover:bg-brand-50'">
              切换
            </button>
            <button v-if="workspace.id === workspaceState.pendingWorkspaceId" @click="cancelPendingSwitch"
              class="h-7 px-2 rounded-lg text-[9.5px] transition-colors"
              :class="isDark ? 'text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:bg-l4'">取消</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Directory Structure -->
    <div v-if="isReady" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3">
        <i class="ri-folder-tree-line text-brand-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">目录结构</span>
      </div>
      <div class="space-y-2">
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
          <i class="ri-folder-line text-emerald-400 text-[14px]" />
          <span class="text-[12px] font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">docs/</span>
          <span class="text-[10px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            文档目录 — Agent 可读写
          </span>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
          <i class="ri-folder-line text-sky-400 text-[14px]" />
          <span class="text-[12px] font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">notes/</span>
          <span class="text-[10px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            笔记目录 — 保存笔记与笔记附件
          </span>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
          <i class="ri-folder-line text-brand-400 text-[14px]" />
          <span class="text-[12px] font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">agents/</span>
          <span class="text-[10px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            智能体目录 — 每个Agent独立子目录(outputs/memory)
          </span>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
          <i class="ri-folder-line text-violet-400 text-[14px]" />
          <span class="text-[12px] font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">skills/</span>
          <span class="text-[10px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            技能目录 — 当前工作空间内共享，Agent按绑定访问
          </span>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
          <i class="ri-folder-line text-wt-dim text-[14px]" />
          <span class="text-[12px] font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">.reviva/</span>
          <span class="text-[10px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">配置目录 — 应用元数据</span>
        </div>
      </div>
    </div>

    <!-- Permission Scope -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3">
        <i class="ri-shield-check-line text-amber-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">权限范围说明</span>
      </div>
      <div class="space-y-2">
        <div class="flex items-start gap-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          <i class="ri-checkbox-circle-line text-emerald-400 text-[12px] mt-[1px] shrink-0" />
          <span>所有 Agent 文件操作严格限于 docs/、notes/ 和 agents/ 等目录内</span>
        </div>
        <div class="flex items-start gap-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          <i class="ri-checkbox-circle-line text-emerald-400 text-[12px] mt-[1px] shrink-0" />
          <span>每个 Agent 在创建时单独配置读取 / 写入 / 重命名 / 联网 / KB 检索权限</span>
        </div>
        <div class="flex items-start gap-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          <i class="ri-alert-line text-amber-400 text-[12px] mt-[1px] shrink-0" />
          <span>批量重命名 / 覆盖已有 / 删除输出 / 取消任务等高风险操作需二次确认</span>
        </div>
        <div class="flex items-start gap-2 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          <i class="ri-close-circle-line text-red-400 text-[12px] mt-[1px] shrink-0" />
          <span>未开启的权限，对应工具调用将被沙箱直接拒绝</span>
        </div>
      </div>
    </div>

    <!-- Change mode — preserve the original page and clarify the three operations -->
    <MsModal v-if="showChangeModeModal" v-model:show="showChangeModeModal" :width="480" :show-footer="false">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
            <i class="ri-folder-settings-line text-[16px] text-brand-400" />
          </div>
          <div>
            <div class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">添加或更改授权根目录</div>
            <div class="text-[9.5px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">选择本次操作方式</div>
          </div>
        </div>
      </template>

      <div class="space-y-2">
        <button v-if="isReady" @click="prepareMigration"
          class="w-full p-3 rounded-lg text-left flex items-start gap-2.5 transition-colors"
          :class="isDark ? 'bg-amber-400/6 border border-amber-400/15 hover:bg-amber-400/10' : 'bg-amber-50 border border-amber-100 hover:bg-amber-100'">
          <i class="ri-folder-transfer-line text-[16px] text-amber-400 mt-0.5" />
          <div>
            <div class="text-[11.5px] font-semibold" :class="isDark ? 'text-amber-400' : 'text-amber-700'">完整迁移当前数据</div>
            <div class="text-[10px] leading-relaxed mt-0.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">完整复制数据库、文档、笔记、Agent、技能和配置；原目录保留。</div>
          </div>
        </button>

        <button @click="createIndependentWorkspace"
          class="w-full p-3 rounded-lg text-left flex items-start gap-2.5 transition-colors"
          :class="isDark ? 'bg-brand-400/6 border border-brand-400/15 hover:bg-brand-400/10' : 'bg-brand-50 border border-brand-100 hover:bg-brand-100'">
          <i class="ri-folder-add-line text-[16px] text-brand-400 mt-0.5" />
          <div>
            <div class="text-[11.5px] font-semibold" :class="isDark ? 'text-brand-400' : 'text-brand-600'">新建独立授权根目录</div>
            <div class="text-[10px] leading-relaxed mt-0.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">创建完全空白、彼此独立的新工作空间。</div>
          </div>
        </button>

        <button @click="openExistingWorkspace"
          class="w-full p-3 rounded-lg text-left flex items-start gap-2.5 transition-colors"
          :class="isDark ? 'bg-d0 border border-d4 hover:border-emerald-400/25' : 'bg-l2 border border-bdrF hover:border-emerald-200'">
          <i class="ri-folder-open-line text-[16px] text-emerald-400 mt-0.5" />
          <div>
            <div class="text-[11.5px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">打开已有授权根目录</div>
            <div class="text-[10px] leading-relaxed mt-0.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">添加以前创建的工作空间，并在重启后切换。</div>
          </div>
        </button>
      </div>
    </MsModal>

    <!-- Restart confirmation shown immediately after add / migrate / switch -->
    <MsModal v-if="showRestartModal" v-model:show="showRestartModal" :width="440" :show-footer="true" :closable="!restarting && !requiresImmediateRestart" :close-on-overlay="!restarting && !requiresImmediateRestart">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-amber-400/8' : 'bg-amber-50'">
            <i class="ri-restart-line text-[16px] text-amber-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">重启后生效</span>
        </div>
      </template>
      <div class="space-y-3">
        <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          已选择“{{ pendingWorkspace?.name || '新的授权根目录' }}”。为确保数据库连接、Agent 服务和文件监听全部使用新目录，{{ requiresImmediateRestart ? '需要立即重启应用。' : '建议现在重启应用。' }}
        </p>
        <div class="rounded-lg p-2.5 text-[10px] leading-relaxed" :class="isDark ? 'bg-amber-400/6 text-amber-400' : 'bg-amber-50 text-amber-700'">
          {{ requiresImmediateRestart ? '这是首个授权根目录，重启后才能完成初始化并进入工作空间。' : '如果选择稍后重启，当前会话仍会继续使用原授权根目录，不会出现数据混写。' }}
        </div>
      </div>
      <template #footer="{ close }">
        <button v-if="!requiresImmediateRestart" @click="close" :disabled="restarting" class="h-8 px-4 rounded-lg text-[11px] font-medium disabled:opacity-40"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">稍后重启</button>
        <button @click="relaunchApp" :disabled="restarting"
          class="h-8 px-4 rounded-lg text-[11px] font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1.5">
          <i :class="restarting ? 'ri-loader-4-line animate-spin' : 'ri-restart-line'" />
          {{ restarting ? '重启中...' : '立即重启' }}
        </button>
      </template>
    </MsModal>

    <!-- Migration Confirmation Modal -->
    <MsModal
      v-if="showMigrateModal"
      v-model:show="showMigrateModal"
      :width="440"
      :show-footer="true"
      :closable="!migrating && !cleaningMigration"
      :close-on-overlay="!migrating && !cleaningMigration"
      @close="cancelMigration">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            :class="isDark ? 'bg-amber-400/8' : 'bg-amber-50'">
            <i class="ri-folder-transfer-line text-[16px] text-amber-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">完整迁移授权根目录</span>
        </div>
      </template>

      <div class="space-y-3">
        <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          将当前授权根目录完整复制到新位置，并作为一个独立工作空间保存。
        </p>

        <!-- Old path -->
        <div>
          <span class="text-[10px] font-medium mb-1 block" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            当前目录
          </span>
          <div
            class="px-3 py-2 rounded-lg text-[11px] font-mono flex items-center gap-2"
            :class="
              isDark ? 'bg-d0 text-red-400 border border-red-400/15' : 'bg-l2 text-red-600 border border-red-100'
            ">
            <i class="ri-folder-line text-[12px]" />
            {{ workDirRoot }}
          </div>
        </div>

        <!-- Arrow -->
        <div class="flex justify-center">
          <i class="ri-arrow-down-line text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </div>

        <!-- New path -->
        <div>
          <span class="text-[10px] font-medium mb-1 block" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">新目录</span>
          <div
            class="px-3 py-2 rounded-lg text-[11px] font-mono flex items-center gap-2"
            :class="
              isDark
                ? 'bg-d0 text-emerald-400 border border-emerald-400/15'
                : 'bg-l2 text-emerald-600 border border-emerald-100'
            ">
            <i class="ri-folder-line text-[12px]" />
            {{ pendingNewPath }}
          </div>
        </div>

        <!-- Migration info -->
        <div
          class="rounded-lg p-2.5 flex items-start gap-2"
          :class="isDark ? 'bg-amber-400/6 border border-amber-400/12' : 'bg-amber-50 border border-amber-100'">
          <i class="ri-information-line text-amber-400 text-[12px] mt-[1px] shrink-0" />
          <span class="text-[10px] leading-relaxed" :class="isDark ? 'text-amber-400' : 'text-amber-600'">
            迁移将在新目录创建完整目录结构（docs/、notes/、wikis/、agents/、skills/、.reviva/），数据库将一致性备份至新位置。原目录数据不会被删除。
          </span>
        </div>

        <!-- Migration result feedback -->
        <div
          v-if="migrateResult"
          class="flex items-center gap-1.5 text-[11px]"
          :class="
            migrateResult.ok
              ? isDark
                ? 'text-emerald-400'
                : 'text-emerald-600'
              : isDark
                ? 'text-red-400'
                : 'text-red-500'
          ">
          <i :class="migrateResult.ok ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'" class="text-[12px]" />
          <span>{{ migrateResult.message }}</span>
        </div>
        <button
          v-if="canCleanupFailedMigration"
          @click="cleanupFailedMigration"
          :disabled="cleaningMigration"
          class="h-8 px-3 rounded-lg text-[10.5px] font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
          :class="isDark ? 'bg-red-400/8 text-red-400 hover:bg-red-400/14 border border-red-400/15' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'">
          <i :class="cleaningMigration ? 'ri-loader-4-line animate-spin' : 'ri-delete-bin-line'" />
          {{ cleaningMigration ? '清理中...' : '清理未完成迁移' }}
        </button>
      </div>

      <template #footer>
        <button
          @click="cancelMigration"
          :disabled="migrating || cleaningMigration"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          取消
        </button>
        <button
          @click="confirmMigration()"
          :disabled="migrating || cleaningMigration"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1.5">
          <i v-if="migrating" class="ri-loader-4-line animate-spin text-[11px]" />
          <i v-else class="ri-folder-transfer-line text-[11px]" />
          {{ migrating ? '迁移中...' : '确认迁移' }}
        </button>
      </template>
    </MsModal>
  </div>
</template>
