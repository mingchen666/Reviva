// src/electron/index.js
// Wrapper for the Electron API exposed via preload

const api = window.electronAPI || {}

export const isElectron = !!window.electronAPI

export async function openDirectory() {
  return api.openDirectory?.() ?? null
}

export async function openFile(options) {
  return api.openFile?.(options) ?? []
}

export async function readFile(filePath, options) {
  return api.readFile?.(filePath, options) ?? { success: false, error: 'Not in Electron' }
}

export async function writeFile(filePath, content, options) {
  return api.writeFile?.(filePath, content, options) ?? { success: false, error: 'Not in Electron' }
}

export async function listDir(dirPath, options) {
  return api.listDir?.(dirPath, options) ?? { success: false, error: 'Not in Electron' }
}

export async function renameFile(oldPath, newPath) {
  return api.rename?.(oldPath, newPath) ?? { success: false, error: 'Not in Electron' }
}

export async function deleteFile(filePath) {
  return api.deleteFile?.(filePath) ?? { success: false, error: 'Not in Electron' }
}

export async function pathExists(filePath) {
  return api.exists?.(filePath) ?? false
}

export async function getFileStat(filePath) {
  return api.stat?.(filePath) ?? { success: false, error: 'Not in Electron' }
}

export async function openInDefault(filePath) {
  return api.openPath?.(filePath)
}

export async function showInFolder(filePath) {
  return api.showItemInFolder?.(filePath)
}

export async function getAppVersion() {
  return api.getVersion?.() ?? '0.0.0'
}

export async function getAppPath(name) {
  return api.getPath?.(name) ?? ''
}
