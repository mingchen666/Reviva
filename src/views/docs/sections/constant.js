export const webProviderVisuals = {
  jina: {
    icon: 'jina',
    raster: true,
    desc: '轻量网页阅读器，适合文章与公开页面',
    dark: 'bg-cyan-400/12 text-cyan-300',
    light: 'bg-cyan-50 text-cyan-600',
    badge: 'text-cyan-500 bg-cyan-400/10'
  },
  firecrawl: {
    icon: 'firecrawl',
    raster: true,
    desc: '结构化网页抓取，支持 Markdown 与 HTML',
    dark: 'bg-orange-400/12 text-orange-300',
    light: 'bg-orange-50 text-orange-600',
    badge: 'text-orange-500 bg-orange-400/10'
  },
  tavily: {
    icon: 'tavily',
    desc: '快速正文提取，适合 Markdown 知识导入',
    dark: 'bg-emerald-400/12 text-emerald-300',
    light: 'bg-emerald-50 text-emerald-600',
    badge: 'text-emerald-500 bg-emerald-400/10'
  }
};

export const pdfEngineOptions = [
  {
    value: 'auto',
    icon: 'ri-magic-line',
    title: '自动',
    desc: '本地能读就先读文本；遇到扫描页、图片页、表格或本地不可用时，再调用 OCR 服务。'
  },
  {
    value: 'local_fast',
    icon: 'ri-flashlight-line',
    title: '本地快速',
    desc: '适合文本型 PDF，速度快，不消耗OCR服务额度。'
  },
  {
    value: 'document_intelligent',
    icon: 'ri-scan-2-line',
    title: '文档智能',
    desc: '适合扫描件、复杂表格和图片页，使用 OCR 服务生成 Markdown/JSON。'
  }
];

export const uploadActionOptions = [
  {
    value: 'ask',
    icon: 'ri-question-answer-line',
    title: '每次询问',
    desc: '上传 PDF 后弹窗选择本次处理方式。'
  },
  {
    value: 'preflight',
    icon: 'ri-speed-line',
    title: '仅快速预检',
    desc: '只读取页数、文本覆盖率和是否需要 OCR。'
  },
  {
    value: 'full',
    icon: 'ri-loop-right-line',
    title: '按默认策略后台处理',
    desc: '根据上面的默认策略自动预检或解析。'
  },
  {
    value: 'none',
    icon: 'ri-pause-circle-line',
    title: '不自动处理',
    desc: '只保存文件，需要时再手动解析。'
  }
];

export const largePdfOptions = [
  {
    value: 'adaptive',
    icon: 'ri-route-line',
    title: '按问题选择页段',
    desc: '对话时根据用户问题读取相关页，避免大 PDF 全量消耗。'
  },
  {
    value: 'full_document',
    icon: 'ri-database-2-line',
    title: '优先使用全文缓存',
    desc: '如果已有全文解析结果，优先复用 Markdown 缓存。'
  }
];

export const fallbackOptions = [
  {
    value: 'ocr_provider',
    icon: 'ri-cloud-line',
    title: '改用 OCR 服务商',
    desc: '普通用户推荐，无需折腾 Python 环境。'
  },
  {
    value: 'prompt',
    icon: 'ri-question-line',
    title: '先提示确认',
    desc: '由用户决定是否改走 OCR 服务商。'
  },
  {
    value: 'error',
    icon: 'ri-error-warning-line',
    title: '直接报错',
    desc: '适合只允许本地解析的场景。'
  }
];

export const mediaActionOptions = [
  {
    value: 'ask',
    icon: 'ri-question-answer-line',
    title: '解析前确认',
    desc: '上传后先登记媒体；开始语音转录、远程下载或关键帧提取前由你确认。'
  },
  {
    value: 'low_cost_auto',
    icon: 'ri-play-circle-line',
    title: '自动开始解析',
    desc: '上传后立即按当前解析方案执行；可能调用语音模型或产生服务费用。'
  },
  {
    value: 'manual',
    icon: 'ri-pause-circle-line',
    title: '稍后手动解析',
    desc: '上传后只登记媒体，不创建解析任务；可在媒体详情中手动开始。'
  }
];

