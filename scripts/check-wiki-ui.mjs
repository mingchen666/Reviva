// Compile and exercise the actual SFCs without Vite, a server, or Electron.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse, compileScript, compileTemplate, compileStyle } from 'vue/compiler-sfc'
import { createRenderer, h, nextTick, ref } from 'vue'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const compiled = new Map()
function compile(filename) {
  const absolute = path.resolve(root, filename)
  if (compiled.has(absolute)) return compiled.get(absolute)
  const { descriptor, errors } = parse(fs.readFileSync(absolute, 'utf8'), { filename: absolute })
  assert.equal(errors.length, 0, filename)
  const script = compileScript(descriptor, { id: filename, inlineTemplate: true })
  const template = compileTemplate({ source: descriptor.template.content, filename, id: filename, compilerOptions: { bindingMetadata: script.bindings } })
  assert.deepEqual(template.errors, [], filename)
  for (const style of descriptor.styles) {
    assert.deepEqual(compileStyle({ filename, id: filename, source: style.content, scoped: style.scoped }).errors, [], filename)
  }
  console.log(`SFC OK: ${filename}`)
  if (filename.endsWith('index.vue')) return
  const code = script.content.replace(/from\s+(['"])([^'"]+)\1/g, (match, quote, specifier) => {
    const url = specifier.endsWith('.vue') ? compile(path.resolve(path.dirname(absolute), specifier))
      : specifier.startsWith('@/') ? pathToFileURL(path.join(root, 'src', `${specifier.slice(2)}.js`)).href
        : import.meta.resolve(specifier)
    return `from ${JSON.stringify(url)}`
  })
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  compiled.set(absolute, url)
  return url
}
const Inspector = (await import(compile('src/views/wiki/sections/WikiInspector.vue'))).default
const Review = (await import(compile('src/views/wiki/sections/WikiReviewPanel.vue'))).default
const Checks = (await import(compile('src/views/wiki/sections/WikiChecksPanel.vue'))).default
const Reader = (await import(compile('src/views/wiki/sections/WikiReader.vue'))).default
const Citation = (await import(compile('src/views/wiki/sections/WikiCitationPreview.vue'))).default
const Extract = (await import(compile('src/views/wiki/sections/WikiSourceExtractReader.vue'))).default
const SourcePicker = (await import(compile('src/views/wiki/sections/WikiSourceExtractPicker.vue'))).default
compile('src/views/wiki/index.vue')

const node = (type, text = '') => ({ type, text, props: {}, children: [], parent: null, listeners: {}, style: {},
  getRootNode() { return globalThis.document || { activeElement: null } },
  addEventListener(event, handler) { this.listeners[event] = handler },
  removeEventListener(event) { delete this.listeners[event] },
})
const renderer = createRenderer({
  createElement: type => node(type), createText: text => node('#text', text), createComment: text => node('#comment', text),
  setText: (el, text) => { el.text = text }, setElementText: (el, text) => { el.children = []; el.text = text },
  patchProp: (el, key, previous, next) => { el.props[key] = next },
  insert(el, parent, anchor) {
    if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1)
    el.parent = parent
    const at = anchor ? parent.children.indexOf(anchor) : -1
    if (at < 0) parent.children.push(el); else parent.children.splice(at, 0, el)
  },
  remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1) },
  parentNode: el => el.parent, nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1],
})
const text = el => (el.type === '#comment' ? '' : el.text) + el.children.map(text).join('')
const find = (el, predicate) => predicate(el) ? el : el.children.map(child => find(child, predicate)).find(Boolean)
const click = async (el) => { assert.ok(el, 'button exists'); assert.ok(!el.props.disabled, 'button enabled'); el.props.onClick(); await nextTick() }
for (const isDark of [false, true]) {
  const host = node('root')
  let closed = false
  const view = tab => h(Inspector, { wiki: { id: 'A', name: 'Alpha' }, isDark, initialTab: tab, onClose: () => { closed = true } }, {
    review: () => h(Review, { isDark }),
    checks: () => h(Checks, { isDark }),
  })
  renderer.render(view('status'), host)
  assert.ok(text(host).includes('WikiAgent 维护'))
  assert.ok(!text(host).includes('待审核提案'))
  assert.ok(!text(host).includes('检索评估'))
  assert.ok(!text(host).includes('健康检查'))
  assert.ok(!text(host).includes('AI 语义巡检'))
  await click(find(host, el => el.props['data-tab'] === 'review'))
  assert.ok(text(host).includes('当前 Wiki 没有待审核提案'))
  assert.ok(!text(host).includes('检索评估'))
  assert.ok(!text(host).includes('健康检查'))
  assert.ok(!text(host).includes('WikiAgent 维护'))
  await click(find(host, el => el.props['data-tab'] === 'checks'))
  assert.ok(text(host).includes('健康检查'))
  assert.ok(text(host).includes('AI 语义巡检'))
  assert.ok(text(host).includes('检索评估'))
  assert.ok(!text(host).includes('待审核提案'))
  assert.ok(!text(host).includes('WikiAgent 维护'))
  const key = async (value, expected) => {
    let focused = ''
    find(host, el => el.props.role === 'tablist').props.onKeydown({ key: value, preventDefault() {}, currentTarget: {
      querySelector(selector) { return { focus() { focused = selector } } },
    } })
    await nextTick()
    assert.equal(find(host, el => el.props['data-tab'] === expected).props['aria-selected'], true)
    assert.equal(focused, `[data-tab="${expected}"]`)
  }
  await key('ArrowRight', 'status')
  await key('ArrowRight', 'review')
  await key('ArrowRight', 'checks')
  await key('ArrowLeft', 'review')
  await key('Home', 'status')
  await key('End', 'checks')
  renderer.render(view('checks'), host)
  renderer.render(view('status'), host)
  await nextTick()
  assert.ok(text(host).includes('WikiAgent 维护'), 'external tab selection updates existing drawer')
  renderer.render(view('checks'), host)
  await nextTick()
  assert.ok(text(host).includes('健康检查'), 'external checks entry updates existing drawer')
  await click(find(host, el => el.props['aria-label'] === '关闭知识库抽屉'))
  assert.equal(closed, true)
  renderer.render(null, host)
}

