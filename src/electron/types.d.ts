export {}

declare global {
  interface Window {
    __REVIVA_WORKSPACE_ID__?: string
    electronAPI: {
      openDirectory: () => Promise<string | null>
      openFile: (options?: any) => Promise<string[]>
      readFile: (filePath: string, options?: any) => Promise<{ success: boolean; data?: string; error?: string }>
      writeFile: (filePath: string, content: string, options?: any) => Promise<{ success: boolean; error?: string }>
      listDir: (dirPath: string, options?: any) => Promise<{ success: boolean; data?: any[]; error?: string }>
      rename: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
      deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
      exists: (filePath: string) => Promise<boolean>
      stat: (filePath: string) => Promise<{ success: boolean; data?: any; error?: string }>
      openPath: (filePath: string) => Promise<{ success: boolean; error?: string }>
      showItemInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>
      getVersion: () => Promise<string>
      getPath: (name: string) => Promise<string>
      theme?: {
        list: () => Promise<any>
        readCss: (id: string) => Promise<any>
        import: () => Promise<any>
        remove: (id: string) => Promise<any>
        openDirectory: () => Promise<any>
        readCustomCss: () => Promise<any>
        stageCustomCss: (css: string) => Promise<any>
        commitCustomCss: () => Promise<any>
        discardPendingCustomCss: () => Promise<any>
        resetCustomCss: () => Promise<any>
      }
      openExternal?: (url: string) => Promise<{ success: boolean; error?: string }>
      quit?: () => Promise<{ success: boolean; error?: string }>
      setStartup?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
      setMinimizeToTray?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
      setTrayIcon?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
      setTrayMenu?: (items: any[]) => Promise<{ ok: boolean; error?: string; items?: any[] }>
      onTrayNavigate?: (callback: (route: string) => void) => any
      removeTrayNavigateListener?: (handler: any) => void
      setSingleInstance?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
      workdir?: {
        init: (rootPath: string) => Promise<{ rootPath?: string; docsPath?: string; notesPath?: string; error?: string }>
        selectRoot: () => Promise<{ rootPath?: string; docsPath?: string; notesPath?: string; error?: string } | null>
        selectDir: () => Promise<{ path?: string; error?: string } | null>
        getStatus: () => Promise<{ initialized: boolean; rootPath?: string | null; docsPath?: string | null; notesPath?: string | null }>
      }
      workspace?: {
        list: () => Promise<any>
        getBootstrapState: () => Promise<any>
        selectDirectory: (options?: any) => Promise<{ path?: string; canceled?: boolean; error?: string }>
        create: (data: { rootPath: string; name?: string }) => Promise<any>
        open: (data: { rootPath: string }) => Promise<any>
        setPending: (id: string) => Promise<any>
        cancelPending: () => Promise<any>
        rename: (data: { id: string; name: string }) => Promise<any>
        remove: (id: string) => Promise<any>
        migrate: (data: { targetRoot: string; name?: string }) => Promise<any>
        cleanupFailedMigration: (targetRoot: string) => Promise<any>
        onMigrationProgress: (callback: (progress: any) => void) => any
        removeMigrationProgressListener: (handler: any) => void
      }
      skill?: {
        install: (skillId: string, data: any) => Promise<any>
        update: (skillId: string, data: any) => Promise<any>
        create: (skillId: string, data: any) => Promise<any>
        save: (skillId: string, data: any) => Promise<any>
        delete: (skillId: string, options?: any) => Promise<any>
        uninstall: (skillId: string) => Promise<any>
        listFiles: (skillId: string) => Promise<any>
        readFile: (skillId: string, relativePath: string) => Promise<any>
        writeFile: (skillId: string, relativePath: string, content: string) => Promise<any>
        pickImportSource: (type: 'zip' | 'folder' | 'skill') => Promise<any>
        importSource: (sessionId: string, options: any) => Promise<any>
        isInstalled: (skillId: string) => Promise<any>
        listBuiltin: () => Promise<any>
      }
      wiki?: {
        list: () => Promise<any>
        get: (id: string) => Promise<any>
        create: (data: any) => Promise<any>
        delete: (id: string) => Promise<any>
        listPages: (id: string) => Promise<any>
        readPage: (id: string, pagePath: string) => Promise<any>
        listSources: (id: string) => Promise<any>
        addSource: (id: string, data: any) => Promise<any>
        addNoteSource: (id: string, noteId: string) => Promise<any>
        reparseSource: (id: string, sourceId: string) => Promise<any>
        deleteSource: (id: string, sourceId: string) => Promise<any>
        listOcrProviders: () => Promise<any>
        createOcrProvider: (data: any) => Promise<any>
        updateOcrProvider: (providerId: string, data: any) => Promise<any>
        deleteOcrProvider: (providerId: string) => Promise<any>
        listOcrJobs: (id: string, sourceId?: string) => Promise<any>
        runOcr: (id: string, sourceId: string, providerId?: string) => Promise<any>
        getJobs: (id: string) => Promise<any>
        updateAgentConfig: (id: string, patch: any) => Promise<any>
        agentDraft: (req: any) => Promise<any>
        agentRun: (req: any) => Promise<any>
        wikiTool: (req: any) => Promise<any>
      }
      webImport?: {
        getSettings: () => Promise<any>
        saveSettings: (patch: any) => Promise<any>
        createJob: (data: any) => Promise<any>
        listJobs: (filters: any) => Promise<any>
        getJob: (id: string) => Promise<any>
        retryJob: (id: string) => Promise<any>
        deleteJob: (id: string) => Promise<any>
        clearFinishedJobs: (filters: any) => Promise<any>
        onJobUpdated: (callback: (job: any) => void) => any
        onNotification: (callback: (job: any) => void) => any
        removeJobUpdatedListener: (handler: any) => void
        removeNotificationListener: (handler: any) => void
      }
      learningMemory?: {
        getSettings: () => Promise<{ success: boolean; data?: any; error?: string }>
        updateSettings: (patch: any) => Promise<{ success: boolean; data?: any; error?: string }>
        getOverview: () => Promise<{ success: boolean; data?: any; error?: string }>
        getRuntimeStatus: () => Promise<{ success: boolean; data?: any; error?: string }>
        retractEvent: (traceId: string) => Promise<{ success: boolean; data?: any; error?: string }>
        clearAll: () => Promise<{ success: boolean; data?: any; error?: string }>
        onUpdated: (callback: (payload: any) => void) => (() => void)
        removeUpdatedListeners: () => void
      }
      db?: {
        noteFolders: any
        agents?: any
        skills?: any
        notes: {
          list: (folderId?: string) => Promise<any[]>
          get: (id: string) => Promise<any>
          create: (data: any) => Promise<any>
          update: (id: string, data: any) => Promise<any>
          delete: (id: string) => Promise<any>
        }
        settings?: any
      }
      recycleBin?: any
      translate?: {
        run: (req: {
          providerId?: string
          apiFormat?: string
          apiKey: string
          baseUrl: string
          modelId: string
          temperature?: number
          system?: string
          userMessage: string
        }) => Promise<{ success: boolean; text?: string; error?: string }>
      }
      onMainProcessMessage: (callback: (...args: any[]) => void) => void
    }
  }
}