export const mediaPresetOptions = [
  {
    value: 'subtitle_first',
    icon: 'ri-closed-captioning-line',
    title: '字幕优先解析',
    desc: '优先导入外部、平台或内嵌字幕；没有字幕时再考虑语音转录。'
  },
  {
    value: 'standard',
    icon: 'ri-movie-2-line',
    title: '标准媒体解析',
    desc: '适合课程录像、会议录屏和普通音视频资料。'
  },
  {
    value: 'transcript_only',
    icon: 'ri-file-text-line',
    title: '仅转录',
    desc: '只生成文字稿与时间戳，减少存储占用。'
  },
  {
    value: 'keyframe_enhanced',
    icon: 'ri-gallery-view-2',
    title: '关键帧增强',
    desc: '在转录基础上限量抽取画面，适合 PPT、板书和操作演示。'
  },
  {
    value: 'local_private',
    icon: 'ri-shield-keyhole-line',
    title: '本地隐私解析',
    desc: '只允许本地 FFmpeg 与本地 ASR，不上传媒体内容。'
  }
];

export const mediaLanguageOptions = [
  {
    value: 'auto',
    icon: 'ri-translate-2',
    title: '自动识别',
    desc: '优先匹配系统语言和字幕默认轨道。'
  },
  {
    value: 'zh',
    icon: 'ri-translate-2',
    title: '中文',
    desc: '优先中文人工字幕，其次中文自动字幕。'
  },
  { value: 'en', icon: 'ri-translate-2', title: '英文', desc: '优先英文字幕与英文转录。' },
  { value: 'ja', icon: 'ri-translate-2', title: '日文', desc: '优先日文字幕与日文转录。' }
];

export function fileIcon(name, isDir) {
  if (isDir) return 'ri-folder-3-line'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    pdf: 'ri-file-pdf-2-line',
    md: 'ri-markdown-line',
    markdown: 'ri-markdown-line',
    docx: 'ri-file-word-2-line',
    doc: 'ri-file-word-2-line',
    txt: 'ri-file-text-line',
    xlsx: 'ri-file-excel-2-line',
    xls: 'ri-file-excel-2-line',
    pptx: 'ri-file-ppt-2-line',
    ppt: 'ri-file-ppt-2-line',
    png: 'ri-image-line',
    jpg: 'ri-image-line',
    jpeg: 'ri-image-line',
    gif: 'ri-image-line',
    svg: 'ri-image-line',
    webp: 'ri-image-line',
    zip: 'ri-file-zip-line',
    rar: 'ri-file-zip-line',
    '7z': 'ri-file-zip-line',
    mp4: 'ri-movie-line',
    mp3: 'ri-music-line',
    wav: 'ri-music-line',
    csv: 'ri-file-text-line',
    json: 'ri-code-line',
    html: 'ri-html5-fill',
    htm: 'ri-html5-fill',
    js: 'ri-code-line',
    py: 'ri-code-line',
    java: 'ri-code-line',
    cpp: 'ri-code-line',
    avi: 'ri-movie-line',
    mkv: 'ri-movie-line',
    mov: 'ri-movie-line',
    webm: 'ri-movie-line',
    flv: 'ri-movie-line',
    wmv: 'ri-movie-line',
    flac: 'ri-music-line',
    aac: 'ri-music-line',
    ogg: 'ri-music-line',
    wma: 'ri-music-line',
    m4a: 'ri-music-line',
  }
  return map[ext] || 'ri-file-line'
}

export function fileIconColor(name, isDir,isDark=false) {
  if (isDir) return isDark ? 'text-amber-400' : 'text-amber-500'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    pdf: 'text-red-400',
    md: 'text-emerald-400',
    docx: 'text-blue-400',
    xlsx: 'text-emerald-400',
    pptx: 'text-orange-400',
    png: 'text-pink-400',
    jpg: 'text-pink-400',
    zip: 'text-yellow-400',
    mp4: 'text-purple-400',
    html: 'text-orange-400',
    htm: 'text-orange-400',
    // 🎬 视频
    avi: 'text-purple-400',
    mkv: 'text-purple-400',
    mov: 'text-purple-400',
    webm: 'text-purple-400',
    flv: 'text-purple-400',
    wmv: 'text-purple-400',
    // 🎵 音频
    flac: 'text-cyan-400',
    aac: 'text-cyan-400',
    ogg: 'text-cyan-400',
    wma: 'text-cyan-400',
    m4a: 'text-cyan-400',
  }
  return map[ext] || (isDark ? 'text-wt-aux' : 'text-lt-aux')
}