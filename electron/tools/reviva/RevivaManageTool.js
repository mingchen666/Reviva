import { tool } from 'langchain'
import { z } from 'zod'

import * as registry from './RevivaActionRegistry.js'
import { errorResponse, errorResponseFromThrow } from './errorResponse.js'
import { notifySettingsChanged } from './settingsNotifier.js'

// Register all domains
import { register as registerUsage } from './domains/usage.js'
import { register as registerAppearance } from './domains/appearance.js'
import { register as registerPreferences } from './domains/preferences.js'
import { register as registerCreationTools } from './domains/creationTools.js'
import { register as registerQuickInputs } from './domains/quickInputs.js'
import { register as registerStatus } from './domains/status.js'
import { register as registerAgents } from './domains/agents.js'
import { register as registerLearning } from './domains/learning.js'

const WRITE_LIMIT = 15

// Ensure domains are registered once
let _initialized = false
function _ensureRegistered() {
  if (_initialized) return
  registerUsage(registry, {})
  registerAppearance(registry, {})
  registerPreferences(registry, {})
  registerCreationTools(registry, {})
  registerQuickInputs(registry, {})
  registerStatus(registry, {})
  registerAgents(registry, {})
  registerLearning(registry, {})
  _initialized = true
}

const OUTPUT_LIMIT = 30000

function _truncate(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data)
  if (!text || text.length <= OUTPUT_LIMIT) return { data, truncated: false }
  return { data: text.slice(0, OUTPUT_LIMIT), truncated: true, total_count: text.length }
}

// Build the context object passed to each action's execute function
function _buildCtx(opts, action) {
  return {
    dbService: opts.getDbService?.(),
    themeService: opts.getThemeService?.(),
    learningMemoryService: opts.getLearningMemoryService?.(),
    workDirService: opts.getWorkDirService?.(),
    skillService: opts.getSkillService?.(),
    mcpService: opts.getMcpService?.(),
    permission: opts.getPermissions?.()?.revivaManage || 'readwrite',
    writeCount: opts.getWriteCount?.() || 0,
  }
}

export async function dispatch(action, domain, params, opts) {
  _ensureRegistered()

  // 0. Global switch check (runtime backstop)
  const dbService = opts.getDbService?.()
  if (dbService?.getSetting?.('allowRevivaManage') !== true) {
    return errorResponse('PERMISSION_DENIED', action, domain, {
      message: 'Agent 自管理功能未开启',
      hint: '请在设置 > 沙箱与限流中打开"允许 Agent 管理 Reviva 设置"',
    })
  }

  // 1. help — special handling
  if (action === 'help') {
    if (!domain) {
 // Level 1: list all domains
      const domains = registry.listDomains()
      return { ok: true, domains, hint: '指定 domain 查看该领域操作，如 {action:"help", domain:"usage"}' }
    }
 // Level 2: list actions in a domain
    const perm = opts.getPermissions?.()?.revivaManage || 'readwrite'
    const result = registry.listActions(domain, { permission: perm })
    if (!result) {
      return errorResponse('UNKNOWN_DOMAIN', 'help', domain, {
        available: registry.getAllDomainIds(),
        hint: 'domain 不存在，请从 available 列表中选择',
      })
    }
    return { ok: true, ...result }
  }

  // 2. Non-help action requires domain
  if (!domain) {
    return errorResponse('MISSING_DOMAIN', action, undefined, {
      hint: '执行操作时必须传 domain，如 {action:"summary", domain:"usage"}',
    })
  }

  // 3. Check domain exists
  if (!registry.hasDomain(domain)) {
    return errorResponse('UNKNOWN_DOMAIN', action, domain, {
      available: registry.getAllDomainIds(),
      hint: 'domain 不存在',
    })
  }

  // 4. Find action
  const entry = registry.get(action, domain)
  if (!entry) {
    return errorResponse('UNKNOWN_ACTION', action, domain, {
      hint: '调用 action="help", domain="' + domain + '" 查看可用操作',
    })
  }

  // 5. Write permission check
  const perm = opts.getPermissions?.()?.revivaManage || 'readwrite'
  if (entry.write && perm !== 'readwrite') {
    return errorResponse('PERMISSION_DENIED', action, domain, {
      hint: '需要 readwrite 权限才能执行写操作',
    })
  }

  // 6. Write rate limiting
  if (entry.write) {
    const writeCount = opts.getWriteCount?.() || 0
    if (writeCount >= WRITE_LIMIT) {
      return errorResponse('RATE_LIMITED', action, domain, {
        hint: `本次运行写操作已达上限 ${WRITE_LIMIT} 次`,
      })
    }
    opts.setWriteCount?.(writeCount + 1)
  }

  // 7. Execute
  const ctx = _buildCtx(opts, action)
  try {
    const result = await entry.execute(params || {}, ctx)

    // 8. Notify renderer of changes
    if (result.changedKeys?.length) {
      notifySettingsChanged(result.changedKeys)
    }

    // 9. Truncate large outputs
    const truncated = _truncate(result.data)
    const response = { ok: true, domain, action, data: truncated.data }
    if (truncated.truncated) {
      response.truncated = true
      response.hint = '结果已截断，可用 filters 参数缩小范围'
    }
    return response
  } catch (err) {
    return errorResponseFromThrow(err, action, domain)
  }
}

export function createRevivaManageTool(opts) {
  return tool(
    async ({ action, domain, params }) => {
      const result = await dispatch(action, domain, params, opts)
      return JSON.stringify(result)
    },
    {
      name: 'reviva_manage',
      description: [
        'Reviva 桌面应用自管理工具。',
        '查询用量、管理主题/偏好/创作工具/快捷输入/系统状态/Agent清单/学习画像。',
        '首次使用先调用 action="help" 获取可用操作。',
      ].join(' '),
      schema: z.object({
        action: z.string()
          .describe('"help" 查看领域列表；或具体操作名如 "summary"、"set_theme"'),
        domain: z.string().optional()
          .describe('领域: usage/appearance/preferences/creation_tools/quick_inputs/status/agents/learning。help 时传则看该领域操作，不传则看全部。执行操作时必填'),
        params: z.record(z.string(), z.any()).optional()
          .describe('操作参数，取决于 domain+action。help 查看参数说明和示例'),
      }),
    }
  )
}
