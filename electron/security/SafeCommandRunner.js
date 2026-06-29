import { exec, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const EXEC_COMMAND_TIMEOUT_MS = 30000
const EXEC_COMMAND_MAX_BUFFER = 1024 * 1024
const EXEC_COMMAND_STDOUT_LIMIT = 10000
const EXEC_COMMAND_STDERR_LIMIT = 5000
const SHELL_SCRIPT_EXTS = new Set(['.sh', '.bash'])
const SCRIPT_SHELL_COMMANDS = new Set(['bash', 'sh'])

export const SAFE_COMMAND_TOOL_DESCRIPTION = [
  '在终端执行单条白名单命令。推荐使用结构化参数 {cmd,args,cwd}，路径参数使用 /project、/docs、/context、/agents/... 等虚拟路径。',
  '结构化命令会在执行前把虚拟路径映射为真实路径，输出中的真实路径会尽量脱敏回虚拟路径。超时30秒，输出限制10KB。',
  '旧版 command 字符串仍兼容，但禁止管道、重定向、多命令串联。',
  'bash/sh 支持 --version/--help、授权工作区内 .sh/.bash 脚本，以及 -c/-lc 的单条内部命令；内部命令仍会重新经过白名单、黑名单和控制符校验。',
].join('\n')

function clipOutput(value, limit) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text || text.length <= limit) return { text: text || '', truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

function redactPrepared(prepared, value) {
  const text = String(value || '')
  return typeof prepared?.redactText === 'function' ? prepared.redactText(text) : text
}

function commandTokens(command) {
  const tokens = []
  let current = ''
  let quote = null
  for (const ch of String(command || '')) {
    if ((ch === '"' || ch === "'")) {
      if (quote === ch) {
        quote = null
      } else if (!quote) {
        quote = ch
      } else {
        current += ch
      }
      continue
    }
    if (!quote && /\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (quote) return null
  if (current) tokens.push(current)
  return tokens
}

function commandRuleText(command) {
  return String(command || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function commandList(value) {
  return (Array.isArray(value) ? value : [])
    .map(item => commandRuleText(item))
    .filter(Boolean)
}

function commandAllowedByWhitelist(trimmedCmd, baseCmd, cmdName, whitelist) {
  if (!whitelist.length) return true
  const commandLower = commandRuleText(trimmedCmd)
  return whitelist.some(rule => {
    if (cmdName === rule || baseCmd === rule) return true
    return commandLower === rule || commandLower.startsWith(`${rule} `)
  })
}

function isScriptShellCommand(baseCmd, cmdName) {
  return SCRIPT_SHELL_COMMANDS.has(cmdName) || SCRIPT_SHELL_COMMANDS.has(baseCmd)
}

function scriptShellPathArg(filePath) {
  return filePath.replace(/\\/g, '/')
}

function isShellInfoOption(value) {
  return value === '--version' || value === '--help'
}

function isShellInlineOption(value) {
  return value === '-c' || value === '-lc'
}

function prepareScriptShellOptionCommand(tokens, ctx) {
  const { workDirService } = ctx
  const option = String(tokens[1] || '').toLowerCase()
  if (isShellInfoOption(option) && tokens.length === 2) {
    return {
      spawn: true,
      command: tokens[0],
      args: [tokens[1]],
      cwd: workDirService.getRootPath(),
    }
  }

  if (!isShellInlineOption(option)) {
    return { error: '安全限制：bash/sh 只允许 --version、--help、-c 或 -lc；其他 shell 选项未开放。' }
  }
  if (tokens.length !== 3 || !String(tokens[2] || '').trim()) {
    return { error: '安全限制：bash/sh -c 只接受一个非空命令字符串。' }
  }

  const innerCommand = String(tokens[2]).trim()
  const innerPrepared = prepareSafeCommand(innerCommand, { ...ctx, nestedShell: true })
  if (innerPrepared.error) {
    return { error: `安全限制：bash/sh -c 内部命令未通过校验。${innerPrepared.error}` }
  }

  return {
    spawn: true,
    command: tokens[0],
    args: [tokens[1], innerCommand],
    cwd: workDirService.getRootPath(),
  }
}

function prepareScriptShellCommand(tokens, ctx) {
  const { workDirService } = ctx
  if (!workDirService?.getRootPath?.()) {
    return { error: '安全限制：未初始化工作空间，不能执行 shell 脚本。' }
  }
  if (tokens.length < 2) {
    return { error: '安全限制：bash/sh 不能以交互模式运行。请使用 bash --version、bash /path/to/script.sh，或 bash -lc "单条白名单命令"。' }
  }

  const scriptPath = tokens[1]
  if (!scriptPath || scriptPath.startsWith('-')) {
    return prepareScriptShellOptionCommand(tokens, ctx)
  }

  let resolved
  try {
    resolved = workDirService.resolveAndValidate(scriptPath, 'any')
  } catch (e) {
    return { error: `安全限制：shell 脚本路径必须位于授权工作区内。${e.message}` }
  }

  const normalized = resolved.replace(/\\/g, '/').toLowerCase()
  if (normalized.includes('/.reviva/')) {
    return { error: '安全限制：shell 脚本不能位于系统元数据目录。' }
  }
  if (!fs.existsSync(resolved)) {
    return { error: '安全限制：shell 脚本文件不存在。' }
  }
  const stat = fs.statSync(resolved)
  if (!stat.isFile()) {
    return { error: '安全限制：shell 脚本路径必须是文件。' }
  }
  const ext = path.extname(resolved).toLowerCase()
  if (!SHELL_SCRIPT_EXTS.has(ext)) {
    return { error: '安全限制：bash/sh 只允许执行 .sh 或 .bash 脚本文件。' }
  }

  return {
    spawn: true,
    command: tokens[0],
    args: [scriptShellPathArg(resolved), ...tokens.slice(2)],
    cwd: workDirService.getRootPath(),
  }
}

export function prepareSafeCommand(command, {
  dbService = null,
  workDirService = null,
  execConfig = null,
  vfsResolver = null,
  vfsContext = null,
  nestedShell = false,
} = {}) {
  if (!dbService?.getSetting) {
    return { error: '安全限制：未初始化命令安全设置，不能执行命令。' }
  }
  if (!workDirService?.getRootPath?.()) {
    return { error: '安全限制：未初始化工作空间，不能执行命令。' }
  }

  const allowExec = dbService.getSetting?.('allowExecCommand') ?? false
  if (!allowExec) {
    return { error: `安全限制：命令执行功能已被全局禁用。请在设置 > 沙箱保护 > 命令执行安全中开启"允许执行命令"。` }
  }

  const trimmedCmd = String(command || '').trim()
  const tokens = commandTokens(trimmedCmd)
  if (!tokens?.length) return { error: '安全限制：命令为空。' }

  const forbiddenShellSyntax = [
    { pattern: /\r|\n/, label: '多行命令' },
    { pattern: /&&|\|\|/, label: '多命令串联' },
    { pattern: /[;&|<>`]/, label: 'Shell 控制符、管道或重定向' },
    { pattern: /\$\(/, label: '命令替换' },
  ]
  for (const rule of forbiddenShellSyntax) {
    if (rule.pattern.test(trimmedCmd)) {
      return { error: `安全限制：exec_command 不允许${rule.label}。请只提交单个白名单命令。` }
    }
  }

  const baseCmd = tokens[0].toLowerCase()
  const cmdName = path.basename(baseCmd, path.extname(baseCmd)).toLowerCase()

  const globalBlacklist = commandList(dbService.getSetting?.('commandBlacklist') ?? [])
  const agentBlacklist = commandList(execConfig?.blacklist ?? [])
  const effectiveBlacklist = [...globalBlacklist, ...agentBlacklist]
  const commandText = commandRuleText(trimmedCmd)
  for (const pattern of effectiveBlacklist) {
    if (commandText.startsWith(commandRuleText(pattern))) {
      return { error: `安全限制：命令匹配黑名单规则 "${pattern}"，已被拒绝执行。如需允许请在设置中移除该黑名单规则。` }
    }
  }

  const globalWhitelist = commandList(dbService.getSetting?.('commandWhitelist') ?? [])
  const agentWhitelist = commandList(execConfig?.whitelist ?? [])
  const effectiveWhitelist = [...globalWhitelist, ...agentWhitelist]
  if (!commandAllowedByWhitelist(trimmedCmd, baseCmd, cmdName, effectiveWhitelist)) {
    return { error: `安全限制：命令 "${baseCmd}" 不在白名单中。当前允许的命令：${effectiveWhitelist.join(', ')}。如需允许请在设置中添加。` }
  }

  if (isScriptShellCommand(baseCmd, cmdName)) {
    if (nestedShell) {
      return { error: '不允许在 bash/sh -c 内部再次调用 bash/sh，避免嵌套 shell 绕过命令策略。' }
    }
    return prepareScriptShellCommand(tokens, { dbService, workDirService, execConfig, nestedShell })
  }

  return {
    spawn: false,
    command: trimmedCmd,
    cwd: workDirService?.getRootPath?.() || undefined,
    redactText: vfsResolver ? (text) => vfsResolver.redactText(text, vfsContext || {}) : null,
  }
}

export function validateSafeCommand(command, options = {}) {
  return prepareSafeCommand(command, options).error || null
}

export function prepareSafeStructuredCommand(input = {}, {
  dbService = null,
  workDirService = null,
  execConfig = null,
  vfsResolver = null,
  vfsContext = null,
} = {}) {
  if (!dbService?.getSetting) {
    return { error: '安全限制：未初始化命令安全设置，不能执行命令。' }
  }
  if (!workDirService?.getRootPath?.()) {
    return { error: '安全限制：未初始化工作空间，不能执行命令。' }
  }
  const allowExec = dbService.getSetting?.('allowExecCommand') ?? false
  if (!allowExec) {
    return { error: `安全限制：命令执行功能已被全局禁用。请在设置 > 沙箱保护 > 命令执行安全中开启"允许执行命令"。` }
  }

  const cmd = String(input.cmd || '').trim()
  const args = Array.isArray(input.args) ? input.args.map(v => String(v)) : []
  if (!cmd) return { error: '安全限制：cmd 不能为空。' }
  if (/\s|[;&|<>`]/.test(cmd) || /\$\(/.test(cmd)) {
    return { error: '安全限制：cmd 只能是单个命令名，不能包含空白、shell 控制符或命令替换。' }
  }

  const baseCmd = cmd.toLowerCase()
  const cmdName = path.basename(baseCmd, path.extname(baseCmd)).toLowerCase()
  const commandText = commandRuleText([cmd, ...args].join(' '))

  const globalBlacklist = commandList(dbService.getSetting?.('commandBlacklist') ?? [])
  const agentBlacklist = commandList(execConfig?.blacklist ?? [])
  const effectiveBlacklist = [...globalBlacklist, ...agentBlacklist]
  for (const pattern of effectiveBlacklist) {
    if (commandText.startsWith(commandRuleText(pattern))) {
      return { error: `安全限制：命令匹配黑名单规则 "${pattern}"，已被拒绝执行。如需允许请在设置中移除该黑名单规则。` }
    }
  }

  const globalWhitelist = commandList(dbService.getSetting?.('commandWhitelist') ?? [])
  const agentWhitelist = commandList(execConfig?.whitelist ?? [])
  const effectiveWhitelist = [...globalWhitelist, ...agentWhitelist]
  if (!commandAllowedByWhitelist(commandText, baseCmd, cmdName, effectiveWhitelist)) {
    return { error: `安全限制：命令 "${baseCmd}" 不在白名单中。当前允许的命令：${effectiveWhitelist.join(', ')}。如需允许请在设置中添加。` }
  }

  if (!vfsResolver?.resolveExecCommand) {
    return {
      spawn: true,
      command: cmd,
      args,
      cwd: workDirService.getRootPath(),
    }
  }

  if (isScriptShellCommand(baseCmd, cmdName)) {
    if (args.length === 1 && isShellInfoOption(args[0])) {
      return {
        spawn: true,
        command: cmd,
        args,
        cwd: workDirService.getRootPath(),
        redactText: (text) => vfsResolver.redactText(text, vfsContext || {}),
      }
    }
    if (!args[0] || args[0].startsWith('-')) {
      return { error: '安全限制：结构化 bash/sh 只允许 --version、--help 或执行授权工作区内 .sh/.bash 脚本；不开放 -c/-lc。' }
    }
    let script
    try {
      script = vfsResolver.resolve(args[0], { ...(vfsContext || {}), op: 'exec_arg' })
    } catch (e) {
      return { error: `安全限制：shell 脚本路径必须位于授权工作区内。${e.message}` }
    }
    if (!fs.existsSync(script.realPath)) return { error: '安全限制：shell 脚本文件不存在。' }
    if (!SHELL_SCRIPT_EXTS.has(path.extname(script.realPath).toLowerCase())) {
      return { error: '安全限制：bash/sh 只允许执行 .sh 或 .bash 脚本文件。' }
    }
    return {
      spawn: true,
      command: cmd,
      args: [scriptShellPathArg(script.realPath), ...args.slice(1)],
      cwd: path.dirname(script.realPath),
      redactText: (text) => vfsResolver.redactText(text, vfsContext || {}),
    }
  }

  try {
    const resolved = vfsResolver.resolveExecCommand({
      cmd,
      args,
      cwd: input.cwd || '/',
    }, vfsContext || {})
    return {
      spawn: true,
      command: resolved.cmd,
      args: resolved.args,
      cwd: resolved.cwd,
      virtual: resolved.virtual,
      redactText: (text) => vfsResolver.redactText(text, vfsContext || {}),
    }
  } catch (e) {
    return { error: `安全限制：命令路径参数未通过 VFS 校验。${e.message}` }
  }
}

export function validateSafeStructuredCommand(input, options = {}) {
  return prepareSafeStructuredCommand(input, options).error || null
}

function runSpawnedCommand(prepared) {
  return new Promise((resolve) => {
    const child = spawn(prepared.command, prepared.args || [], {
      cwd: prepared.cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    })
    const stdoutChunks = []
    const stderrChunks = []
    let stdoutSize = 0
    let stderrSize = 0
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }
    const append = (chunks, data, kind) => {
      if (kind === 'stdout') {
        stdoutSize += data.length
        if (stdoutSize <= EXEC_COMMAND_MAX_BUFFER) chunks.push(data)
      } else {
        stderrSize += data.length
        if (stderrSize <= EXEC_COMMAND_MAX_BUFFER) chunks.push(data)
      }
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ exitCode: 124, stdout: '', stderr: 'command timeout' })
    }, EXEC_COMMAND_TIMEOUT_MS)

    child.stdout.on('data', d => append(stdoutChunks, d, 'stdout'))
    child.stderr.on('data', d => append(stderrChunks, d, 'stderr'))
    child.on('error', err => finish({ exitCode: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: redactPrepared(prepared, err.message) }))
    child.on('close', code => {
      const stdout = redactPrepared(prepared, Buffer.concat(stdoutChunks).toString('utf8'))
      const stderr = redactPrepared(prepared, Buffer.concat(stderrChunks).toString('utf8'))
      finish({
        exitCode: code ?? 0,
        stdout: clipOutput(stdout, EXEC_COMMAND_STDOUT_LIMIT).text,
        stderr: clipOutput(stderr, EXEC_COMMAND_STDERR_LIMIT).text,
        stdoutTruncated: stdoutSize > EXEC_COMMAND_MAX_BUFFER,
        stderrTruncated: stderrSize > EXEC_COMMAND_MAX_BUFFER,
      })
    })
  })
}

function runExecCommand(prepared) {
  return new Promise((resolve) => {
    exec(prepared.command, {
      cwd: prepared.cwd,
      timeout: EXEC_COMMAND_TIMEOUT_MS,
      maxBuffer: EXEC_COMMAND_MAX_BUFFER,
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          exitCode: error.code || 1,
          stdout: clipOutput(redactPrepared(prepared, stdout || ''), EXEC_COMMAND_STDOUT_LIMIT).text,
          stderr: clipOutput(redactPrepared(prepared, stderr || error.message), EXEC_COMMAND_STDERR_LIMIT).text,
        })
        return
      }
      resolve({
        exitCode: 0,
        stdout: clipOutput(redactPrepared(prepared, stdout || ''), EXEC_COMMAND_STDOUT_LIMIT).text,
        stderr: clipOutput(redactPrepared(prepared, stderr || ''), EXEC_COMMAND_STDERR_LIMIT).text,
      })
    })
  })
}

export async function runSafeCommand(command, options = {}) {
  const prepared = prepareSafeCommand(command, options)
  if (prepared.error) return { exitCode: 126, stdout: '', stderr: prepared.error }
  if (prepared.spawn) return runSpawnedCommand(prepared)
  return runExecCommand(prepared)
}

export async function runSafeStructuredCommand(input, options = {}) {
  const prepared = prepareSafeStructuredCommand(input, options)
  if (prepared.error) return { exitCode: 126, stdout: '', stderr: prepared.error }
  const result = await runSpawnedCommand(prepared)
  return { ...result, cwd: prepared.virtual?.cwd, args: prepared.virtual?.args }
}
