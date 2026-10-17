// Static configuration data extracted from the agents store.
// Pure data, no runtime dependencies.

export const REMOVED_TOOL_IDS = new Set(['llm_wiki', 'web_scrape'])

// DeepAgents-aligned tool categories
export const TOOL_CATEGORIES = [
  { key: 'filesystem', label: '文件系统', icon: 'ri-folder-line', color: '#4ADE80', desc: '文件读取、写入、列表、重命名' },
  { key: 'execution', label: '执行', icon: 'ri-terminal-box-line', color: '#38BDF8', desc: 'Shell 命令执行与沙盒运行' },
  { key: 'media', label: '媒体', icon: 'ri-movie-line', color: '#14B8A6', desc: '音视频信息读取、音频提取、字幕、抽帧和片段处理' },
  { key: 'document', label: '文档转换', icon: 'ri-file-transfer-line', color: '#A78BFA', desc: '文档格式转换与导出' },
  { key: 'web', label: '联网', icon: 'ri-global-line', color: '#3B82F6', desc: '联网搜索与网页内容获取' },
  { key: 'knowledge', label: '知识库', icon: 'ri-database-2-line', color: '#6C8AFF', desc: '知识库检索与知识编译' },
  { key: 'mcp', label: 'MCP', icon: 'ri-plug-line', color: '#10B981', desc: '远程 MCP 服务器接入的工具（HTTP / SSE）' },
  { key: 'custom', label: '自定义', icon: 'ri-tools-line', color: '#FACC15', desc: '用户自建的 API 工具；本地脚本暂未开放' },
]

export const DOCUMENT_READ_TOOL_MIGRATION_KEY = '__document_read_default_route_migrated'

