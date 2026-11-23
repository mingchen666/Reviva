import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { createPinia, setActivePinia } from 'pinia'
import { useWikiStore } from '../src/stores/wiki.js'
import { findSourceExtractLines, matchSourceExtractLocation, normalizeSourceExtractPath, sourceExtractLocation, sourceExtractPageForLine, sourceExtractSearchSegments, sourceExtractFrontmatterRange, sourceExtractHeadings } from '../src/utils/wikiSourceExtract.js'

const success = data => ({ success: true, data })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const content = Array.from({ length: 1200 }, (_, i) => `第 ${i + 1} 行 ${i === 999 ? '全文搜索目标' : ''}`).join('\r\n')
const sourceData = (wikiId, sourceId = 'shared') => ({ wiki_id: wikiId, source: { id: sourceId, wiki_id: wikiId, title: `${wikiId} title`, original_uri: 'D:\\原文 #&% (测试).md', parser_status: 'complete', extract_path: 'sources/extracts/摘录 #&% (测试).md' }, content })
function setup(reader = async ({ wikiId, sourceId }) => success(sourceData(wikiId, sourceId))) {
  setActivePinia(createPinia())
  globalThis.window = { electronAPI: { wiki: {
    get: async id => success({ id }), listPages: async () => success([]), listSources: async id => success([sourceData(id).source]),
    getJobs: async () => success([]),
    wikiTool: async request => request.action === 'read_source' ? reader(request) : success(request.action === 'list_proposals' ? [] : null),
  } } }
  return useWikiStore()
}

test('store pins read_source to selected Wiki and source ID, preserving full Markdown and metadata', async () => {
  const requests = []
  const store = setup(async request => { requests.push(request); return success(sourceData(request.wikiId, request.sourceId)) })
  await store.openWiki('A')
  const location = sourceExtractLocation({ page_path: sourceData('A').source.extract_path, start_line: 999, end_line: 1001 })
  const reading = store.openSourceExtract('shared', location)
  assert.equal(store.sourceExtract.status, 'loading')
  await reading
  assert.deepEqual(requests, [{ action: 'read_source', wikiId: 'A', sourceId: 'shared' }])
  assert.equal(store.sourceExtract.content, content)
  assert.equal(store.sourceExtract.source.title, 'A title')
  assert.deepEqual(store.sourceExtract.location, location)
  assert.equal(store.sourceExtract.status, 'ready')
  assert.deepEqual(store.pages, [], 'extracts do not become knowledge pages')
})

test('A to B and back discards late source success and failure with the same source ID', async () => {
  for (const failure of [false, true]) {
    const stale = deferred()
    let first = true
    const store = setup(async request => {
      if (request.wikiId === 'A' && first) { first = false; return stale.promise }
      return success(sourceData(request.wikiId))
    })
    await store.openWiki('A')
    const oldRead = store.openSourceExtract('shared')
    const openingB = store.openWiki('B')
    assert.equal(store.sourceExtract, null, 'reset is immediate')
    await openingB
    await store.openSourceExtract('shared')
    assert.equal(store.sourceExtract.wikiId, 'B')
    await store.openWiki('A')
    await store.openSourceExtract('shared')
    if (failure) stale.reject(new Error('old A failed'))
    else stale.resolve(success({ ...sourceData('A'), content: 'stale A content' }))
    await oldRead
    assert.equal(store.sourceExtract.content, content)
    assert.equal(store.sourceExtract.error, '')
    assert.equal(store.sourceExtract.status, 'ready')
  }
})

test('closing or choosing another source invalidates a pending read', async () => {
  const stale = deferred()
  const store = setup(request => request.sourceId === 'old' ? stale.promise : Promise.resolve(success(sourceData('A', 'new'))))
  await store.openWiki('A')
  const oldRead = store.openSourceExtract('old')
  await store.openSourceExtract('new')
  stale.resolve(success(sourceData('A', 'old')))
  await oldRead
  assert.equal(store.sourceExtract.sourceId, 'new')
  const late = deferred()
  window.electronAPI.wiki.wikiTool = () => late.promise
  const pending = store.openSourceExtract('new')
  store.closeSourceExtract()
  late.resolve(success(sourceData('A', 'new')))
  await pending
  assert.equal(store.sourceExtract, null)
})

