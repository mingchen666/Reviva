const DB_FIELD_TO_CONFIG_FIELD = [
  ['permissions', 'permissions'],
  ['tools', 'tools'],
  ['skills', 'skills'],
  ['subAgents', 'sub_agents'],
  ['prompt', 'prompt'],
  ['maxIter', 'max_iterations'],
  ['model', 'model'],
  ['temperature', 'temperature'],
  ['topP', 'top_p'],
  ['maxTokens', 'max_tokens'],
  ['presencePenalty', 'presence_penalty'],
  ['frequencyPenalty', 'frequency_penalty'],
  ['thinkingMode', 'thinking_mode'],
  ['thinkingIntensity', 'thinking_intensity'],
  ['reviewerModel', 'reviewer_model'],
  ['useSameModel', 'use_same_model'],
  ['toolCallLimit', 'tool_call_limit'],
  ['modelCallLimit', 'model_call_limit'],
]

function cloneRuntimeValue(value) {
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return { ...value }
  return value
}

function matchesBuiltinConfig(agent, config) {
  if (!agent?.builtin) return false
  const id = String(config?.id || '').trim()
  const englishName = String(config?.english_name || '').trim()
  return agent.id === id
    || agent.builtinKey === id
    || (!!englishName && agent.englishName === englishName)
}

export function findBuiltinAgentConfigRow(db, config) {
  if (!db || !config) return null
  try {
    const direct = config.id ? db.getAgent?.(config.id) : null
    if (matchesBuiltinConfig(direct, config)) return direct
    return (db.listAgents?.() || []).find(agent => matchesBuiltinConfig(agent, config)) || null
  } catch (error) {
    console.warn('[EffectiveBuiltinAgentConfig] failed to resolve builtin agent override:', error?.message || error)
    return null
  }
}

// The database row is the already-merged user-facing configuration. Keep disk-only
// metadata (artifact rules, prompt/subagent file locations, output schema) intact
// and overlay only fields that are intentionally editable in AgentEdit.
export function resolveEffectiveBuiltinAgentConfig(config, db) {
  if (!config) return null
  const agent = findBuiltinAgentConfigRow(db, config)
  if (!agent) return config

  const effective = { ...config }
  for (const [agentField, configField] of DB_FIELD_TO_CONFIG_FIELD) {
    if (agent[agentField] === undefined || agent[agentField] === null) continue
    effective[configField] = cloneRuntimeValue(agent[agentField])
  }
  return effective
}
