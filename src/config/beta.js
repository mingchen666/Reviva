export const BETA_RELEASE = {
  enabled: true,
  batch: 'reviva-beta-001',
  expiresAt: '2026-07-25T23:59:59+08:00',
  downloadUrl: 'https://pan.quark.cn/s/9cbc820db4ef',
  productName: 'Reviva',
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
