// electron/agents/ErrorClassifier.js — Error classification and recovery strategies

export class ErrorClassifier {
  /**
   * Classify an error for recovery strategy
   * @param {Error} error
   * @returns {{ code: string, retryable: boolean, userMessage: string, suggestion: string }}
   */
  classify(error) {
    const msg = (error.message || '').toLowerCase()
    const code = error.code || ''
    // Try to extract actual provider error message
    const rawMsg = error.message || ''

    if (code === 'VISION_MODEL_REQUIRED' || msg.includes('不支持图片识别') || msg.includes('vision') && msg.includes('not support'))
      return { code: 'VISION_MODEL_REQUIRED', retryable: false, userMessage: '当前模型不支持图片识别', suggestion: '请切换到支持视觉能力的模型后再发送图片' }

    if (code && code.startsWith('TOOL_'))
      return { code, retryable: false, userMessage: rawMsg || '工具执行失败', suggestion: '请检查工具配置、输入文件路径或本地依赖' }

    if (msg.includes('not a valid tool') || msg.includes('try one of')) {
      return {
        code: 'TOOL_OPERATION_NOT_ALLOWED',
        retryable: false,
        userMessage: '当前 Agent 未启用所需工具',
        suggestion: rawMsg || '请在智能体工具配置中启用对应工具集或子能力',
      }
    }

    if (code === 'NETWORK_ERROR' || msg.includes('enotfound') || msg.includes('econnrefused'))
      return { code: 'NETWORK_ERROR', retryable: true, userMessage: '网络连接失败', suggestion: '请检查网络连接或代理设置' }

    if (code === 'AUTH_ERROR' || msg.includes('401') || msg.includes('authentication') || msg.includes('invalid api key') || msg.includes('invalid x-api-key'))
      return { code: 'AUTH_ERROR', retryable: false, userMessage: '认证失败', suggestion: '请检查 API Key 是否正确' }

    if (code === 'RATE_LIMIT' || msg.includes('429') || msg.includes('rate limit') || msg.includes('capacity'))
      return { code: 'RATE_LIMIT', retryable: true, userMessage: '请求频率超限', suggestion: '请稍后重试，或降低发送频率' }

    if (msg.includes('context_length_exceeded') || msg.includes('max context') || msg.includes('too many tokens'))
      return { code: 'CONTEXT_OVERFLOW', retryable: false, userMessage: '上下文超限', suggestion: '请压缩对话或减少上下文' }

    if (msg.includes('content_policy') || msg.includes('refused') || msg.includes('policy violation'))
      return { code: 'MODEL_REFUSAL', retryable: false, userMessage: '模型拒绝响应', suggestion: '请调整请求内容' }

    if (msg.includes('invalid_request') || msg.includes('invalid model') || msg.includes('does not support'))
      return { code: 'INVALID_REQUEST', retryable: false, userMessage: '请求参数错误', suggestion: rawMsg || '请检查模型配置和请求参数' }

    if (code === 'ABORTED' || msg === 'aborted')
      return { code: 'ABORTED', retryable: false, userMessage: '已取消', suggestion: '' }

    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('overloaded') || msg.includes('internal server error'))
      return { code: 'API_ERROR', retryable: true, userMessage: '服务端暂时异常', suggestion: '请稍后重试' }

    if (msg.includes('recursion') || msg.includes('Recursion') || error.name === 'GraphRecursionError')
      return { code: 'RECURSION_LIMIT', retryable: false, userMessage: '迭代步数已达上限', suggestion: 'Agent 执行步数达到限制，可尝试增加迭代次数或简化任务' }

    // Fallback: include actual error message for debugging
    return { code: 'API_ERROR', retryable: false, userMessage: rawMsg ? rawMsg.slice(0, 100) : '未知错误', suggestion: '请检查请求参数或服务商配置' }
  }
}
