import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const dbAgents = () => window.electronAPI.db.agents
const dbSkills = () => window.electronAPI.db.skills
const dbTools = () => window.electronAPI.db.tools
const dbSubAgents = () => window.electronAPI.db.subAgents

const DISABLED_CUSTOM_TOOL_TYPES = new Set(['script'])

function normalizeNonNegativeLimit(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function hasAnyKey(obj, keys) {
  return keys.some(k => Object.prototype.hasOwnProperty.call(obj || {}, k))
}

function normalizeCustomToolRecord(tool = {}) {
  const type = tool.type || 'api'
  const permReq = tool.permReq || tool.perm_required || (type === 'script' ? 'execCommand' : '')
  const runtimeDisabled = DISABLED_CUSTOM_TOOL_TYPES.has(type)
  return {
    ...tool,
    desc: tool.desc || tool.description || '',
    cat: tool.cat || tool.category || 'custom',
    apiUrl: tool.apiUrl || tool.api_url || '',
    scriptPath: tool.scriptPath || tool.script_path || '',
    permReq,
    archCompat: tool.archCompat || tool.arch_compat || ['react', 'plan_exec', 'hybrid'],
    responseFormat: tool.responseFormat || tool.response_format || 'JSON',
    providerConfig: tool.providerConfig || tool.provider_config || {},
    enabled: tool.enabled !== false && tool.enabled !== 0,
    runtimeDisabled,
    unsupportedReason: runtimeDisabled ? '本地脚本工具暂未开放运行' : '',
    builtin: !!tool.builtin,
  }
}

function customToolToDbPayload(tool = {}, { partial = false } = {}) {
  const data = {}
  const put = (keys, dbKey, value) => {
    if (!partial || hasAnyKey(tool, keys)) data[dbKey] = value
  }
  const type = tool.type || 'api'

  put(['name'], 'name', tool.name || '未命名工具')
  put(['icon'], 'icon', tool.icon || 'ri-tools-line')
  put(['color'], 'color', tool.color || '#4ADE80')
  put(['cat', 'category'], 'category', tool.cat || tool.category || 'custom')
  put(['desc', 'description'], 'description', tool.desc || tool.description || '')
  put(['type'], 'type', type)
  put(['apiUrl', 'api_url'], 'api_url', tool.apiUrl || tool.api_url || '')
  put(['method'], 'method', tool.method || 'POST')
  put(['headers'], 'headers', tool.headers || {})
  put(['params'], 'params', tool.params || [])
  put(['responseFormat', 'response_format'], 'response_format', tool.responseFormat || tool.response_format || 'JSON')
  put(['scriptPath', 'script_path'], 'script_path', tool.scriptPath || tool.script_path || '')
  put(['sandbox'], 'sandbox', tool.sandbox || '')
  put(['permReq', 'perm_required', 'type'], 'perm_required', tool.permReq || tool.perm_required || (type === 'script' ? 'execCommand' : ''))
  put(['archCompat', 'arch_compat'], 'arch_compat', tool.archCompat || tool.arch_compat || ['react', 'plan_exec', 'hybrid'])
  put(['enabled'], 'enabled', tool.enabled === false || tool.enabled === 0 ? 0 : 1)
  put(['providerConfig', 'provider_config'], 'provider_config', tool.providerConfig || tool.provider_config || {})
  return data
}

// Built-in tools are defined in-code (not in DB) since they're static
// Built-in skills are loaded from disk at startup via IPC skill:listBuiltin
// (sourced from electron/builtin-assets/skills/{id}/config.json)
const platformSkills = ref([])
const REMOVED_TOOL_IDS = new Set(['llm_wiki', 'web_scrape'])

// DeepAgents-aligned tool categories
const TOOL_CATEGORIES = [
  { key: 'filesystem', label: '文件系统', icon: 'ri-folder-line', color: '#4ADE80', desc: '文件读取、写入、列表、重命名' },
  { key: 'execution', label: '执行', icon: 'ri-terminal-box-line', color: '#38BDF8', desc: 'Shell 命令执行与沙盒运行' },
  { key: 'media', label: '媒体', icon: 'ri-movie-line', color: '#14B8A6', desc: '音视频信息读取、音频提取、字幕、抽帧和片段处理' },
  { key: 'document', label: '文档转换', icon: 'ri-file-transfer-line', color: '#A78BFA', desc: '文档格式转换与导出' },
  { key: 'web', label: '联网', icon: 'ri-global-line', color: '#3B82F6', desc: '联网搜索与网页内容获取' },
  { key: 'knowledge', label: '知识库', icon: 'ri-database-2-line', color: '#6C8AFF', desc: '知识库检索与知识编译' },
  { key: 'mcp', label: 'MCP', icon: 'ri-plug-line', color: '#10B981', desc: '远程 MCP 服务器接入的工具（HTTP / SSE）' },
  { key: 'custom', label: '自定义', icon: 'ri-tools-line', color: '#FACC15', desc: '用户自建的 API 工具；本地脚本暂未开放' },
]

const BUILTIN_TOOLS = [
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
    id: 'office_read', name: 'Office 读取', icon: 'ri-file-text-line', color: '#3B82F6', cat: 'filesystem', desc: '读取 Word、Excel、PPT 的结构概览和分段正文（系统默认工具）',
    permReq: '', archCompat: ['全架构'], type: '',
    params: [
      { name: 'path', type: 'string', required: true, desc: 'Office 文件路径（.docx / .xlsx / .pptx）' },
      { name: 'mode', type: 'string', required: false, desc: 'overview / text / outline / stats / issues，默认 overview' },
      { name: 'start', type: 'number', required: false, desc: 'text 模式分段读取起始位置' },
      { name: 'maxLines', type: 'number', required: false, desc: 'text 模式最多读取行数' },
      { name: 'maxChars', type: 'number', required: false, desc: '返回内容最大字符数' },
    ],
    sandbox: '系统默认只读工具。仅允许读取授权目录内 .docx/.xlsx/.pptx，依赖 officecli；默认概览，正文需分段读取。',
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
    id: 'pdf_read', name: 'PDF 读取', icon: 'ri-file-pdf-2-line', color: '#EF4444', cat: 'filesystem', desc: '读取 PDF 的页数、元数据和分段正文（系统默认工具）',
    permReq: '', archCompat: ['全架构'], type: '',
    params: [
      { name: 'path', type: 'string', required: true, desc: 'PDF 文件路径（.pdf）' },
      { name: 'mode', type: 'string', required: false, desc: 'overview / text / metadata，默认 overview' },
      { name: 'startPage', type: 'number', required: false, desc: 'text 模式起始页码' },
      { name: 'maxPages', type: 'number', required: false, desc: '最多读取页数' },
      { name: 'maxChars', type: 'number', required: false, desc: '返回内容最大字符数' },
    ],
    sandbox: '系统默认只读工具。仅允许读取授权目录内 .pdf，依赖 Python 包 pypdf；默认概览，正文需按页分段读取。',
    builtin: true, enabled: true, alwaysEnabled: true,
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

const SUB_AGENTS = [
  {
    id: 'Reader',
    name: 'Reader',
    runtimeName: 'Reader',
    aliases: ['reader'],
    icon: 'ri-book-open-line',
    color: '#6C8AFF',
    desc: '资料阅读与关键信息提取',
    description: '读取本地资料和知识库内容，提取与任务直接相关的事实、概念、数据和出处。',
    prompt: '你是资料阅读子智能体。你的任务是读取用户指定的文件、Office/PDF 文档或知识库材料，只提取与主任务相关的信息。\n\n工作要求：\n- 先确认需要读取的文件或主题范围\n- 优先使用 office_read 读取 Office 文档，使用 pdf_read 读取 PDF 文档，普通文本使用 file_read，必要时使用 kb_search\n- 输出结构化摘要，包含关键事实、原始出处、重要术语和不确定点\n- 不要自行扩写结论，不要写最终报告',
    tools: ['file_read', 'kb_search'],
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
    prompt: '你是本地资料分析子智能体。你的任务是分析用户提供的本地资料。\n\n工作要求：\n- 逐个文件提取核心观点、关键数据、证据和结论\n- 标注来源文件、章节或路径\n- 跨文件比较共同主题、互补信息和矛盾点\n- 对 Office 文档优先使用 office_read，对 PDF 文档优先使用 pdf_read\n- 输出分析发现，不要写最终报告',
    tools: ['file_read', 'kb_search'],
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

function normalizeSubAgentRecord(subAgent) {
  const aliases = new Set(Array.isArray(subAgent.aliases) ? subAgent.aliases.filter(Boolean) : [])
  if (String(subAgent.id || '').startsWith('sa_')) aliases.add(String(subAgent.id).slice(3))
  return {
    ...subAgent,
    desc: subAgent.desc || subAgent.description || '',
    description: subAgent.description || subAgent.desc || '',
    aliases: [...aliases],
    abilities: Array.isArray(subAgent.abilities) ? subAgent.abilities : [],
  }
}

export const useAgentsStore = defineStore('agents', () => {
  const agents = ref([])
  const customSkills = ref([])
  const customTools = ref([])
  const mcpServers = ref([])
  const customSubAgents = ref([])
  const loaded = ref(false)
  const platformSkillEnabledMap = ref({})

  const builtinSkills = ref([]) // Populated from platformSkills that user enables
  const builtinTools = ref(BUILTIN_TOOLS)
  const builtinSubAgents = ref(SUB_AGENTS.map(s => normalizeSubAgentRecord({ ...s, builtin: true })))
  const subAgentList = computed(() => [...builtinSubAgents.value, ...customSubAgents.value])
  const toolEnabledMap = ref({})
  const toolProviderConfigMap = ref({})

  function _stripRemovedToolRefs(agent) {
    if (!Array.isArray(agent?.tools)) return agent
    const tools = agent.tools.filter(id => !REMOVED_TOOL_IDS.has(id))
    return tools.length === agent.tools.length ? agent : { ...agent, tools }
  }

  async function _persistRemovedToolRefs(originalAgents, cleanedAgents) {
    if (!window.electronAPI?.db?.agents) return
    const updates = []
    for (let i = 0; i < cleanedAgents.length; i++) {
      const before = originalAgents[i]?.tools || []
      const after = cleanedAgents[i]?.tools || []
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        updates.push(dbAgents().update(cleanedAgents[i].id, { tools: JSON.parse(JSON.stringify(after)) }))
      }
    }
    if (updates.length) await Promise.all(updates)
  }

  // Restore built-in tool enabled state and provider configs from persisted maps
  // Also handles migration from old 'web_search' to per-provider tools
  function _restoreBuiltinToolEnabled() {
    for (const id of REMOVED_TOOL_IDS) {
      delete toolEnabledMap.value[id]
      delete toolProviderConfigMap.value[id]
    }

    // Migration: convert old 'web_search' config to per-provider tool
    const oldEnabled = toolEnabledMap.value.web_search
    const oldConfig = toolProviderConfigMap.value.web_search
    if (oldEnabled !== undefined || oldConfig) {
      const provider = oldConfig?.provider || 'tavily'
      const newToolId = 'web_search_' + provider
      if (oldConfig) {
        toolProviderConfigMap.value[newToolId] = {
          apiKey: oldConfig.apiKey || '',
          baseUrl: oldConfig.baseUrl || '',
          userParams: oldConfig.userParams || {},
        }
        delete toolProviderConfigMap.value.web_search
      }
      if (oldEnabled !== undefined) {
        toolEnabledMap.value[newToolId] = oldEnabled
        delete toolEnabledMap.value.web_search
      }
      // Also migrate agents' tool arrays if any reference 'web_search'
      for (const agent of agents.value) {
        if (agent.tools) {
          const idx = agent.tools.indexOf('web_search')
          if (idx >= 0) {
            agent.tools.splice(idx, 1, newToolId)
            // Update DB asynchronously
            if (window.electronAPI?.db?.agents) {
              dbAgents().update(agent.id, { tools: JSON.parse(JSON.stringify(agent.tools)) })
            }
          }
        }
      }
    }

    for (const tool of builtinTools.value) {
      if (tool.alwaysEnabled) {
        tool.enabled = true
        toolEnabledMap.value[tool.id] = true
      } else if (toolEnabledMap.value[tool.id] !== undefined) {
        tool.enabled = toolEnabledMap.value[tool.id]
      }
      if (toolProviderConfigMap.value[tool.id]) {
        const saved = toolProviderConfigMap.value[tool.id]
        tool.providerConfig = {
          ...tool.providerConfig,
          apiKey: saved.apiKey || '',
          baseUrl: saved.baseUrl || '',
          userParams: saved.userParams ? { ...tool.providerConfig.userParams, ...saved.userParams } : tool.providerConfig.userParams,
        }
      }
    }
  }
  _restoreBuiltinToolEnabled()

  function _isConfigured(tool) {
    if (!tool.needsConfig) return true
    const cfg = tool.providerConfig
    if (!cfg) return false
    // New per-provider tools: check needsKey and baseUrl
    if (tool.needsKey !== undefined) {
      // needsKey true = must have apiKey; 'optional' = apiKey not required; false = no apiKey needed
      if (tool.needsKey === true && !cfg.apiKey) return false
      // Tools that need baseUrl (SearXNG) — if no baseUrl and no defaultUrl, not configured
      if (!tool.needsKey && !cfg.baseUrl && !cfg.defaultUrl) return false
      return true
    }
    // Legacy multi-provider tools (e.g. translate): keep old logic
    if (!cfg.providers) return false
    const selected = cfg.providers.find(p => p.key === cfg.provider)
    if (!selected) return false
    if (selected.needsKey && !cfg.apiKey) return false
    return true
  }

  function toggleBuiltinTool(toolId) {
    const tool = builtinTools.value.find(t => t.id === toolId)
    if (!tool) return
    if (tool.alwaysEnabled) {
      tool.enabled = true
      toolEnabledMap.value[toolId] = true
      return
    }
    // Cannot enable a tool that needs config but isn't configured
    if (!tool.enabled && tool.needsConfig && !_isConfigured(tool)) return
    tool.enabled = !tool.enabled
    toolEnabledMap.value[toolId] = tool.enabled
  }

  function updateToolProviderConfig(toolId, config) {
    const tool = builtinTools.value.find(t => t.id === toolId)
    if (!tool) return
    // For per-provider tools, merge apiKey/baseUrl/userParams only
    const { apiKey, baseUrl, userParams } = config
    tool.providerConfig = {
      ...tool.providerConfig,
      apiKey: apiKey || tool.providerConfig.apiKey || '',
      baseUrl: baseUrl || tool.providerConfig.baseUrl || '',
      userParams: userParams ? { ...tool.providerConfig.userParams, ...userParams } : tool.providerConfig.userParams,
    }
    toolProviderConfigMap.value[toolId] = { apiKey: tool.providerConfig.apiKey, baseUrl: tool.providerConfig.baseUrl, userParams: tool.providerConfig.userParams }
  }

  // Built-in skills are always enabled — they ship with the app and are auto-installed
  // to the DB at startup so the agent runtime can read prompt_content from custom_skills.
  function _restorePlatformSkillEnabled() {
    for (const skill of platformSkills.value) {
      skill.enabled = true
    }
  }

  // Load built-in skills metadata from disk via IPC (electron/builtin-assets/skills/*/config.json)
  async function _loadBuiltinSkills() {
    if (!window.electronAPI?.skill?.listBuiltin) return
    try {
      const res = await window.electronAPI.skill.listBuiltin()
      if (!res?.success) return
      platformSkills.value = (res.data || []).map(s => ({
        ...s,
        desc: s.description,
        usedBy: [],
        enabled: true,
      }))
    } catch (e) {
      console.error('Failed to load builtin skills:', e)
    }
  }

  // Ensure every built-in skill has a matching DB row (source='platform', enabled=1).
  // The DB row carries prompt_content so the agent runtime can read it without disk IO.
  // Re-runs on every startup to sync changes the user made to SKILL.md on disk.
  async function _ensureBuiltinSkillsInDb(dbSkillList) {
    if (!window.electronAPI?.db?.skills) return
    for (const skill of platformSkills.value) {
      const existing = dbSkillList.find(s => s.id === skill.id && s.source === 'platform')

      let promptContent = ''
      try {
        const fileRes = await window.electronAPI.skill.readFile(skill.id, 'SKILL.md')
        if (fileRes?.success) promptContent = fileRes.data || ''
      } catch { }

      if (!existing) {
        const createPayload = {
          id: skill.id,
          name: skill.name,
          icon: skill.icon,
          color: skill.color,
          description: skill.desc || skill.description,
          detail: '',
          prompt_template: promptContent,
          prompt_content: promptContent,
          output_types: skill.outputTypes || ['Markdown'],
          allowed_tools: skill.allowedTools || [],
          source: 'platform',
          category: skill.category || '',
          version: skill.version || '1.0',
          author: skill.author || '',
          license: skill.license || '',
          builtin: 1,
          enabled: 1,
        }
        await window.electronAPI.db.skills.create(JSON.parse(JSON.stringify(createPayload)))
      } else if (
        existing.enabled !== 1 ||
        existing.prompt_content !== promptContent ||
        existing.version !== (skill.version || '1.0') ||
        JSON.stringify(existing.output_types || existing.outputTypes || []) !== JSON.stringify(skill.outputTypes || ['Markdown']) ||
        JSON.stringify(existing.allowed_tools || existing.allowedTools || []) !== JSON.stringify(skill.allowedTools || [])
      ) {
        const updatePayload = {
          enabled: 1,
          prompt_template: promptContent,
          prompt_content: promptContent,
          name: skill.name,
          description: skill.desc || skill.description,
          icon: skill.icon,
          color: skill.color,
          category: skill.category || '',
          output_types: skill.outputTypes || ['Markdown'],
          allowed_tools: skill.allowedTools || [],
          version: skill.version || '1.0',
          author: skill.author || '',
          license: skill.license || '',
          builtin: 1,
        }
        await window.electronAPI.db.skills.update(skill.id, JSON.parse(JSON.stringify(updatePayload)))
      }
    }
  }

  // Built-in skills are always enabled — kept as a no-op for any legacy callers.
  async function togglePlatformSkill(_skillId) {
    console.warn('togglePlatformSkill is a no-op — built-in skills are always enabled')
  }

  // Combined skill list: built-in (always enabled) + custom
  const skillList = computed(() => [...platformSkills.value, ...customSkills.value])
  const allAvailableSkills = computed(() => [...platformSkills.value, ...customSkills.value])
  const skillCategories = computed(() => {
    const cats = new Set(platformSkills.value.map(s => s.category))
    customSkills.value.forEach(s => cats.add(s.category || '自定义'))
    return [...cats]
  })
  // Each enabled MCP server shows as ONE entry in the agent tool picker (server-level binding).
  // id format: `mcp:{serverId}` — at runtime AgentService expands this to all non-disabled tools of that server.
  // Per-tool exclusion is still controlled in McpManager via the server's disabled_tools list.
  const mcpTools = computed(() => {
    const out = []
    for (const s of mcpServers.value) {
      if (!s.enabled) continue
      const total = (s.tools_cache || []).length
      const disabled = (s.disabled_tools || []).length
      const active = Math.max(total - disabled, 0)
      const resources = (s.resources_cache || []).length
      const prompts = (s.prompts_cache || []).length
      const templates = (s.resource_templates_cache || []).length
      const capabilityTotal = active + resources + prompts + templates
      const desc = capabilityTotal === 0
        ? `MCP 远程服务器 · 未同步能力`
        : `MCP 远程服务器 · ${active} 工具 / ${resources} 资源 / ${prompts} 提示 / ${templates} 模板${disabled ? `（${disabled} 个工具已禁用）` : ''}`
      out.push({
        id: `mcp:${s.id}`,
        name: s.name,
        desc,
        description: desc,
        icon: 'ri-plug-line',
        color: '#10B981',
        cat: 'mcp',
        source: 'mcp',
        serverId: s.id,
        serverName: s.name,
        toolCount: active,
        resourceCount: resources,
        promptCount: prompts,
        templateCount: templates,
        builtin: false,
        enabled: true,
        permReq: '',
        archCompat: ['react', 'plan_exec', 'hybrid'],
        params: [],
        sandbox: `远程 MCP 服务器：${s.name}`,
      })
    }
    return out
  })

  async function loadMcpServers() {
    if (!window.electronAPI?.db?.mcpServers) return
    try {
      mcpServers.value = await window.electronAPI.db.mcpServers.list() || []
    } catch (e) {
      console.error('Failed to load MCP servers:', e)
    }
  }

  const toolList = computed(() => [...builtinTools.value, ...customTools.value, ...mcpTools.value])
  const enabledTools = computed(() => toolList.value.filter(t => t.enabled && !t.runtimeDisabled))
  const toolCategories = computed(() => {
    const cats = new Set(builtinTools.value.map(t => t.cat))
    customTools.value.forEach(t => cats.add(t.cat || 'custom'))
    return TOOL_CATEGORIES.filter(c => cats.has(c.key))
  })
  const customAgents = computed(() => agents.value.filter(a => !a.builtin))
  const builtinAgents = computed(() => agents.value.filter(a => a.builtin))
  const customCount = computed(() => customAgents.value.length)
  const builtinCount = computed(() => builtinAgents.value.length)
  const totalToolUses = computed(() => agents.value.reduce((n, a) => n + (a.tools?.length || 0), 0))
  const totalSkillUses = computed(() => agents.value.reduce((n, a) => n + (a.skills?.length || 0), 0))
  const totalSubUses = computed(() => agents.value.reduce((n, a) => n + ((a.subAgents || a.sub_agents || []).length), 0))

  async function loadFromDb() {
    if (!window.electronAPI?.db) return
    try {
      // Load built-in skills metadata from disk first
      await _loadBuiltinSkills()

      const [agentList, skillList, toolList, subAgentList] = await Promise.all([
        dbAgents().list(),
        dbSkills().list(),
        dbTools().list(),
        dbSubAgents().list(),
      ])
      const cleanedAgents = agentList.map(_stripRemovedToolRefs)
      agents.value = cleanedAgents
      customTools.value = toolList.map(normalizeCustomToolRecord)
      customSubAgents.value = subAgentList.map(normalizeSubAgentRecord)
      await _persistRemovedToolRefs(agentList, cleanedAgents)

      // Sync built-in skills to DB so agent runtime can read prompt_content.
      // This also picks up SKILL.md edits on disk between startups.
      await _ensureBuiltinSkillsInDb(skillList)

      // customSkills excludes source='platform' rows — those are surfaced via platformSkills
      // (single source of truth on disk). Avoids double-counting in market UI / agent picker.
      customSkills.value = skillList
        .filter(s => s.source !== 'platform')
        .map(s => ({ ...s, desc: s.desc || s.description || '' }))

      // Load MCP server configs + their cached tools (for agent tool picker)
      await loadMcpServers()

      _restorePlatformSkillEnabled()
      _restoreBuiltinToolEnabled()
      loaded.value = true
    } catch (e) {
      console.error('Failed to load agents from DB:', e)
    }
  }

  async function addAgent(agent) {
    // Validate english_name uniqueness
    if (agent.englishName && window.electronAPI?.db?.agents?.isEnglishNameUnique) {
      const isUnique = await dbAgents().isEnglishNameUnique(agent.englishName)
      if (!isUnique) throw new Error(`英文名称 "${agent.englishName}" 已被占用`)
    }
    const data = {
      name: agent.name || '未命名智能体',
      english_name: agent.englishName || '',
      description: agent.desc || '',
      icon: agent.icon || 'ri-sparkling-2-line',
      color: agent.color || '#A78BFA',
      architecture: 'react',
      builtin: false,
      permissions: agent.permissions || { fileRead: false, fileWrite: false, fileDelete: false, fileRename: false, execCommand: false, execCommandWhitelist: [], execCommandBlacklist: [] },
      tools: agent.tools || ['kb_search'],
      skills: agent.skills || [],
      sub_agents: agent.subAgents || [],
      prompt: agent.prompt || '',
      max_iterations: normalizeNonNegativeLimit(agent.maxIter ?? agent.maxIterations, 10),
      reflect_persist: false,
      planning_model: '',
      plan_steps: 5,
      complexity_classifier: false,
      model: agent.model || '',
      temperature: agent.temperature ?? 0.7,
      top_p: agent.topP ?? 1.0,
      max_tokens: agent.maxTokens || 4096,
      presence_penalty: agent.presencePenalty ?? 0,
      frequency_penalty: agent.frequencyPenalty ?? 0,
      thinking_mode: agent.thinkingMode || 'auto',
      thinking_intensity: agent.thinkingIntensity || 'medium',
      reviewer_model: agent.reviewerModel || '',
      use_same_model: agent.useSameModel ? 1 : 0,
      tool_call_limit: normalizeNonNegativeLimit(agent.toolCallLimit, 0),
      model_call_limit: normalizeNonNegativeLimit(agent.modelCallLimit, 0),
    }
    if (window.electronAPI?.db) {
      const result = await dbAgents().create(data)
      await loadFromDb()
      return agents.value.find(a => a.id === result.id)
    }
    const fallback = { id: Date.now(), ...data }
    agents.value.push(fallback)
    return fallback
  }

  async function updateAgent(id, data) {
    // Validate english_name uniqueness (excluding self)
    if (data.englishName && window.electronAPI?.db?.agents?.isEnglishNameUnique) {
      const isUnique = await dbAgents().isEnglishNameUnique(data.englishName, id)
      if (!isUnique) throw new Error(`英文名称 "${data.englishName}" 已被占用`)
    }
    const mapped = {
      name: data.name, english_name: data.englishName, description: data.desc, icon: data.icon, color: data.color,
      architecture: 'react', builtin: data.builtin,
      permissions: data.permissions, tools: data.tools, skills: data.skills,
      sub_agents: data.subAgents, prompt: data.prompt,
      max_iterations: normalizeNonNegativeLimit(data.maxIter ?? data.maxIterations, undefined), reflect_persist: false,
      planning_model: '', plan_steps: 5,
      complexity_classifier: false,
      model: data.model, temperature: data.temperature,
      top_p: data.topP, max_tokens: data.maxTokens,
      presence_penalty: data.presencePenalty, frequency_penalty: data.frequencyPenalty,
      thinking_mode: data.thinkingMode, thinking_intensity: data.thinkingIntensity,
      reviewer_model: data.reviewerModel, use_same_model: data.useSameModel,
      tool_call_limit: normalizeNonNegativeLimit(data.toolCallLimit, undefined), model_call_limit: normalizeNonNegativeLimit(data.modelCallLimit, undefined),
    }
    if (window.electronAPI?.db) await dbAgents().update(id, mapped)
    await loadFromDb()
  }

  async function removeAgent(id) {
    if (window.electronAPI?.db) await dbAgents().delete(id)
    agents.value = agents.value.filter(a => a.id !== id)
  }

  function duplicateAgent(agent) {
    const copy = { ...JSON.parse(JSON.stringify(agent)) }
    copy.name = `${agent.name} (副本)`
    copy.englishName = ''
    copy.builtin = false
    delete copy.id
    return addAgent(copy)
  }

  async function addSkill(skill) {
    // Deep-clone to strip Vue reactive proxies before IPC
    const raw = JSON.parse(JSON.stringify(skill))
    // Use englishName as ID/directory name; fallback to slugified name
    const baseId = raw.englishName || slugify(raw.name) || 'skill-' + Date.now()
    function slugify(val) { return (val || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').trim() }
    // Ensure uniqueness
    const existingIds = customSkills.value.map(s => s.id)
    let finalId = baseId
    if (existingIds.includes(finalId)) {
      finalId = baseId + '-' + Date.now()
    }
    const data = {
      id: finalId,
      name: raw.name || '未命名 Skill',
      icon: raw.icon || '🧠',
      color: raw.color || '#6C8AFF',
      description: raw.desc || raw.description || '',
      prompt_template: raw.promptTemplate || raw.promptContent || '',
      prompt_content: raw.promptContent || raw.promptTemplate || '',
      category: raw.category || '',
    }
    if (window.electronAPI?.db) {
      const result = await dbSkills().create(data)
      // Install skill files to disk ({root}/skills/{id}/)
      if (window.electronAPI?.skill?.install) {
        await window.electronAPI.skill.install(result.id, JSON.parse(JSON.stringify({ ...result, promptContent: result.prompt_content })))
      }
      customSkills.value.push({ ...result, desc: result.description })
      return result
    }
    const fallback = { id: finalId, ...data, builtin: false, usedBy: [], desc: data.description }
    customSkills.value.push(fallback)
    return fallback
  }

  async function updateSkill(id, data) {
    // Deep-clone to strip Vue reactive proxies before IPC
    const raw = JSON.parse(JSON.stringify(data))
    // Map camelCase UI props to snake_case DB columns
    const mapped = {
      name: raw.name,
      icon: raw.icon,
      color: raw.color,
      description: raw.desc || raw.description,
      prompt_template: raw.promptTemplate || raw.promptContent,
      prompt_content: raw.promptContent || raw.promptTemplate,
      category: raw.category,
    }
    // Remove undefined keys so dynamicUpdate doesn't set them to NULL
    for (const k of Object.keys(mapped)) {
      if (mapped[k] === undefined) delete mapped[k]
    }
    if (window.electronAPI?.db) await dbSkills().update(id, mapped)
    // Re-install skill files to disk — deep-clone to strip reactive proxies
    if (window.electronAPI?.skill?.install) {
      const skillRow = customSkills.value.find(s => s.id === id)
      if (skillRow) {
        await window.electronAPI.skill.install(id, JSON.parse(JSON.stringify({ ...skillRow, ...mapped, promptContent: mapped.prompt_content })))
      }
    }
    const idx = customSkills.value.findIndex(s => s.id === id)
    if (idx !== -1) customSkills.value[idx] = { ...customSkills.value[idx], ...mapped, desc: mapped.description || customSkills.value[idx].desc }
  }

  async function removeSkill(id) {
    if (window.electronAPI?.db) await dbSkills().delete(id)
    if (window.electronAPI?.skill?.uninstall) {
      await window.electronAPI.skill.uninstall(id)
    }
    customSkills.value = customSkills.value.filter(s => s.id !== id)
  }

  async function addTool(tool) {
    const data = customToolToDbPayload({ ...tool, enabled: tool.enabled ?? 1 })
    if (window.electronAPI?.db) {
      const result = await dbTools().create(data)
      customTools.value.push(normalizeCustomToolRecord({ id: result.id, ...data, builtin: false, usedBy: [] }))
      return result
    }
    const fallback = normalizeCustomToolRecord({ id: 'tool_' + Date.now(), ...data, builtin: false, usedBy: [] })
    customTools.value.push(fallback)
    return fallback
  }

  async function updateTool(id, data) {
    const mapped = customToolToDbPayload(data, { partial: true })
    if (window.electronAPI?.db) await dbTools().update(id, mapped)
    const idx = customTools.value.findIndex(t => t.id === id)
    if (idx !== -1) customTools.value[idx] = normalizeCustomToolRecord({ ...customTools.value[idx], ...mapped, ...data })
  }

  async function removeTool(id) {
    if (window.electronAPI?.db) await dbTools().delete(id)
    customTools.value = customTools.value.filter(t => t.id !== id)
  }

  async function addSubAgent(sub) {
    const desc = sub.desc || sub.description || ''
    const data = {
      name: sub.name || '未命名 SubAgent',
      icon: sub.icon || 'ri-team-line',
      color: sub.color || '#6C8AFF',
      description: desc,
      prompt: sub.prompt || '',
      tools: sub.tools || [],
      skills: sub.skills || [],
      model: sub.model || '',
      temperature: sub.temperature ?? 0.7,
    }
    if (window.electronAPI?.db) {
      const result = await dbSubAgents().create(data)
      customSubAgents.value.push({ id: result.id, ...data, desc, builtin: false, enabled: true, abilities: [] })
      return result
    }
    const fallback = { id: 'sub_' + Date.now(), ...data, desc, builtin: false, enabled: true, abilities: [] }
    customSubAgents.value.push(fallback)
    return fallback
  }

  async function updateSubAgent(id, data) {
    // Normalize desc/description for DB
    const dbData = { ...data }
    if (dbData.desc && !dbData.description) dbData.description = dbData.desc
    if (window.electronAPI?.db) await dbSubAgents().update(id, dbData)
    const idx = customSubAgents.value.findIndex(s => s.id === id)
    if (idx !== -1) {
      const desc = dbData.desc || dbData.description || ''
      customSubAgents.value[idx] = { ...customSubAgents.value[idx], ...dbData, desc }
    }
  }

  async function removeSubAgent(id) {
    if (window.electronAPI?.db) await dbSubAgents().delete(id)
    customSubAgents.value = customSubAgents.value.filter(s => s.id !== id)
  }

  // ─── Health Check ───
  const healthCheckResults = ref({})
  const healthChecking = ref(false)
  const healthCheckingIds = ref([])

  async function runHealthCheck(agentIds) {
    healthChecking.value = true
    healthCheckingIds.value = [...agentIds]
    for (const id of agentIds) {
      healthCheckResults.value[id] = { status: 'checking', results: {}, checkedAt: null }
    }
    try {
      const results = await window.electronAPI.agent.healthCheck(agentIds, {
        toolProviderConfigMap: JSON.parse(JSON.stringify(toolProviderConfigMap.value || {})),
      })
      for (const r of results) {
        healthCheckResults.value[r.agentId] = r
      }
    } catch (e) {
      console.error('Health check failed:', e)
      for (const id of agentIds) {
        if (healthCheckResults.value[id]?.status === 'checking') {
          healthCheckResults.value[id] = { status: 'not_ready', results: {}, checkedAt: Date.now(), agentId: id }
        }
      }
    }
    healthChecking.value = false
    healthCheckingIds.value = []
  }

  function clearHealthCheck(agentId) {
    if (agentId) delete healthCheckResults.value[agentId]
    else healthCheckResults.value = {}
  }

  return {
    agents, platformSkills, platformSkillEnabledMap, allAvailableSkills, skillCategories, customSkills, skillList,
    builtinTools, customTools, toolList, enabledTools, toolCategories,
    toolEnabledMap, toolProviderConfigMap,
    mcpServers, mcpTools, loadMcpServers,
    builtinSubAgents, customSubAgents, subAgentList, loaded,
    customAgents, builtinAgents, customCount, builtinCount,
    totalToolUses, totalSkillUses, totalSubUses,
    TOOL_CATEGORIES,
    healthCheckResults, healthChecking, healthCheckingIds,
    loadFromDb, addAgent, updateAgent, removeAgent, duplicateAgent,
    togglePlatformSkill, toggleBuiltinTool, _isConfigured, updateToolProviderConfig,
    addSkill, updateSkill, removeSkill,
    addTool, updateTool, removeTool,
    addSubAgent, updateSubAgent, removeSubAgent,
    runHealthCheck, clearHealthCheck,
  }
}, {
  persist: {
    pick: ['agents', 'customSkills', 'customTools', 'customSubAgents', 'platformSkillEnabledMap', 'toolEnabledMap', 'toolProviderConfigMap'],
  },
})
