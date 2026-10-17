// agents/tools/skillInstallTool.js — extracted from langchainTools.js
// Skill install tool with git clone/download support.

import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { tool } from 'langchain'
import { z } from 'zod'
import { _dbService, _skillService } from './toolContext.js'

function _skillDbPayload(skillId, config, promptContent) {
  return {
    id: skillId,
    name: config.name || skillId,
    icon: config.icon,
    color: config.color,
    description: config.description,
    prompt_template: promptContent || '',
    prompt_content: promptContent || '',
    output_types: config.outputTypes || [],
    allowed_tools: config.allowedTools || [],
    source: 'custom',
    category: config.category || '',
    version: config.version || '',
    author: config.author || '',
    license: config.license || '',
    builtin: 0,
    enabled: 1,
  }
}

function _cloneGitRepo(repoUrl, targetDir, options = {}) {
  return new Promise((resolve) => {
    const gitArgs = options.noProxy ? ['-c', 'http.proxy=', '-c', 'https.proxy=', 'clone', '--depth', '1', repoUrl, targetDir] : ['clone', '--depth', '1', repoUrl, targetDir]
    const child = spawn('git', gitArgs, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let done = false
    const finish = (result) => { if (done) return; done = true; clearTimeout(timer); resolve(result) }
    const timer = setTimeout(() => { try { child.kill() } catch {} finish({ error: new Error('git clone timeout (60s)'), stdout, stderr }) }, 60000)
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', err => finish({ error: err, stdout, stderr }))
    child.on('close', code => finish({ error: code !== 0 ? new Error(`git clone exited with code ${code}`) : null, stdout, stderr }))
  })
}

const GITHUB_MIRRORS = [
  '',
  'https://gh-proxy.com/',
  'https://mirror.ghproxy.com/',
  'https://ghproxy.net/',
]

function _parseGitHubUrl(url) {
  // Accept: https://github.com/owner/repo, https://github.com/owner/repo.git,
  //         https://github.com/owner/repo/tree/branch, https://github.com/owner/repo/refs/heads/branch
  const m = String(url || '').match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|refs\/heads)\/([^/]+))?\/?$/)
  if (!m) return null
  return { owner: m[1], repo: m[2], branch: m[3] || 'main' }
}

function _normalizeGitUrl(raw) {
  let url = String(raw || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(url) && /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/.test(url) && !/[:\\]/.test(url)) {
    return 'https://github.com/' + url
  }
  return url
}
async function _downloadZip(zipUrl, destPath, timeoutMs) {
  const resp = await fetch(zipUrl, {
    signal: AbortSignal.timeout(timeoutMs || 30000),
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + resp.statusText)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.length < 100) throw new Error('Downloaded file too small (' + buf.length + ' bytes), likely an error page')
  await fs.promises.writeFile(destPath, buf)
  return buf.length
}

