// electron/preload.js — CJS format for Electron preload (must be CommonJS, not ESM)
const { contextBridge, ipcRenderer } = require('electron')

const api = {
  // Dialog
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),

  // File system
  readFile: (filePath, options) => ipcRenderer.invoke('fs:readFile', filePath, options),
  writeFile: (filePath, content, options) => ipcRenderer.invoke('fs:writeFile', filePath, content, options),
  listDir: (dirPath, options) => ipcRenderer.invoke('fs:listDir', dirPath, options),
  rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
  mkdir: (dirPath, options) => ipcRenderer.invoke('fs:mkdir', dirPath, options),
  removeDir: (dirPath) => ipcRenderer.invoke('fs:removeDir', dirPath),
  copyFile: (src, dest) => ipcRenderer.invoke('fs:copyFile', src, dest),
  exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),

  // Shell
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // App
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),
  clearCache: () => ipcRenderer.invoke('app:clearCache'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  quit: () => ipcRenderer.invoke('app:quit'),
  getDataSize: () => ipcRenderer.invoke('app:getDataSize'),
  getSysInfo: () => ipcRenderer.invoke('app:getSysInfo'),
  checkEnv: (keys) => ipcRenderer.invoke('env:check', keys),
  installPythonOfficeLibs: () => ipcRenderer.invoke('env:installPythonOfficeLibs'),
  exportSettings: () => ipcRenderer.invoke('app:exportSettings'),
  importSettings: (data) => ipcRenderer.invoke('app:importSettings', data),
  setStartup: (enabled) => ipcRenderer.invoke('app:setStartup', enabled),
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('app:setMinimizeToTray', enabled),
  setTrayIcon: (enabled) => ipcRenderer.invoke('app:setTrayIcon', enabled),
  setSingleInstance: (enabled) => ipcRenderer.invoke('app:setSingleInstance', enabled),
  notify: (opts) => ipcRenderer.invoke('app:notify', opts),
  playSound: (name) => ipcRenderer.invoke('app:playSound', name),

  // Window controls (frameless title bar on Win/Linux)
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChanged: (cb) => {
      const h = (_, v) => cb(v)
      ipcRenderer.on('window:maximizedChanged', h)
      return h
    },
    removeMaximizedListeners: () => ipcRenderer.removeAllListeners('window:maximizedChanged'),
  },
  platform: process.platform,

  // Event listeners
  onMainProcessMessage: (callback) => {
    ipcRenderer.on('main-process-message', (event, ...args) => callback(...args))
  },
  onPlaySound: (callback) => {
    ipcRenderer.on('play-sound', (event, ...args) => callback(...args))
  },

  // WorkDir
  workdir: {
    init: (rootPath) => ipcRenderer.invoke('workdir:init', rootPath),
    getStatus: () => ipcRenderer.invoke('workdir:getStatus'),
    selectRoot: () => ipcRenderer.invoke('workdir:selectRoot'),
    selectDir: () => ipcRenderer.invoke('workdir:selectDir'),
    getRoot: async () => {
      const s = await ipcRenderer.invoke('workdir:getStatus')
      return s?.rootPath || ''
    },
  },

  // Shortcuts
  shortcuts: {
    register: (bindings) => ipcRenderer.invoke('shortcuts:register', bindings),
  },

  // Recycle Bin (FS + DB combined)
  recycleBin: {
    moveToTrash: (itemPath, itemMeta) => ipcRenderer.invoke('recycleBin:moveToTrash', itemPath, itemMeta),
    trashConversation: (convId) => ipcRenderer.invoke('recycleBin:trashConversation', convId),
    trashNote: (noteId) => ipcRenderer.invoke('recycleBin:trashNote', noteId),
    trashNoteFolder: (folderId) => ipcRenderer.invoke('recycleBin:trashNoteFolder', folderId),
    trashArtifact: (artifactId, options) => ipcRenderer.invoke('recycleBin:trashArtifact', artifactId, options),
    restore: (trashId) => ipcRenderer.invoke('recycleBin:restore', trashId),
    restoreBatch: (trashIds) => ipcRenderer.invoke('recycleBin:restoreBatch', trashIds),
    deletePermanently: (trashId) => ipcRenderer.invoke('recycleBin:deletePermanently', trashId),
    deleteBatchPermanently: (trashIds) => ipcRenderer.invoke('recycleBin:deleteBatchPermanently', trashIds),
    emptyTrash: () => ipcRenderer.invoke('recycleBin:emptyTrash'),
  },

  // Models
  models: {
    fetchList: (providerId, apiKey, baseUrl, apiFormat) => ipcRenderer.invoke('models:fetchList', providerId, apiKey, baseUrl, apiFormat),
    testConnection: (providerId, apiKey, baseUrl, modelId, apiFormat) => ipcRenderer.invoke('models:testConnection', providerId, apiKey, baseUrl, modelId, apiFormat),
  },

  // Token Usage
  tokenUsage: {
    create: (data) => ipcRenderer.invoke('tokenUsage:create', data),
    summary: (range) => ipcRenderer.invoke('tokenUsage:summary', range),
    byModel: (range) => ipcRenderer.invoke('tokenUsage:byModel', range),
    byAgent: (range) => ipcRenderer.invoke('tokenUsage:byAgent', range),
    daily: (range) => ipcRenderer.invoke('tokenUsage:daily', range),
    cleanup: (beforeDate) => ipcRenderer.invoke('tokenUsage:cleanup', beforeDate),
  },

  // Logs
  logs: {
    read: (date, filters) => ipcRenderer.invoke('logs:read', date, filters),
    listDates: () => ipcRenderer.invoke('logs:listDates'),
    cleanup: (beforeDate) => ipcRenderer.invoke('logs:cleanup', beforeDate),
  },

  // Chat
  chat: {
    start: (req) => ipcRenderer.invoke('chat:start', req),
    cancel: (reqId) => ipcRenderer.invoke('chat:cancel', reqId),
    onStarted: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('chat:started', h); return h },
    onChunk: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('chat:chunk', h); return h },
    onDone: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('chat:done', h); return h },
    onError: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('chat:error', h); return h },
    onCancelled: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('chat:cancelled', h); return h },
    onAuthRequest: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('chat:authRequest', h); return h },
    respondAuth: (requestId, approved) => ipcRenderer.invoke('agent:authRespond', requestId, approved),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('chat:started')
      ipcRenderer.removeAllListeners('chat:chunk')
      ipcRenderer.removeAllListeners('chat:done')
      ipcRenderer.removeAllListeners('chat:error')
      ipcRenderer.removeAllListeners('chat:cancelled')
      ipcRenderer.removeAllListeners('chat:authRequest')
    },
  },

  // Agent (new Agent system IPC)
  agent: {
    startRun: (req) => ipcRenderer.invoke('agent:startRun', req),
    cancelRun: (runId) => ipcRenderer.invoke('agent:cancelRun', runId),
    executeTool: (req) => ipcRenderer.invoke('agent:executeTool', req),
    runSubAgent: (req) => ipcRenderer.invoke('agent:runSubAgent', req),
    compressContext: (req) => ipcRenderer.invoke('agent:compressContext', req),
    generateTitle: (req) => ipcRenderer.invoke('agent:generateTitle', req),
    getRunState: (runId) => ipcRenderer.invoke('agent:getRunState', runId),
    respondAuth: (requestId, approved) => ipcRenderer.invoke('agent:authRespond', requestId, approved),
    healthCheck: (agentIds, options) => ipcRenderer.invoke('agent:healthCheck', agentIds, options),
    // All streaming events (content, thinking, tool_start/end/error, subagent_start/chunk/end) flow through agent:chunk
    onChunk: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('agent:chunk', h); return h },
    onDone: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('agent:runDone', h); return h },
    onError: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('agent:runError', h); return h },
    onCancelled: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('agent:runCancelled', h); return h },
    onRunStarted: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('agent:runStarted', h); return h },
    onMaxIterations: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('agent:runMaxIterations', h); return h },
    onAuthRequest: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('agent:authRequest', h); return h },
    onArtifactsCreated: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('agent:artifactsCreated', h); return h },
    removeRunListeners: (requestId) => {
      ipcRenderer.removeAllListeners('agent:chunk')
      ipcRenderer.removeAllListeners('agent:runDone')
      ipcRenderer.removeAllListeners('agent:runError')
      ipcRenderer.removeAllListeners('agent:runCancelled')
      ipcRenderer.removeAllListeners('agent:runStarted')
      ipcRenderer.removeAllListeners('agent:runMaxIterations')
      ipcRenderer.removeAllListeners('agent:authRequest')
      ipcRenderer.removeAllListeners('agent:artifactsCreated')
    },
  },

  // Skill directory operations
  skill: {
    install: (skillId, skillData) => ipcRenderer.invoke('skill:install', skillId, skillData),
    uninstall: (skillId) => ipcRenderer.invoke('skill:uninstall', skillId),
    listFiles: (skillId) => ipcRenderer.invoke('skill:listFiles', skillId),
    readFile: (skillId, relativePath) => ipcRenderer.invoke('skill:readFile', skillId, relativePath),
    isInstalled: (skillId) => ipcRenderer.invoke('skill:isInstalled', skillId),
    listBuiltin: () => ipcRenderer.invoke('skill:listBuiltin'),
  },

  // MCP runtime operations (live connection test + sync)
  mcp: {
    testServer: (config) => ipcRenderer.invoke('mcp:testServer', config),
    syncServerTools: (serverId) => ipcRenderer.invoke('mcp:syncServerTools', serverId),
    syncServerCapabilities: (serverId) => ipcRenderer.invoke('mcp:syncServerCapabilities', serverId),
    readResource: (serverId, uri) => ipcRenderer.invoke('mcp:readResource', serverId, uri),
    getPrompt: (serverId, name, args) => ipcRenderer.invoke('mcp:getPrompt', serverId, name, args),
  },

  // PPTX export
  pptx: {
    exportLocal: (htmlPath, outputPath) => ipcRenderer.invoke('pptx:exportLocal', htmlPath, outputPath),
    exportCloud: (htmlPath, outputPath) => ipcRenderer.invoke('pptx:exportCloud', htmlPath, outputPath),
  },

  // Output scanning (filesystem-based)
  outputs: {
    scanAll: () => ipcRenderer.invoke('outputs:scanAll'),
    scanDateFiles: (agentDirName, date) => ipcRenderer.invoke('outputs:scanDateFiles', agentDirName, date),
    readFile: (virtualPath) => ipcRenderer.invoke('outputs:readFile', virtualPath),
  },

  // Local LLM Wiki workspace
  wiki: {
    list: () => ipcRenderer.invoke('wiki:list'),
    get: (id) => ipcRenderer.invoke('wiki:get', id),
    create: (data) => ipcRenderer.invoke('wiki:create', data),
    delete: (id) => ipcRenderer.invoke('wiki:delete', id),
    listPages: (id) => ipcRenderer.invoke('wiki:listPages', id),
    readPage: (id, pagePath) => ipcRenderer.invoke('wiki:readPage', id, pagePath),
    listSources: (id) => ipcRenderer.invoke('wiki:listSources', id),
    addSource: (id, data) => ipcRenderer.invoke('wiki:addSource', id, data),
    addNoteSource: (id, noteId) => ipcRenderer.invoke('wiki:addNoteSource', id, noteId),
    reparseSource: (id, sourceId) => ipcRenderer.invoke('wiki:reparseSource', id, sourceId),
    deleteSource: (id, sourceId) => ipcRenderer.invoke('wiki:deleteSource', id, sourceId),
    listOcrProviders: () => ipcRenderer.invoke('wiki:listOcrProviders'),
    createOcrProvider: (data) => ipcRenderer.invoke('wiki:createOcrProvider', data),
    updateOcrProvider: (providerId, data) => ipcRenderer.invoke('wiki:updateOcrProvider', providerId, data),
    deleteOcrProvider: (providerId) => ipcRenderer.invoke('wiki:deleteOcrProvider', providerId),
    listOcrJobs: (id, sourceId) => ipcRenderer.invoke('wiki:listOcrJobs', id, sourceId),
    runOcr: (id, sourceId, providerId) => ipcRenderer.invoke('wiki:runOcr', id, sourceId, providerId),
    getJobs: (id) => ipcRenderer.invoke('wiki:getJobs', id),
    updateAgentConfig: (id, patch) => ipcRenderer.invoke('wiki:updateAgentConfig', id, patch),
    agentDraft: (req) => ipcRenderer.invoke('wiki:agentDraft', req),
    agentRun: (req) => ipcRenderer.invoke('wiki:agentRun', req),
    wikiTool: (req) => ipcRenderer.invoke('wiki:tool', req),
  },

  // Generation Tasks (async creation jobs — mindmap / graph / podcast / etc.)
  genTasks: {
    create: (req) => ipcRenderer.invoke('genTask:create', req),
    cancel: (taskId) => ipcRenderer.invoke('genTask:cancel', taskId),
    pollCloud: (taskId) => ipcRenderer.invoke('genTask:pollCloud', taskId),
    onProgress: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('genTask:progress', h); return h },
    onCompleted: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('genTask:completed', h); return h },
    onFailed: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('genTask:failed', h); return h },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('genTask:progress')
      ipcRenderer.removeAllListeners('genTask:completed')
      ipcRenderer.removeAllListeners('genTask:failed')
    },
  },

  // Database API
  db: {
    // Spaces
    spaces: {
      list: () => ipcRenderer.invoke('db:spaces:list'),
      get: (id) => ipcRenderer.invoke('db:spaces:get', id),
      create: (data) => ipcRenderer.invoke('db:spaces:create', data),
      update: (id, data) => ipcRenderer.invoke('db:spaces:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:spaces:delete', id),
      docCount: (id) => ipcRenderer.invoke('db:spaces:docCount', id),
    },
    // Documents
    docs: {
      list: (spaceId) => ipcRenderer.invoke('db:docs:list', spaceId),
      create: (data) => ipcRenderer.invoke('db:docs:create', data),
      update: (id, data) => ipcRenderer.invoke('db:docs:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:docs:delete', id),
    },
    // Conversations
    convs: {
      list: (spaceId, groupId) => ipcRenderer.invoke('db:convs:list', spaceId, groupId),
      get: (id) => ipcRenderer.invoke('db:convs:get', id),
      create: (data) => ipcRenderer.invoke('db:convs:create', data),
      update: (id, data) => ipcRenderer.invoke('db:convs:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:convs:delete', id),
    },
    // Conversation Groups
    convGroups: {
      list: () => ipcRenderer.invoke('db:convGroups:list'),
      create: (data) => ipcRenderer.invoke('db:convGroups:create', data),
      update: (id, data) => ipcRenderer.invoke('db:convGroups:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:convGroups:delete', id),
    },
    // Messages
    msgs: {
      list: (convId) => ipcRenderer.invoke('db:msgs:list', convId),
      listPaginated: (convId, limit, offset) => ipcRenderer.invoke('db:msgs:listPaginated', convId, limit, offset),
      count: (convId) => ipcRenderer.invoke('db:msgs:count', convId),
      create: (data) => ipcRenderer.invoke('db:msgs:create', data),
      update: (id, data) => ipcRenderer.invoke('db:msgs:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:msgs:delete', id),
    },
    // Agents
    agents: {
      list: () => ipcRenderer.invoke('db:agents:list'),
      get: (id) => ipcRenderer.invoke('db:agents:get', id),
      create: (data) => ipcRenderer.invoke('db:agents:create', data),
      update: (id, data) => ipcRenderer.invoke('db:agents:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:agents:delete', id),
      isEnglishNameUnique: (englishName, excludeId) => ipcRenderer.invoke('db:agents:isEnglishNameUnique', englishName, excludeId),
    },
    // Skills
    skills: {
      list: () => ipcRenderer.invoke('db:skills:list'),
      create: (data) => ipcRenderer.invoke('db:skills:create', data),
      update: (id, data) => ipcRenderer.invoke('db:skills:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:skills:delete', id),
    },
    // Tools
    tools: {
      list: () => ipcRenderer.invoke('db:tools:list'),
      create: (data) => ipcRenderer.invoke('db:tools:create', data),
      update: (id, data) => ipcRenderer.invoke('db:tools:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:tools:delete', id),
    },
    // MCP Servers (remote URL-based MCP integrations)
    mcpServers: {
      list: () => ipcRenderer.invoke('db:mcpServers:list'),
      get: (id) => ipcRenderer.invoke('db:mcpServers:get', id),
      create: (data) => ipcRenderer.invoke('db:mcpServers:create', data),
      update: (id, data) => ipcRenderer.invoke('db:mcpServers:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:mcpServers:delete', id),
    },
    // Sub Agents
    subAgents: {
      list: () => ipcRenderer.invoke('db:subAgents:list'),
      create: (data) => ipcRenderer.invoke('db:subAgents:create', data),
      update: (id, data) => ipcRenderer.invoke('db:subAgents:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:subAgents:delete', id),
    },
    // Tasks
    tasks: {
      list: () => ipcRenderer.invoke('db:tasks:list'),
      listByGroup: (groupId, toolIds) => ipcRenderer.invoke('db:tasks:listByGroup', groupId, toolIds),
      get: (id) => ipcRenderer.invoke('db:tasks:get', id),
      create: (data) => ipcRenderer.invoke('db:tasks:create', data),
      update: (id, data) => ipcRenderer.invoke('db:tasks:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:tasks:delete', id),
    },
    // Outputs
    outputs: {
      list: () => ipcRenderer.invoke('db:outputs:list'),
      create: (data) => ipcRenderer.invoke('db:outputs:create', data),
      delete: (id) => ipcRenderer.invoke('db:outputs:delete', id),
    },
    // Artifacts
    artifacts: {
      listByGroup: (groupId) => ipcRenderer.invoke('db:artifacts:listByGroup', groupId),
      create: (data) => ipcRenderer.invoke('db:artifacts:create', data),
      delete: (id) => ipcRenderer.invoke('db:artifacts:delete', id),
      update: (id, data) => ipcRenderer.invoke('db:artifacts:update', id, data),
    },
    // Settings
    settings: {
      get: (key) => ipcRenderer.invoke('db:settings:get', key),
      set: (key, value) => ipcRenderer.invoke('db:settings:set', key, value),
      getAll: () => ipcRenderer.invoke('db:settings:getAll'),
    },
    // Memories
    memories: {
      list: () => ipcRenderer.invoke('db:memories:list'),
      create: (data) => ipcRenderer.invoke('db:memories:create', data),
      update: (id, data) => ipcRenderer.invoke('db:memories:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:memories:delete', id),
    },
    // Trash (DB queries)
    trash: {
      list: () => ipcRenderer.invoke('db:trash:list'),
      listByCategory: (category) => ipcRenderer.invoke('db:trash:listByCategory', category),
      get: (id) => ipcRenderer.invoke('db:trash:get', id),
      create: (data) => ipcRenderer.invoke('db:trash:create', data),
      delete: (id) => ipcRenderer.invoke('db:trash:delete', id),
      deleteBatch: (ids) => ipcRenderer.invoke('db:trash:deleteBatch', ids),
      empty: () => ipcRenderer.invoke('db:trash:empty'),
      count: () => ipcRenderer.invoke('db:trash:count'),
    },
    // Token Usage (DB queries)
    tokenUsage: {
      create: (data) => ipcRenderer.invoke('db:tokenUsage:create', data),
      list: (filters) => ipcRenderer.invoke('db:tokenUsage:list', filters),
      summary: (range) => ipcRenderer.invoke('db:tokenUsage:summary', range),
      byModel: (range) => ipcRenderer.invoke('db:tokenUsage:byModel', range),
      byAgent: (range) => ipcRenderer.invoke('db:tokenUsage:byAgent', range),
      daily: (range) => ipcRenderer.invoke('db:tokenUsage:daily', range),
      cleanup: (beforeDate) => ipcRenderer.invoke('db:tokenUsage:cleanup', beforeDate),
    },
    // Agent Runs (DB queries)
    agentRuns: {
      create: (data) => ipcRenderer.invoke('db:agentRuns:create', data),
      get: (id) => ipcRenderer.invoke('db:agentRuns:get', id),
      update: (id, data) => ipcRenderer.invoke('db:agentRuns:update', id, data),
      listByConv: (convId) => ipcRenderer.invoke('db:agentRuns:listByConv', convId),
      listByAgent: (agentId) => ipcRenderer.invoke('db:agentRuns:listByAgent', agentId),
      delete: (id) => ipcRenderer.invoke('db:agentRuns:delete', id),
    },
    // Note Folders
    noteFolders: {
      list: (parentId) => ipcRenderer.invoke('db:noteFolders:list', parentId),
      get: (id) => ipcRenderer.invoke('db:noteFolders:get', id),
      create: (data) => ipcRenderer.invoke('db:noteFolders:create', data),
      update: (id, data) => ipcRenderer.invoke('db:noteFolders:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:noteFolders:delete', id),
    },
    // Notes
    notes: {
      list: (folderId) => ipcRenderer.invoke('db:notes:list', folderId),
      get: (id) => ipcRenderer.invoke('db:notes:get', id),
      create: (data) => ipcRenderer.invoke('db:notes:create', data),
      update: (id, data) => ipcRenderer.invoke('db:notes:update', id, data),
      delete: (id) => ipcRenderer.invoke('db:notes:delete', id),
    },
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onChecking: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('update:checking', h); return h },
    onAvailable: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('update:available', h); return h },
    onNotAvailable: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('update:not-available', h); return h },
    onProgress: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('update:progress', h); return h },
    onDownloaded: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('update:downloaded', h); return h },
    onError: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('update:error', h); return h },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('update:checking')
      ipcRenderer.removeAllListeners('update:available')
      ipcRenderer.removeAllListeners('update:not-available')
      ipcRenderer.removeAllListeners('update:progress')
      ipcRenderer.removeAllListeners('update:downloaded')
      ipcRenderer.removeAllListeners('update:error')
    },
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