const checkHost = node('root')
const actions = []
const checkView = busy => h(Checks, {
  semanticAuditEnabled: true, linting: busy, auditing: busy, evaluating: busy,
  lintReport: { summary: { error: 2, warning: 3, info: 1 } },
  evaluation: { case_count: 4, metrics: { recall_at_5: 0.75, recall_at_10: 1, mrr: 0.8, citation_validity: 1 } },
  onRunLint: () => actions.push('lint'), onRunSemanticAudit: () => actions.push('audit'), onRunEvaluation: () => actions.push('evaluation'),
})
renderer.render(checkView(false), checkHost)
for (const label of ['检查', '巡检', '运行评估']) await click(find(checkHost, el => el.type === 'button' && text(el) === label))
assert.deepEqual(actions, ['lint', 'audit', 'evaluation'])
assert.ok(text(checkHost).includes('75%'))
renderer.render(checkView(true), checkHost)
for (const label of ['检查中', '巡检中', '评估中']) assert.equal(find(checkHost, el => el.type === 'button' && text(el) === label).props.disabled, true)
renderer.render(null, checkHost)

for (const isDark of [false, true]) {
  const issueHost = node('root')
  const opened = []
  const warnings = Array.from({ length: 14 }, (_, i) => ({ severity: 'warning', code: 'LINK_BROKEN', message: `Linked page does not exist: pages/summaries/pages/concepts/topic-${i}.md`, page_path: 'pages/summaries/source.md' }))
  const report = { summary: { error: 1, warning: 14, info: 1 }, issues: [
    ...warnings,
    { severity: 'error', code: 'REQUIRED_PAGE_MISSING', message: 'overview.md is missing', page_path: 'overview.md' },
    { severity: 'info', code: 'FUTURE_CHECK', message: 'Additional source detail', source_id: 'source-1' },
  ] }
  const issueView = lintReport => h(Checks, { lintReport, isDark, pages: [{ path: 'pages/summaries/source.md' }], onOpenPage: pagePath => opened.push(pagePath) })
  renderer.render(issueView(report), issueHost)
  const list = () => find(issueHost, el => el.props['aria-label'] === '健康检查问题列表')
  const filter = severity => find(issueHost, el => el.type === 'button' && String(el.props.class).includes(`metric-${severity}`))
  const issueCount = () => list()?.children.filter(el => el.type === 'li').length || 0
  assert.equal(issueCount(), 16, 'all issue details shown initially')
  await click(filter('warning'))
  assert.equal(issueCount(), 14)
  assert.equal(filter('warning').props['aria-pressed'], true)
  assert.ok(text(issueHost).includes('链接指向的页面不存在：'))
  assert.ok(text(issueHost).includes('../concepts/文件名.md'))
  await click(find(issueHost, el => el.props['aria-label'] === '打开页面 pages/summaries/source.md'))
  assert.deepEqual(opened, ['pages/summaries/source.md'])
  await click(filter('error'))
  assert.equal(issueCount(), 1)
  assert.ok(text(issueHost).includes('缺少导航页'))
  assert.equal(find(issueHost, el => String(el.props['aria-label'] || '').startsWith('打开页面 ')), undefined, 'missing pages are not clickable')
  await click(filter('info'))
  assert.ok(text(issueHost).includes('Additional source detail'))
  assert.ok(text(issueHost).includes('source-1'))
  await click(find(issueHost, el => el.type === 'button' && text(el) === '查看全部'))
  assert.equal(issueCount(), 16)
  renderer.render(issueView({ summary: { error: 0, warning: 0, info: 0 }, issues: [] }), issueHost)
  await nextTick()
  assert.equal(issueCount(), 0, 'rerun replaces old issues')
  assert.ok(text(issueHost).includes('本次检查未发现问题'))
  renderer.render(issueView({ summary: { error: 0, warning: 14, info: 0 } }), issueHost)
  await nextTick()
  assert.ok(text(issueHost).includes('详情缺失'))
  assert.ok(!text(issueHost).includes('本次检查未发现问题'))
  renderer.render(null, issueHost)
}

