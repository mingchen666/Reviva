import { podcastCloudProfile } from './PodcastCloudProfile.js'
import { pptCloudProfile } from './PptCloudProfile.js'
import { researchCloudProfile } from './ResearchCloudProfile.js'

const PROFILES = new Map([
  [pptCloudProfile.toolId, pptCloudProfile],
  [researchCloudProfile.toolId, researchCloudProfile],
  [podcastCloudProfile.toolId, podcastCloudProfile],
])

export function getCloudBusinessProfile(toolId) {
  return PROFILES.get(toolId) || null
}