export const BUILTIN_TOOLS = [
  {
    id: 'web_search_tavily', name: 'Tavily 搜索', icon: 'ri-search-line', color: '#3B82F6', cat: 'web', desc: '使用 Tavily 高质量搜索 API 搜索互联网，专为 AI 应用设计',
    permReq: '', archCompat: ['react', 'plan_exec', 'hybrid'], type: '',
    params: [{ name: 'query', type: 'string', required: true, desc: '搜索关键词' }, { name: 'max_results', type: 'number', required: false, desc: '最大返回结果数，默认 5' }, { name: 'language', type: 'string', required: false, desc: '搜索语言偏好，如 zh-CN / en' }],
    sandbox: '每任务最多 10 次调用，每次超时 10 秒', builtin: true, enabled: false,
    needsConfig: true, needsKey: true,
    providerConfig: {
      apiKey: '', baseUrl: '',
      providerLabel: 'Tavily', providerDesc: '高质量搜索 API，专为 AI 应用设计',
      defaultUrl: 'https://api.tavily.com',
      userParams: { max_results: 5, language: 'zh-CN' }
    }
  },
  {
    id: 'web_search_searxng', name: 'SearXNG 搜索', icon: 'ri-search-eye-line', color: '#4ADE80', cat: 'web', desc: '使用 SearXNG 开源元搜索引擎搜索互联网，可自建实例，免费',
    permReq: '', archCompat: ['react', 'plan_exec', 'hybrid'], type: '',
    params: [{ name: 'query', type: 'string', required: true, desc: '搜索关键词' }, { name: 'max_results', type: 'number', required: false, desc: '最大返回结果数，默认 5' }, { name: 'language', type: 'string', required: false, desc: '搜索语言偏好，如 zh-CN / en' }],
    sandbox: '每任务最多 10 次调用，每次超时 10 秒', builtin: true, enabled: false,
    needsConfig: true, needsKey: 'optional',
    providerConfig: {
      apiKey: '', baseUrl: '',
      providerLabel: 'SearXNG', providerDesc: '开源元搜索引擎，可自建实例，部分实例需要 API Key',
      defaultUrl: 'https://searx.be',
      userParams: { max_results: 5, language: 'zh-CN' }
    }
  },
  {
    id: 'web_search_bing', name: 'Bing 搜索', icon: 'ri-microsoft-line', color: '#38BDF8', cat: 'web', desc: '通过本地请求 Bing 搜索互联网，免费，无需 API Key',
    permReq: '', archCompat: ['react', 'plan_exec', 'hybrid'], type: '',
    params: [{ name: 'query', type: 'string', required: true, desc: '搜索关键词' }, { name: 'max_results', type: 'number', required: false, desc: '最大返回结果数，默认 5' }, { name: 'language', type: 'string', required: false, desc: '搜索语言偏好，如 zh-CN / en' }],
    sandbox: '每任务最多 10 次调用，每次超时 10 秒', builtin: true, enabled: false,
    needsConfig: false, needsKey: false,
    providerConfig: {
      providerLabel: 'Bing', providerDesc: '本地搜索，直接请求 Bing，免费无需 API Key',
      userParams: { max_results: 5, language: 'zh-CN' }
    }
  },
  {
    id: 'file_read', name: '文件读取', icon: 'ri-file-text-line', color: '#4ADE80', cat: 'filesystem', desc: '读取授权目录内的文件内容',
    permReq: 'fileRead', archCompat: ['全架构'], type: '',
    params: [{ name: 'path', type: 'string', required: true, desc: '相对于授权根目录的文件路径' }, { name: 'max_chars', type: 'number', required: false, desc: '最大读取字符数，默认 50000' }],
    sandbox: 'path 必须在授权根目录内，不允许读取二进制文件', builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'document_read', name: '文档读取', icon: 'ri-file-search-line', color: '#2563EB', cat: 'filesystem', desc: '读取 PDF、Word、Excel、PPT 的统一路由工具（系统默认工具）',
    permReq: '', archCompat: ['全架构'], type: '',
    params: [
      { name: 'path', type: 'string', required: true, desc: 'PDF / Office 文件路径' },
      { name: 'mode', type: 'string', required: false, desc: 'auto / overview / text / metadata / page / layout / images / ocr，默认 overview' },
      { name: 'intent', type: 'string', required: false, desc: 'read / inspect / extract_images / layout / ocr 等任务意图' },
      { name: 'startPage', type: 'number', required: false, desc: 'PDF 起始页码' },
      { name: 'maxPages', type: 'number', required: false, desc: 'PDF 最多读取页数' },
      { name: 'maxChars', type: 'number', required: false, desc: '返回内容最大字符数' },
      { name: 'confirm', type: 'boolean', required: false, desc: '用户已确认 OCR 或未来媒体解析等耗时/额度操作' },
    ],
    sandbox: '系统默认只读路由工具。PDF 分发到 pdf_read，Office 分发到 office_read；图片返回 vision_analyze 建议，普通文本返回默认文本读取建议；不静默 OCR。',
    builtin: true, enabled: true, alwaysEnabled: true,
    providerConfig: {}
  },
  {
    id: 'media_read', name: '音视频读取', icon: 'ri-movie-2-line', color: '#14B8A6', cat: 'media', desc: '按任务读取已解析音视频的元数据、转录、上下文搜索结果、章节、关键帧和产物状态（系统默认工具）',
    permReq: '', archCompat: ['全架构'], type: '',
    params: [
      { name: 'mediaId', type: 'string', required: true, desc: '本次上下文授权的媒体 ID' },
      { name: 'mode', type: 'string', required: false, desc: 'metadata / transcript / search / chapters / frames / artifacts，默认 metadata' },
      { name: 'query', type: 'string', required: false, desc: 'search 模式的主题、术语或短句' },
      { name: 'startMs', type: 'number', required: false, desc: 'transcript / frames 起始时间（毫秒）' },
      { name: 'endMs', type: 'number', required: false, desc: 'transcript / frames 结束时间（毫秒）' },
      { name: 'cursor', type: 'string', required: false, desc: '相同查询条件上一页返回的 nextCursor，必须原样传回' },
      { name: 'limit', type: 'number', required: false, desc: '返回数量上限，按任务复杂度设置' },
      { name: 'maxChars', type: 'number', required: false, desc: 'transcript / search 单次文本上限' },
      { name: 'contextSegments', type: 'number', required: false, desc: 'search 命中前后附带段数，0-6，默认 2' },
    ],
    sandbox: '系统默认只读工具。只访问本次 Agent 运行明确授权的 mediaId 和当前已发布 run；不读取绝对路径，不触发解析或创建媒体文件。',
    builtin: true, enabled: true, alwaysEnabled: true,
    providerConfig: {}
  },
  {
    id: 'office_read', name: 'Office 读取', icon: 'ri-file-text-line', color: '#3B82F6', cat: 'filesystem', desc: '读取 Word、Excel、PPT 的结构概览、分段正文和嵌入图片（底层精确工具）',
    permReq: '', archCompat: ['全架构'], type: '',
    params: [
      { name: 'path', type: 'string', required: true, desc: 'Office 文件路径（.docx / .xlsx / .pptx）' },
      { name: 'mode', type: 'string', required: false, desc: 'overview / text / outline / stats / issues / images，默认 overview' },
      { name: 'start', type: 'number', required: false, desc: 'text 模式分段读取起始位置' },
      { name: 'maxLines', type: 'number', required: false, desc: 'text 模式最多读取行数' },
      { name: 'maxChars', type: 'number', required: false, desc: '返回内容最大字符数' },
      { name: 'exportImages', type: 'boolean', required: false, desc: 'images 模式下导出嵌入图片到 /context/office-images/...' },
      { name: 'imagePath', type: 'string', required: false, desc: 'images 模式下指定 DOM path、图片名或 relId 片段' },
      { name: 'maxImages', type: 'number', required: false, desc: 'images 模式最多列出/导出图片数' },
    ],
    sandbox: '底层只读工具。仅允许读取授权目录内 .docx/.xlsx/.pptx，依赖 officecli；默认概览，正文需分段读取；图片导出写入 /context/office-images/...。常规文档读取优先使用 document_read。',
    builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'vision_analyze', name: '图片理解', icon: 'ri-eye-line', color: '#0EA5E9', cat: 'ai', desc: '按需理解工作区图片、Office 导出图片、PDF 截图或视频关键帧（仅视觉模型自动启用）',
    permReq: '', archCompat: ['全架构'], type: '',
    params: [
      { name: 'path', type: 'string', required: false, desc: '单张图片路径，如 /context/office-images/.../chart.png' },
      { name: 'paths', type: 'array', required: false, desc: '多张图片路径，默认最多 4 张，硬上限 8 张' },
      { name: 'question', type: 'string', required: false, desc: '希望回答的问题；为空时自动描述图片并提取相关信息' },
      { name: 'context', type: 'string', required: false, desc: '图片来源、文档页码、用户任务等上下文' },
      { name: 'mode', type: 'string', required: false, desc: 'auto / per_image / compare，默认 auto' },
      { name: 'maxImages', type: 'number', required: false, desc: '最多分析图片数，默认 4，最大 8' },
    ],
    sandbox: '系统默认按需工具。只能读取授权目录内图片，单图不超过 10MB。',
    builtin: true, enabled: true, alwaysEnabled: true,
    providerConfig: {}
  },
  {
    id: 'office_write', name: 'Office 创建编辑', icon: 'ri-file-edit-line', color: '#2563EB', cat: 'document', desc: '受控创建和编辑 Word、Excel、PPT，支持 batch 提速和按需 raw_set。默认输出副本，不覆盖原文件',
    permReq: 'fileWrite', archCompat: ['react', 'plan_exec', 'hybrid'], type: 'router',
    params: [
      { name: 'operation', type: 'string', required: true, desc: 'help / create / edit' },
      { name: 'path', type: 'string', required: false, desc: 'edit 操作的输入 Office 文件路径' },
      { name: 'filename', type: 'string', required: false, desc: '输出文件名，例如 report.docx' },
      { name: 'actions', type: 'array', required: false, desc: '结构化 Office actions，支持 add/clone/set/remove/query/get/raw_set/replace_text 和格式快捷动作' },
      { name: 'useBatch', type: 'boolean', required: false, desc: '是否用 officecli batch 一次性执行 actions' },
      { name: 'allowRawXml', type: 'boolean', required: false, desc: '是否允许 raw_set；action 仍需 confirm=true' },
    ],
    sandbox: '只注册 office_write 路由工具；不开放 raw command/watch。batch 由结构化 actions 自动生成；raw_set 需显式 allowRawXml 和 confirm。输入必须在授权工作区内，输出写入 /agents/{agent}/outputs/YYYY-MM-DD/。',
    builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'pdf_read', name: 'PDF 读取', icon: 'ri-file-pdf-2-line', color: '#EF4444', cat: 'filesystem', desc: '读取 PDF 的页数、元数据、分段正文和 OCR 结果（底层精确工具）',
    permReq: '', archCompat: ['全架构'], type: '',
    params: [
      { name: 'path', type: 'string', required: true, desc: 'PDF 文件路径（.pdf）' },
      { name: 'mode', type: 'string', required: false, desc: 'overview / text / metadata，默认 overview' },
      { name: 'startPage', type: 'number', required: false, desc: 'text 模式起始页码' },
      { name: 'maxPages', type: 'number', required: false, desc: '最多读取页数' },
      { name: 'maxChars', type: 'number', required: false, desc: '返回内容最大字符数' },
    ],
    sandbox: '底层只读工具。仅允许读取授权目录内 .pdf，依赖 Python 包 PyMuPDF；默认概览，正文需按页分段读取。常规 PDF 读取优先使用 document_read。',
    builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'ffmpeg:*', name: 'FFmpeg 工具集', icon: 'ri-movie-2-line', color: '#14B8A6', cat: 'media', desc: '受控处理课程视频、讲座和播客：读取媒体信息、提取音频/字幕、抽帧、生成封面、截取片段',
    permReq: 'fileRead', archCompat: ['react', 'plan_exec', 'hybrid'], type: 'router',
    params: [
      { name: 'operation', type: 'string', required: true, desc: 'probe / extract_audio / extract_subtitles / extract_frames / thumbnail / clip' },
      { name: 'path', type: 'string', required: true, desc: '授权目录内的音视频文件路径' },
    ],
    sandbox: '只注册一个 ffmpeg_tool 路由工具；不开放 raw command。输入必须在授权目录内，输出写入 /context/ffmpeg/YYYY-MM-DD/。',
    builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'pandoc:*', name: 'Pandoc 工具集', icon: 'ri-file-transfer-line', color: '#A78BFA', cat: 'document', desc: '受控转换学习资料、讲义、笔记和报告：查看支持格式、转换为 Markdown/HTML/Word/PDF/PPTX',
    permReq: 'fileRead', archCompat: ['react', 'plan_exec', 'hybrid'], type: 'router',
    params: [
      { name: 'operation', type: 'string', required: true, desc: 'formats / convert' },
      { name: 'path', type: 'string', required: false, desc: 'convert 操作的输入文档路径' },
    ],
    sandbox: '只注册一个 pandoc_tool 路由工具；不开放 raw command、Lua filter 或自定义模板。输入必须在授权目录内，输出写入 /context/pandoc/YYYY-MM-DD/。',
    builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'manim:*', name: 'Manim 动画工具集', icon: 'ri-movie-line', color: '#0EA5E9', cat: 'media', desc: '受控制作学习动画视频：检查环境、识别 Scene、渲染 MP4，并可配合 FFmpeg 做媒体验证和预览',
    permReq: 'fileRead', archCompat: ['react', 'plan_exec', 'hybrid'], type: 'router',
    params: [
      { name: 'operation', type: 'string', required: true, desc: 'check / list_scenes / render' },
      { name: 'path', type: 'string', required: false, desc: 'list_scenes/render 操作的 Manim .py 脚本路径' },
      { name: 'sceneName', type: 'string', required: false, desc: '要渲染的 Scene 类名' },
    ],
    sandbox: '只注册一个 manim_tool 路由工具；不开放 raw command。输入必须是授权目录内 .py 脚本，输出写入 /context/manim/YYYY-MM-DD/。',
    builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'file_write', name: '文件写入', icon: 'ri-file-edit-line', color: '#FACC15', cat: 'filesystem', desc: '在授权目录内创建或修改文件',
    permReq: 'fileWrite', archCompat: ['全架构'], type: '',
    params: [{ name: 'path', type: 'string', required: true, desc: '相对于授权根目录的目标路径' }, { name: 'content', type: 'string', required: true, desc: '写入内容' }, { name: 'overwrite', type: 'boolean', required: false, desc: '是否覆盖已有文件，默认 false' }],
    sandbox: 'path 必须在授权根目录内，单次写入最大 10MB', builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'pptx_export_local', name: 'PPTX 本地导出', icon: 'ri-file-ppt-line', color: '#F97316', cat: 'document', desc: '将 HTML 演示文稿导出为可编辑 PPTX 文件',
    permReq: 'fileWrite', archCompat: ['plan_exec', 'hybrid'], type: '',
    params: [{ name: 'htmlPath', type: 'string', required: true, desc: 'HTML 演示文稿路径' }, { name: 'outputPath', type: 'string', required: false, desc: 'PPTX 输出路径，默认同目录同名' }],
    sandbox: '输入必须是授权工作空间内 HTML；输出只能写入 /agents/ 下的 Agent 输出目录', builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'file_list', name: '文件列表', icon: 'ri-folder-open-line', color: '#A78BFA', cat: 'filesystem', desc: '列出授权目录内的文件和文件夹',
    permReq: 'fileRead', archCompat: ['全架构'], type: '',
    params: [{ name: 'dir_path', type: 'string', required: false, desc: '相对于授权根目录的目录路径' }, { name: 'recursive', type: 'boolean', required: false, desc: '是否递归列出子目录' }, { name: 'pattern', type: 'string', required: false, desc: '文件名匹配模式' }],
    sandbox: '需要文件读取权限', builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'file_rename', name: '文件重命名', icon: 'ri-price-tag-3-line', color: '#F87171', cat: 'filesystem', desc: '在授权目录内重命名文件',
    permReq: 'fileRename', archCompat: ['全架构'], type: '',
    params: [{ name: 'old_path', type: 'string', required: true, desc: '原文件路径' }, { name: 'new_path', type: 'string', required: true, desc: '新文件路径' }],
    sandbox: '两个路径都必须在授权根目录内', builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'exec_command', name: '执行命令', icon: 'ri-terminal-box-line', color: '#38BDF8', cat: 'execution', desc: '在沙盒环境中执行 shell 命令',
    permReq: 'execCommand', archCompat: ['react', 'plan_exec', 'hybrid'], type: '',
    params: [{ name: 'command', type: 'string', required: true, desc: '要执行的 shell 命令' }, { name: 'timeout', type: 'number', required: false, desc: '超时时间（秒），默认 30' }],
    sandbox: '仅限沙盒环境执行，需要 execCommand 权限', builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'kb_search', name: '知识库检索', icon: 'ri-database-2-line', color: '#6C8AFF', cat: 'knowledge', desc: '检索当前选择的云端知识库或知识库文档',
    permReq: '', archCompat: ['全架构'], type: '',
    params: [{ name: 'query', type: 'string', required: true, desc: '检索问题或关键词' }, { name: 'top_k', type: 'number', required: false, desc: '返回结果数，默认 5；复杂问题可适度上调' }],
    sandbox: '默认开启，每任务最多 20 次', builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'wiki_tool', name: 'LLM-Wiki 工具', icon: 'ri-book-2-line', color: '#4A6CFF', cat: 'knowledge', desc: '只读检索一个或多个本地 LLM-Wiki 的页面、来源和图片资产',
    permReq: '', archCompat: ['全架构'], type: '',
    params: [
      { name: 'action', type: 'string', required: true, desc: 'list_wikis / search_wikis / query_wikis / read_page / read_source / list_assets 等只读动作' },
      { name: 'wikiId', type: 'string', required: false, desc: 'Wiki id；list_wikis 不需要' },
      { name: 'query', type: 'string', required: false, desc: 'search 动作的检索问题' },
    ],
    sandbox: '只读访问当前工作区 wikis；普通 Agent 不开放 Wiki 写入', builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'note_tool', name: '笔记工具', icon: 'ri-sticky-note-line', color: '#10B981', cat: 'knowledge', desc: '读取、创建和维护 Reviva 笔记，支持任意层级的嵌套目录',
    permReq: 'noteRead', archCompat: ['全架构'], type: '',
    params: [
      { name: 'action', type: 'string', required: true, desc: 'list / get / create / update / delete / create_folder' },
      { name: 'note_id', type: 'string', required: false, desc: '读取、更新或删除的笔记 ID' },
      { name: 'title', type: 'string', required: false, desc: '笔记标题' },
      { name: 'content', type: 'string', required: false, desc: 'Markdown 正文' },
      { name: 'folder_path', type: 'string', required: false, desc: '相对 notes 根目录的嵌套路径，如 项目/产品A/会议记录' },
      { name: 'folder_id', type: 'string', required: false, desc: '稳定目录 ID，可替代 folder_path' },
      { name: 'create_folders', type: 'boolean', required: false, desc: '是否自动逐级创建缺失目录，默认 true' },
    ],
    sandbox: 'list/get 需要 noteRead；create/update/delete/create_folder 需要 noteWrite。写入统一经过 NoteFileService，delete 只移入回收站。',
    builtin: true, enabled: true, alwaysEnabled: true,
    providerConfig: {}
  },
  {
    id: 'calculator', name: '科学计算器', icon: 'ri-calculator-line', color: '#FB923C', cat: 'execution', desc: '基于 mathjs 的多功能计算：科学函数、统计、单位换算、组合数学、矩阵复数',
    permReq: '', archCompat: ['全架构'], type: '',
    params: [{ name: 'expression', type: 'string', required: true, desc: 'mathjs 表达式：sin(45 deg) / mean([1,2,3]) / 12 inch to cm / combinations(10,3) 等' }],
    sandbox: '纯本地计算，无外部调用；import/createUnit 已禁用', builtin: true, enabled: false,
    providerConfig: {}
  },
  {
    id: 'file_delete', name: '文件删除', icon: 'ri-delete-bin-line', color: '#F87171', cat: 'filesystem', desc: '删除授权 outputs/ 目录下的文件（需授权确认）',
    permReq: 'fileDelete', archCompat: ['全架构'], type: '',
    params: [{ name: 'path', type: 'string', required: true, desc: '要删除的文件路径，必须在 outputs/ 目录下' }],
    sandbox: '只能删除 outputs/ 目录下的文件，需要 fileDelete 权限和用户授权', builtin: true, enabled: false,
    providerConfig: {}
  },
]

