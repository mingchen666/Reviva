import { ref, computed } from 'vue'

export function useRename({ selectedItem, selectedFile, loadDirectory, loadFolderTree }) {
  const api = () => window.electronAPI

  const showRenameModal = ref(false)
  const renameItem = ref(null)
  const renameValue = ref('')
  const renameError = ref('')

  function splitEditableName(name = '', isDirectory = false) {
    const value = String(name || '')
    if (isDirectory) return { base: value, ext: '' }
    const dot = value.lastIndexOf('.')
    if (dot <= 0) return { base: value, ext: '' }
    return { base: value.slice(0, dot), ext: value.slice(dot) }
  }

  function dirnameOfPath(filePath = '') {
    const value = String(filePath || '')
    const slash = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
    return slash >= 0 ? value.slice(0, slash) : ''
  }

  function joinPathName(dir = '', name = '') {
    const base = String(dir || '').replace(/[\\/]+$/, '')
    const sep = base.includes('\\') ? '\\' : '/'
    return `${base}${sep}${name}`
  }

  const renameExtension = computed(() => splitEditableName(renameItem.value?.name, renameItem.value?.isDirectory).ext)

  function normalizedRenameBaseName() {
    let value = String(renameValue.value || '').trim()
    const ext = renameExtension.value
    if (ext && value.toLowerCase().endsWith(ext.toLowerCase())) {
      value = value.slice(0, -ext.length).trim()
    }
    return value
  }

  const renameTargetName = computed(() => {
    const base = normalizedRenameBaseName()
    return renameItem.value?.isDirectory ? base : `${base}${renameExtension.value}`
  })

  const renameValidationMessage = computed(() => {
    if (!renameItem.value) return ''
    const base = normalizedRenameBaseName()
    if (!base) return '名称不能为空'
    if (/[\\/:*?"<>|]/.test(base)) return '名称不能包含 \\ / : * ? " < > |'
    if (!renameItem.value.isDirectory && !renameExtension.value && base.lastIndexOf('.') > 0) return '不能新增文件扩展名'
    if (renameTargetName.value === renameItem.value.name) return '名称未变化'
    return ''
  })

  const renameCanSubmit = computed(() => !!renameItem.value && !renameValidationMessage.value)

  const renameFeedbackText = computed(() => {
    if (renameError.value) return renameError.value
    if (!String(renameValue.value || '').trim()) return renameValidationMessage.value
    if (renameValidationMessage.value === '名称未变化') return ''
    return renameValidationMessage.value
  })

  function openRenameModal(item) {
    renameItem.value = item
    renameValue.value = splitEditableName(item.name, item.isDirectory).base
    renameError.value = ''
    showRenameModal.value = true
  }

  async function confirmRename() {
    renameError.value = ''
    if (!renameItem.value) return false
    if (!renameCanSubmit.value) {
      renameError.value = renameValidationMessage.value
      return false
    }
    const oldPath = renameItem.value.path
    if (!oldPath) {
      renameError.value = '缺少原文件路径'
      return false
    }
    const newName = renameTargetName.value
    const dir = dirnameOfPath(oldPath)
    const newPath = joinPathName(dir, newName)
    const result = await api()?.rename?.(oldPath, newPath)
    if (result?.success) {
      if (selectedItem.value?.path === oldPath) {
        selectedItem.value = { ...selectedItem.value, path: newPath, name: newName }
      }
      if (selectedFile.value?.path === oldPath) {
        selectedFile.value = { ...selectedFile.value, path: newPath, name: newName }
      }
      renameItem.value = null
      renameValue.value = ''
      renameError.value = ''
      showRenameModal.value = false
      loadDirectory()
      loadFolderTree()
      return true
    }
    renameError.value = result?.error || '重命名失败'
    return false
  }

  return {
    showRenameModal,
    renameItem,
    renameValue,
    renameError,
    renameExtension,
    renameTargetName,
    renameValidationMessage,
    renameCanSubmit,
    renameFeedbackText,
    splitEditableName,
    dirnameOfPath,
    joinPathName,
    openRenameModal,
    confirmRename,
  }
}
