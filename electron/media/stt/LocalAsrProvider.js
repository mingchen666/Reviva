import { SPEECH_TO_TEXT_PROVIDER_IDS } from './SpeechToTextTypes.js'
import { OpenAiWhisperProvider } from './OpenAiWhisperProvider.js'

export class LocalAsrProvider extends OpenAiWhisperProvider {
  constructor() {
    super({ id: SPEECH_TO_TEXT_PROVIDER_IDS.LOCAL_ASR, displayName: '本地 ASR' })
  }
}