test('bad IDs, empty extracts, errors and mismatched Wiki/source responses have explicit states', async () => {
  const store = setup()
  await store.openWiki('A')
  for (const data of [
    { success: false, error: 'Source not found' }, success(sourceData('B')), success(sourceData('A', 'other')),
    success({ ...sourceData('A'), content: null }),
    success({ ...sourceData('A'), source: { ...sourceData('A').source, wiki_id: 'B' } }),
  ]) {
    window.electronAPI.wiki.wikiTool = async () => data
    await store.openSourceExtract('shared')
    assert.equal(store.sourceExtract.status, 'error')
    assert.ok(store.sourceExtract.error)
    assert.equal(store.sourceExtract.content, '')
  }
  let calls = 0
  window.electronAPI.wiki.wikiTool = async () => { calls++; return success({ ...sourceData('A'), content: '\n \n' }) }
  for (const id of ['', null, {}, 'x\0', 'x'.repeat(513)]) { await store.openSourceExtract(id); assert.equal(store.sourceExtract.status, 'error') }
  assert.equal(calls, 0)
  await store.openSourceExtract('shared')
  assert.equal(store.sourceExtract.status, 'empty')
})

test('citation location requires an extract path, integral range, matching registry path and in-bounds lines', () => {
  const source = sourceData('A').source
  const passage = { page_path: source.extract_path, start_line: 116, end_line: 120 }
  const location = sourceExtractLocation(passage)
  assert.deepEqual(matchSourceExtractLocation(location, source, 1200), { extractPath: source.extract_path, startLine: 116, endLine: 120 })
  for (const invalid of [
    { page_path: 'pages/a.md' }, { page_path: '../sources/extracts/a.md' }, { page_path: 'sources/extracts/../secret.md' },
    { page_path: 'sources/extracts/a.md\0' }, { page_path: 'D:/sources/extracts/a.md' }, { start_line: 0 },
    { start_line: 1.5 }, { start_line: '116' }, { end_line: 115 }, { end_line: Infinity },
  ]) assert.equal(sourceExtractLocation({ ...passage, ...invalid }), null, JSON.stringify(invalid))
  assert.equal(matchSourceExtractLocation(location, { extract_path: 'sources/extracts/other.md' }, 1200), null)
  assert.equal(matchSourceExtractLocation(location, source, 119), null)
  assert.equal(normalizeSourceExtractPath(source.extract_path), source.extract_path, 'literal %, #, spaces and Unicode are preserved')
})

test('drifted citation locations open full text without misleading highlights', async () => {
  const store = setup()
  await store.openWiki('A')
  for (const location of [
    { extractPath: 'sources/extracts/wrong.md', startLine: 116, endLine: 120 },
    { extractPath: sourceData('A').source.extract_path, startLine: 1199, endLine: 1201 },
  ]) {
    await store.openSourceExtract('shared', location)
    assert.equal(store.sourceExtract.status, 'ready')
    assert.equal(store.sourceExtract.location, null)
    assert.ok(store.sourceExtract.locationWarning)
  }
})

test('long-document literal search finds lines beyond the first page and handles regex characters safely', () => {
  const lines = content.split(/\r?\n/)
  assert.deepEqual(findSourceExtractLines(lines, '全文搜索目标'), [1000])
  assert.equal(sourceExtractPageForLine(1000), 4)
  assert.equal(sourceExtractPageForLine(201), 1)
  assert.deepEqual(findSourceExtractLines(['a.*[B]', 'nothing'], '.*[b]'), [1])
  assert.deepEqual(findSourceExtractLines(lines, ''), [])
})

test('search highlights preserve literal Markdown and HTML characters without injecting markup', () => {
  const original = '<script>.*[X]</script> .*[x]'
  const parts = sourceExtractSearchSegments(original, '.*[x]')
  assert.equal(parts.map(part => part.text).join(''), original)
  assert.deepEqual(parts.filter(part => part.match).map(part => part.text), ['.*[X]', '.*[x]'])
  assert.deepEqual(sourceExtractSearchSegments('', ''), [{ text: ' ', match: false }])
})