const host = node('root')
let applied = 0
const proposal = { proposal_id: 'high', title: 'High risk', status: 'pending_review', risk: 'high', old_content: 'original text', new_content: 'updated text', diff: '- old\n+ new' }
renderer.render(h(Review, { selectedProposal: proposal, proposals: [proposal], onApply: () => { applied++ } }), host)
await click(find(host, el => el.type === 'button' && text(el) === '原内容'))
assert.ok(text(host).includes('original text'))
await click(find(host, el => el.type === 'button' && text(el) === '新内容'))
assert.ok(text(host).includes('updated text'))
await click(find(host, el => el.type === 'button' && text(el).includes('应用提案')))
let confirm = find(host, el => el.type === 'button' && text(el) === '确认写入')
assert.equal(confirm.props.disabled, true)
const checkbox = find(host, el => el.type === 'input')
checkbox.props['onUpdate:modelValue'](true)
await nextTick()
confirm = find(host, el => el.type === 'button' && text(el) === '确认写入')
await click(confirm)
assert.equal(applied, 1)
renderer.render(null, host)

const citationHost = node('root')
const requests = []
let resolveOld
globalThis.Document = class Document {}
globalThis.ShadowRoot = class ShadowRoot {}
globalThis.document = Object.assign(new Document(), { activeElement: null })
globalThis.window = { electronAPI: { wiki: { wikiTool: async request => {
  requests.push(request)
  if (request.wikiId === 'old') return new Promise(resolve => { resolveOld = resolve })
  if (request.passageId === 'passage_missing') return { success: false, error: 'Passage not found' }
  if (request.passageId === 'passage_page') return { success: true, data: { wiki_id: request.wikiId, source_id: 'src', page_path: 'pages/concepts/topic.md', start_line: 1, end_line: 2, text: 'Page evidence' } }
  return { success: true, data: { wiki_id: request.wikiId, source_id: 'src', page_path: 'sources/extracts/src.md', start_line: 119, end_line: 172, text: 'Current evidence' } }
} } } }
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await nextTick() }
renderer.render(h(Citation, { wikiId: 'old', passageId: 'passage_old' }), citationHost)
await settle()
const extractRequests = []
renderer.render(h(Citation, { wikiId: 'new', passageId: 'passage_new', onOpenSourceExtract: value => extractRequests.push(value) }), citationHost)
await settle()
resolveOld({ success: true, data: { wiki_id: 'old', text: 'Old evidence' } })
await settle()
assert.ok(text(citationHost).includes('Current evidence'))
assert.ok(!text(citationHost).includes('Old evidence'))
assert.ok(text(citationHost).includes('119–172'))
const fullExtractButton = find(citationHost, el => el.type === 'button' && text(el).includes('查看完整摘录'))
assert.ok(String(fullExtractButton.parent.props.class).includes('citation-location'), 'full extract action is beside the citation information')
assert.ok(!String(fullExtractButton.parent.props.class).includes('citation-location-copy'), 'action is outside the left information column')
await click(find(citationHost, el => el.type === 'button' && text(el).includes('查看完整摘录')))
assert.deepEqual(extractRequests, [{ sourceId: 'src', location: { extractPath: 'sources/extracts/src.md', startLine: 119, endLine: 172 } }])
renderer.render(h(Citation, { wikiId: 'new', passageId: 'passage_missing' }), citationHost)
await settle()
assert.ok(text(citationHost).includes('Passage not found'))
renderer.render(h(Citation, { wikiId: 'new', passageId: 'passage_page', onOpenSourceExtract: value => extractRequests.push(value) }), citationHost)
await settle()
await click(find(citationHost, el => el.type === 'button' && text(el).includes('查看完整摘录')))
assert.deepEqual(extractRequests.at(-1), { sourceId: 'src', location: null }, 'knowledge-page coordinates never locate source extract lines')
renderer.render(null, citationHost)

