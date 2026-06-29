export class BuiltinAgentTaskRunner {
  constructor({ db, agentService, emitProgress }) {
    this._db = db
    this._agentService = agentService
    this._emitProgress = emitProgress
  }

  canRun() {
    return !!this._agentService?.runBuiltinTask
  }

  async run({ task, toolId, moduleConfig, topic, params, ctxItems, providerId, apiFormat, apiKey, baseUrl, model, toolProviderConfigs, cloudContext, abortController }) {
    this._emitProgress(task.id, 12, '准备内置智能体...')
    const result = await this._agentService.runBuiltinTask({
      taskId: task.id,
      toolId,
      agentEnglishName: moduleConfig.english_name,
      topic,
      params,
      ctxItems,
      providerId,
      apiFormat,
      apiKey,
      baseUrl,
      model,
      toolProviderConfigs,
      cloudContext,
      groupId: task.group_id || 'default',
      conversationId: task.conversation_id || '',
      abortController,
      onProgress: (progress, message) => this._emitProgress(task.id, progress, message),
    })

    if (abortController.signal.aborted) return

    const artifacts = Array.isArray(result?.artifacts) ? result.artifacts : []
    if (!artifacts.length) {
      throw new Error('任务完成但未扫描到生成文件，请重试或检查智能体输出规则')
    }

    const artifactIds = artifacts.map(a => a.id).filter(Boolean)
    this._db.updateTask(task.id, {
      status: 'completed',
      progress: 100,
      artifact_id: artifactIds[0] || '',
      completed_at: new Date().toISOString(),
      result: `已生成 ${artifacts.length} 个产物`,
      params: { ...(task.params || {}), artifactIds },
    })

    return {
      taskId: task.id,
      artifactId: artifactIds[0] || '',
      artifactIds,
      groupId: task.group_id,
    }
  }
}
