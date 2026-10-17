import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { normalizeCreationToolPreferences } from '@/config/creationTools'
import { encodeModelRef, parseModelRef } from '@/utils/modelRef'
import { BUILTIN_THEMES, getBuiltinTheme, resolveThemeColorMode } from '@/config/themes'

import {
  ACCENT_PRESETS,
  normalizeProviderApiFormat,
  DEFAULT_PROVIDERS,
  DEFAULT_DEFAULT_MODELS,
} from './constants'

import {
  providerConfigured,
  _sanitizeAnswerStyle,
  _sanitizeChatNavigationStyle,
  hexToRgb, darkenHex, mixHex, buildAccentScale, rgbStr,
  _findModelRef,
  _mergeBuiltinProviders,
  _sanitizeDefaultModels,
  normalizeWikiWebResearchSettings,
} from './utils'
let _systemThemeListener = null

export const useSettingsStore = defineStore('settings', () => {
  // ─── Workspace ───
  const workDirRoot = ref('')
  const isWorkspaceReady = computed(() => !!workDirRoot.value)
  const workspaceState = ref({
    activeWorkspaceId: null,
    pendingWorkspaceId: null,
    activeWorkspace: null,
    pendingWorkspace: null,
    workspaces: [],
    startupError: '',
  })

  // ─── Preferences ───
  const themeId = ref('default')
  const themeMode = ref('light')
  const accentColor = ref('theme')
  const userThemes = ref([])
  const themeLoadErrors = ref([])
  const themesLoading = ref(false)
  const customCss = ref('')
  const pendingCustomCss = ref('')
  const customCssPreviewing = ref(false)
  const customCssBusy = ref(false)
  const customCssSecondsRemaining = ref(0)
  const customAccentHex = ref('#4A6CFF')
  const fontSize = ref('medium')
  const langPref = ref('zh')
  const animations = ref(true)
  const reducedMotion = ref(false)
  const answerStyle = ref('default')
  const conflictStrategy = ref('ask')
  const quickInputEnabled = ref(false)
  const creationToolPreferences = ref(normalizeCreationToolPreferences())
  const agentSkillsPanelEnabled = ref(false)
  const chatNavigationEnabled = ref(true)
 const chatNavigationStyle = ref('directory')
 const kbMode = ref('external') // 'external' | 'cloud' — 对话默认使用的知识库类型

  // Chat Toolbar Visibility - Agent selector and clear button are always visible
  const chatToolbarAttach = ref(true)
  const chatToolbarWiki = ref(true)
  const chatToolbarContext = ref(true)
  const chatToolbarVoice = ref(true)
  const chatToolbarTokenCounter = ref(true)
 const chatToolbarLatency = ref(true)
 const chatThinkingIntensity = ref('auto')

 // ─── Network ───
  const proxyMode = ref('system')
  const proxyType = ref('http')
  const proxyHost = ref('127.0.0.1')
  const proxyPort = ref('7890')
  const proxyAuth = ref(false)
  const proxyUser = ref('')
  const proxyPass = ref('')
  const wikiWebResearchSettings = ref(normalizeWikiWebResearchSettings())

  // ─── Sandbox ───
  const maxIter = ref(100)
  const maxTaskMin = ref(30)
  const searchLimit = ref(10)
  const fileOpLimit = ref(30)
  const toolCallLimit = ref(0)
  const modelCallLimit = ref(0)
  const loopGuard = ref(true)
  const auditDays = ref(30)
  const pathRedact = ref(true)
  const allowFileDelete = ref(true)
  const deleteScope = ref('outputs-only')
  const allowExecCommand = ref(true)
  const allowRevivaManage = ref(false)
  const hitlMode = ref('auto') // 'auto' = no popups; 'sensitive' = destructive-only
  const defaultCommandBlacklist = ['rm -rf', 'rm -r', 'format', 'del /s', 'del /q', 'rmdir /s', 'rmdir /q', 'mkfs', 'dd', 'shutdown', 'reboot', 'reg', 'regedit', 'powershell', 'cmd']
  const commandBlacklist = ref([...defaultCommandBlacklist])

  // ─── Notifications ───
  const notifyTaskDone = ref(false)
  const notifyTaskFailed = ref(false)
  const notifySound = ref(false)
  const notifySoundType = ref('complete')
  const notifyDND = ref(false)
  const autoStart = ref(false)
  const minimizeToTray = ref(true)
  const trayIcon = ref(true)
  const trayMenuItems = ref([
    { id: 'show-window', type: 'builtin', action: 'showWindow', label: '显示主窗口', enabled: true },
    { id: 'separator-default', type: 'separator', enabled: true },
    { id: 'settings', type: 'route', path: '/settings/notifications', label: '设置', enabled: true },
    { id: 'quit', type: 'builtin', action: 'quit', label: '退出', enabled: true },
  ])
  let trayMenuSaveQueue = Promise.resolve({ ok: true })
  let trayMenuSaveVersion = 0
  const singleInstance = ref(true)

  // ─── LLM Config ───
  const providers = ref(JSON.parse(JSON.stringify(DEFAULT_PROVIDERS)))
  const defaultModels = ref({ ...DEFAULT_DEFAULT_MODELS })

  // ─── Accent Color Computed ───
  const availableThemes = computed(() => [...BUILTIN_THEMES, ...userThemes.value])
  const currentTheme = computed(() => availableThemes.value.find(theme => theme.id === themeId.value) || getBuiltinTheme('default'))
  const currentAccentHex = computed(() => {
    if (accentColor.value === 'theme') return currentTheme.value.accentHex
    if (accentColor.value === 'custom') return customAccentHex.value
    const preset = ACCENT_PRESETS.find(p => p.key === accentColor.value)
    return preset ? preset.hex : '#4A6CFF'
  })

  const currentAccentHover = computed(() => darkenHex(currentAccentHex.value, 0.85))
  const currentAccentRgb = computed(() => rgbStr(currentAccentHex.value))
  const currentAccentScale = computed(() => buildAccentScale(currentAccentHex.value))

  // ─── Model Computed ───
  const enabledProviders = computed(() => providers.value.filter(p => p.enabled))
  const availableModels = computed(() => enabledProviders.value.reduce((sum, p) => sum + p.models.filter(m => m.enabled).length, 0))

  const chatModelOptions = computed(() =>
    enabledProviders.value.map(p => ({
      type: 'group', label: p.name, key: p.id,
      children: p.models.filter(m => m.tier !== 'embedding' && m.enabled).map(m => ({ label: m.name, value: encodeModelRef(p.id, m.id) })),
    }))
  )

  const visionModelOptions = computed(() =>
    enabledProviders.value.map(p => ({
      type: 'group', label: p.name, key: p.id,
      children: p.models
        .filter(m => m.tier !== 'embedding' && m.enabled && !!m.capabilities?.vision)
        .map(m => ({ label: m.name, value: encodeModelRef(p.id, m.id) })),
    })).filter(group => group.children.length)
  )

  const embeddingModelOptions = computed(() =>
    enabledProviders.value.flatMap(p =>
      p.models.filter(m => m.tier === 'embedding' && m.enabled).map(m => ({ label: `${p.name} / ${m.name}`, value: encodeModelRef(p.id, m.id) }))
    )
  )

  const modelCapabilitiesMap = computed(() => {
    const map = {}
    for (const p of providers.value) {
      for (const m of p.models) {
        const caps = m.capabilities || { tool_calling: false, vision: false, search: false, vector: false, reranking: false }
        map[encodeModelRef(p.id, m.id)] = caps
        if (!map[m.id]) map[m.id] = caps
      }
    }
    return map
  })

  function getModelName(ref) {
    const match = _findModelRef(providers.value, ref)
    if (!match) return ref
    const duplicate = providers.value.some(p => p.id !== match.provider.id && p.models?.some(m => m.id === match.model.id))
    return parseModelRef(ref).scoped || duplicate ? `${match.provider.name} / ${match.model.name}` : match.model.name
  }

  // ─── Apply Accent Color ───
  function applyAccentColor() {
    const appRoot = document.querySelector('#app > [data-theme]') || document.documentElement
    const documentRoot = document.documentElement
    const properties = [
      ...[50, 100, 200, 300, 400, 500, 600].flatMap(step => [
        `--ui-brand-${step}`,
        `--ui-brand-${step}-rgb`,
      ]),
      '--brand',
      '--brand-hover',
      '--brand-rgb',
    ]
    for (const el of new Set([appRoot, documentRoot])) {
      for (const property of properties) el.style.removeProperty(property)
    }
    if (accentColor.value === 'theme') {
      return
    }
    const hex = currentAccentHex.value
    const hover = currentAccentHover.value
    const rgb = currentAccentRgb.value
    const targets = themeId.value === 'default' ? [appRoot] : [...new Set([appRoot, documentRoot])]
    for (const el of targets) {
      for (const [step, color] of Object.entries(currentAccentScale.value)) {
        el.style.setProperty(`--ui-brand-${step}`, color)
        el.style.setProperty(`--ui-brand-${step}-rgb`, rgbStr(color))
      }
      el.style.setProperty('--brand', hex)
      el.style.setProperty('--brand-hover', hover)
      el.style.setProperty('--brand-rgb', rgb)
    }
  }

  // ─── Apply Product Theme ───
  function removeUserThemeStyle() {
    document.getElementById('reviva-user-theme')?.remove()
  }

  function injectUserThemeStyle(css) {
    let style = document.getElementById('reviva-user-theme')
    if (!style) {
      style = document.createElement('style')
      style.id = 'reviva-user-theme'
      const customStyle = document.getElementById('reviva-custom-css')
      if (customStyle) document.head.insertBefore(style, customStyle)
      else document.head.appendChild(style)
    }
    style.textContent = css
  }

  function injectCustomCssStyle(css) {
    const value = String(css || '')
    let style = document.getElementById('reviva-custom-css')
    if (!value.trim()) {
      style?.remove()
      return
    }
    if (!style) {
      style = document.createElement('style')
      style.id = 'reviva-custom-css'
    }
    style.textContent = value
    document.head.appendChild(style)
  }

  async function preflightCustomCss(css) {
    if (typeof CSSStyleSheet !== 'function' || typeof CSSStyleSheet.prototype?.replace !== 'function') return
    const sheet = new CSSStyleSheet()
    try {
      await sheet.replace(css)
    } catch (error) {
      throw new Error(`CSS 语法无法解析：${error.message}`)
    }
  }

  let customCssPreviewTimer = null

  function clearCustomCssPreviewTimer() {
    if (customCssPreviewTimer) window.clearInterval(customCssPreviewTimer)
    customCssPreviewTimer = null
    customCssSecondsRemaining.value = 0
  }

  async function loadCustomCss() {
    clearCustomCssPreviewTimer()
    customCssPreviewing.value = false
    pendingCustomCss.value = ''
    if (!window.electronAPI?.theme?.readCustomCss) {
      customCss.value = ''
      injectCustomCssStyle('')
      return { success: true, css: '', exists: false }
    }
    const result = await window.electronAPI.theme.readCustomCss()
    if (!result?.success) {
      customCss.value = ''
      injectCustomCssStyle('')
      return result || { success: false, error: '无法读取自定义 CSS' }
    }
    customCss.value = typeof result.css === 'string' ? result.css : ''
    injectCustomCssStyle(customCss.value)
    return result
  }

  async function performCustomCssRollback() {
    clearCustomCssPreviewTimer()
    customCssPreviewing.value = false
    pendingCustomCss.value = ''
    const result = await window.electronAPI?.theme?.discardPendingCustomCss?.()
    if (result?.success && typeof result.css === 'string') customCss.value = result.css
    injectCustomCssStyle(customCss.value)
    return result || { success: false, error: '无法恢复上一份自定义 CSS' }
  }

  async function rollbackCustomCss() {
    if (customCssBusy.value) return { success: false, busy: true, error: '自定义 CSS 正在处理' }
    customCssBusy.value = true
    try {
      return await performCustomCssRollback()
    } finally {
      customCssBusy.value = false
    }
  }

  function startCustomCssPreviewTimer() {
    clearCustomCssPreviewTimer()
    const deadline = Date.now() + 5000
    customCssSecondsRemaining.value = 5
    customCssPreviewTimer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      customCssSecondsRemaining.value = remaining
      if (remaining === 0) void rollbackCustomCss()
    }, 100)
  }

  async function previewCustomCss(css) {
    if (customCssBusy.value) return { success: false, busy: true, error: '自定义 CSS 正在处理' }
    if (customCssPreviewing.value) return { success: false, error: '请先确认或恢复正在试用的样式' }
    customCssBusy.value = true
    try {
      const value = String(css ?? '')
      try {
        await preflightCustomCss(value)
      } catch (error) {
        return { success: false, error: error.message }
      }
      const result = await window.electronAPI?.theme?.stageCustomCss?.(value)
      if (!result?.success) return result || { success: false, error: '无法暂存自定义 CSS' }
      pendingCustomCss.value = value
      customCssPreviewing.value = true
      injectCustomCssStyle(value)
      startCustomCssPreviewTimer()
      return { success: true, css: value }
    } finally {
      customCssBusy.value = false
    }
  }

  async function commitCustomCss() {
    if (customCssBusy.value) return { success: false, busy: true, error: '自定义 CSS 正在处理' }
    if (!customCssPreviewing.value) return { success: false, error: '当前没有等待确认的样式' }
    customCssBusy.value = true
    try {
      clearCustomCssPreviewTimer()
      const result = await window.electronAPI?.theme?.commitCustomCss?.()
      if (!result?.success) {
        await performCustomCssRollback()
        return result || { success: false, error: '无法保存自定义 CSS' }
      }
      customCss.value = typeof result.css === 'string' ? result.css : pendingCustomCss.value
      pendingCustomCss.value = ''
      customCssPreviewing.value = false
      injectCustomCssStyle(customCss.value)
      return { success: true, css: customCss.value }
    } finally {
      customCssBusy.value = false
    }
  }

  async function resetCustomCss() {
    if (customCssBusy.value) return { success: false, busy: true, error: '自定义 CSS 正在处理' }
    customCssBusy.value = true
    try {
      clearCustomCssPreviewTimer()
      customCssPreviewing.value = false
      pendingCustomCss.value = ''
      injectCustomCssStyle(customCss.value)
      const result = await window.electronAPI?.theme?.resetCustomCss?.()
      if (!result?.success) return result || { success: false, error: '无法重置自定义 CSS' }
      customCss.value = ''
      injectCustomCssStyle('')
      return { success: true, css: '', exists: false }
    } finally {
      customCssBusy.value = false
    }
  }

  async function loadThemes() {
    themesLoading.value = true
    try {
      if (!window.electronAPI?.theme?.list) {
        userThemes.value = []
        themeLoadErrors.value = []
        return { success: true, themes: [] }
      }
      const result = await window.electronAPI.theme.list()
      if (!result?.success) return { success: false, error: result?.error || '无法读取用户主题' }
      userThemes.value = Array.isArray(result.themes) ? result.themes : []
      themeLoadErrors.value = Array.isArray(result.errors) ? result.errors : []
      return result
    } finally {
      themesLoading.value = false
    }
  }

  async function applyTheme(requestedThemeId = themeId.value) {
    const appStore = useAppStore()
    const requested = String(requestedThemeId || '').trim().toLowerCase()
    const target = availableThemes.value.find(theme => theme.id === requested) || getBuiltinTheme('default')

    if (target.source === 'user') {
      const result = await window.electronAPI?.theme?.readCss?.(target.id)
      if (!result?.success || typeof result.css !== 'string') {
        return { success: false, error: result?.error || '无法读取主题 CSS' }
      }
      injectUserThemeStyle(result.css)
    } else {
      removeUserThemeStyle()
    }

    themeId.value = target.id
    appStore.applyTheme(target.id)
    applyAccentColor()
    applyThemeMode()
    return { success: true, theme: target }
  }

  async function importTheme() {
    const result = await window.electronAPI?.theme?.import?.()
    if (!result?.success) return result || { success: false, error: '当前环境不支持导入主题' }
    await loadThemes()
    const applyResult = await savePreference('themeId', result.theme.id)
    if (!applyResult?.success) return applyResult
    return result
  }

  async function reloadThemes() {
    const result = await loadThemes()
    if (!result?.success) return result
    return await applyTheme(themeId.value)
  }

  async function removeTheme(id) {
    const target = userThemes.value.find(theme => theme.id === id)
    if (!target) return { success: false, error: '只能删除用户主题' }
    if (themeId.value === id) await savePreference('themeId', 'default')
    const result = await window.electronAPI?.theme?.remove?.(id)
    if (!result?.success) return result || { success: false, error: '当前环境不支持删除主题' }
    await loadThemes()
    return result
  }

  async function openThemeDirectory() {
    return await window.electronAPI?.theme?.openDirectory?.()
  }

  // ─── Apply Theme Mode ───

  function applyThemeMode() {
    // Remove previous system listener
    if (_systemThemeListener) {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', _systemThemeListener)
      _systemThemeListener = null
    }
    const appStore = useAppStore()
    const supports = currentTheme.value.supports || ['light', 'dark']
    const applySupportedMode = (preferred, systemPrefersDark = false) => {
      const resolved = resolveThemeColorMode(supports, preferred, systemPrefersDark)
      appStore.isDark = resolved === 'dark'
    }

    if (themeMode.value === 'dark') {
      applySupportedMode('dark')
    } else if (themeMode.value === 'light') {
      applySupportedMode('light')
    } else {
      // system
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      applySupportedMode('system', mql.matches)
      _systemThemeListener = (e) => { applySupportedMode('system', e.matches) }
      mql.addEventListener('change', _systemThemeListener)
    }
  }

  // ─── Save Preferences ───
  async function savePreference(key, value) {
    const refsMap = {
      themeId, themeMode, accentColor, customAccentHex, fontSize,
      langPref, animations, reducedMotion, answerStyle, conflictStrategy, quickInputEnabled, creationToolPreferences, agentSkillsPanelEnabled, chatNavigationEnabled, chatNavigationStyle,
      kbMode,
      chatToolbarAttach, chatToolbarWiki, chatToolbarContext, chatToolbarVoice, chatToolbarTokenCounter,
     chatToolbarLatency,
     chatThinkingIntensity,
     proxyMode, proxyType, proxyHost, proxyPort, proxyAuth, proxyUser, proxyPass, wikiWebResearchSettings,
     maxIter, maxTaskMin, searchLimit, fileOpLimit, toolCallLimit, modelCallLimit, loopGuard, auditDays, pathRedact, allowFileDelete, deleteScope, allowExecCommand, allowRevivaManage, hitlMode, commandBlacklist,
      notifyTaskDone, notifyTaskFailed, notifySound, notifySoundType, notifyDND,
      autoStart, minimizeToTray, trayIcon, singleInstance,
    }
    if (key === 'themeId') {
      const result = await applyTheme(value)
      if (!result.success) return result
      value = themeId.value
    } else if (key === 'creationToolPreferences') {
      value = normalizeCreationToolPreferences(value)
      creationToolPreferences.value = value
    } else if (key === 'chatNavigationEnabled') {
      value = value !== false
      chatNavigationEnabled.value = value
    } else if (key === 'chatNavigationStyle') {
      value = _sanitizeChatNavigationStyle(value)
      chatNavigationStyle.value = value
    } else if (key === 'agentSkillsPanelEnabled') {
      value = value === true
      agentSkillsPanelEnabled.value = value
    } else if (refsMap[key]) {
      refsMap[key].value = value
    }

    // Persist to DB
    if (window.electronAPI?.db) {
      try { await window.electronAPI.db.settings.set(key, JSON.stringify(value)) } catch (e) { console.error('savePreference error:', e) }
    }

    // Apply effects
    if (key === 'accentColor' || key === 'customAccentHex') applyAccentColor()
    if (key === 'themeMode') applyThemeMode()
    // Sync startup/tray/notification settings to main process
    const syncMap = {
      autoStart: window.electronAPI?.setStartup,
      minimizeToTray: window.electronAPI?.setMinimizeToTray,
      trayIcon: window.electronAPI?.setTrayIcon,
      singleInstance: window.electronAPI?.setSingleInstance,
    }
    if (syncMap[key]) {
      try {
        const result = await syncMap[key](value)
        if (result && result.ok === false) console.error(`apply ${key} failed:`, result.error)
      } catch (e) {
        console.error(`apply ${key} error:`, e)
      }
    }
    return { success: true }
  }

  async function saveProviders() {
    if (!window.electronAPI?.db) return false
    try {
      await window.electronAPI.db.settings.set('providers', JSON.stringify(providers.value))
      return true
    } catch (e) {
      console.error('saveProviders error:', e)
      return false
    }
  }

  async function saveDefaultModels() {
    if (window.electronAPI?.db) {
      try { await window.electronAPI.db.settings.set('defaultModels', JSON.stringify(defaultModels.value)) } catch (e) { console.error('saveDefaultModels error:', e) }
    }
  }

  // ─── Load from DB ───
  async function loadFromDb() {
    if (!window.electronAPI?.db) return
    try {
      // getAllSettings() returns already-parsed values via parseJSON
      const all = await window.electronAPI.db.settings.getAll()
      workDirRoot.value = all.workdir_root ?? ''

      // Preferences (no JSON.parse needed — getAllSettings already parsed)
      themeId.value = String(all.themeId || 'default')
      themeMode.value = ['light', 'dark', 'system'].includes(all.themeMode) ? all.themeMode : 'light'
      accentColor.value = all.accentColor ?? 'theme'
      customAccentHex.value = all.customAccentHex ?? '#4A6CFF'
      fontSize.value = all.fontSize ?? 'medium'
      langPref.value = all.langPref ?? 'zh'
      animations.value = all.animations ?? true
      reducedMotion.value = all.reducedMotion ?? false
      answerStyle.value = _sanitizeAnswerStyle(all.answerStyle ?? 'default')
      conflictStrategy.value = all.conflictStrategy ?? 'ask'
      quickInputEnabled.value = all.quickInputEnabled === true
      creationToolPreferences.value = normalizeCreationToolPreferences(all.creationToolPreferences)
      agentSkillsPanelEnabled.value = all.agentSkillsPanelEnabled === true
      chatNavigationEnabled.value = all.chatNavigationEnabled !== false
     chatNavigationStyle.value = _sanitizeChatNavigationStyle(all.chatNavigationStyle)
     kbMode.value = all.kbMode === 'cloud' ? 'cloud' : 'external'
      chatToolbarAttach.value = all.chatToolbarAttach !== false
      chatToolbarWiki.value = all.chatToolbarWiki !== false
      chatToolbarContext.value = all.chatToolbarContext !== false
      chatToolbarVoice.value = all.chatToolbarVoice !== false
      chatToolbarTokenCounter.value = all.chatToolbarTokenCounter !== false
     chatToolbarLatency.value = all.chatToolbarLatency !== false
     chatThinkingIntensity.value = all.chatThinkingIntensity || 'auto'

     // Network
      proxyMode.value = all.proxyMode ?? 'system'
      proxyType.value = all.proxyType ?? 'http'
      proxyHost.value = all.proxyHost ?? '127.0.0.1'
      proxyPort.value = all.proxyPort ?? '7890'
      proxyAuth.value = all.proxyAuth ?? false
      proxyUser.value = all.proxyUser ?? ''
      proxyPass.value = all.proxyPass ?? ''
      wikiWebResearchSettings.value = normalizeWikiWebResearchSettings(all.wikiWebResearchSettings)

      // Sandbox
      maxIter.value = all.maxIter ?? 100
      toolCallLimit.value = all.toolCallLimit ?? 0
      modelCallLimit.value = all.modelCallLimit ?? 0
      maxTaskMin.value = all.maxTaskMin ?? 5
      searchLimit.value = all.searchLimit ?? 10
      fileOpLimit.value = all.fileOpLimit ?? 30
      loopGuard.value = all.loopGuard ?? true
      auditDays.value = all.auditDays ?? 30
      pathRedact.value = all.pathRedact ?? true
      allowFileDelete.value = all.allowFileDelete ?? true
      deleteScope.value = all.deleteScope ?? 'outputs-only'
      allowExecCommand.value = all.allowExecCommand ?? true
      allowRevivaManage.value = all.allowRevivaManage ?? false
      hitlMode.value = all.hitlMode ?? 'auto'
      commandBlacklist.value = all.commandBlacklist ?? [...defaultCommandBlacklist]

      // Notifications
      notifyTaskDone.value = all.notifyTaskDone ?? false
      notifyTaskFailed.value = all.notifyTaskFailed ?? false
      notifySound.value = all.notifySound ?? false
      notifySoundType.value = all.notifySoundType ?? 'complete'
      notifyDND.value = all.notifyDND ?? false
      autoStart.value = all.autoStart ?? false
      minimizeToTray.value = all.minimizeToTray ?? true
      trayIcon.value = all.trayIcon ?? true
      if (Array.isArray(all.trayMenuItems)) trayMenuItems.value = all.trayMenuItems
      singleInstance.value = all.singleInstance ?? true

      // LLM Config (objects/arrays — already parsed by getAllSettings)
      const storedProviders = all.providers ?? JSON.parse(JSON.stringify(DEFAULT_PROVIDERS))
      const mergedProviders = _mergeBuiltinProviders(storedProviders)
      providers.value = mergedProviders
      defaultModels.value = _sanitizeDefaultModels(all.defaultModels ?? { ...DEFAULT_DEFAULT_MODELS }, providers.value)

      // Update configured status based on apiKey presence
      providers.value.forEach(p => { p.configured = providerConfigured(p) })
      if (JSON.stringify(storedProviders) !== JSON.stringify(providers.value)) {
        await saveProviders()
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  // ─── Workspace methods ───
  async function selectWorkspaceRoot() {
    if (!window.electronAPI?.workdir) {
      console.error('electronAPI.workdir not available')
      return { error: 'Electron API 未就绪' }
    }
    try {
      const result = await window.electronAPI.workdir.selectRoot()
      if (result && !result.error && !result.pendingRestart) workDirRoot.value = result.rootPath
      return result
    } catch (e) { console.error('selectWorkspaceRoot error:', e); return { error: e.message } }
  }

  async function selectDirOnly() {
    if (!window.electronAPI?.workdir) {
      console.error('electronAPI.workdir not available')
      return { error: 'Electron API 未就绪' }
    }
    try {
      const result = await window.electronAPI.workdir.selectDir()
      return result
    } catch (e) { console.error('selectDirOnly error:', e); return { error: e.message } }
  }

  async function initWorkspace(rootPath) {
    if (!window.electronAPI?.workdir) return null
    try {
      const result = await window.electronAPI.workdir.init(rootPath)
      if (result && !result.error && !result.pendingRestart) workDirRoot.value = result.rootPath
      return result
    } catch (e) { console.error('initWorkspace error:', e); return null }
  }

  async function getWorkspaceStatus() {
    if (!window.electronAPI?.workdir) return { initialized: false }
    return window.electronAPI.workdir.getStatus()
  }

  async function saveTrayMenu(items) {
    const pendingItems = items.map(item => ({ ...item }))
    const version = ++trayMenuSaveVersion
    trayMenuItems.value = pendingItems
    trayMenuSaveQueue = trayMenuSaveQueue.catch(() => ({ ok: false })).then(async () => {
      try {
        const result = await window.electronAPI?.setTrayMenu?.(pendingItems) ?? { ok: true, items: pendingItems }
        if (result.ok === false) return result
        const normalizedItems = Array.isArray(result.items) ? result.items : pendingItems
        await window.electronAPI?.db?.settings?.set('trayMenuItems', JSON.stringify(normalizedItems))
        if (version === trayMenuSaveVersion) trayMenuItems.value = normalizedItems
        return { ...result, items: normalizedItems }
      } catch (e) {
        console.error('saveTrayMenu error:', e)
        return { ok: false, error: e.message }
      }
    })
    return trayMenuSaveQueue
  }

  function applyWorkspaceState(state) {
    if (!state || state.error) return state
    workspaceState.value = {
      activeWorkspaceId: state.activeWorkspaceId || null,
      pendingWorkspaceId: state.pendingWorkspaceId || null,
      activeWorkspace: state.activeWorkspace || null,
      pendingWorkspace: state.pendingWorkspace || null,
      workspaces: Array.isArray(state.workspaces) ? state.workspaces : [],
      startupError: state.startupError || '',
    }
    if (state.activeWorkspace?.rootPath) workDirRoot.value = state.activeWorkspace.rootPath
    return workspaceState.value
  }

  async function loadWorkspaceState() {
    if (!window.electronAPI?.workspace) return workspaceState.value
    const state = await window.electronAPI.workspace.list()
    return applyWorkspaceState(state)
  }

  async function createWorkspace(data) {
    const result = await window.electronAPI?.workspace?.create(data)
    if (result?.state) applyWorkspaceState(result.state)
    return result
  }

  async function openWorkspace(data) {
    const result = await window.electronAPI?.workspace?.open(data)
    if (result?.state) applyWorkspaceState(result.state)
    return result
  }

  async function switchWorkspace(id) {
    const result = await window.electronAPI?.workspace?.setPending(id)
    if (result?.state) applyWorkspaceState(result.state)
    return result
  }

  async function cancelWorkspaceSwitch() {
    const result = await window.electronAPI?.workspace?.cancelPending()
    if (result?.state) applyWorkspaceState(result.state)
    return result
  }

  async function renameWorkspace(data) {
    const result = await window.electronAPI?.workspace?.rename(data)
    if (result?.state) applyWorkspaceState(result.state)
    return result
  }

  async function removeWorkspace(id) {
    const result = await window.electronAPI?.workspace?.remove(id)
    if (result?.state) applyWorkspaceState(result.state)
    return result
  }

  async function migrateWorkspace(data) {
    const result = await window.electronAPI?.workspace?.migrate(data)
    await loadWorkspaceState()
    return result
  }

  async function cleanupFailedWorkspaceMigration(targetRoot) {
    return window.electronAPI?.workspace?.cleanupFailedMigration(targetRoot)
  }

  function getDocsPath() {
    if (!workDirRoot.value) return ''
    return workDirRoot.value.replace(/[/\\]$/, '') + '/docs'
  }

  // ─── Model Management Actions ───
  function addModelToProvider(providerId, model) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return false
    if (p.models.find(m => m.id === model.id)) return false
    p.models.push({
      ...model,
      capabilities: model.capabilities || { tool_calling: false, vision: false, search: false, vector: false, reranking: false },
      addedBy: model.addedBy || 'user',
      enabled: model.enabled ?? false,
      maxOutput: model.maxOutput || '?',
      costInput: model.costInput ?? 0,
      costOutput: model.costOutput ?? 0,
      costCacheRead: model.costCacheRead ?? 0,
      costCacheWrite: model.costCacheWrite ?? 0,
    })
    return true
  }

  function removeModelFromProvider(providerId, modelId) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return false
    const idx = p.models.findIndex(m => m.id === modelId)
    if (idx < 0) return false
    p.models.splice(idx, 1)
    return true
  }

  function updateModelInProvider(providerId, modelId, updates) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return false
    const m = p.models.find(m => m.id === modelId)
    if (!m) return false
    Object.assign(m, updates)
    return true
  }

  function updateModelCapabilities(providerId, modelId, capabilities) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return false
    const m = p.models.find(m => m.id === modelId)
    if (!m) return false
    m.capabilities = capabilities
    return true
  }

  function addFetchedModels(providerId, models) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return
    for (const model of models) {
      if (p.models.find(m => m.id === model.id)) continue
      p.models.push(normalizeFetchedModel(model, null, { enabled: false, addedBy: 'fetch' }))
    }
  }

  function syncFetchedModels(providerId, models, options = {}) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p || !Array.isArray(models)) return false
    const incomingIds = new Set(models.map(m => m.id).filter(Boolean))
    let changed = false

    for (const model of models) {
      if (!model?.id) continue
      const existing = p.models.find(m => m.id === model.id)
      const normalized = normalizeFetchedModel(model, existing, {
        enabled: options.enableNew ?? false,
        addedBy: options.addedBy || 'fetch',
      })
      if (existing) Object.assign(existing, normalized, { enabled: existing.enabled ?? normalized.enabled })
      else p.models.push(normalized)
      changed = true
    }

    if (options.replaceMissing) {
      const before = p.models.length
      p.models = p.models.filter(m => incomingIds.has(m.id))
      changed = changed || before !== p.models.length
    }
    return changed
  }

  function normalizeFetchedModel(model, existing, options = {}) {
    return {
      id: model.id,
      name: model.name || existing?.name || model.id,
      ctx: model.ctx || existing?.ctx || '?',
      maxOutput: model.maxOutput || existing?.maxOutput || '?',
      tier: model.tier || existing?.tier || guessTier(model.id),
      capabilities: model.capabilities || existing?.capabilities || { tool_calling: false, vision: false, search: false, vector: false, reranking: false },
      costInput: model.costInput ?? existing?.costInput ?? 0,
      costOutput: model.costOutput ?? existing?.costOutput ?? 0,
      costCacheRead: model.costCacheRead ?? existing?.costCacheRead ?? 0,
      costCacheWrite: model.costCacheWrite ?? existing?.costCacheWrite ?? 0,
      billingUnit: model.billingUnit || existing?.billingUnit || undefined,
      requestMinPoints: model.requestMinPoints ?? existing?.requestMinPoints ?? undefined,
      pointsPerCny: model.pointsPerCny ?? existing?.pointsPerCny ?? undefined,
      minPositiveChargePoints: model.minPositiveChargePoints ?? existing?.minPositiveChargePoints ?? undefined,
      addedBy: model.addedBy || existing?.addedBy || options.addedBy || 'fetch',
      enabled: existing?.enabled ?? options.enabled ?? false,
    }
  }

  function getProviderDefaultBaseUrl(providerId) {
    const def = DEFAULT_PROVIDERS.find(p => p.id === providerId)
    return def?.baseUrl || ''
  }

  function resetProviderBaseUrl(providerId) {
    const p = providers.value.find(p => p.id === providerId)
    const baseUrl = getProviderDefaultBaseUrl(providerId)
    if (!p || !baseUrl) return false
    p.baseUrl = baseUrl
    return true
  }

  function guessTier(modelId) {
    const id = modelId.toLowerCase()
    if (id.includes('embed') || id.includes('rerank')) return 'embedding'
    if (id.includes('mini') || id.includes('turbo') || id.includes('haiku') || id.includes('flash') || id.includes('small')) return 'fast'
    if (id.includes('plus') || id.includes('balanced') || id.includes('sonnet') || id.includes('chat') || id.includes('pro')) return 'balanced'
    return 'flagship'
  }

  function setupRevivaSettingsListener() {
    if (!window.electronAPI?.onRevivaSettingsChanged) return
    window.electronAPI.onRevivaSettingsChanged(async ({ keys }) => {
      await loadFromDb()
      if (keys.some(k => ['themeId', 'themeMode'].includes(k))) {
        await applyTheme()
      }
      if (keys.some(k => ['accentColor', 'customAccentHex'].includes(k))) {
        applyAccentColor()
      }
      if (keys.includes('customCss')) {
        await applyTheme()
      }
    })
  }

  return {
    // Workspace
    workDirRoot, isWorkspaceReady, workspaceState,
    loadFromDb, selectWorkspaceRoot, selectDirOnly, initWorkspace, getWorkspaceStatus,
    setupRevivaSettingsListener,
    getDocsPath, loadWorkspaceState, createWorkspace, openWorkspace, switchWorkspace,
    cancelWorkspaceSwitch, renameWorkspace, removeWorkspace, migrateWorkspace,
    cleanupFailedWorkspaceMigration,
    // Preferences
    themeId, themeMode, accentColor, customAccentHex, fontSize, langPref,
    userThemes, themeLoadErrors, themesLoading, availableThemes,
    customCss, pendingCustomCss, customCssPreviewing, customCssBusy, customCssSecondsRemaining,
    animations, reducedMotion, answerStyle, conflictStrategy, quickInputEnabled, creationToolPreferences, agentSkillsPanelEnabled, chatNavigationEnabled, chatNavigationStyle,
    kbMode,
    chatToolbarAttach, chatToolbarWiki, chatToolbarContext, chatToolbarVoice, chatToolbarTokenCounter,
   chatToolbarLatency,
   chatThinkingIntensity,
   ACCENT_PRESETS, BUILTIN_THEMES,
    // Network
    proxyMode, proxyType, proxyHost, proxyPort, proxyAuth, proxyUser, proxyPass, wikiWebResearchSettings,
    // Sandbox
    maxIter, maxTaskMin, searchLimit, fileOpLimit, toolCallLimit, modelCallLimit, loopGuard, auditDays, pathRedact, allowFileDelete, deleteScope, allowExecCommand, allowRevivaManage, hitlMode, commandBlacklist,
    // Notifications
    notifyTaskDone, notifyTaskFailed, notifySound, notifySoundType, notifyDND,
    autoStart, minimizeToTray, trayIcon, trayMenuItems, singleInstance,
    // LLM Config
    providers, defaultModels,
    enabledProviders, availableModels,
    chatModelOptions, visionModelOptions, embeddingModelOptions, modelCapabilitiesMap, getModelName,
    // Model management
    addModelToProvider, removeModelFromProvider, updateModelInProvider, updateModelCapabilities, addFetchedModels, syncFetchedModels, getProviderDefaultBaseUrl, resetProviderBaseUrl, guessTier, providerConfigured, normalizeProviderApiFormat,
    // Computed
    currentTheme, currentAccentHex, currentAccentHover, currentAccentRgb, currentAccentScale,
    // Methods
    savePreference, saveTrayMenu, saveProviders, saveDefaultModels,
    applyAccentColor, loadThemes, applyTheme, importTheme, reloadThemes, removeTheme, openThemeDirectory, applyThemeMode,
    loadCustomCss, previewCustomCss, commitCustomCss, rollbackCustomCss, resetCustomCss,
  }
}, {
  persist: {
    pick: ['workDirRoot'],
  },
})
