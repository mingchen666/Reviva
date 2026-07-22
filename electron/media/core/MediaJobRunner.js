import { MEDIA_ERROR_CODES, normalizeMediaError } from './MediaErrors.js'
import { MEDIA_RUN_STATUSES, MEDIA_STAGES } from './MediaTypes.js'

export class MediaJobRunner {
  constructor({ runRepository, artifactService, pipeline } = {}) {
    this._runs = runRepository
    this._artifacts = artifactService
    this._pipeline = pipeline
    this._started = false
    this._active = null
    this._scheduled = false
    this._timer = null
  }

  async start() {
    this._started = true
    await this.recoverInterruptedRuns()
    this.wake()
  }

  async stop() {
    this._started = false
    if (this._timer) clearTimeout(this._timer)
    this._timer = null
    this._active?.controller.abort()
  }

  wake() {
    if (!this._started || this._scheduled || this._active) return
    if (this._timer) clearTimeout(this._timer)
    this._timer = null
    this._scheduled = true
    queueMicrotask(async () => {
      this._scheduled = false
      await this.runNext()
      this._scheduleNext()
    })
  }

  _scheduleNext() {
    if (!this._started || this._active || this._scheduled) return
    if (this._runs.listWaitingProviderRuns(new Date().toISOString(), 1).length || this._runs.listQueuedMediaRuns(1).length) {
      this.wake()
      return
    }
    const next = this._runs.getNextWaitingProviderRun?.()
    if (!next?.next_poll_at) return
    const delay = Math.max(250, new Date(next.next_poll_at).getTime() - Date.now())
    this._timer = setTimeout(() => {
      this._timer = null
      this.wake()
    }, Math.min(delay, 2147483647))
  }

  async recoverInterruptedRuns() {
    for (const run of this._runs.listActiveMediaRuns()) {
      if (run.status !== MEDIA_RUN_STATUSES.RUNNING) continue
      if (run.cancel_requested) {
        this._runs.updateMediaRun(run.id, {
          status: MEDIA_RUN_STATUSES.CANCELLED,
          nextPollAt: '',
          abandonedAt: run.provider_job_id ? new Date().toISOString() : run.abandoned_at,
          errorCode: MEDIA_ERROR_CODES.CANCELLED,
          errorMessage: '任务在应用退出前已请求取消。',
          finishedAt: new Date().toISOString(),
        })
        if (run.provider_job_id) this._artifacts.cleanupTemp(run.media_id, run.id).catch(() => {})
      } else if (run.provider_job_id) {
        this._runs.updateMediaRun(run.id, {
          status: MEDIA_RUN_STATUSES.RUNNING,
          stage: MEDIA_STAGES.WAITING_PROVIDER,
          nextPollAt: new Date().toISOString(),
          message: '正在恢复云端转写任务。',
        })
      } else if (run.stage !== MEDIA_STAGES.WAITING_PROVIDER) {
        this._runs.updateMediaRun(run.id, {
          status: MEDIA_RUN_STATUSES.QUEUED,
          stage: '',
          progress: 0,
          message: '任务将在应用恢复后重新执行。',
        })
      }
    }
  }

