export const ERROR_INFO = {
  // ── Network & Provider errors ──
  NETWORK_ERROR: {
    title: '网络连接失败',
    icon: 'ri-wifi-off-line',
    suggestion: '请检查网络连接或代理设置',
    color: 'warning',
  },
  AUTH_ERROR: {
    title: '认证失败',
    icon: 'ri-lock-line',
    suggestion: '请检查设置中的 API Key 是否正确',
    color: 'error',
  },
  RATE_LIMIT: {
    title: '请求频率超限',
    icon: 'ri-timer-line',
    suggestion: '请稍等片刻后重试，或降低发送频率',
    color: 'warning',
  },
  API_ERROR: {
    title: '服务端错误',
    icon: 'ri-error-warning-line',
    suggestion: '服务商暂时异常，请稍后重试',
    color: 'error',
  },
  ABORTED: {
    title: '已取消',
    icon: 'ri-stop-circle-line',
    suggestion: '对话已被手动取消',
    color: 'default',
  },
  INVALID_REQUEST: {
    title: '请求格式错误',
    icon: 'ri-file-warning-line',
    suggestion: '请检查输入内容是否符合要求',
    color: 'error',
  },

  // ── Agent-specific errors ──
  CONTEXT_OVERFLOW: {
    title: '上下文超限',
    icon: 'ri-database-2-line',
    suggestion: '对话内容过长，已自动压缩历史记录',
    color: 'info',
  },
  TOOL_EXECUTION_FAILED: {
    title: '工具执行失败',
    icon: 'ri-tools-line',
    suggestion: '工具执行出错，智能体将尝试其他方式',
    color: 'warning',
  },
  TOOL_DEPENDENCY_MISSING: {
    title: '缺少工具依赖',
    icon: 'ri-tools-line',
    suggestion: '请到设置中的环境检测安装或修复对应依赖',
    color: 'warning',
  },
  TOOL_OPERATION_NOT_ALLOWED: {
    title: '工具能力未启用',
    icon: 'ri-lock-line',
    suggestion: '请在智能体工具配置中启用对应工具集或子能力',
    color: 'warning',
  },
  TOOL_INPUT_NOT_ALLOWED: {
    title: '工具输入受限',
    icon: 'ri-shield-line',
    suggestion: '请确认文件位于授权目录内，或先添加到上下文',
    color: 'warning',
  },
  SUB_AGENT_FAILED: {
    title: '子智能体执行失败',
    icon: 'ri-robot-line',
    suggestion: '委托任务失败，智能体将尝试自行处理',
    color: 'warning',
  },
  MAX_ITERATIONS: {
    title: '达到最大迭代次数',
    icon: 'ri-loop-left-line',
    suggestion: '任务可能过于复杂，请尝试拆分为更小的子任务',
    color: 'info',
  },
  RECURSION_LIMIT: {
    title: '迭代步数已达上限',
    icon: 'ri-loop-left-line',
    suggestion: 'Agent 执行步数达到限制，任务中途停止。可尝试增加迭代次数或简化任务',
    color: 'warning',
  },
  MODEL_REFUSAL: {
    title: '模型拒绝响应',
    icon: 'ri-shield-line',
    suggestion: '请求内容可能违反了使用政策',
    color: 'error',
  },

  // ── Configuration errors ──
  NO_PROVIDER: {
    title: '未配置提供商',
    icon: 'ri-cloud-off-line',
    suggestion: '请先在设置中配置 AI 服务提供商',
    color: 'error',
  },
  NO_API_KEY: {
    title: 'API Key 未配置',
    icon: 'ri-key-line',
    suggestion: '请在设置中填写对应提供商的 API Key',
    color: 'error',
  },
  VISION_MODEL_REQUIRED: {
    title: '需要视觉模型',
    icon: 'ri-eye-line',
    suggestion: '请切换到支持图片识别的模型后再发送图片',
    color: 'warning',
  },
}

export function getErrorInfo(code) {
  return ERROR_INFO[code] || {
    title: '未知错误',
    icon: 'ri-error-warning-line',
    suggestion: '请稍后重试，或查看错误详情',
    color: 'error',
  }
}
