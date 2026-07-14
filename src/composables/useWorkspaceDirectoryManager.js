import { computed, onMounted, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'

export function useWorkspaceDirectoryManager() {
  const settingsStore = useSettingsStore()
  const messageBox = useMessageBox()

  const workspaceState = computed(() => settingsStore.workspaceState)
  const activeWorkspace = computed(() => workspaceState.value.activeWorkspace)
  const pendingWorkspace = computed(() => workspaceState.value.pendingWorkspace)
  const workspaces = computed(() => workspaceState.value.workspaces || [])
  const workDirRoot = computed(() => activeWorkspace.value?.rootPath || settingsStore.workDirRoot)
  const isReady = computed(() => !!activeWorkspace.value || settingsStore.isWorkspaceReady)

  const verifying = ref(false)
  const verifyResult = ref(null)
  const showChangeModeModal = ref(false)
  const showMigrateModal = ref(false)
  const showRestartPrompt = ref(false)
  const showRestartModal = ref(false)
  const requiresImmediateRestart = ref(false)
  const pendingNewPath = ref('')
  const pendingWorkspaceName = ref('')
  const migrating = ref(false)
  const migrateResult = ref(null)
  const restarting = ref(false)
  const cleaningMigration = ref(false)
  const canCleanupFailedMigration = computed(() => !!pendingNewPath.value && migrateResult.value?.ok === false)

  function basename(filePath) {
    return String(filePath || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '新授权根目录'
  }

  async function relaunchApp() {
    restarting.value = true
    try {
      const result = await window.electronAPI?.relaunch?.()
      if (result?.error) throw new Error(result.error)
    } catch (error) {
      restarting.value = false
      verifyResult.value = { ok: false, message: error.message || '应用重启失败' }
    }
  }

  function dismissRestartPrompt() {
    if (requiresImmediateRestart.value) return
    showRestartPrompt.value = false
    showRestartModal.value = false
  }

  function showRestartConfirmation({ required = false } = {}) {
    requiresImmediateRestart.value = required
    showRestartPrompt.value = true
    showRestartModal.value = true
  }

  function selectNewDir() {
    showChangeModeModal.value = true
  }

  function firstTimeSetup() {
    showChangeModeModal.value = true
  }

  async function chooseDirectory(title) {
    const result = await window.electronAPI?.workspace?.selectDirectory({ title })
    if (!result || result.canceled) return ''
    if (result.error) verifyResult.value = { ok: false, message: result.error }
    return result.path || ''
  }

  async function createIndependentWorkspace() {
    showChangeModeModal.value = false
    const rootPath = await chooseDirectory('选择新的授权根目录（工作空间）')
    if (!rootPath) return
    const name = await messageBox.prompt({
      title: '新建独立授权根目录',
      message: '该目录将拥有独立的模型配置、Agent、对话、文档和笔记。请选择一个空目录。',
      inputValue: basename(rootPath),
      inputPlaceholder: '工作空间名称',
      confirmText: '确认新建',
      cancelText: '取消',
    })
    if (!name?.trim()) return
    try {
      const hadActiveWorkspace = !!activeWorkspace.value
      const result = await settingsStore.createWorkspace({ rootPath, name: name.trim() })
      if (!result?.success) {
        verifyResult.value = { ok: false, message: result?.error || '新建授权根目录失败' }
        return
      }
      verifyResult.value = { ok: true, message: `已添加独立授权根目录：${rootPath}` }
      showRestartConfirmation({ required: !hadActiveWorkspace })
    } catch (error) {
      verifyResult.value = { ok: false, message: error.message || '新建授权根目录失败' }
    }
  }

  async function openExistingWorkspace() {
    showChangeModeModal.value = false
    const rootPath = await chooseDirectory('选择已有授权根目录（工作空间）')
    if (!rootPath) return
    const confirmed = await messageBox.confirm({
      title: '打开已有授权根目录',
      message: `验证并添加以下授权根目录：\n${rootPath}`,
      confirmText: '验证并添加',
      cancelText: '取消',
      icon: 'ri-folder-open-line',
    })
    if (!confirmed) return
    try {
      const hadActiveWorkspace = !!activeWorkspace.value
      const result = await settingsStore.openWorkspace({ rootPath })
      if (!result?.success) {
        verifyResult.value = { ok: false, message: result?.error || '打开授权根目录失败' }
        return
      }
      verifyResult.value = { ok: true, message: result.pendingRestart ? '授权根目录已添加，重启后切换' : '当前已是该授权根目录' }
      if (result.pendingRestart) showRestartConfirmation({ required: !hadActiveWorkspace })
    } catch (error) {
      verifyResult.value = { ok: false, message: error.message || '打开授权根目录失败' }
    }
  }

  async function prepareMigration() {
    showChangeModeModal.value = false
    if (!activeWorkspace.value) return
    const rootPath = await chooseDirectory('选择完整迁移目标目录')
    if (!rootPath) return
    pendingNewPath.value = rootPath
    pendingWorkspaceName.value = `${activeWorkspace.value.name} 副本`
    migrateResult.value = null
    showMigrateModal.value = true
  }

  async function confirmMigration() {
    migrating.value = true
    migrateResult.value = null
    try {
      const result = await settingsStore.migrateWorkspace({
        targetRoot: pendingNewPath.value,
        name: pendingWorkspaceName.value,
      })
      if (!result?.success) throw new Error(result?.error || '完整迁移失败')
      migrateResult.value = { ok: true, message: '授权根目录已完整迁移，新旧目录彼此独立' }
      verifyResult.value = { ok: true, message: `已完整迁移至 ${pendingNewPath.value}` }
      showMigrateModal.value = false
      showRestartConfirmation()
    } catch (error) {
      migrateResult.value = { ok: false, message: error.message }
    } finally {
      migrating.value = false
    }
  }

  async function cleanupFailedMigration() {
    if (!canCleanupFailedMigration.value || cleaningMigration.value) return
    const confirmed = await messageBox.confirm({
      title: '清理未完成迁移',
      message: `将删除本次失败迁移在目标目录中创建的 docs、notes、wikis、agents、skills 和 .reviva 数据：\n${pendingNewPath.value}`,
      confirmText: '确认清理',
      cancelText: '取消',
      danger: true,
      icon: 'ri-delete-bin-line',
    })
    if (!confirmed) return
    cleaningMigration.value = true
    try {
      const result = await settingsStore.cleanupFailedWorkspaceMigration(pendingNewPath.value)
      if (!result?.success) throw new Error(result?.error || '清理失败')
      migrateResult.value = null
      verifyResult.value = { ok: true, message: '失败迁移产生的目录已清理，可以重新迁移' }
    } catch (error) {
      migrateResult.value = { ok: false, message: error.message }
    } finally {
      cleaningMigration.value = false
    }
  }

  function cancelMigration() {
    if (migrating.value || cleaningMigration.value) return
    showMigrateModal.value = false
    pendingNewPath.value = ''
    migrateResult.value = null
  }

  async function switchWorkspace(workspace) {
    const confirmed = await messageBox.confirm({
      title: '切换授权根目录',
      message: `确定切换到“${workspace.name}”吗？当前任务仍使用现目录，重启应用后正式生效。`,
      confirmText: '确认切换',
      cancelText: '取消',
      icon: 'ri-arrow-left-right-line',
    })
    if (!confirmed) return
    try {
      const result = await settingsStore.switchWorkspace(workspace.id)
      if (!result?.success) {
        verifyResult.value = { ok: false, message: result?.error || '切换失败' }
        return
      }
      showRestartConfirmation()
    } catch (error) {
      verifyResult.value = { ok: false, message: error.message || '切换失败' }
    }
  }

  async function cancelPendingSwitch() {
    try {
      const result = await settingsStore.cancelWorkspaceSwitch()
      if (result?.success) {
        requiresImmediateRestart.value = false
        showRestartPrompt.value = false
        showRestartModal.value = false
        verifyResult.value = { ok: true, message: '已取消待切换授权根目录' }
      }
    } catch (error) {
      verifyResult.value = { ok: false, message: error.message || '取消切换失败' }
    }
  }

  async function verify() {
    verifying.value = true
    verifyResult.value = null
    try {
      await settingsStore.loadWorkspaceState()
      const current = settingsStore.workspaceState.activeWorkspace
      verifyResult.value = current?.available === false
        ? { ok: false, message: current.error || '授权根目录验证失败' }
        : { ok: !!current, message: current ? '授权根目录验证通过' : '尚未配置授权根目录' }
    } catch (error) {
      verifyResult.value = { ok: false, message: error.message }
    } finally {
      verifying.value = false
    }
  }

  onMounted(async () => {
    try {
      await settingsStore.loadWorkspaceState()
      const state = settingsStore.workspaceState
      showRestartPrompt.value = !!state.pendingWorkspace
      requiresImmediateRestart.value = !!state.pendingWorkspace && !state.activeWorkspace
    } catch (error) {
      verifyResult.value = { ok: false, message: error.message || '加载授权根目录状态失败' }
    }
  })

  return {
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
  }
}