test('metadata folding and chapter navigation preserve original line numbers and ignore code-fence headings', () => {
  const lines = ['---', '# metadata comment', 'title: Source', '---', '# Actual title', '', '```md', '## Not a chapter', '```', '## Requirements', '~~~', '# Also code', '~~~', '### Details']
  assert.deepEqual(sourceExtractFrontmatterRange(lines), { startLine: 1, endLine: 4 })
  assert.equal(sourceExtractFrontmatterRange(['---', 'unclosed']), null)
  assert.equal(sourceExtractFrontmatterRange(['# Plain Markdown']), null)
  assert.deepEqual(sourceExtractHeadings(lines), [
    { line: 5, level: 1, title: 'Actual title' }, { line: 10, level: 2, title: 'Requirements' }, { line: 14, level: 3, title: 'Details' },
  ])
  assert.equal(sourceExtractHeadings(lines, 1).length, 1)
})

// Stub only Electron's IPC import; service and filesystem behavior are real.
const hooks = registerHooks({ resolve(specifier, context, next) {
  return specifier === 'electron' ? { url: 'data:text/javascript,export const ipcMain = {}; export const app = {};', shortCircuit: true } : next(specifier, context)
} })
let WikiService
try { ({ WikiService } = await import('../electron/WikiService.js')) } finally { hooks.deregister() }

async function fixture(t) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wiki-extract-test-'))
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(dir).startsWith('wiki-extract-test-'))
    await fs.promises.rm(dir, { recursive: true, force: true })
  })
  const service = new WikiService({ getRootPath: () => dir, getWikiPath: () => path.join(dir, 'wikis'), resolveAndValidate: target => target })
  for (const id of ['A', 'B']) {
    const wikiDir = service._wikiDir(id)
    await fs.promises.mkdir(path.join(wikiDir, 'sources', 'extracts'), { recursive: true })
    const data = sourceData(id)
    await fs.promises.writeFile(path.join(wikiDir, data.source.extract_path), `${id}\n${content}`)
    await fs.promises.writeFile(path.join(wikiDir, 'sources/registry.json'), JSON.stringify({ version: 1, sources: [data.source] }))
  }
  return { service, dir, registry: async sources => fs.promises.writeFile(path.join(service._wikiDir('A'), 'sources/registry.json'), JSON.stringify({ sources })) }
}

test('real read_source selects the Wiki registry and reads full content with special filenames', async t => {
  const { service } = await fixture(t)
  for (const wikiId of ['A', 'B']) {
    const read = await service.wikiTool({ action: 'read_source', wikiId, sourceId: 'shared' })
    assert.equal(read.success, true, read.error)
    assert.equal(read.data.wiki_id, wikiId)
    assert.equal(read.data.source.title, `${wikiId} title`)
    assert.equal(read.data.content, `${wikiId}\n${content}`)
    assert.ok(!(await service.listPages(wikiId)).data.some(page => page.path.startsWith('sources/')))
  }
})

test('real read_source distinguishes absent/empty content from missing, unsafe or wrong-source reads', async t => {
  const { service, registry, dir } = await fixture(t)
  for (const sourceId of ['', {}, 'unknown', '../B/shared', 'x\0']) {
    assert.equal((await service.readSource('A', sourceId)).success, false)
  }
  for (const extract_path of ['', 'sources/extracts/empty.md']) {
    if (extract_path) await fs.promises.writeFile(path.join(service._wikiDir('A'), extract_path), '')
    await registry([{ ...sourceData('A').source, extract_path }])
    assert.equal((await service.readSource('A', 'shared')).data.content, '')
  }
  for (const extract_path of ['sources/extracts/missing.md', '../B/sources/extracts/a.md', path.join(dir, 'outside.md'), 'sources/extracts/a.md\0', 'sources/extracts']) {
    await registry([{ ...sourceData('A').source, extract_path }])
    const read = await service.readSource('A', 'shared')
    assert.equal(read.success, false, extract_path)
    assert.ok(read.error)
  }
  await registry([{ ...sourceData('B').source }])
  assert.equal((await service.readSource('A', 'shared')).success, false)
})

test('read_source rejects a directory junction that escapes the current Wiki', async t => {
  const { service, registry } = await fixture(t)
  const link = path.join(service._wikiDir('A'), 'sources', 'extracts', 'linked')
  await fs.promises.symlink(path.join(service._wikiDir('B'), 'sources', 'extracts'), link, process.platform === 'win32' ? 'junction' : 'dir')
  await registry([{ ...sourceData('A').source, extract_path: 'sources/extracts/linked/摘录 #&% (测试).md' }])
  const read = await service.readSource('A', 'shared')
  assert.equal(read.success, false)
  assert.match(read.error, /outside this Wiki/)
})
