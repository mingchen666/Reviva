import { BuiltinAgentTaskRunner } from './BuiltinAgentTaskRunner.js'
import { ChartGenerationModule } from './modules/ChartGenerationModule.js'
import { CloudBusinessTaskRunner } from './CloudBusinessTaskRunner.js'
import { FlashcardGenerationModule } from './modules/FlashcardGenerationModule.js'
import { JsonArtifactRunner } from './JsonArtifactRunner.js'
import { GraphGenerationModule } from './modules/GraphGenerationModule.js'
import { MindmapGenerationModule } from './modules/MindmapGenerationModule.js'
import { PodcastGenerationModule } from './modules/PodcastGenerationModule.js'
import { PptGenerationModule } from './modules/PptGenerationModule.js'
import { QuizGenerationModule } from './modules/QuizGenerationModule.js'
import { ResearchGenerationModule } from './modules/ResearchGenerationModule.js'

export const CLOUD_NOT_READY_ERR = '云端服务即将开放，敬请期待'

export function generationTaskName(module, topic) {
  const prefix = module?.label || module?.toolId || '生成'
  const t = (topic || '').trim().slice(0, 24) || '未命名'
  return `${prefix} · ${t}`
}

export class GenerationModuleRegistry {
  constructor({ db, workDirService, agentService, emitProgress, send }) {
    const jsonRunner = new JsonArtifactRunner({ db, workDirService, emitProgress, send })
    const agentRunner = new BuiltinAgentTaskRunner({ db, agentService, emitProgress })
    const cloudRunner = new CloudBusinessTaskRunner({ db, workDirService, emitProgress })
    this._modules = new Map([
      ['mindmap', new MindmapGenerationModule({ jsonRunner })],
      ['graph', new GraphGenerationModule({ jsonRunner })],
      ['flashcard', new FlashcardGenerationModule({ jsonRunner })],
      ['quiz', new QuizGenerationModule({ jsonRunner })],
      ['chart', new ChartGenerationModule({ jsonRunner })],
      ['ppt', new PptGenerationModule({ agentRunner, cloudRunner })],
      ['research', new ResearchGenerationModule({ agentRunner, cloudRunner })],
      ['podcast', new PodcastGenerationModule({ cloudRunner })],
    ])
  }

  get(toolId) {
    return this._modules.get(toolId) || null
  }
}
