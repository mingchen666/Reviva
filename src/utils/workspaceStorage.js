export function getWorkspaceStorageKey(key) {
  const workspaceId = window.__REVIVA_WORKSPACE_ID__ || 'unconfigured'
  return `workspace:${workspaceId}:${key}`
}
