import { MediaArtifactService } from './core/MediaArtifactService.js'
import { MediaIngestionService } from './core/MediaIngestionService.js'
import { MediaJobRunner } from './core/MediaJobRunner.js'
import { MediaLifecycleService } from './core/MediaLifecycleService.js'
import { MediaMaintenanceService } from './core/MediaMaintenanceService.js'
import { LocalMediaPipeline } from './core/LocalMediaPipeline.js'
import { MediaQueryService } from './core/MediaQueryService.js'
import { FfmpegRunner } from './processing/FfmpegRunner.js'
import { MediaProbeService } from './processing/MediaProbeService.js'
import { SegmentNormalizeService } from './processing/SegmentNormalizeService.js'
import { SubtitleNormalizeService } from './processing/SubtitleNormalizeService.js'
import { TimelineIndexService } from './processing/TimelineIndexService.js'
import { KeyframeService } from './processing/KeyframeService.js'
import { LocalFileSourceProvider } from './sources/local/LocalFileSourceProvider.js'
import { DirectUrlSourceProvider } from './sources/direct/DirectUrlSourceProvider.js'
import { MediaSourceService } from './sources/MediaSourceService.js'
import { SourceProviderRegistry } from './sources/SourceProviderRegistry.js'
import { SpeechToTextRegistry } from './stt/SpeechToTextRegistry.js'
import { LocalAsrProvider } from './stt/LocalAsrProvider.js'
import { OpenAiWhisperProvider } from './stt/OpenAiWhisperProvider.js'
import { AliyunBailianAsrProvider } from './stt/AliyunBailianAsrProvider.js'
import { DirectMediaDownloader } from './acquisition/DirectMediaDownloader.js'
import { MediaAcquisitionService } from './acquisition/MediaAcquisitionService.js'
import { BilibiliDownloader } from './acquisition/BilibiliDownloader.js'
import { BilibiliApiClient } from './sources/bilibili/BilibiliApiClient.js'
import { BilibiliCookieService } from './sources/bilibili/BilibiliCookieService.js'
import { BilibiliSourceProvider } from './sources/bilibili/BilibiliSourceProvider.js'
import { BilibiliSubtitleAdapter } from './sources/bilibili/BilibiliSubtitleAdapter.js'

export function createMediaModule(dependencies = {}) {
  const database = dependencies.database || null
  const repositories = database?.mediaRepositories || null
  const workDirService = dependencies.workDirService || null
  if (!repositories || !workDirService) {
    return Object.freeze({
      dependencies: Object.freeze({
        database,
        workDirService,
        secretStore: dependencies.secretStore || null,
        ffmpegRuntime: dependencies.ffmpegRuntime || null,
      }),
      repositories,
    })
  }

  const ffmpegRunner = dependencies.ffmpegRunner || new FfmpegRunner({ workDirService })
  const segmentNormalizer = new SegmentNormalizeService()
  const subtitleService = new SubtitleNormalizeService({ segmentNormalizer })
  const probeService = new MediaProbeService({ ffmpegRunner })
  const timelineService = new TimelineIndexService()
  const speechToTextRegistry = new SpeechToTextRegistry([
    new LocalAsrProvider(),
    new OpenAiWhisperProvider(),
    new AliyunBailianAsrProvider(),
  ])
  const directDownloader = new DirectMediaDownloader()
  const bilibiliCookies = new BilibiliCookieService({
    database,
    secretStore: dependencies.secretStore || null,
  })
  const bilibiliClient = new BilibiliApiClient({ cookieService: bilibiliCookies })
  const bilibiliSubtitleAdapter = new BilibiliSubtitleAdapter({ segmentNormalizer, subtitleService })
  const bilibiliDownloader = new BilibiliDownloader({
    client: bilibiliClient,
    directDownloader,
    subtitleAdapter: bilibiliSubtitleAdapter,
    ffmpegRunner,
  })
  const registry = new SourceProviderRegistry([
    new LocalFileSourceProvider({ workDirService }),
    new BilibiliSourceProvider({ client: bilibiliClient }),
    new DirectUrlSourceProvider(),
  ])
  const sourceService = new MediaSourceService({
    registry,
    mediaRepository: repositories.media,
    locationRepository: repositories.locations,
  })
  const artifactService = new MediaArtifactService({
    workDirService,
    artifactRepository: repositories.artifacts,
    mediaRepository: repositories.media,
    runRepository: repositories.runs,
  })
  const keyframeService = new KeyframeService({ ffmpegRunner, artifactService })
  const acquisitionService = new MediaAcquisitionService({
    artifactService,
    directDownloader,
    bilibiliDownloader,
  })
  const pipeline = new LocalMediaPipeline({
    workDirService,
    mediaRepository: repositories.media,
    locationRepository: repositories.locations,
    artifactService,
    probeService,
    subtitleService,
    timelineService,
    keyframeService,
    ffmpegRunner,
    segmentNormalizer,
    speechToTextRegistry,
    runRepository: repositories.runs,
    acquisitionService,
    getSpeechSettings: () => database?.getSetting?.('mediaSpeechSettings') || {},
  })
  const runner = new MediaJobRunner({
    runRepository: repositories.runs,
    artifactService,
    pipeline,
  })
  const ingestion = new MediaIngestionService({
    sourceService,
    mediaRepository: repositories.media,
    locationRepository: repositories.locations,
    runRepository: repositories.runs,
    jobRunner: runner,
  })
  const query = new MediaQueryService({
    mediaRepository: repositories.media,
    runRepository: repositories.runs,
    artifactRepository: repositories.artifacts,
    workDirService,
    subtitleService,
  })
  const lifecycle = new MediaLifecycleService({
    mediaRepository: repositories.media,
    locationRepository: repositories.locations,
    runRepository: repositories.runs,
    artifactService,
    jobRunner: runner,
  })
  const maintenance = new MediaMaintenanceService({
    workDirService,
    mediaRepository: repositories.media,
    runRepository: repositories.runs,
    artifactService,
  })

  return Object.freeze({
    dependencies: Object.freeze({
      database,
      workDirService,
      secretStore: dependencies.secretStore || null,
      ffmpegRuntime: dependencies.ffmpegRuntime || null,
    }),
    repositories,
    ingestion,
    query,
    lifecycle,
    maintenance,
    runner,
    sources: Object.freeze({ registry, service: sourceService }),
    processing: Object.freeze({ ffmpegRunner, probeService, subtitleService, segmentNormalizer, timelineService, keyframeService }),
    acquisition: acquisitionService,
    bilibili: Object.freeze({ client: bilibiliClient, cookies: bilibiliCookies }),
    speechToText: speechToTextRegistry,
    artifacts: artifactService,
  })
}
