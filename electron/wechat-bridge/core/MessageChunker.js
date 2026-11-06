// 长文本切分：微信单条文本上限约 2000 字符，留余量按 1800 切。
// 优先在段落 / 换行 / 句末 / 空格处切，避免拆词；实在没有分隔符才硬切。
const DEFAULT_MAX = 1800

export function chunkText(text = '', maxLen = DEFAULT_MAX) {
  if (!text) return []
  const t = String(text)
  if (t.length <= maxLen) return [t]
  const chunks = []
  let rest = t
  while (rest.length > maxLen) {
    let cut = -1
    const seps = ['\n\n', '\n', '。', '！', '？', '!', '?', '；', ';', '，', ',', ' ', '']
    for (const sep of seps) {
      const idx = sep ? rest.lastIndexOf(sep, maxLen) : maxLen
      if (idx > maxLen * 0.5) { cut = idx + sep.length; break }
    }
    if (cut < 0) cut = maxLen
    const piece = rest.slice(0, cut).replace(/\s+$/, '')
    if (piece) chunks.push(piece)
    rest = rest.slice(cut).replace(/^\s+/, '')
  }
  if (rest) chunks.push(rest)
  return chunks
}