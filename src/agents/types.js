// src/agents/types.js — Constants, enums, type definitions for the Agent system
// DeepAgents handles: agent loop, tool execution, context compression, retry/backoff
// Renderer only needs: streaming states, event types, error info for UI rendering

// ── Agent Run States ──────────────────────────────────────────
export const RunState = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled',
  COMPRESSING: 'compressing',
})

// ── Message Status ────────────────────────────────────────────
export const MsgStatus = Object.freeze({
  PENDING: 'pending',
  STREAMING: 'streaming',
  COMPLETED: 'completed',
  ERROR: 'error',
})

// ── Stream Event Types ───────────────────────────────────────
export const StreamEvent = Object.freeze({
  TEXT_DELTA: 'text_delta',
  THINKING_DELTA: 'thinking_delta',
  TOOL_START: 'tool_start',
  TOOL_INPUT: 'tool_input',
  TOOL_END: 'tool_end',
  TOOL_ERROR: 'tool_error',
  SUB_AGENT_START: 'sub_agent_start',
  SUB_AGENT_CHUNK: 'sub_agent_chunk',
  SUB_AGENT_END: 'sub_agent_end',
  SUB_AGENT_ERROR: 'sub_agent_error',
  TODOS: 'todos',
  AUTH_REQUEST: 'auth_request',
  DONE: 'done',
  ERROR: 'error',
  COMPRESSING: 'compressing',
  COMPRESSED: 'compressed',
})

// ── Agent Architecture Types ──────────────────────────────────
export const ArchType = Object.freeze({
  REACT: 'react',
  PLAN_EXEC: 'plan_exec',
  HYBRID: 'hybrid',
})

// ── Tool Call Status ─────────────────────────────────────────
export const ToolCallStatus = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
})

// ── Error Codes ───────────────────────────────────────────────
export const AgentErrorCode = Object.freeze({
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  RATE_LIMIT: 'RATE_LIMIT',
  API_ERROR: 'API_ERROR',
  CONTEXT_OVERFLOW: 'CONTEXT_OVERFLOW',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  SUB_AGENT_FAILED: 'SUB_AGENT_FAILED',
  MAX_ITERATIONS: 'MAX_ITERATIONS',
  MODEL_REFUSAL: 'MODEL_REFUSAL',
  ABORTED: 'ABORTED',
  INVALID_REQUEST: 'INVALID_REQUEST',
})

// ── Error Render Config ───────────────────────────────────────
export const AGENT_ERROR_INFO = Object.freeze({
  [AgentErrorCode.NETWORK_ERROR]: {
    title: '网络连接失败',
    icon: 'ri-wifi-off-line',
    suggestion: '请检查网络连接或代理设置',
    color: 'warning',
  },
  [AgentErrorCode.AUTH_ERROR]: {
    title: '认证失败',
    icon: 'ri-lock-line',
    suggestion: '请检查设置中的 API Key 是否正确',
    color: 'error',
  },
  [AgentErrorCode.RATE_LIMIT]: {
    title: '请求频率超限',
    icon: 'ri-timer-line',
    suggestion: '请稍等片刻后重试，或降低发送频率',
    color: 'warning',
  },
  [AgentErrorCode.API_ERROR]: {
    title: '服务端错误',
    icon: 'ri-error-warning-line',
    suggestion: '服务商暂时异常，请稍后重试',
    color: 'error',
  },
  [AgentErrorCode.CONTEXT_OVERFLOW]: {
    title: '上下文超限',
    icon: 'ri-database-2-line',
    suggestion: '对话内容过长，已自动压缩历史记录',
    color: 'info',
  },
  [AgentErrorCode.TOOL_EXECUTION_FAILED]: {
    title: '工具执行失败',
    icon: 'ri-tools-line',
    suggestion: '工具执行出错，智能体将尝试其他方式',
    color: 'warning',
  },
  [AgentErrorCode.SUB_AGENT_FAILED]: {
    title: '子智能体执行失败',
    icon: 'ri-robot-line',
    suggestion: '委托任务失败，智能体将尝试自行处理',
    color: 'warning',
  },
  [AgentErrorCode.MAX_ITERATIONS]: {
    title: '达到最大迭代次数',
    icon: 'ri-loop-left-line',
    suggestion: '任务可能过于复杂，请尝试拆分为更小的子任务',
    color: 'info',
  },
  [AgentErrorCode.MODEL_REFUSAL]: {
    title: '模型拒绝响应',
    icon: 'ri-shield-line',
    suggestion: '请求内容可能违反了使用政策',
    color: 'error',
  },
  [AgentErrorCode.ABORTED]: {
    title: '已取消',
    icon: 'ri-stop-circle-line',
    suggestion: '对话已被手动取消',
    color: 'default',
  },
  [AgentErrorCode.INVALID_REQUEST]: {
    title: '请求格式错误',
    icon: 'ri-file-warning-line',
    suggestion: '请检查输入内容是否符合要求',
    color: 'error',
  },
})

// ── Agent Loop Config ─────────────────────────────────────────
export const DEFAULT_MAX_ITERATIONS = 10
