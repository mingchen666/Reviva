import { getAppVersion } from '@/utils/tools'

const appVersion = getAppVersion()
export const BETA_RELEASE = {
  enabled: true,
  batch: 'reviva-beta-001',
  expiresAt: '2026-07-25T23:59:59+08:00',
  downloadUrl: 'https://pan.quark.cn/s/9cbc820db4ef',
  fallbackLabel: '夸克网盘下载',
  latestVersion: appVersion,
  releaseNotes: '当前内测发布通道用于在自动更新不可达时提供备用下载。',
  productName: 'Reviva',
  // Later sources can include { type: 'manifest', url: 'https://.../latest.json' }.
  updateSources: [
    {
      id: 'reviva-github-releases',
      type: 'github',
      name: 'GitHub Releases',
      url: 'https://api.github.com/repos/mingchen666/Reviva/releases?per_page=20',
      downloadUrl: 'https://github.com/mingchen666/Reviva/releases/latest',
      canAutoDownload: false,
    },
    {
      id: 'reviva-beta-quark',
      type: 'manual',
      name: '夸克网盘备用发布',
      version: appVersion,
      downloadUrl: 'https://pan.quark.cn/s/9cbc820db4ef',
      releaseNotes: '当前内测发布通道用于在自动更新不可达时提供备用下载。',
      canAutoDownload: false,
    },
    // Future self-hosted source (for example, Cloudflare Pages):
    // {
    //   id: 'reviva-cloudflare',
    //   type: 'manifest',
    //   name: 'Reviva Update Service',
    //   url: 'https://update.example.com/latest.json',
    //   canAutoDownload: false,
    // },
  ],
}

export function isBetaExpired(now = new Date()) {
  if (!BETA_RELEASE.enabled) return false
  return now.getTime() >= new Date(BETA_RELEASE.expiresAt).getTime()
}

export function formatBetaDate(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
