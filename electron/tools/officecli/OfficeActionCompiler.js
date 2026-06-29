import { argsToBatchEntry, commandOf, compileCommonAction, fail, formatOf, MAX_ACTIONS } from './actions/common.js'
import { compileDocxAction } from './actions/docx.js'
import { compilePptxAction } from './actions/pptx.js'
import { compileXlsxAction } from './actions/xlsx.js'

function compileFormatAction(filePath, action, actionIndex, command) {
  const format = formatOf(filePath)
  if (format === 'docx') return compileDocxAction(filePath, action, actionIndex, command)
  if (format === 'pptx') return compilePptxAction(filePath, action, actionIndex, command)
  if (format === 'xlsx') return compileXlsxAction(filePath, action, actionIndex, command)
  return null
}

function assertAdvancedAllowed(command, options, actionIndex) {
  if ((command === 'raw_set' || command === 'raw-set') && options.allowRawXml !== true) {
    fail('OFFICE_ACTION_RAW_XML_DISABLED', 'raw-set 需要显式传 allowRawXml=true。', actionIndex)
  }
  if (command === 'batch' && options.allowBatch !== true) {
    fail('OFFICE_ACTION_BATCH_DISABLED', 'batch 需要显式传 useBatch=true。', actionIndex)
  }
}

function compileOneOfficeAction(filePath, action, index, options = {}) {
  const command = commandOf(action)
  if (!command) fail('OFFICE_ACTION_MISSING_COMMAND', 'Office action 缺少 command。', index)
  assertAdvancedAllowed(command, options, index)

  if (command === 'batch') {
    fail('OFFICE_ACTION_BATCH_NESTED', 'useBatch 会自动批处理 actions，不支持嵌套 batch action。', index)
  }

  const common = compileCommonAction(filePath, action, index, command)
  if (common) return { index, command, args: common }

  const formatSpecific = compileFormatAction(filePath, action, index, command)
  if (formatSpecific) return { index, command, args: formatSpecific }

  fail('OFFICE_ACTION_UNSUPPORTED', `不支持的 Office action：${command}`, index)
}

function assertActionList(actions) {
  if (!Array.isArray(actions)) fail('OFFICE_ACTIONS_INVALID', 'actions 必须是数组。')
  if (actions.length > MAX_ACTIONS) {
    fail('OFFICE_ACTIONS_TOO_MANY', `单次 office_write 最多支持 ${MAX_ACTIONS} 个 actions。`)
  }
}

export function compileOfficeActions(filePath, actions = [], options = {}) {
  assertActionList(actions)
  return actions.map((action, index) => compileOneOfficeAction(filePath, action, index, options))
}

export function compileOfficeBatchActions(filePath, actions = [], options = {}) {
  assertActionList(actions)
  return actions.map((action, index) => {
    const compiled = compileOneOfficeAction(filePath, action, index, { ...options, allowBatch: true })
    const entry = argsToBatchEntry(compiled.args)
    if (!entry) fail('OFFICE_ACTION_BATCH_UNSUPPORTED', `该 action 暂不支持 batch：${compiled.command}`, index)
    return { ...compiled, batchEntry: entry }
  })
}
