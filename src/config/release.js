import { getAppVersion } from '@/utils/tools'

const appVersion = getAppVersion()

export const RELEASE_CONFIG = {
  downloadUrl: 'https://pan.quark.cn/s/9cbc820db4ef',
  fallbackLabel: '夸克网盘下载',
  latestVersion: appVersion,
  releaseNotes: '当前发布通道用于在自动更新不可达时提供备用下载。',
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
      id: 'reviva-quark',
      type: 'manual',
      name: '夸克网盘备用发布',
      version: appVersion,
      downloadUrl: 'https://pan.quark.cn/s/9cbc820db4ef',
      releaseNotes: '当前发布通道用于在自动更新不可达时提供备用下载。',
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
