import { AgentRuntime } from './AgentRuntime'

let runtime = null

export function getAgentRuntime(convStore, agentsStore, settingsStore) {
  if (!runtime) {
    runtime = new AgentRuntime(convStore, agentsStore, settingsStore)
  }
  return runtime
}
