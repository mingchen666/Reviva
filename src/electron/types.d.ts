export {}

declare global {
  interface Window {
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
      openExternal?: (url: string) => Promise<{ success: boolean; error?: string }>
      quit?: () => Promise<{ success: boolean; error?: string }>
      setStartup?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
      setMinimizeToTray?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
      setTrayIcon?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
      setSingleInstance?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
      workdir?: {
        init: (rootPath: string) => Promise<{ rootPath?: string; docsPath?: string; notesPath?: string; error?: string }>
        selectRoot: () => Promise<{ rootPath?: string; docsPath?: string; notesPath?: string; error?: string } | null>
        selectDir: () => Promise<{ path?: string; error?: string } | null>
        getStatus: () => Promise<{ initialized: boolean; rootPath?: string | null; docsPath?: string | null; notesPath?: string | null }>
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
      db?: {
        noteFolders: any
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
      onMainProcessMessage: (callback: (...args: any[]) => void) => void
    }
  }
}