async function _cloneOrDownload(repoUrl, tempDir) {
  // Try git clone first
  const cloneResult = await _cloneGitRepo(repoUrl, tempDir)
  if (!cloneResult.error) return { method: 'git', path: tempDir }

  const gitErr = cloneResult.error.message || ''
  const isGitMissing = /ENOENT|not found|spawn/i.test(gitErr) && !/Repository|404|exist/i.test(gitErr)

  const stderrMsg = cloneResult.stderr || ''
  const combined = gitErr + ' ' + stderrMsg
  const isNetworkError = /Failed to connect|Couldnt connect|Connection refused|Could not resolve host|port \d+ after/i.test(combined)

  if (!isGitMissing && isNetworkError && !/timeout/i.test(gitErr)) {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    await fs.promises.mkdir(tempDir, { recursive: true })
    console.log('[skillInstall] Git clone failed (proxy/network), retrying without proxy...')
    const retryResult = await _cloneGitRepo(repoUrl, tempDir, { noProxy: true })
    if (!retryResult.error) return { method: 'git', path: tempDir }
    console.warn('[skillInstall] Retry without proxy also failed:', retryResult.error.message)
  }

  // If git is available but clone failed for other reasons (repo not found, auth), don't retry with zip
  if (!isGitMissing && !isNetworkError && !/timeout/i.test(gitErr)) {
    return { method: 'git', error: cloneResult.error, stderr: cloneResult.stderr }
  }

  // Fallback: download ZIP from GitHub
  const gh = _parseGitHubUrl(repoUrl)
  if (!gh) {
    // Not a GitHub URL and git is unavailable
    return {
      method: 'git',
      error: new Error(gitErr + '。非 GitHub URL 且 git 不可用，无法下载 ZIP 降级。请安装 git 或手动下载后用 install_path 安装'),
      stderr: cloneResult.stderr,
    }
  }

  const zipPath = path.join(os.tmpdir(), 'reviva-skill-' + Date.now() + '.zip')
  // Try branch from URL first, then common defaults. Use simple archive/{ref}.zip format
  // which works for both branches and tags.
  const branchCandidates = [...new Set([gh.branch, 'main', 'master'])]
  let lastError = null
  let downloaded = false

  for (const branch of branchCandidates) {
    if (downloaded) break
    const archiveSlug = 'archive/' + branch + '.zip'
    for (const mirror of GITHUB_MIRRORS) {
      const fullUrl = mirror
        ? mirror + 'https://github.com/' + gh.owner + '/' + gh.repo + '/' + archiveSlug
        : 'https://github.com/' + gh.owner + '/' + gh.repo + '/' + archiveSlug
      try {
        const size = await _downloadZip(fullUrl, zipPath, 60000)
        console.log('[skillInstall] Downloaded ZIP via', mirror || 'direct', 'branch=' + branch, '-', size, 'bytes')
        return { method: 'zip', path: zipPath, isZip: true }
      } catch (err) {
        lastError = err
        console.warn('[skillInstall] ZIP download failed via', mirror || 'direct', 'branch=' + branch, ':', err.message)
      }
    }
  }

  // All mirrors failed
  return {
    method: 'zip',
    error: new Error((isGitMissing ? 'git 不可用且 ' : '') + 'ZIP 下载失败: ' + (lastError?.message || 'unknown') + '。请手动下载 ZIP 后用 install_path 安装，或配置代理后重试'),
    stderr: cloneResult.stderr,
  }
}