const readerHost = node('root')
const readerPages = []
const readerExtracts = []
const readerView = id => h(Reader, { wiki: { id }, sources: [{ id: 'src', extract_path: 'sources/extracts/src.md' }], page: { path: 'pages/summaries/source.md', content: '# Summary\n[Concept](pages/concepts/topic.md)\n[sources/extracts/src.md:116-120](#passage_abc)' }, onOpenPage: target => readerPages.push(target), onOpenSourceExtract: target => readerExtracts.push(target) })
renderer.render(readerView('new'), readerHost)
const markdownClick = async href => {
  const content = find(readerHost, el => String(el.props.class).includes('markdown-content rounded'))
  content.props.onClick({ target: { closest: () => ({ getAttribute: () => href }) }, preventDefault() {} })
  await settle()
}
await markdownClick('pages/concepts/topic.md')
assert.deepEqual(readerPages, ['pages/concepts/topic.md'])
await markdownClick('https://example.com/page.md')
assert.equal(readerPages.length, 1, 'external Markdown URL is not routed inside Wiki')
await markdownClick('sources/extracts/src.md')
assert.deepEqual(readerExtracts, [{ sourceId: 'src' }])
assert.equal(readerPages.length, 1, 'source path is never opened as a knowledge page')
await markdownClick('sources/extracts/unknown.md')
await markdownClick('wiki:sources%2Fextracts%2Fsrc.md')
await markdownClick('wiki-source:src')
assert.equal(readerPages.length, 1)
assert.equal(readerExtracts.length, 3)
await markdownClick('#passage_abc')
assert.ok(text(readerHost).includes('Current evidence'))
assert.equal(requests.at(-1).wikiId, 'new')
await click(find(readerHost, el => el.type === 'button' && text(el).includes('查看完整摘录')))
assert.deepEqual(readerExtracts.at(-1), { sourceId: 'src', location: { extractPath: 'sources/extracts/src.md', startLine: 119, endLine: 172 } }, 'current passage coordinates supersede stale 116–120 link labels')
await markdownClick('#passage_abc')
renderer.render(readerView('another'), readerHost)
await nextTick()
assert.ok(!text(readerHost).includes('Current evidence'), 'citation closes on Wiki switch')
renderer.render(null, readerHost)

