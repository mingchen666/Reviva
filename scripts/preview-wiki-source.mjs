// Offline visual fixture for the actual source reader components (no Vite/dev).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse, compileScript, compileStyle } from 'vue/compiler-sfc'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, '.tmp', 'wiki-source-preview')
await fs.promises.mkdir(output, { recursive: true })
const modules = new Map()
const styles = []
async function compile(relative) {
  const absolute = path.resolve(root, relative)
  if (modules.has(absolute)) return modules.get(absolute)
  const { descriptor, errors } = parse(await fs.promises.readFile(absolute, 'utf8'), { filename: absolute })
  if (errors.length) throw errors[0]
  const id = `wiki-preview-${modules.size}`
  const name = `${path.basename(absolute, '.vue')}.js`
  const target = path.join(output, name)
  modules.set(absolute, pathToFileURL(target).href)
  let code = compileScript(descriptor, { id, inlineTemplate: true }).content
  code = code.replace('export default', 'const __component =')
  code += `\n__component.__scopeId = ${JSON.stringify(`data-v-${id}`)}; export default __component;\n`
  const imports = [...code.matchAll(/from\s+(['"])([^'"]+)\1/g)]
  for (const match of imports) {
    const specifier = match[2]
    const url = specifier === 'vue' ? pathToFileURL(path.join(root, 'node_modules/vue/dist/vue.runtime.esm-browser.js')).href
      : specifier.endsWith('.vue') ? await compile(path.resolve(path.dirname(absolute), specifier))
        : specifier.startsWith('@/') ? pathToFileURL(path.join(root, 'src', `${specifier.slice(2)}.js`)).href : specifier
    code = code.replace(match[0], `from ${JSON.stringify(url)}`)
  }
  await fs.promises.writeFile(target, code)
  for (const style of descriptor.styles) {
    const result = compileStyle({ id, source: style.content, filename: absolute, scoped: style.scoped })
    if (result.errors.length) throw result.errors[0]
    styles.push(result.code)
  }
  return pathToFileURL(target).href
}

const Reader = await compile('src/views/wiki/sections/WikiSourceExtractReader.vue')
const Citation = await compile('src/views/wiki/sections/WikiCitationPreview.vue')
const vue = pathToFileURL(path.join(root, 'node_modules/vue/dist/vue.runtime.esm-browser.js')).href
const contract = await fs.promises.readFile(path.join(root, 'src/styles/themes/_contract.scss'), 'utf8')
const themes = await fs.promises.readFile(path.join(root, 'src/styles/themes/_default.scss'), 'utf8')
const icons = pathToFileURL(path.join(root, 'node_modules/remixicon/fonts/remixicon.css')).href
const content = ['---', 'source_id: src_software_review', 'source_type: word', 'title: "软件工程复习资料.docx"', 'parser: "officecli"', 'asset_count: 9', '---', '', '# 软件工程复习资料', '',
  '## 软件过程与需求分析', '', '软件工程是将系统化、规范化、可量化的方法应用于软件开发、运行和维护的过程。', '',
  '### 需求分析的目标', '', '需求分析帮助团队理解用户真正需要解决的问题，明确功能边界以及质量要求。', '',
  '- 功能需求：系统需要提供哪些服务。', '- 非功能需求：性能、可靠性、安全性和可维护性。', '- 需求验证：确认需求与用户目标保持一致。', '',
  '## 软件测试与质量保证', '', '软件测试通过发现缺陷来降低风险。单元测试关注单一组件，集成测试关注组件间的协作。', '',
  '### 测试策略', '', '| 测试层次 | 关注点 |', '| --- | --- |', '| 单元测试 | 组件内部行为 |', '| 集成测试 | 模块接口与数据流 |', '',
  ...Array.from({ length: 180 }, (_, i) => `第 ${i + 1} 条复习要点：记录需求、设计、测试与维护之间的联系。`)].join('\n')
const fixture = { wikiId: 'preview', sourceId: 'src_software_review', source: { id: 'src_software_review', title: '软件工程复习资料.docx', original_uri: 'D:/学习资料/软件工程复习资料.docx', parser_status: 'complete', extract_path: 'sources/extracts/src_software_review.md' }, content, status: 'ready', location: null }
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${icons}"><style>${contract}\n${themes}\n*{box-sizing:border-box}body{margin:0;font-family:var(--ui-font-family);color:var(--ui-text-main);background:var(--ui-bg-1)}button,input,summary{font-family:inherit}button{border:0;background:none;cursor:pointer}#app{height:100vh;display:flex;flex-direction:column}.top{height:54px;display:flex;align-items:center;padding:0 24px;gap:12px;flex-shrink:0}.top strong{font-size:14px}.top small{color:var(--ui-text-aux);font-size:11px}.tabs{display:flex;gap:24px;padding:0 24px;border-bottom:1px solid var(--ui-border-panel);height:40px;align-items:stretch;flex-shrink:0;font-size:12px;color:var(--ui-text-aux)}.tabs span{display:flex;gap:6px;align-items:center}.tabs .active{color:var(--ui-brand-500);border-bottom:2px solid currentColor}.fixture-body{flex:1;min-height:0}${styles.join('\n')}</style></head><body class="theme-default"><div id="app"></div><script type="module">import {createApp,h,ref} from ${JSON.stringify(vue)};import Reader from ${JSON.stringify(Reader)};const state=ref(${JSON.stringify(fixture)});const q=new URLSearchParams(location.search);document.body.classList.add(q.get('theme')==='dark'?'theme-dark':'theme-light');window.previewState=state;const sources=[state.value.source,{id:'src_test_plan',title:'软件测试策略与实践.pdf',parser_status:'complete',original_uri:'D:/学习资料/软件测试策略与实践.pdf'}];createApp({setup:()=>()=>h('div',{style:'height:100%;display:flex;flex-direction:column'},[h('div',{class:'top'},[h('i',{class:'ri-book-3-line'}),h('strong','aaa'),h('small','Wiki 知识库')]),h('div',{class:'tabs'},[h('span','知识页'),h('span',{class:'active'},[h('i',{class:'ri-file-search-line'}),'来源摘录'])]),h('div',{class:'fixture-body'},[h(Reader,{state:state.value,sources,isDark:q.get('theme')==='dark',onSelectSource:id=>{state.value={...state.value,sourceId:id,source:sources.find(s=>s.id===id)}}})])])}).mount('#app');</script></body></html>`
await fs.promises.writeFile(path.join(output, 'index.html'), html)
const passageFixture = { wiki_id: 'preview', source_id: 'src_software_review', page_path: 'sources/extracts/src_software_review.md', start_line: 23, end_line: 25, text: '## 软件测试与质量保证\n\n软件测试通过发现缺陷来降低风险。单元测试关注单一组件，集成测试关注组件间的协作。' }
const citationModule = `<script type="module">import {createApp,h} from ${JSON.stringify(vue)};import Citation from ${JSON.stringify(Citation)};const dark=new URLSearchParams(location.search).get('theme')==='dark';document.body.classList.add(dark?'theme-dark':'theme-light');window.electronAPI={wiki:{wikiTool:async()=>({success:true,data:${JSON.stringify(passageFixture)}})}};createApp({render:()=>h(Citation,{wikiId:'preview',passageId:'passage_fixture',isDark:dark})}).mount('#app');</script>`
await fs.promises.writeFile(path.join(output, 'citation.html'), html.replace(/<script type="module">[\s\S]*?<\/script>/, () => citationModule))
console.log(pathToFileURL(path.join(output, 'index.html')).href)
