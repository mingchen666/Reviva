#!/usr/bin/env node
// Layout check: text overflow + measured collisions (figure labels overlapping each other, the board, tips,
// the caption or the stage edge) at keyframes; keyframe screenshots to <out>/check/ and contact sheets
// <out>/check/sheet_N.png (12 frames each) so a reviewer looks at 1 image instead of 12.
// usage: node check.mjs <outDir> [--times 3,10.5]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openStage } from './browser.mjs';
import { parseArgs } from './build.mjs';

export function keyTimes(tl, pageStarts = []) {
  const ts = new Set();
  // a full column flips to a new page mid-scene: capture the full page just before the wipe
  pageStarts.slice(1).forEach((t) => ts.add(+(t - 0.55).toFixed(2)));
  const writes = tl.ops.filter((o) => o.kind === 'write');
  // just before every scene change / page wipe, the board is at its fullest
  tl.scenes.slice(1).forEach((s) => ts.add(+(s.at - 0.05).toFixed(2)));
  tl.ops.filter((o) => o.kind === 'cam').forEach((o) => ts.add(+(o.at + (o.dur || 1.6) + 0.3).toFixed(2)));
  tl.ops.filter((o) => o.kind === 'emph').forEach((o) => ts.add(+(o.at + 1).toFixed(2)));
  if (writes.length) ts.add(+(writes[writes.length - 1].at + writes[writes.length - 1].dur + 0.5).toFixed(2));
  return [...ts].filter((t) => t > 0 && t < tl.duration).sort((a, b) => a - b);
}

// runs in the page: boxes of what is visible right now, and every pair that collides
function collisions() {
  const shown = (el) => {
    let o = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      o *= +cs.opacity * (e.getAttribute('opacity') != null ? +e.getAttribute('opacity') : 1);
    }
    return o > 0.35;
  };
  const stage = document.getElementById('stage').getBoundingClientRect();
  const box = (el, kind) => { const r = el.getBoundingClientRect(); return { kind, text: el.textContent.trim().slice(0, 24), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
  const all = (sel, kind) => [...document.querySelectorAll(sel)].filter((e) => shown(e) && e.textContent.trim()).map((e) => box(e, kind)).filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
  const labels = all('.fig svg text', 'label');
  const others = [...all('.col .ln', 'board'), ...all('.tip', 'tip'), ...all('.cap .ct', 'caption')];
  const inter = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const area = (a) => (a.x1 - a.x0) * (a.y1 - a.y0);
  const out = [];
  labels.forEach((a, i) => {
    if (a.x0 < stage.left - 1 || a.y0 < stage.top - 1 || a.x1 > stage.right + 1 || a.y1 > stage.bottom + 1) out.push({ type: 'label-outside', a: a.text });
    for (const b of labels.slice(i + 1)) if (inter(a, b) > 0.3 * Math.min(area(a), area(b))) out.push({ type: 'label-overlap', a: a.text, b: b.text });
    for (const b of others) if (inter(a, b) > 0.2 * area(a)) out.push({ type: `label-under-${b.kind}`, a: a.text, b: b.text });
  });
  return out;
}

// one PNG per 12 frames (3×4 grid of 640×360 tiles, time stamped), drawn by the browser we already have
async function contactSheets(browser, files, dir) {
  const sheets = [];
  for (let i = 0; i < files.length; i += 12) {
    const part = files.slice(i, i + 12), rows = Math.ceil(part.length / 3);
    const page = await browser.newPage({ viewport: { width: 1920, height: rows * 360 } });
    const tiles = part.map((f) => `<div><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><b>${path.basename(f, '.png').replace(/^t0*/, '')}s</b></div>`).join('');
    await page.setContent(`<style>body{margin:0;display:grid;grid-template-columns:repeat(3,640px)}div{position:relative;width:640px;height:360px;outline:1px solid #888}img{width:640px;height:360px;display:block}b{position:absolute;left:6px;top:4px;background:#000c;color:#fff;font:600 20px monospace;padding:2px 8px}</style>${tiles}`);
    await page.evaluate(() => Promise.all([...document.images].map((im) => im.decode())));
    const f = path.join(dir, `sheet_${sheets.length + 1}.png`);
    await page.screenshot({ path: f });
    await page.close();
    sheets.push(f);
  }
  return sheets;
}

export async function check(outDir, { times } = {}) {
  const tl = JSON.parse(fs.readFileSync(path.join(outDir, 'timeline.json'), 'utf8'));
  const browser = await launch();
  try {
    const { page, seek } = await openStage(browser, outDir, { scale: 1 });
    const report = await page.evaluate(() => SV.report());
    const dir = path.join(outDir, 'check');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const shots = [], seen = new Set();
    const pageStarts = await page.evaluate(() => SV.state().pages.map((p) => p.start));
    for (const t of times || keyTimes(tl, pageStarts)) {
      await seek(t);
      for (const c of await page.evaluate(collisions)) {
        const k = JSON.stringify(c);
        if (!seen.has(k)) { seen.add(k); report.push({ ...c, t }); }
      }
      const f = path.join(dir, `t${t.toFixed(2).padStart(7, '0')}.png`);
      await page.screenshot({ path: f });
      shots.push(f);
    }
    const sheets = await contactSheets(browser, shots, dir);
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ report, warnings: tl.warnings, shots }, null, 1));
    return { report, shots, sheets, warnings: tl.warnings };
  } finally { await browser.close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const times = args.times ? String(args.times).split(',').map(Number) : undefined;
  check(path.resolve(args._[0]), { times }).then((r) => { console.log(JSON.stringify({ layout: r.report, warnings: r.warnings, sheets: r.sheets, frames: r.shots.length }, null, 1)); if (r.report.length) process.exitCode = 3; })
    .catch((e) => { console.error('检查失败：' + e.message); process.exit(1); });
}
