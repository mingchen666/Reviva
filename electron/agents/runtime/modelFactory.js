// agents/runtime/modelFactory.js — extracted from AgentService.js
// Pure model-creation functions with zero instance-state dependency.

import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAIResponsesCompat, ChatOpenAICompletionsCompat, normalizeAnthropicApiUrl } from './modelAdapters.js'

function isAnthropicFormat(providerId, apiFormat = '') {
  return normalizeApiFormat(providerId, apiFormat) === 'anthropic'
}

function normalizeApiFormat(providerId, apiFormat = '') {
  const value = String(apiFormat || '').trim().toLowerCase()
  if (['openai_responses', 'openai-responses', 'openai_response', 'openai-response', 'responses', 'response'].includes(value)) return 'openai_responses'
  if (value === 'anthropic') return 'anthropic'
  if (['openai', 'openai_chat', 'openai-chat', 'chat', 'chat_completions', 'chat-completions'].includes(value)) return 'openai'
  return String(providerId || '').toLowerCase() === 'anthropic' ? 'anthropic' : 'openai'
}

function normalizeThinkingMode(mode) {
  const value = String(mode || 'auto').toLowerCase()
  if (value === 'off') return 'disabled'
  if (value === 'on') return 'enabled'
  return ['auto', 'enabled', 'disabled'].includes(value) ? value : 'auto'
}

function resolveThinkingIntensity(intensity, fallback = 'medium') {
  const value = String(intensity || fallback).toLowerCase()
  return ['low', 'medium', 'high', 'xhigh', 'max'].includes(value) ? value : fallback
 }

function providerThinkingIntensity(intensity, provider) {
  const v = resolveThinkingIntensity(intensity)
  if (provider === 'anthropic') return v
  // Non-Anthropic providers only support low/medium/high
  if (v === 'xhigh' || v === 'max') return 'high'
  return v
}

function openAIReasoningEffort(providerId, modelName, options = {}) {
  const mode = normalizeThinkingMode(options.thinkingMode)
  if (mode === 'disabled') return ''
  const model = String(modelName || '').toLowerCase()
  const isOpenAI = String(providerId || '').toLowerCase() === 'openai'
  const isReasoningModel = /^(o\d|gpt-5)/.test(model)
  // When explicitly enabled, send reasoning_effort to any OpenAI-compatible provider
  if (mode === 'enabled') return providerThinkingIntensity(options.thinkingIntensity, 'openai')
  // Auto mode: only for OpenAI reasoning models (o-series, gpt-5)
  if (!isOpenAI || !isReasoningModel) return ''
  return providerThinkingIntensity(options.thinkingIntensity, 'openai')
}

export function createModel(providerId, apiKey, baseUrl, modelName, options = {}) {
  const common = { apiKey, model: modelName, maxRetries: 1 }
  const timeout = options.timeout || 300000
  if (options.temperature !== undefined) common.temperature = options.temperature
  if (options.maxTokens) common.maxTokens = options.maxTokens
  if (options.topP !== undefined) common.topP = options.topP

  if (isAnthropicFormat(providerId, options.apiFormat)) {
    const anthropicApiUrl = normalizeAnthropicApiUrl(baseUrl)
  const anthropicOpts = { ...common, timeout }
    if (options.streaming === true) anthropicOpts.streaming = true
    if (options.disableStreaming === true) anthropicOpts.disableStreaming = true
    if (anthropicApiUrl) anthropicOpts.anthropicApiUrl = anthropicApiUrl
   if (normalizeThinkingMode(options.thinkingMode) === 'enabled') {
     const budgetMap = { low: 2000, medium: 10000, high: 32000, xhigh: 64000, max: 128000 }
     anthropicOpts.thinking = {
       type: 'enabled',
       budget_tokens: Math.min(budgetMap[resolveThinkingIntensity(options.thinkingIntensity)] || 10000, (options.maxTokens || 4096) - 256),
     }
   }
    return new ChatAnthropic(anthropicOpts)
  }

  // OpenAI-compatible providers: choose the API surface explicitly from provider.apiFormat.
  const openaiOpts = { ...common, timeout }
  if (options.streaming === true) openaiOpts.streaming = true
  if (options.disableStreaming === true) openaiOpts.disableStreaming = true
 if (baseUrl) {
   openaiOpts.configuration = { baseURL: baseUrl }
 }
  const _apiFormat = normalizeApiFormat(providerId, options.apiFormat)
  const reasoningEffort = options.reasoningEffort || openAIReasoningEffort(providerId, modelName, options)
  if (reasoningEffort) {
    openaiOpts.reasoningEffort = reasoningEffort
    // Inject via modelKwargs to bypass LangChain's isReasoningModel gate.
    // Send only the format matching the provider's API surface to avoid 400 from strict providers:
    //   - Chat Completions API  -> reasoning_effort
    //   - Responses API          -> reasoning.effort
    if (_apiFormat === 'openai_responses') {
      openaiOpts.modelKwargs = { ...(openaiOpts.modelKwargs || {}), reasoning: { effort: reasoningEffort } }
    } else {
      openaiOpts.modelKwargs = { ...(openaiOpts.modelKwargs || {}), reasoning_effort: reasoningEffort }
    }
  }
  const ChatModel = _apiFormat === 'openai_responses'
    ? ChatOpenAIResponsesCompat
    : ChatOpenAICompletionsCompat
  return new ChatModel(openaiOpts)
}

