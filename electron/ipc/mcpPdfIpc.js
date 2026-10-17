import path from 'node:path'
import { PdfReadService } from '../tools/pdf/PdfReadService.js'
import { PdfTextExtractor } from '../tools/pdf/PdfTextExtractor.js'
import { PDF_READ_SETTINGS_KEY, normalizePdfReadSettings } from '../tools/pdf/PdfReadSettings.js'

export function registerMcpPdfIpc(ipcMain, deps) {
  const { mcpService, dbService, validateFsPath, toWorkspaceVirtualPath } = deps

  function pdfService() {
    return new PdfReadService({ workDirService: deps.workDirService, dbService })
  }

  // ─── MCP Server runtime IPC ───
  ipcMain.handle('mcp:testServer', async (_, config) => {
    try {
      return await mcpService.testServer(config)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:syncServerTools', async (_, serverId) => {
    try {
      return await mcpService.syncServerTools(serverId)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:syncServerCapabilities', async (_, serverId) => {
    try {
      return await mcpService.syncServerTools(serverId)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:readResource', async (_, serverId, uri) => {
    try {
      return await mcpService.readResource(serverId, uri)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:getPrompt', async (_, serverId, name, args) => {
    try {
      return await mcpService.getPrompt(serverId, name, args)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ─── PDF IPC ───
  ipcMain.handle('pdf:preflight', async (event, filePath, options = {}) => {
    try {
      const inputPath = validateFsPath(filePath)
      if (path.extname(inputPath).toLowerCase() !== '.pdf') return { success: false, error: 'Only PDF files can be preflighted' }
      const result = await pdfService().read({
        inputPath,
        virtualPath: toWorkspaceVirtualPath(inputPath),
        mode: 'overview',
        maxPages: options.maxPages || 5,
        maxChars: options.maxChars || 40000,
        sourceInfo: options.sourceInfo || { origin: 'docs' },
      })
      return result
    } catch (err) {
      return { success: false, error: err.message, code: 'PDF_PREFLIGHT_FAILED' }
    }
  })

  ipcMain.handle('pdf:getSettings', async () => {
    try {
      return { success: true, data: normalizePdfReadSettings(dbService?.getSetting?.(PDF_READ_SETTINGS_KEY) || {}) }
    } catch (err) {
      return { success: false, error: err.message, code: 'PDF_SETTINGS_GET_FAILED' }
    }
  })

  ipcMain.handle('pdf:setSettings', async (event, settings = {}) => {
    try {
      const normalized = normalizePdfReadSettings(settings)
      dbService?.setSetting?.(PDF_READ_SETTINGS_KEY, normalized)
      return { success: true, data: normalized }
    } catch (err) {
      return { success: false, error: err.message, code: 'PDF_SETTINGS_SET_FAILED' }
    }
  })

  ipcMain.handle('pdf:checkEnvironment', async () => {
    try {
      const textExtractor = new PdfTextExtractor()
      return await textExtractor.checkEnvironment()
    } catch (err) {
      return { success: false, error: err.message, code: 'PDF_ENV_CHECK_FAILED' }
    }
  })

  ipcMain.handle('pdf:getStatus', async (event, filePath, options = {}) => {
    try {
      const inputPath = validateFsPath(filePath)
      const result = await pdfService().read({
        inputPath,
        virtualPath: toWorkspaceVirtualPath(inputPath),
        mode: 'metadata',
        probe: options?.probe !== false,
      })
      return result
    } catch (err) {
      return { success: false, error: err.message, code: 'PDF_STATUS_FAILED' }
    }
  })

  ipcMain.handle('pdf:startOcr', async (event, filePath, options = {}) => {
    try {
      const inputPath = validateFsPath(filePath)
      const explicitPageSelection = Array.isArray(options.pages) && options.pages.length > 0
        || options.startPage !== undefined
        || options.maxPages !== undefined
      const result = await pdfService().read({
        inputPath,
        virtualPath: toWorkspaceVirtualPath(inputPath),
        mode: 'ocr',
        pages: Array.isArray(options.pages) ? options.pages : [],
        startPage: options.startPage || 1,
        maxPages: options.maxPages || 5,
        explicitPageSelection,
        provider: options.provider || 'auto',
        confirmFull: !!options.confirmFull,
        fullDocument: !!options.fullDocument,
        sourceInfo: options.sourceInfo || { origin: 'docs' },
      })
      return result
    } catch (err) {
      return { success: false, error: err.message, code: 'PDF_OCR_START_FAILED' }
    }
  })

  ipcMain.handle('pdf:listImages', async (event, filePath, options = {}) => {
    try {
      const inputPath = validateFsPath(filePath)
      const result = await pdfService().read({
        inputPath,
        virtualPath: toWorkspaceVirtualPath(inputPath),
        mode: 'images',
        startPage: options.startPage || 1,
        maxPages: options.maxPages || 5,
        maxImages: options.maxImages || 50,
      })
      return result
    } catch (err) {
      return { success: false, error: err.message, code: 'PDF_IMAGES_FAILED' }
    }
  })

  // ─── Outputs Scan ───
  const { outputScanService, pptxExportService } = deps

  ipcMain.handle('outputs:scanAll', async () => {
    try {
      return await outputScanService.scanAll()
    } catch (err) {
      console.error('[OutputScan] scanAll error:', err.message)
      return []
    }
  })

  ipcMain.handle('outputs:scanDateFiles', async (_, agentDirName, date) => {
    try {
      return await outputScanService.scanDateFiles(agentDirName, date)
    } catch (err) {
      console.error('[OutputScan] scanDateFiles error:', err.message)
      return []
    }
  })

  ipcMain.handle('outputs:readFile', async (_, virtualPath) => {
    try {
      return await outputScanService.readOutputFile(virtualPath)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ─── PPTX Export ───
  ipcMain.handle('pptx:exportLocal', async (_, htmlPath, outputPath) => {
    try {
      return await pptxExportService.exportLocal(htmlPath, outputPath)
    } catch (err) {
      console.error('[PptxExport] exportLocal error:', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('pptx:exportCloud', async (_, htmlPath, outputPath) => {
    try {
      return await pptxExportService.exportCloud(htmlPath, outputPath)
    } catch (err) {
      console.error('[PptxExport] exportCloud error:', err.message)
      return { success: false, error: err.message }
    }
  })
}
