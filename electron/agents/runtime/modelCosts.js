const MODEL_COST = {
  'claude-opus-4':          { input: 108,  output: 540,  cacheRead: 10.8,  cacheWrite: 135 },
  'claude-4-7-opus':        { input: 108,  output: 540,  cacheRead: 10.8,  cacheWrite: 135 },
  'claude-sonnet-4':        { input: 21.6, output: 108,  cacheRead: 2.16,  cacheWrite: 27 },
  'claude-4-6-sonnet':      { input: 21.6, output: 108,  cacheRead: 2.16,  cacheWrite: 27 },
  'claude-haiku-4':         { input: 5.76, output: 28.8, cacheRead: 0.576, cacheWrite: 7.2 },
  'claude-4-5-haiku':       { input: 5.76, output: 28.8, cacheRead: 0.576, cacheWrite: 7.2 },
  'gpt-4o':                 { input: 18,   output: 72,   cacheRead: 1.8,   cacheWrite: 9 },
  'gpt-4o-mini':            { input: 1.08, output: 4.32, cacheRead: 0.108, cacheWrite: 0.54 },
  'o1':                     { input: 108,  output: 432,  cacheRead: 0,     cacheWrite: 0 },
  'o3-mini':                { input: 10.8, output: 43.2, cacheRead: 1.08,  cacheWrite: 5.4 },
  'deepseek-chat':          { input: 1,    output: 2,    cacheRead: 0.1,   cacheWrite: 0.5 },
  'deepseek-reasoner':      { input: 4,    output: 16,   cacheRead: 0.4,   cacheWrite: 2 },
  'gemini-2.0-flash':       { input: 0,    output: 0,    cacheRead: 0,     cacheWrite: 0 },
  'gemini-2.0-pro':         { input: 0,    output: 0,    cacheRead: 0,     cacheWrite: 0 },
  'qwen-max':               { input: 20,   output: 60,   cacheRead: 2,     cacheWrite: 10 },
  'qwen-plus':              { input: 4,    output: 12,   cacheRead: 0.4,   cacheWrite: 2 },
  'command-r-plus':         { input: 0,    output: 0,    cacheRead: 0,     cacheWrite: 0 },
}

const DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export function calcCost(model, usage) {
  const rates = MODEL_COST[model] || DEFAULT_COST
  return (
    (usage.inputTokens * rates.input +
     usage.outputTokens * rates.output +
     usage.cacheReadTokens * rates.cacheRead +
     usage.cacheWriteTokens * rates.cacheWrite) / 1_000_000
  )
}