export const skillInstall = tool(
  async (input = {}) => {
    if (!_skillService) return JSON.stringify({ success: false, error: 'SkillService 未初始化' })
    const action = String(input.action || '').trim()
    try {
      switch (action) {
        case 'list': {
          const builtin = await _skillService.listBuiltinSkills()
          const dbSkills = _dbService?.listSkills?.() || []
          const installedIds = new Set(dbSkills.map(s => s.id))
          return JSON.stringify({
            success: true,
            installed: dbSkills.map(s => ({
              id: s.id, name: s.name || s.id, description: s.description || '',
              source: s.source || 'custom', enabled: s.enabled !== 0,
            })),
            builtinAvailable: builtin.filter(b => !installedIds.has(b.id)).map(b => ({
              id: b.id, name: b.name || b.id, description: b.description || '',
            })),
          })
        }
        case 'install_url': {
          const url = _normalizeGitUrl(input.url)
          if (!url) return JSON.stringify({ success: false, error: '缺少 url 参数' })
          if (!/^https?:\/\//.test(url)) return JSON.stringify({ success: false, error: 'url 必须是 http/https 开头的 Git 仓库地址' })
          const repoName = url.replace(/\.git$/, '').split('/').pop() || 'skill'
          const skillId = _skillService.normalizeSkillId(input.skillId || repoName)
          if (!_skillService.isValidSkillId(skillId)) return JSON.stringify({ success: false, error: `无效的 Skill ID: ${skillId}` })
          if (_skillService.isBuiltinSkillId(skillId)) return JSON.stringify({ success: false, error: `不能覆盖内置 Skill: ${skillId}` })
          if (_skillService.isInstalled(skillId)) return JSON.stringify({ success: false, error: `Skill "${skillId}" 已存在`, conflict: true })
          const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-skill-clone-'))
          const fetchResult = await _cloneOrDownload(url, tempDir)
          if (fetchResult.error) {
            await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
            return JSON.stringify({ success: false, error: fetchResult.error.message, stderr: (fetchResult.stderr || '').slice(0, 500) })
          }
          // Unify: for zip, extract first; for git clone, scan directly
          let scanDir = tempDir
          let zipExtractedDir = null
          if (fetchResult.isZip) {
            try {
              zipExtractedDir = await _skillService._extractZip(fetchResult.path)
              scanDir = zipExtractedDir
            } catch (err) {
              await fs.promises.rm(fetchResult.path, { force: true }).catch(() => {})
              return JSON.stringify({ success: false, error: 'ZIP 解压失败: ' + err.message })
            }
            // GitHub ZIPs wrap contents in repo-branch/ directory — descend if needed
            if (!fs.existsSync(path.join(scanDir, 'SKILL.md'))) {
              const entries = await fs.promises.readdir(scanDir, { withFileTypes: true })
              const dirs = entries.filter(e => e.isDirectory())
              if (dirs.length === 1) scanDir = path.join(scanDir, dirs[0].name)
            }
          }
          const installed = []
          const hasRootSkill = fs.existsSync(path.join(scanDir, 'SKILL.md'))
          if (hasRootSkill) {
            try {
              const result = await _skillService.importSkillSource(scanDir, { id: skillId, source: 'custom', sourceUrl: url })
              installed.push({ skillId, ...result })
            } catch (err) {
              console.warn('[skillInstall] Import failed:', err.message)
            }
          } else {
            // Multi-skill repo: find subdirs with SKILL.md
            const entries = await fs.promises.readdir(scanDir, { withFileTypes: true })
            for (const entry of entries) {
              if (!entry.isDirectory() || entry.name.startsWith('.')) continue
              if (!fs.existsSync(path.join(scanDir, entry.name, 'SKILL.md'))) continue
              const subId = _skillService.normalizeSkillId(entry.name)
              if (_skillService.isBuiltinSkillId(subId) || _skillService.isInstalled(subId)) continue
              try {
                const result = await _skillService.importSkillSource(path.join(scanDir, entry.name), { id: subId, source: 'custom', sourceUrl: url })
                installed.push({ skillId: subId, ...result })
              } catch (err) {
                console.warn(`[skillInstall] Failed to import ${subId}:`, err.message)
              }
            }
          }
          await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
          if (zipExtractedDir) await fs.promises.rm(zipExtractedDir, { recursive: true, force: true }).catch(() => {})
          if (fetchResult.isZip) await fs.promises.rm(fetchResult.path, { force: true }).catch(() => {})
          if (!installed.length) return JSON.stringify({ success: false, error: '仓库中未找到有效的 Skill（缺少 SKILL.md）' })
          // Sync each to DB
          const results = []
          for (const item of installed) {
            if (!item.spec?.valid) { results.push({ skillId: item.skillId, success: false, issues: item.spec?.issues }); continue }
            const promptResult = await _skillService.readSkillFile(item.skillId, 'SKILL.md')
            const promptContent = promptResult.success ? promptResult.data : ''
            const dbPayload = _skillDbPayload(item.skillId, item.config, promptContent)
           const existing = (_dbService?.listSkills?.() || []).find(s => s.id === item.skillId)
           if (existing) _dbService?.updateSkill?.(item.skillId, dbPayload)
           else _dbService?.createSkill?.(dbPayload)
            let adaptation = null
            try { adaptation = await _skillService.adaptExternalSkill(item.skillId) } catch (e) { console.warn('[skillInstall] Adaptation scan failed:', e.message) }
            results.push({ skillId: item.skillId, success: true, name: item.config?.name || item.skillId, description: item.config?.description || '', adaptation })
         }
          const needsAttention = results.some(r => r.adaptation?.needsAttention)
          let adaptHint = ''
          if (needsAttention) adaptHint = ' 部分安装的 Skill 引用了非 Reviva 工具或平台路径，可能需要适配后才能正常使用。'
          return JSON.stringify({ success: true, results, message: `安装了 ${results.length} 个 Skill。建议关闭并重新打开 Reviva 使新 Skill 完全生效，或在 Agent 设置中手动绑定。${adaptHint}` })
        }
        case 'install_path': {
          const sourcePath = String(input.sourcePath || input.path || '').trim()
          if (!sourcePath) return JSON.stringify({ success: false, error: '缺少 sourcePath 参数' })
          const customSkills = (_dbService?.listSkills?.() || []).filter(s => s.source !== 'platform')
          const preview = await _skillService.inspectSkillSource(sourcePath, { customSkills })
          const skillId = _skillService.normalizeSkillId(input.skillId || preview.id)
          if (!_skillService.isValidSkillId(skillId)) return JSON.stringify({ success: false, error: `无效的 Skill ID: ${skillId}` })
          if (_skillService.isBuiltinSkillId(skillId)) return JSON.stringify({ success: false, error: `不能覆盖内置 Skill: ${skillId}` })
          if (_skillService.isInstalled(skillId)) return JSON.stringify({ success: false, error: `Skill "${skillId}" 已存在`, conflict: true, preview })
          const result = await _skillService.importSkillSource(sourcePath, { id: skillId, source: 'custom', sourceUrl: url })
          if (!result.spec?.valid) return JSON.stringify({ success: false, error: result.spec?.issues?.join('; ') || 'Skill 验证失败', spec: result.spec })
          const promptResult = await _skillService.readSkillFile(skillId, 'SKILL.md')
          const promptContent = promptResult.success ? promptResult.data : ''
          const dbPayload = _skillDbPayload(skillId, result.config, promptContent)
         _dbService?.createSkill?.(dbPayload)
          let adaptation = null
          try { adaptation = await _skillService.adaptExternalSkill(skillId) } catch (e) { console.warn('[skillInstall] Adaptation scan failed:', e.message) }
          let adaptHint = adaptation?.needsAttention ? ` 该 Skill 可能引用了非 Reviva 工具或平台路径，检查 adaptation 报告中的警告。` : ''
          return JSON.stringify({ success: true, skillId, name: result.config?.name || skillId, description: result.config?.description || '', spec: result.spec, adaptation, message: `Skill "${skillId}" 安装成功。建议关闭并重新打开 Reviva 使新 Skill 完全生效，或在 Agent 设置中手动绑定。${adaptHint}` })
        }
        case 'create': {
          const skillId = _skillService.normalizeSkillId(input.skillId || input.id || '')
          if (!_skillService.isValidSkillId(skillId)) return JSON.stringify({ success: false, error: `无效的 Skill ID: ${skillId}` })
          if (_skillService.isBuiltinSkillId(skillId)) return JSON.stringify({ success: false, error: `不能覆盖内置 Skill: ${skillId}` })
          if (_skillService.isInstalled(skillId)) return JSON.stringify({ success: false, error: `Skill "${skillId}" 已存在`, conflict: true })
          const skillData = {
            name: input.name || skillId,
            description: input.description || '',
            promptContent: input.promptContent || input.content || '',
            source: 'custom',
            icon: input.icon || 'ri-brain-line',
            color: input.color || '#6C8AFF',
            category: input.category || '',
            allowedTools: input.allowedTools || [],
            outputTypes: input.outputTypes || [],
            version: input.version || '1.0',
            author: input.author || '',
          }
          const result = await _skillService.installSkill(skillId, skillData)
          const promptResult = await _skillService.readSkillFile(skillId, 'SKILL.md')
          const promptContent = promptResult.success ? promptResult.data : ''
          _dbService?.createSkill?.(_skillDbPayload(skillId, result.config, promptContent))
          return JSON.stringify({ success: true, skillId, name: result.config?.name || skillId, description: result.config?.description || '', spec: result.spec, message: `Skill "${skillId}" 创建成功。建议关闭并重新打开 Reviva 使新 Skill 完全生效，或在 Agent 设置中手动绑定。` })
        }
        case 'validate': {
          const skillId = _skillService.normalizeSkillId(input.skillId || '')
          if (!_skillService.isValidSkillId(skillId)) return JSON.stringify({ success: false, error: '缺少或无效的 skillId' })
          const spec = _skillService.validateSkillSpec(skillId)
          return JSON.stringify({ success: true, skillId, spec })
        }
        case 'info': {
          const skillId = _skillService.normalizeSkillId(input.skillId || '')
          if (!_skillService.isValidSkillId(skillId)) return JSON.stringify({ success: false, error: '缺少或无效的 skillId' })
          const relativePath = input.filePath || 'SKILL.md'
          const result = await _skillService.readSkillFile(skillId, relativePath)
          if (!result.success) return JSON.stringify({ success: false, error: result.error })
          return JSON.stringify({ success: true, skillId, filePath: relativePath, content: result.data })
        }
        case 'uninstall': {
          const skillId = _skillService.normalizeSkillId(input.skillId || '')
          if (!_skillService.isValidSkillId(skillId)) return JSON.stringify({ success: false, error: '缺少或无效的 skillId' })
          if (_skillService.isBuiltinSkillId(skillId)) return JSON.stringify({ success: false, error: `不能删除内置 Skill: ${skillId}` })
          const existing = (_dbService?.listSkills?.() || []).find(s => s.id === skillId)
          if (existing?.source === 'platform' || existing?.builtin) return JSON.stringify({ success: false, error: `不能删除内置 Skill: ${skillId}` })
          await _skillService.uninstallSkill(skillId)
          _dbService?.deleteSkill?.(skillId)
          return JSON.stringify({ success: true, skillId, message: `Skill "${skillId}" 已删除` })
        }

        case 'update': {
          const skillId = _skillService.normalizeSkillId(input.skillId || '')
          if (!_skillService.isValidSkillId(skillId)) return JSON.stringify({ success: false, error: '缺少或无效的 skillId。请提供合法的 Skill ID（小写字母、数字、连字符）' })
          if (_skillService.isBuiltinSkillId(skillId)) return JSON.stringify({ success: false, error: '内置 Skill 不能通过此方式更新: ' + skillId + '。内置 Skill 随应用更新自动刷新' })
          if (!_skillService.isInstalled(skillId)) return JSON.stringify({ success: false, error: 'Skill "' + skillId + '" 未安装，请先使用 install_url 安装' })
          const url = _normalizeGitUrl(input.url)
          if (!url) return JSON.stringify({ success: false, error: '更新需要提供 url（GitHub 仓库地址）。如果不记得 URL，请用 list 查看已安装的 Skill，或请用户提供' })
          if (!/^https?:\/\//.test(url)) return JSON.stringify({ success: false, error: 'url 必须是 http/https 开头的 Git 仓库地址' })

          const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-skill-update-'))
          const fetchResult = await _cloneOrDownload(url, tempDir)
          if (fetchResult.error) {
            await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
            return JSON.stringify({ success: false, error: fetchResult.error.message, stderr: (fetchResult.stderr || '').slice(0, 500) })
          }

          // Determine source path: for zip, importSkillSource handles extraction; for git, scan directory
          let sourcePath = fetchResult.isZip ? fetchResult.path : tempDir
          if (!fetchResult.isZip && !fs.existsSync(path.join(tempDir, 'SKILL.md'))) {
            const subDir = path.join(tempDir, skillId)
            if (fs.existsSync(path.join(subDir, 'SKILL.md'))) {
              sourcePath = subDir
            } else {
              const entries = await fs.promises.readdir(tempDir, { withFileTypes: true })
              const skillSubdir = entries.find(e => e.isDirectory() && !e.name.startsWith('.') && fs.existsSync(path.join(tempDir, e.name, 'SKILL.md')))
              if (skillSubdir) {
                sourcePath = path.join(tempDir, skillSubdir.name)
              } else {
                await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
                return JSON.stringify({ success: false, error: '仓库中未找到与 "' + skillId + '" 匹配的 Skill（缺少 SKILL.md）。请检查仓库结构或确认 Skill ID 是否正确' })
              }
            }
          }

          try {
            const result = await _skillService.importSkillSource(sourcePath, { id: skillId, source: 'custom' })
            await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
            if (fetchResult.isZip) await fs.promises.rm(fetchResult.path, { force: true }).catch(() => {})
            if (!result.spec?.valid) return JSON.stringify({ success: false, error: result.spec?.issues?.join('; ') || 'Skill 验证失败，请检查 SKILL.md 是否符合规范', spec: result.spec })
            const promptResult = await _skillService.readSkillFile(skillId, 'SKILL.md')
            const promptContent = promptResult.success ? promptResult.data : ''
            const dbPayload = _skillDbPayload(skillId, result.config, promptContent)
           _dbService?.updateSkill?.(skillId, dbPayload)
            let adaptation = null
            try { adaptation = await _skillService.adaptExternalSkill(skillId) } catch (e) { console.warn('[skillInstall] Adaptation scan failed:', e.message) }
            let adaptHint = adaptation?.needsAttention ? ' 该 Skill 可能引用了非 Reviva 工具或平台路径，检查 adaptation 报告中的警告。' : ''
            return JSON.stringify({ success: true, skillId, name: result.config?.name || skillId, description: result.config?.description || '', spec: result.spec, adaptation, message: 'Skill "' + skillId + '" 更新成功。建议关闭并重新打开 Reviva 使更新完全生效。' + adaptHint })
          } catch (err) {
            await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
            return JSON.stringify({ success: false, error: '更新失败: ' + err.message })
          }
        }
        default:
          return JSON.stringify({ success: false, error: `未知操作: ${action}。可用: list, install_url, install_path, create, validate, info, uninstall, update` })
      }
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message })
    }
  },
  {
    name: 'skill_install',
    description: [
      '安装、创建和管理 Reviva Skills。当用户说"安装 skill""帮我安装 xxx""我下载了 skill""创建一个 skill"时使用。',
      '操作：list=列出已安装和可用内置 Skills；install_url=从 GitHub URL 克隆安装（自动 clone，无 git 时自动下载 ZIP）；install_path=从本地文件夹/ZIP 导入；create=从名称和内容创建新 Skill；validate=验证 Skill 结构；info=读取 Skill 文件；uninstall=删除自定义 Skill。；update=从 GitHub URL 重新拉取并更新已安装的 Skill。',
    ].join('\n'),
    schema: z.object({
      action: z.enum(['list', 'install_url', 'install_path', 'create', 'validate', 'info', 'uninstall', 'update']).describe('要执行的 Skill 操作'),
      url: z.string().optional().describe('install_url/update: GitHub 仓库 URL'),
      sourcePath: z.string().optional().describe('install_path: 本地文件夹或 ZIP 文件绝对路径'),
      skillId: z.string().optional().describe('Skill ID（小写字母、数字、连字符），不传时从来源自动推断'),
      name: z.string().optional().describe('create: Skill 显示名称'),
      description: z.string().optional().describe('create: Skill 触发描述'),
      promptContent: z.string().optional().describe('create: SKILL.md 正文内容'),
      content: z.string().optional().describe('create: 同 promptContent'),
      icon: z.string().optional().describe('create: 图标'),
      color: z.string().optional().describe('create: 颜色'),
      category: z.string().optional().describe('create: 分类'),
      allowedTools: z.array(z.string()).optional().describe('create: 允许的工具 ID 列表'),
      outputTypes: z.array(z.string()).optional().describe('create: 输出类型'),
      version: z.string().optional().describe('create: 版本号'),
      author: z.string().optional().describe('create: 作者'),
      filePath: z.string().optional().describe('info: 要读取的文件相对路径（默认 SKILL.md）'),
    }),
  },
)

