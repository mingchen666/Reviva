// Bot 固定回复文案集中维护。改任何菜单/提示文案只动这一个文件。
// CommandHandler 与 WeChatBridgeService 都从这里引用，避免文案散落各处。

// 触发 /help 的关键词（非斜杠消息里命中也算命令）
export const HELP_KEYWORDS = /菜单|帮助|功能|指令/

// /help 显示的指令菜单
export const HELP_TEXT = [
  '【微信助手 · 指令速查】',
  '',
  '/help —— 显示本帮助（发"菜单""帮助"也行）',
  '/new —— 保存当前对话，开始新对话',
  '/clear —— 清空当前对话上下文（不保存）',
  '/agent —— 列出可用 Agent',
  '/agent <关键词> —— 切换 Agent（如 /agent 考公）',
  '/status —— 查看当前 Agent、模型与连接状态',
  '/files —— 列出已导入「微信bot文件」目录的文件',
  '/doc <文件名> —— 把指定文件标记为当前对话重点参考',
  '',
  '直接发消息就是跟 Agent 对话；发文件/链接会自动导入。',
].join('\n')

export const RESPONSES = {
  // —— 消息管线文案（WeChatBridgeService 用）——
  intro: '我是你的 Reviva 学习助手，直接提问就行，也可以发文件/链接给我导入。发 /help 看更多指令。',
  stillProcessing: '还在处理中，请稍等...',
  thinking: '🤔 我正在思考…',
  toolStart: (name) => '🔧 正在执行' + (name ? ('：' + name) : '') + '…',
  noAgent: '微信 Bot 尚未设置默认 Agent，请在「Agent 助手」页选择。',
  busy: '上一条还在处理中，请稍等片刻再发送。',
  emptyReply: '(空回复)',
  agentFail: (msg) => '处理失败：' + (msg || '未知错误'),
  sendFail: (msg) => '发送失败：' + (msg || '未知'),

  // —— 命令文案（CommandHandler 用）——
  help: HELP_TEXT,
  unknownCmd: (cmd) => '未知指令「/' + cmd + '」，发 /help 查看可用指令。',
  newConv: '已保存当前对话，开始新对话。直接发消息即可。',
  clearConv: '已清空当前对话上下文。直接发消息即可。',

  // /agent
  noAgents: '暂无可用 Agent，请先在 Reviva 中创建配置。',
  agentListTitle: '【可用 Agent】',
  agentListHint: '\n\n发 /agent <关键词> 切换。',
  agentSwitched: (name) => '已切换到「' + name + '」，下次对话生效。',
  agentMulti: '匹配到多个 Agent，请更精确：',
  agentNone: (kw) => '未找到匹配「' + kw + '」的 Agent。发 /agent 查看全部。',

  // /status
  statusTitle: '【当前状态】',
  statusNoAgent: '当前未设置默认 Agent（连接正常）。请在「AI 助手」页或发 /agent 选择。',
  statusConnected: '正常（Bot 在线）',
  statusLine: (name, model) => '· Agent：' + name + '\n· 模型：' + model + '\n· 连接：',
  statusPushReady: (n) => '\n· 主动推送：就绪（已建立 ' + n + ' 个会话，提醒可到点推送）',
  statusPushNoToken: '\n· 主动推送：未就绪（需先在微信里给 bot 发一条消息，提醒才能主动推送）',

  // /files
  noFiles: '「微信bot文件」目录暂无文件。发文件给我会自动导入。',
  filesTitle: '【已导入文件】（最近 10 个自动挂载）',
  fileNotFound: (arg) => '未找到包含「' + arg + '」的文件。发 /files 查看全部。',
  docMarked: (name) => '已将「' + name + '」标记为当前对话重点参考。',
  docUsage: '用法：/doc <文件名>，如 /doc 数据结构',

  // —— 文件导入通知 ——
  fileImported: (name, size) => '✅ 文件「' + name + '」已保存' + (size ? ('（' + size + '）') : '') + '，并自动挂载为对话上下文。发 /files 查看全部，或直接提问。',
  fileImportFail: (name) => '⚠️ 文件「' + (name || '未命名') + '」保存失败，请重试。',
}