export const SUB_AGENTS = [
  {
    id: 'Reader',
    name: 'Reader',
    runtimeName: 'Reader',
    aliases: ['reader'],
    icon: 'ri-book-open-line',
    color: '#6C8AFF',
    desc: '资料阅读与关键信息提取',
    description: '读取本地资料和知识库内容，提取与任务直接相关的事实、概念、数据和出处。',
    prompt: '你是资料阅读子智能体。你的任务是读取用户指定的文件、Office/PDF 文档或知识库材料，只提取与主任务相关的信息。\n\n工作要求：\n- 先确认需要读取的文件或主题范围\n- 优先使用 document_read 读取 Office/PDF 文档，普通文本使用 file_read，必要时使用 kb_search\n- 需要读取文档内图片或图文并茂回答时，调用 document_read(intent="extract_images")，并使用返回的 assets[].path 写 Markdown 图片或交给 vision_analyze\n- Python、zip 解包或底层脚本仅作为 document_read/底层读取工具不可用、能力不足或用户明确要求底层诊断时的备用方案\n- 输出结构化摘要，包含关键事实、原始出处、重要术语和不确定点\n- 不要自行扩写结论，不要写最终报告',
    tools: ['file_read', 'document_read', 'kb_search'],
    abilities: ['文件读取', '知识库检索', '信息提取'],
    usedBy: ['错题分析助手', '复习规划师', '摘要助手', '测验生成器', '知识整理师'],
  },
  {
    id: 'Summarizer',
    name: 'Summarizer',
    runtimeName: 'Summarizer',
    aliases: ['summarizer'],
    icon: 'ri-file-text-line',
    color: '#4ADE80',
    desc: '内容摘要与压缩',
    description: '把长材料压缩成短摘要、提纲、要点列表或复习速记，不引入新信息。',
    prompt: '你是摘要压缩子智能体。你的任务是把输入材料压缩成清晰、可复用的摘要。\n\n工作要求：\n- 保留核心论点、证据、结论和关键数字\n- 明确区分原文事实和你的归纳\n- 根据主任务选择摘要形式：短摘要、分层提纲、表格或要点列表\n- 不要编造材料中没有的信息',
    tools: ['file_read', 'kb_search'],
    abilities: ['摘要压缩', '结构化提纲'],
    usedBy: ['复习规划师', '摘要助手', '知识整理师'],
  },
  {
    id: 'Quiz',
    name: 'Quiz',
    runtimeName: 'Quiz',
    aliases: ['quiz'],
    icon: 'ri-question-line',
    color: '#FACC15',
    desc: '测验题生成与评估',
    description: '根据学习材料生成测验题、答案、解析和易错点。',
    prompt: '你是测验生成子智能体。你的任务是根据给定材料生成高质量练习题。\n\n工作要求：\n- 题目必须能从材料或明确知识点推出\n- 覆盖概念理解、应用、辨析和易错点\n- 每题给出答案、解析、考点和难度\n- 不要只生成机械记忆题',
    tools: ['file_read', 'file_write', 'kb_search'],
    abilities: ['出题', '答案解析', '易错点'],
    usedBy: ['测验生成器'],
  },
  {
    id: 'Review Planner',
    name: 'Review Planner',
    runtimeName: 'Review Planner',
    aliases: ['review_planner', 'review-planner'],
    icon: 'ri-calendar-check-line',
    color: '#F87171',
    desc: '复习计划制定与进度跟踪',
    description: '把学习目标、材料量和截止时间拆成可执行复习计划。',
    prompt: '你是复习规划子智能体。你的任务是把学习目标拆解为可执行计划。\n\n工作要求：\n- 识别考试或学习目标、截止时间、资料范围和薄弱点\n- 给出阶段目标、每日任务、复盘节点和检测方式\n- 优先安排高价值内容和薄弱环节\n- 输出可以直接执行的清单',
    tools: ['file_read', 'file_write', 'kb_search'],
    abilities: ['复习计划', '任务拆解'],
    usedBy: ['复习规划师'],
  },
  {
    id: 'researcher',
    name: 'Researcher',
    runtimeName: 'researcher',
    aliases: ['web-researcher', 'sa_web-researcher'],
    icon: 'ri-global-line',
    color: '#38BDF8',
    desc: '联网检索、网页阅读与来源整理',
    description: '面向开放问题做网络搜索、网页阅读和来源整理，返回可引用发现。',
    prompt: '你是联网研究子智能体。你的任务是围绕主任务进行网络检索和网页资料整理。\n\n工作要求：\n- 先用宽查询建立背景，再用窄查询补足关键缺口\n- 优先选择权威、近期、可核验的来源\n- 每条关键发现都给出来源编号和 URL\n- 标注冲突、不确定性和需要主智能体进一步判断的点\n- 不要写最终报告，只返回研究发现',
    tools: ['mcp:exa', 'mcp:jina-mcp-server', 'web_search_bing'],
    abilities: ['联网搜索', '网页阅读', '来源整理'],
    usedBy: ['深度研究员', '通用研究任务'],
  },
  {
    id: 'local-analyst',
    name: 'Local Analyst',
    runtimeName: 'local-analyst',
    aliases: ['local_analyst', 'sa_local-analyst'],
    icon: 'ri-folder-open-line',
    color: '#4ADE80',
    desc: '本地文件分析与跨资料对比',
    description: '读取本地文件和知识库材料，提取观点、证据、数据、矛盾和待确认信息。',
    prompt: '你是本地资料分析子智能体。你的任务是分析用户提供的本地资料。\n\n工作要求：\n- 逐个文件提取核心观点、关键数据、证据和结论\n- 标注来源文件、章节或路径\n- 跨文件比较共同主题、互补信息和矛盾点\n- 对 Office/PDF 文档优先使用 document_read，普通文本使用 file_read\n- 需要读取文档内图片或图文并茂回答时，调用 document_read(intent="extract_images")，并使用返回的 assets[].path 写 Markdown 图片或交给 vision_analyze\n- Python、zip 解包或底层脚本仅作为 document_read/底层读取工具不可用、能力不足或用户明确要求底层诊断时的备用方案\n- 输出分析发现，不要写最终报告',
    tools: ['file_read', 'document_read', 'kb_search'],
    abilities: ['文件分析', '跨资料对比'],
    usedBy: ['深度研究员', '知识整理师'],
  },
  {
    id: 'writer',
    name: 'Writer',
    runtimeName: 'writer',
    aliases: ['report-writer', 'sa_report-writer'],
    icon: 'ri-file-edit-line',
    color: '#FACC15',
    desc: '报告、文章和结构化输出撰写',
    description: '根据主智能体提供的材料和结论撰写报告、文章、提纲或最终交付物。',
    prompt: '你是写作子智能体。你的任务是把已有材料组织成清晰、准确、可交付的文本。\n\n工作要求：\n- 严格基于输入材料和主智能体给出的结论写作\n- 结构先行，标题、摘要、正文、结论层次清楚\n- 保留来源引用和不确定性说明\n- 需要创建文件时使用 file_write 写入指定输出路径\n- 不要补充未经证实的事实',
    tools: ['file_read', 'file_write'],
    abilities: ['报告撰写', '结构化输出'],
    usedBy: ['深度研究员', '通用写作任务'],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    runtimeName: 'reviewer',
    aliases: ['visual-reviewer', 'sa_visual-reviewer'],
    icon: 'ri-eye-line',
    color: '#F87171',
    desc: '质量审查、事实核对与改进建议',
    description: '审查文本、报告、演示稿或任务结果的完整性、准确性、结构和可读性。',
    prompt: '你是审查子智能体。你的任务是对已有产出做质量检查。\n\n工作要求：\n- 检查事实一致性、引用完整性、结构清晰度、遗漏项和可执行性\n- 对视觉或演示内容检查布局、层级、可读性和风格一致性\n- 输出问题清单、严重程度和具体修改建议\n- 不要重写全文，除非主任务明确要求',
    tools: ['file_read'],
    abilities: ['质量审查', '事实核对', '改进建议'],
    usedBy: ['PPT 生成器', '报告任务'],
  },
  {
    id: 'flashcard-generator',
    name: 'Flashcard Generator',
    runtimeName: 'flashcard-generator',
    aliases: ['flashcard_generator'],
    icon: 'ri-stack-line',
    color: '#EC4899',
    desc: '学习闪卡与记忆卡片批量生成',
    description: '面向学习材料生成问答、填空、解释和标签化复习闪卡。',
    prompt: '你是闪卡生成子智能体。你的任务是围绕学习材料生成适合主动回忆的复习卡片。\n\n工作要求：\n- 每张卡只考一个知识点\n- 覆盖定义、公式、步骤、对比、限制条件和易混点\n- 每张卡包含正面问题、背面答案、解析、标签和难度\n- 题目必须与材料或指定知识点一致\n- 可按要求输出 Markdown、JSON 或写入文件',
    tools: ['file_read', 'file_write', 'kb_search'],
    abilities: ['闪卡', '主动回忆', '记忆复习'],
    usedBy: ['闪卡生成器', '学习任务'],
  },
  {
    id: 'quiz-generator',
    name: 'Quiz Generator',
    runtimeName: 'quiz-generator',
    aliases: ['quiz_generator'],
    icon: 'ri-question-answer-line',
    color: '#FB923C',
    desc: '学习测验与练习题批量生成',
    description: '面向学习材料生成分层练习、答案解析和复习反馈。',
    prompt: '你是练习题生成子智能体。你的任务是围绕学习材料生成可训练、可讲评的练习。\n\n工作要求：\n- 覆盖基础记忆、概念辨析、应用迁移和综合题\n- 每题包含答案、解析、考点、难度和常见错误\n- 题目必须与材料或指定知识点一致\n- 可按要求输出 Markdown、JSON 或写入文件',
    tools: ['file_read', 'file_write', 'kb_search'],
    abilities: ['练习题', '解析', '讲评'],
    usedBy: ['测验生成器', '学习任务'],
  },
  {
    id: 'study-planner',
    name: 'Study Planner',
    runtimeName: 'study-planner',
    aliases: ['study_planner'],
    icon: 'ri-calendar-todo-line',
    color: '#A78BFA',
    desc: '学习路径、复习节奏和任务计划',
    description: '根据目标、资料和时间限制制定学习路径、复习安排和检查点。',
    prompt: '你是学习规划子智能体。你的任务是制定可执行的学习或复习计划。\n\n工作要求：\n- 明确目标、时间、资料范围和验收标准\n- 拆分阶段、每日任务、复盘节点和测验安排\n- 对薄弱点和高分值内容提高优先级\n- 输出简洁、可执行、方便主智能体整合的计划',
    tools: ['file_read', 'file_write', 'kb_search'],
    abilities: ['学习路径', '复习计划', '检查点'],
    usedBy: ['复习规划师', '学习任务'],
  },
]