  async runNext() {
    if (this._active) return null
    const waitingRun = this._runs.listWaitingProviderRuns(new Date().toISOString(), 1)[0]
    const run = waitingRun || this._runs.listQueuedMediaRuns(1)[0]
    if (!run) return null
    const resumingProvider = Boolean(waitingRun)
    const controller = new AbortController()
    this._active = { runId: run.id, controller, resumingProvider }
    const startedAt = new Date().toISOString()
    if (resumingProvider) {
      this._runs.updateMediaRun(run.id, { heartbeatAt: startedAt, message: '正在查询云端转写任务。' })
    } else {
      this._runs.updateMediaRun(run.id, {
        status: MEDIA_RUN_STATUSES.RUNNING,
        progress: 1,
        startedAt,
        heartbeatAt: startedAt,
        errorCode: '',
        errorMessage: '',
      })
    }
    try {
      const currentRun = this._runs.getMediaRun(run.id)
      const outcome = await (resumingProvider
        ? this._pipeline.resumeProvider(currentRun, {
          signal: controller.signal,
          onStage: async (stage, progress, message) => {
            this._runs.updateMediaRun(run.id, { status: MEDIA_RUN_STATUSES.RUNNING, stage, progress, message, heartbeatAt: new Date().toISOString() })
          },
        })
        : this._pipeline.execute(currentRun, {
        signal: controller.signal,
        onStage: async (stage, progress, message) => {
          this._runs.updateMediaRun(run.id, {
            status: MEDIA_RUN_STATUSES.RUNNING,
            stage,
            progress,
            message,
            heartbeatAt: new Date().toISOString(),
          })
        },
      }))
      if (outcome?.waitingProvider) {
        const pollAfterMs = Math.max(5000, Number(outcome.pollAfterMs) || 30000)
        this._runs.updateMediaRun(run.id, {
          status: MEDIA_RUN_STATUSES.RUNNING,
          stage: MEDIA_STAGES.WAITING_PROVIDER,
          progress: 64,
          message: '云端正在转写，稍后继续查询。',
          sttProviderId: outcome.providerId || currentRun.stt_provider_id,
          sttModelId: outcome.providerModel || currentRun.stt_model_id,
          providerJobId: outcome.providerJobId || currentRun.provider_job_id,
          providerJobStatus: outcome.providerJobStatus || currentRun.provider_job_status,
          providerJobMeta: outcome.providerJobMeta || currentRun.provider_job_meta || {},
          nextPollAt: new Date(Date.now() + pollAfterMs).toISOString(),
          heartbeatAt: new Date().toISOString(),
          errorCode: '',
          errorMessage: '',
        })
      }
      return this._runs.getMediaRun(run.id)
    } catch (error) {
      const normalized = normalizeMediaError(error)
      const cancelled = controller.signal.aborted || normalized.code === MEDIA_ERROR_CODES.CANCELLED
      if (resumingProvider && normalized.retryable && !cancelled) {
        const delay = normalized.status === 429 ? 60000 : 30000
        this._runs.updateMediaRun(run.id, {
          status: MEDIA_RUN_STATUSES.RUNNING,
          stage: MEDIA_STAGES.WAITING_PROVIDER,
          message: `${normalized.message} 将自动重试。`,
          nextPollAt: new Date(Date.now() + delay).toISOString(),
          retryCount: Number(run.retry_count || 0) + 1,
          lastRetryAt: new Date().toISOString(),
          lastErrorCode: normalized.code,
          heartbeatAt: new Date().toISOString(),
        })
        return this._runs.getMediaRun(run.id)
      }
      await this._artifacts.cleanupTemp(run.media_id, run.id)
      this._runs.updateMediaRun(run.id, {
        status: cancelled ? MEDIA_RUN_STATUSES.CANCELLED : MEDIA_RUN_STATUSES.FAILED,
        progress: 100,
        errorCode: normalized.code,
        errorMessage: normalized.message,
        nextPollAt: '',
        abandonedAt: cancelled && run.provider_job_id ? new Date().toISOString() : run.abandoned_at,
        finishedAt: new Date().toISOString(),
      })
      return this._runs.getMediaRun(run.id)
    } finally {
      this._active = null
    }
  }

  requestCancel(runId) {
    const run = this._runs.getMediaRun(runId)
    if (!run) return null
    this._runs.updateMediaRun(runId, { cancelRequested: true, message: '正在取消任务' })
    if (this._active?.runId === runId) this._active.controller.abort()
    else if (run.stage === MEDIA_STAGES.WAITING_PROVIDER) {
      this._runs.updateMediaRun(runId, {
        status: MEDIA_RUN_STATUSES.CANCELLED,
        progress: 100,
        nextPollAt: '',
        providerCancelStatus: 'unsupported',
        abandonedAt: new Date().toISOString(),
        errorCode: MEDIA_ERROR_CODES.CANCELLED,
        errorMessage: '任务已取消；已提交的云端任务将不再查询或发布。',
        finishedAt: new Date().toISOString(),
      })
      this._artifacts.cleanupTemp(run.media_id, run.id).catch(() => {})
      if (this._timer) clearTimeout(this._timer)
      this._timer = null
      this._scheduleNext()
    } else if (run.status === MEDIA_RUN_STATUSES.QUEUED) {
      this._runs.updateMediaRun(runId, {
        status: MEDIA_RUN_STATUSES.CANCELLED,
        progress: 100,
        errorCode: MEDIA_ERROR_CODES.CANCELLED,
        errorMessage: '任务已取消。',
        finishedAt: new Date().toISOString(),
      })
    }
    return this._runs.getMediaRun(runId)
  }

  async cancelMediaRuns(mediaId, { timeoutMs = 15000 } = {}) {
    const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 15000)
    const activeRuns = () => this._runs.listActiveMediaRunsForMedia?.(mediaId)
      || this._runs.listActiveMediaRuns(500).filter(run => run.media_id === mediaId)
    for (const run of activeRuns()) this.requestCancel(run.id)
    while (activeRuns().length || (this._active && this._runs.getMediaRun(this._active.runId)?.media_id === mediaId)) {
      if (Date.now() >= deadline) {
        throw new Error('媒体解析任务取消超时，暂未清理解析数据。')
      }
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    return { success: true }
  }
}
