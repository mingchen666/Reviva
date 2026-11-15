// agents/tools/pythonEnvTools.js — Python venv query tool for Agents.
// Lets the Agent check venv readiness, interpreter info, and installed packages
// so it can proactively determine whether skill Python dependencies are satisfied
// before running scripts, and guide the user to initialize/install if not.

import { tool } from 'langchain'
import { z } from 'zod'
import { _pythonEnvService } from './toolContext.js'

export const pythonEnv = tool(
  async ({ action, package_name, packages, check_script }) => {
    const svc = _pythonEnvService
    if (!svc) {
      return JSON.stringify({
        success: false,
        error: 'Python 环境服务未就绪。',
      })
    }

    try {
      if (action === 'status') {
        const status = await svc.getStatus()
        return JSON.stringify({
          success: true,
          venv: {
            ready: status.venv.ready,
            path: status.venv.path,
            baseSource: status.venv.baseSource,
            baseVersion: status.venv.baseVersion,
            createdAt: status.venv.createdAt,
          },
          interpreter: {
            source: status.interpreter.source,
            version: status.interpreter.version,
            available: status.interpreter.available,
            fallback: status.interpreter.fallback,
          },
          bundled: { available: status.bundled.available },
          targetVersion: status.targetVersion,
        })
      }

      if (action === 'list_packages') {
        const result = await svc.listPackages()
        return JSON.stringify(result)
      }

      if (action === 'check_package') {
        if (!package_name) {
          return JSON.stringify({ success: false, error: '缺少 package_name 参数。' })
        }
        const info = await svc.getPackageInfo(package_name)
        return JSON.stringify(info)
      }

      if (action === 'install_packages') {
        if (!Array.isArray(packages) || packages.length === 0) {
          return JSON.stringify({ success: false, error: '缺少 packages 参数（字符串数组）。' })
        }
        const venvReady = svc.isVenvReadySync?.()
        if (!venvReady) {
          return JSON.stringify({ success: false, error: '虚拟环境未就绪，请先提示用户在设置 > 虚拟环境管理中初始化虚拟环境。' })
        }
        const result = await svc.installPackages({ packages, checkScript: check_script })
        // Trim pip output to save tokens: success returns brief summary,
        // failure returns last 800 chars of stderr for diagnosis.
        if (result.success) {
          return JSON.stringify({
            success: true,
            packages: result.packages,
            check: result.check || null,
            installed: true,
          })
        }
        return JSON.stringify({
          success: false,
          error: result.error || '安装失败。',
          packages: result.packages,
          stderr: (result.stderr || '').slice(-800),
          check: result.check || null,
        })
      }

      return JSON.stringify({ success: false, error: `未知的 action: ${action}` })
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message })
    }
  },
  {
    name: 'python_env',
    description: [
      '查询 Reviva 托管的 Python 虚拟环境（venv）状态和已安装的 Python 库。',
      '执行 Python 脚本或 Skill 前，可用此工具确认 venv 是否就绪、所需库是否已安装，避免盲目执行后才发现缺库。',
      '- action="status"：获取 venv 整体状态（是否就绪、解释器来源/版本、路径）。',
      '- action="list_packages"：列出 venv 中已安装的所有包（名称+版本），排除 pip/setuptools/wheel。',
      '- action="check_package"：检查单个包是否已安装，需传 package_name。',
'- action="install_packages"：往 venv 安装 Python 包，需传 packages（字符串数组，如 ["pymupdf"]），可选 check_script（安装后验证导入的 Python 代码）。',
'  常用场景：工具返回 DEPENDENCY_MISSING 时（如 PDF 读取缺 pymupdf），先安装再重试，而不是直接让用户去设置页。',
'  也可用 exec_command({cmd:"python",args:["-m","pip","install","包名"]}) 安装，效果相同（exec_command 执行 python 时自动走 venv）。',
      'venv 未就绪时返回的 ready 为 false，应提示用户在"设置 > 虚拟环境管理"中初始化。',
    ].join('\n'),
    schema: z.object({
      action: z.enum(['status', 'list_packages', 'check_package', 'install_packages']).describe('查询或安装类型'),
      package_name: z.string().optional().describe('当 action="check_package" 时指定要检查的包名'),
packages: z.array(z.string()).optional().describe('当 action="install_packages" 时指定要安装的包名列表，如 ["pymupdf", "matplotlib"]'),
check_script: z.string().optional().describe('安装后验证导入的 Python 代码，如 import fitz')
    }),
  },
)
