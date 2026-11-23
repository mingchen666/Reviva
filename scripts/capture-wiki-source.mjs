// Capture the offline fixture in installed Edge; no app server or user profile.
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, '.tmp', 'wiki-source-preview')
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const port = 19387
const browser = spawn(edge, ['--headless', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(output, 'capture-profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket
try {
  let targets
  for (let attempt = 0; attempt < 40; attempt++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await new Promise(resolve => setTimeout(resolve, 150)) }
  }
  const target = targets?.find(item => item.type === 'page')
  if (!target) throw new Error('Edge debugger did not start')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  const pending = new Map()
  let sequence = 0
  socket.onmessage = event => {
    const result = JSON.parse(event.data)
    if (result.id) {
      const task = pending.get(result.id)
      pending.delete(result.id)
      if (result.error) task?.reject(new Error(result.error.message)); else task?.resolve(result.result)
    }
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  await send('Page.enable')
  await send('Runtime.enable')
  for (const [theme, width] of [['light', 1000], ['dark', 480], ['light', 360]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: `${pathToFileURL(path.join(output, 'index.html')).href}?theme=${theme}` })
    let ready = false
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await send('Runtime.evaluate', { expression: '!!document.querySelector(".source-header")', returnByValue: true })
      if (result.result.value) { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!ready) throw new Error('Fixture did not mount')
    await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true })
    const metrics = await send('Runtime.evaluate', { expression: `JSON.stringify({viewport:innerWidth, documentWidth:document.documentElement.scrollWidth, bodyTop:document.querySelector('.extract-lines').getBoundingClientRect().top, bodyHeight:document.querySelector('.extract-lines').clientHeight, overflow:[...document.querySelectorAll('.source-header,.extract-toolbar,footer')].map(el=>({element:el.className||el.tagName,width:el.clientWidth,scroll:el.scrollWidth}))})`, returnByValue: true })
    const measured = JSON.parse(metrics.result.value)
    if (measured.documentWidth > width || measured.overflow.some(item => item.scroll > item.width + 1)) throw new Error(`Horizontal overflow: ${JSON.stringify(measured)}`)
    console.log(JSON.stringify({ theme, width, ...measured }))
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await fs.writeFile(path.join(output, `${theme}-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    const search = await send('Runtime.evaluate', { expression: `(async()=>{const el=document.querySelector('input[aria-label="搜索完整摘录"]');el.value='需求';el.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,220));return {marks:document.querySelectorAll('mark').length,matches:document.querySelector('.match-count').textContent}})()`, awaitPromise: true, returnByValue: true })
    if (!search.result.value.marks) throw new Error('Live search did not highlight matches')
    console.log(JSON.stringify({ theme, width, liveSearch: search.result.value }))
    const picker = await send('Runtime.evaluate', { expression: `(async()=>{document.querySelector('.source-picker').open=true;await new Promise(r=>setTimeout(r,40));const trigger=document.querySelector('.source-picker summary');const menu=document.querySelector('.source-picker__menu');const alignment={triggerWidth:Math.round(trigger.getBoundingClientRect().width),menuWidth:Math.round(menu.getBoundingClientRect().width),menuLeft:Math.round(menu.getBoundingClientRect().left-trigger.getBoundingClientRect().left)};const input=document.querySelector('input[aria-label="搜索摘录来源"]');const focused=document.activeElement===input;input.value='测试策略';input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,20));const options=[...document.querySelectorAll('.source-picker__list button')];document.querySelector('.top').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return {focused,options:options.map(el=>el.textContent),closed:!document.querySelector('.source-picker').open,alignment}})()`, awaitPromise: true, returnByValue: true })
    if (Math.abs(picker.result.value.alignment.triggerWidth - picker.result.value.alignment.menuWidth) > 1 || picker.result.value.alignment.menuLeft !== 0) throw new Error(`Source picker alignment failed: ${JSON.stringify(picker.result.value.alignment)}`)
    if (!picker.result.value.focused || !picker.result.value.closed || picker.result.value.options.length !== 1) throw new Error(`Picker interaction failed: ${JSON.stringify(picker.result.value)}`)
    console.log(JSON.stringify({ theme, width, picker: picker.result.value }))
    await send('Runtime.evaluate', { expression: `document.querySelector('[aria-label="清除搜索"]').click();window.previewState.value={...window.previewState.value,location:{startLine:23,endLine:25}};`, returnByValue: true })
    await new Promise(resolve => setTimeout(resolve, 30))
    const citation = await send('Runtime.evaluate', { expression: `JSON.stringify({cited:document.querySelectorAll('.extract-line.cited').length,overflow:document.querySelector('.extract-toolbar').scrollWidth>document.querySelector('.extract-toolbar').clientWidth+1})`, returnByValue: true })
    const citationMeasured = JSON.parse(citation.result.value)
    if (citationMeasured.cited !== 3 || citationMeasured.overflow) throw new Error(`Citation layout failed: ${JSON.stringify(citationMeasured)}`)
    console.log(JSON.stringify({ theme, width, citation: citationMeasured }))
    if (width === 1000) {
      const evidence = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      await fs.writeFile(path.join(output, 'citation-1000.png'), Buffer.from(evidence.data, 'base64'))
      const targetHighlight = await send('Runtime.evaluate', { expression: `JSON.stringify({rows:document.querySelectorAll('.extract-line.located').length,glowLayers:document.querySelectorAll('.glow-start,.glow-end,.glowing').length,lineNumbers:[...document.querySelectorAll('.extract-line.located .line-number')].map(node=>getComputedStyle(node).color)})`, returnByValue: true })
      const measuredHighlight = JSON.parse(targetHighlight.result.value)
      if (measuredHighlight.rows !== 3 || measuredHighlight.glowLayers !== 0 || measuredHighlight.lineNumbers.some(color => color === '')) throw new Error(`Persistent highlight check failed: ${JSON.stringify(measuredHighlight)}`)
      console.log(JSON.stringify({ persistentHighlight: measuredHighlight }))
    }
    const focus = await send('Runtime.evaluate', { expression: `(()=>{const el=document.querySelector('input[aria-label="搜索完整摘录"]');el.focus();const input=getComputedStyle(el);const form=getComputedStyle(el.closest('form'));return {innerOutline:input.outlineStyle,innerShadow:input.boxShadow,innerBorder:input.borderTopWidth,outerBorder:form.borderTopWidth}})()`, returnByValue: true })
    if (focus.result.value.innerOutline !== 'none' || focus.result.value.innerShadow !== 'none' || focus.result.value.innerBorder !== '0px') throw new Error(`Duplicate input focus style: ${JSON.stringify(focus.result.value)}`)
    console.log(JSON.stringify({ theme, width, searchFocus: focus.result.value }))
    if (theme === 'light' && width === 1000) {
      const focused = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      await fs.writeFile(path.join(output, 'search-focus-1000.png'), Buffer.from(focused.data, 'base64'))
    }
  }
  for (const [theme, width] of [['light', 1000], ['dark', 480], ['light', 360]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: `${pathToFileURL(path.join(output, 'citation.html')).href}?theme=${theme}` })
    for (let attempt = 0; attempt < 30; attempt++) {
      const ready = await send('Runtime.evaluate', { expression: '!!document.querySelector(".extract-link")', returnByValue: true })
      if (ready.result.value) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true })
    const alignment = await send('Runtime.evaluate', { expression: `(()=>{const row=document.querySelector('.citation-location');const copy=document.querySelector('.citation-location-copy').getBoundingClientRect();const action=document.querySelector('.extract-link').getBoundingClientRect();const info=row.getBoundingClientRect();return {inline:action.left>=copy.right-1,rightGap:Math.round(info.right-action.right),documentWidth:document.documentElement.scrollWidth,rowWidth:row.clientWidth,rowScroll:row.scrollWidth}})()`, returnByValue: true })
    if (alignment.result.value.documentWidth > width || alignment.result.value.rowScroll > alignment.result.value.rowWidth + 1 || alignment.result.value.rightGap > 24 || !alignment.result.value.inline) throw new Error(`Citation action alignment failed: ${JSON.stringify(alignment.result.value)}`)
    console.log(JSON.stringify({ theme, width, citationAction: alignment.result.value }))
    const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await fs.writeFile(path.join(output, `passage-${theme}-${width}.png`), Buffer.from(image.data, 'base64'))
  }
  await send('Browser.close')
} finally {
  socket?.close()
  browser.kill()
}