for (const isDark of [false, true]) {
  const extractHost = node('root')
  const longContent = Array.from({ length: 10000 }, (_, i) => `line ${i + 1}${i === 8999 ? ' search.*[target]' : ''}`).join('\r\n')
  const state = { wikiId: 'A', sourceId: 'src', source: { title: '<script>unsafe</script>', original_uri: 'D:\\原文 #&% (测试).md', parser_status: 'complete', extract_path: 'sources/extracts/src.md' }, status: 'ready', content: longContent, location: { startLine: 599, endLine: 602 } }
  let retried = false
  const view = value => h(Extract, { state: value, isDark, onRetry: () => { retried = true } })
  renderer.render(view(state), extractHost)
  await settle()
  assert.ok(text(extractHost).includes('<script>unsafe</script>'), 'title is literal text')
  assert.equal(find(extractHost, el => String(el.props.class).includes('source-meta')), undefined, 'technical metadata is collapsed initially')
  await click(find(extractHost, el => String(el.props.class).includes('details-toggle')))
  assert.ok(text(extractHost).includes('D:\\原文 #&% (测试).md'), 'full metadata remains accessible')
  assert.equal(find(extractHost, el => el.type === 'script'), undefined)
  const line = n => find(extractHost, el => el.props['data-line'] === n)
  assert.ok(String(line(599).props.class).includes('cited'))
  assert.ok(String(line(600).props.class).includes('cited'))
  assert.equal(line(9000), undefined, 'distant lines are loaded on demand')
  assert.ok(String(line(601).props.class).includes('cited'))
  assert.ok(String(line(602).props.class).includes('cited'))
  const searchInput = find(extractHost, el => el.props['aria-label'] === '搜索完整摘录')
  searchInput.props['onUpdate:modelValue']('search.*[target]')
  find(extractHost, el => el.type === 'form' && String(el.props.class).includes('search-form')).props.onSubmit({ preventDefault() {} })
  await settle()
  assert.ok(line(9000), 'search reaches text outside the initially mounted page')
  assert.ok(String(line(9000).props.class).includes('located'))
  assert.ok(text(extractHost).includes('1 / 1'))
  assert.ok(find(extractHost, el => el.type === 'mark' && text(el) === 'search.*[target]'), 'literal match text is highlighted')
  const jumpInput = find(extractHost, el => el.props['aria-label'] === '跳转行号')
  jumpInput.props['onUpdate:modelValue']('10001')
  const jumpForm = find(extractHost, el => el.type === 'form' && String(el.props.class).includes('jump-form'))
  jumpForm.props.onSubmit({ preventDefault() {} })
  await nextTick()
  assert.ok(text(extractHost).includes('请输入 1–10000 之间的行号'))
  jumpInput.props['onUpdate:modelValue']('10000')
  jumpForm.props.onSubmit({ preventDefault() {} })
  await settle()
  assert.ok(line(10000))
  renderer.render(view({ ...state, status: 'loading', content: '', location: null }), extractHost)
  await settle()
  assert.ok(text(extractHost).includes('正在读取来源摘录'))
  assert.equal(find(extractHost, el => el.props['data-line']), undefined)
  renderer.render(view({ ...state, status: 'empty', content: '', location: null }), extractHost)
  await settle()
  assert.ok(text(extractHost).includes('暂无解析摘录'))
  renderer.render(view({ ...state, status: 'error', content: '', location: null, error: 'Source not found' }), extractHost)
  await settle()
  assert.ok(text(extractHost).includes('Source not found'))
  await click(find(extractHost, el => el.type === 'button' && text(el) === '重新读取'))
  assert.ok(retried)
  assert.equal(find(extractHost, el => el.type === 'button' && text(el).includes('返回知识页')), undefined, 'return uses the existing page tab')
  assert.equal(find(extractHost, el => el.props.role === 'dialog'), undefined, 'extract is inline, without a modal')
  renderer.render(null, extractHost)
  const sourceHost = node('root')
  const selected = []
  renderer.render(h(Inspector, { wiki: { id: 'A' }, sources: [{ id: 'src', title: 'Source title' }], isDark, onViewSourceExtract: value => selected.push(value) }), sourceHost)
  await click(find(sourceHost, el => el.props['aria-label'] === '查看摘录：Source title'))
  assert.deepEqual(selected, ['src'], 'source panel and inspector forward the exact source ID')
  renderer.render(null, sourceHost)
}
for (const isDark of [false, true]) {
  const modeHost = node('root')
  const readerMode = ref('page')
  const extractState = ref(null)
  const wikiId = ref('A')
  const pagePath = ref('pages/concepts/topic.md')
  const sourceRequests = []
  const sources = [
    { id: 'src_alpha', title: '需求分析资料', original_uri: 'D:/文档/需求.docx', extract_path: 'sources/extracts/alpha.md' },
    { id: 'src_beta', title: '测试策略资料', original_uri: 'https://example.com/testing-guide', extract_path: 'sources/extracts/beta.md' },
  ]
  const changing = value => { readerMode.value = value }
  const App = { setup: () => () => h(Reader, {
    key: wikiId.value, wiki: { id: wikiId.value }, isDark, readerMode: readerMode.value,
    page: { path: pagePath.value, content: '# Knowledge page content' }, sources, sourceExtract: extractState.value,
    onChangeMode: changing,
    onOpenSourceExtract: target => {
      sourceRequests.push(target)
      readerMode.value = 'source'
      if (target.location) extractState.value = {
        wikiId: wikiId.value, sourceId: target.sourceId, source: { id: target.sourceId, title: '引用来源' },
        status: 'ready', content: Array.from({ length: 500 }, (_, i) => `citation line ${i + 1}`).join('\n'), location: target.location,
      }
    },
  }) }
  renderer.render(h(App), modeHost)
  const tab = mode => find(modeHost, el => el.props['data-reader-mode'] === mode)
  const panel = mode => find(modeHost, el => el.props.id === tab(mode).props['aria-controls'])
  const knowledge = find(modeHost, el => String(el.props.class).includes('knowledge-page-content'))
  knowledge.scrollTop = 428
  assert.equal(panel('source').style.display, 'none')
  await click(tab('source'))
  assert.equal(panel('page').style.display, 'none')
  assert.notEqual(panel('source').style.display, 'none')
  assert.ok(text(panel('source')).includes('选择要查看的来源'))
  assert.equal(find(panel('source'), el => el.props.role === 'dialog'), undefined)
  const picker = find(modeHost, el => String(el.props.class).includes('source-picker') && el.type === 'details')
  picker.open = true
  const sourceSearch = find(modeHost, el => el.props['aria-label'] === '搜索摘录来源')
  sourceSearch.props['onUpdate:modelValue']('testing-guide')
  await nextTick()
  assert.equal(find(modeHost, el => el.props['aria-label'] === '选择来源 需求分析资料'), undefined)
  await click(find(modeHost, el => el.props['aria-label'] === '选择来源 测试策略资料'))
  assert.deepEqual(sourceRequests.at(-1), { sourceId: 'src_beta' })
  assert.equal(picker.open, false)
  extractState.value = { wikiId: 'A', sourceId: 'src_beta', source: sources[1], content: Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'), status: 'ready', location: null }
  await settle()
  const sourceSummary = find(modeHost, el => el.props['aria-label'] === '选择摘录来源')
  assert.ok(text(sourceSummary).includes('测试策略资料'))
  await click(find(modeHost, el => el.type === 'button' && text(el).includes('继续载入正文')))
  const line201 = find(modeHost, el => el.props['data-line'] === 201)
  const excerpt = find(modeHost, el => el.props['aria-label'] === '带行号的完整 Markdown 摘录')
  excerpt.scrollTop = 340
  const excerptSearch = find(modeHost, el => el.props['aria-label'] === '搜索完整摘录')
  excerptSearch.props['onUpdate:modelValue']('line 205')
  await click(tab('page'))
  assert.equal(knowledge.scrollTop, 428, 'knowledge page retains its scroll position')
  assert.equal(knowledge, find(modeHost, el => String(el.props.class).includes('knowledge-page-content')), 'knowledge DOM retained')
  await click(tab('source'))
  assert.equal(line201, find(modeHost, el => el.props['data-line'] === 201), 'extract page retained')
  assert.equal(excerpt.scrollTop, 340, 'extract scroll position retained')
  assert.equal(find(modeHost, el => el.props['aria-label'] === '搜索完整摘录').value, 'line 205', 'search input retained')
  await click(tab('page'))
  assert.equal(readerMode.value, 'page')
  const markdown = find(modeHost, el => String(el.props.class).includes('markdown-content rounded'))
  markdown.props.onClick({ target: { closest: () => ({ getAttribute: () => '#passage_abc' }) }, preventDefault() {} })
  await settle()
  await click(find(modeHost, el => el.type === 'button' && text(el).includes('查看完整摘录')))
  await settle()
  assert.equal(readerMode.value, 'source', 'citation switches to the inline source mode')
  assert.equal(find(modeHost, el => el.props.role === 'dialog'), undefined, 'passage preview closes after inline navigation')
  assert.ok(String(find(modeHost, el => el.props['data-line'] === 119).props.class).includes('cited'))
  assert.ok(String(find(modeHost, el => el.props['data-line'] === 172).props.class).includes('cited'))
  await click(tab('page'))
  const tablist = find(modeHost, el => el.props['aria-label'] === '阅读模式')
  let focused = ''
  tablist.props.onKeydown({ key: 'End', preventDefault() {}, currentTarget: { querySelector: value => ({ focus: () => { focused = value } }) } })
  await nextTick()
  assert.equal(readerMode.value, 'source')
  assert.equal(focused, '[data-reader-mode="source"]')
  wikiId.value = 'B'
  readerMode.value = 'page'
  extractState.value = null
  await settle()
  assert.equal(panel('source').style.display, 'none')
  assert.equal(find(modeHost, el => el.props['data-line']), undefined, 'new Wiki does not keep old extract lines')
  renderer.render(null, modeHost)
}

const pickerHost = node('root')
renderer.render(h(SourcePicker, { sources: [] }), pickerHost)
assert.ok(text(pickerHost).includes('当前 Wiki 暂无来源'))
renderer.render(h(SourcePicker, { sources: [{ id: 'src', title: 'Only source' }] }), pickerHost)
const filterInput = find(pickerHost, el => el.props['aria-label'] === '搜索摘录来源')
filterInput.props['onUpdate:modelValue']('not found')
await nextTick()
assert.ok(text(pickerHost).includes('没有匹配的来源'))
renderer.render(null, pickerHost)

// Verify disclosure and continuous reading against the actual reader SFC.
const readingHost = node('root')
const stateWithMetadata = {
  wikiId: 'A', sourceId: 's1', source: { id: 's1', title: 'Source one', parser_status: 'complete' }, status: 'ready', location: null,
  content: ['---', 'title: MetadataTarget', '---', '# Chapter one', ...Array.from({ length: 596 }, (_, i) => `body line ${i + 5}`), '## Chapter two'].join('\n'),
}
const sourceSelections = []
renderer.render(h(Extract, { state: stateWithMetadata, sources: [stateWithMetadata.source, { id: 's2', title: 'Source two' }], onSelectSource: id => sourceSelections.push(id) }), readingHost)
await settle()
const readingLine = number => find(readingHost, el => el.props['data-line'] === number)
assert.equal(readingLine(1), undefined, 'front matter folded initially')
assert.ok(readingLine(4), 'body keeps original line number')
await click(find(readingHost, el => String(el.props.class).includes('frontmatter-toggle')))
assert.ok(readingLine(1), 'metadata remains fully readable')
await click(find(readingHost, el => el.props['aria-label'] === '下一个来源'))
assert.deepEqual(sourceSelections, ['s2'])
const readingPane = find(readingHost, el => el.props['aria-label'] === '带行号的完整 Markdown 摘录')
Object.assign(readingPane, { scrollHeight: 4800, scrollTop: 4400, clientHeight: 500 })
readingPane.props.onScrollPassive()
await nextTick()
assert.ok(readingLine(400), 'scroll near the bottom appends more lines')
const chapter = find(readingHost, el => el.type === 'button' && text(el).includes('Chapter two'))
await click(chapter)
await settle()
assert.ok(readingLine(601), 'chapter jumps to distant original line')
await click(find(readingHost, el => el.type === 'button' && text(el).includes('载入前文')))
assert.ok(readingLine(400), 'preceding context is recoverable after distant jumps')
const metadataSearch = find(readingHost, el => el.props['aria-label'] === '搜索完整摘录')
metadataSearch.props['onUpdate:modelValue']('MetadataTarget')
await new Promise(resolve => setTimeout(resolve, 190))
await settle()
assert.ok(readingLine(2), 'live search reveals a match inside folded metadata')
assert.ok(find(readingHost, el => el.type === 'mark' && text(el) === 'MetadataTarget'))
await click(find(readingHost, el => el.props['aria-label'] === '清除搜索'))
assert.equal(find(readingHost, el => el.type === 'mark'), undefined, 'clear search removes highlight')
renderer.render(null, readingHost)

const highlightHost = node('root')
const highlightState = { wikiId: 'A', sourceId: 's', source: { id: 's' }, status: 'ready', content: Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join('\n'), location: { startLine: 116, endLine: 120 } }
const highlightView = state => h(Extract, { state })
renderer.render(highlightView(highlightState), highlightHost)
await settle()
const target = n => find(highlightHost, el => el.props['data-line'] === n)
for (const n of [116, 117, 118, 119, 120]) {
  assert.ok(String(target(n).props.class).includes('located'), 'full citation range keeps its target highlight')
  assert.ok(String(target(n).props.class).includes('cited'), 'citation range remains distinguishable')
}
assert.equal(find(highlightHost, el => String(el.props.class).includes('glow-start') || String(el.props.class).includes('glow-end') || String(el.props.class).includes('glowing')), undefined, 'jump feedback has no radiating glow')
await click(find(highlightHost, el => String(el.props.class).includes('citation-return')))
await settle()
assert.ok(String(target(116).props.class).includes('located'), 'return to citation maintains row highlight')
const jump = find(highlightHost, el => el.props['aria-label'] === '跳转行号')
jump.props['onUpdate:modelValue']('240')
find(highlightHost, el => el.type === 'form' && String(el.props.class).includes('jump-form')).props.onSubmit({ preventDefault() {} })
await settle()
assert.ok(String(target(240).props.class).includes('located'), 'manual jump keeps its target highlighted')
assert.ok(!String(target(116)?.props.class || '').includes('located'), 'a new jump moves the active highlight')
assert.equal(find(highlightHost, el => String(el.props.class).includes('glowing') || String(el.props.class).includes('glow-start') || String(el.props.class).includes('glow-end')), undefined)
renderer.render(highlightView({ ...highlightState, wikiId: 'B', content: 'new Wiki content', location: null }), highlightHost)
await settle()
assert.equal(find(highlightHost, el => String(el.props.class).includes('located')), undefined, 'changing Wiki clears the old target highlight')
renderer.render(null, highlightHost)
console.log('Inline extract UI OK: mode tabs/keyboard, source picker/search, retained scroll and incremental reading, no modal, Wiki switch, 10000-line search/highlight, explicit states, light/dark')
console.log('Jump feedback OK: persistent row/line-number highlight moves to the latest target and clears on Wiki switch; no glow animation')
console.log('UI interactions OK: three exclusive tabs, keyboard navigation, check actions, 14-warning filtering/details/page navigation, missing details, close, content switching, high-risk confirmation (light/dark)')
console.log('Citation UI OK: root-relative page links, external links, evidence preview, missing passage, Wiki isolation')
