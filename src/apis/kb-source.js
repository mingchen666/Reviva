// src/apis/kb-source.js
// Frontend API wrapper for knowledge source management (KBP)

const api = () => window.electronAPI?.kb

export async function listSources() {
  return api()?.listSources() ?? []
}

export async function getSource(id) {
  return api()?.getSource(id) ?? null
}

export async function addSource(data) {
  return api()?.addSource(data) ?? null
}

export async function updateSource(id, data) {
  return api()?.updateSource(id, data) ?? null
}

export async function deleteSource(id) {
  return api()?.deleteSource(id) ?? { success: false }
}

export async function testConnection(id) {
  return api()?.testConnection(id) ?? { success: false, error: 'Not in Electron' }
}

export async function search(id, params) {
  return api()?.search(id, params) ?? { status: 'error', message: 'Not in Electron' }
}

export async function getPresets() {
  return api()?.getPresets() ?? []
}

export async function getPresetConfig(presetName, userValues) {
  return api()?.getPresetConfig(presetName, userValues) ?? null
}

export async function getActiveSourceId() {
  return api()?.getActiveSourceId() ?? ''
}

export async function setActiveSource(id) {
  return api()?.setActiveSource(id) ?? { success: false }
}

export async function analyzeRequestResponse(params) {
  return api()?.analyzeRequestResponse(params) ?? { success: false, error: 'Not in Electron' }
}

export async function fetchKnowledgeBases(presetName, userValues) {
  return api()?.fetchKnowledgeBases(presetName, userValues) ?? { success: false, error: 'Not in Electron' }
}

export async function listKnowledgeBases(sourceId) {
  return api()?.listKnowledgeBases(sourceId) ?? { success: false, error: 'Not in Electron' }
}
