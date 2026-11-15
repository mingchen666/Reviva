// Usage:
//   node render.mjs stills auto            -> build/stills/<scene>_<line>.png: one frame near the END of every
//                                             narration line (all of that line's animation should be on screen)
//   node render.mjs stills 5,30.5,60       -> build/stills/t<ms>.png at those seconds
//   node render.mjs motion                 -> build/motion_report.txt: does the FIGURE (left half) actually change
//                                             during every narration line? exit 1 if a line is static or a scene
//                                             never has sustained motion (see reference/visual-design.md)
//   node render.mjs video [workers]        -> ../<output_name>.mp4   (workers = parallel browser pages, NOT fps;
//                                             fps is fixed at 30. 4-8 is sensible.)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(ROOT, 'build');
const TL = JSON.parse(fs.readFileSync(path.join(BUILD, 'timeline.json'), 'utf8'));
fs.writeFileSync(path.join(BUILD, 'timeline.js'), 'window.TIMELINE=' + JSON.stringify(TL) + ';');
const URL_ = pathToFileURL(path.join(ROOT, 'index.html')).href + '?render=1';
const FPS = 30;
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'episode.json'), 'utf8'));
const OUT = path.join(ROOT, '..', CONFIG.output_name + '.mp4');
let ERRORS = 0;  // JS errors in anim.js/engine.js: a frame with an error is silently incomplete

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { ERRORS++; console.error('PAGE ERROR', e.message); });
  page.on('console', m => { if (m.type() === 'error') { ERRORS++; console.error('console:', m.text()); } });
  await page.goto(URL_);
  await page.evaluate(() => window.ready);
  return page;
}
const canvasShot = page => page.locator('#c').screenshot({ type: 'jpeg', quality: 93 });

function run(args) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg, args, { stdio: ['pipe', 'inherit', 'inherit'] });
    p.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
    p.on('error', rej);
  });
}

async function renderChunk(browser, f0, f1, file, id) {
  const page = await openPage(browser);
  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg chunk ' + c)))));
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    await page.evaluate(t => window.renderFrame(t), f / FPS);
    const buf = await canvasShot(page);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((f - f0) % 300 === 0) console.log(`[w${id}] ${f - f0}/${f1 - f0}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await done;
  await page.close();
}

const mode = process.argv[2] || 'stills';
if (mode === 'video' && TL.preview_only) throw new Error('Preview-only timeline: generate real audio before exporting video.');
// file access flags: lets `motion` read pixels of a canvas that has problem.png drawn on it (file:// taints it otherwise)
const ARGS = ['--font-render-hinting=none', '--allow-file-access-from-files', '--disable-web-security'];
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', args: ARGS });
} catch (e) {  // no Google Chrome installed: use Playwright's own Chromium (npx playwright install chromium)
  browser = await chromium.launch({ args: ARGS });
}
if (mode === 'motion') {
  const page = await openPage(browser);
  await page.evaluate(() => { window.NO_BOIL = true; });  // freeze the hand-drawn wobble so only real changes count
  const FIG = [0, 110, 925, 770], BOARD = [925, 110, 995, 770];  // x, y, w, h (everything above the subtitles)
  const grab = t => page.evaluate(([t, regs]) => {
    window.renderFrame(t);
    const c = document.getElementById('c').getContext('2d');
    return regs.map(([x, y, w, h]) => {
      const d = c.getImageData(x, y, w, h).data, out = [];
      for (let j = 0; j < h; j += 3) for (let i = 0; i < w; i += 3) { const k = (j * w + i) * 4; out.push((d[k] + d[k + 1] + d[k + 2]) / 3); }
      return out;
    });
  }, [t, [FIG, BOARD]]);
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 24) n++; return 100 * n / a.length; };  // 24 grey levels: a translucent highlighter over paper still counts
  const exempt = new Set(CONFIG.static_ok || []);
  const first = TL.scenes[0].id, last = TL.scenes[TL.scenes.length - 1].id;
  const rows = [], problems = [];
  for (const sc of TL.scenes) {
    const skip = sc.id === first || sc.id === last || exempt.has(sc.id);
    let moving = 0;
    for (const [k, ln] of sc.lines.entries()) {
      const N = 6, a = ln.start + 0.05, b = Math.max(a + 0.1, ln.end - 0.05), shots = [];
      for (let i = 0; i < N; i++) shots.push(await grab(a + (b - a) * i / (N - 1)));
      const steps = shots.slice(1).map((s, i) => diff(shots[i][0], s[0]));
      const net = diff(shots[0][0], shots[N - 1][0]), board = diff(shots[0][1], shots[N - 1][1]);
      const active = steps.filter(v => v > 0.1).length;
      const kind = Math.max(net, ...steps) < 0.15 ? 'STATIC' : active >= 3 ? 'MOVE' : 'POP';
      if (kind === 'MOVE') moving++;
      const key = `${sc.id} ${k}`;
      const bad = !skip && !exempt.has(key) && kind === 'STATIC';
      if (bad) problems.push(`[${key}] figure does not change during this line: "${ln.zh}"`);
      rows.push(`${bad ? '✗' : ' '} [${key}] ${kind.padEnd(6)} figure ${net.toFixed(2).padStart(6)}%  steps ${steps.map(v => v.toFixed(1)).join('/')}  board ${board.toFixed(2)}%${skip ? '  (exempt scene)' : ''}`);
    }
    if (!skip && !moving) problems.push(`[${sc.id}] no line has sustained motion (MOVE): add a slide / morph / camera move / moving point`);
  }
  const rep = rows.join('\n') + '\n\nSTATIC = figure unchanged, POP = things appear, MOVE = continuous motion through the line\n'
    + (problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'motion check passed') + '\n';
  fs.writeFileSync(path.join(BUILD, 'motion_report.txt'), rep);
  console.log(rep);
  if (problems.length) process.exitCode = 1;
} else if (mode === 'stills') {
  const dir = path.join(BUILD, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  const page = await openPage(browser);
  const arg = process.argv[3] || 'auto';
  const shots = arg === 'auto'
    ? TL.scenes.flatMap((sc, i) => sc.lines.map((ln, k) => [Math.max(ln.start + 0.3, ln.end - 0.15), `${String(i + 1).padStart(2, '0')}_${sc.id}_${k}`]))
      .concat([[TL.duration - 1.6, 'zz_end']])
    : arg.split(',').map(Number).map(t => [t, `t${String(Math.round(t * 1000)).padStart(7, '0')}`]);
  if (arg === 'auto') for (const f of fs.readdirSync(dir)) if (f.endsWith('.png')) fs.rmSync(path.join(dir, f));
  for (const [t, name] of shots) {
    await page.evaluate(tt => window.renderFrame(tt), t);
    const f = path.join(dir, `${name}.png`);
    await page.locator('#c').screenshot({ path: f });
    console.log(f);
  }
} else {
  const workers = Number(process.argv[3] || 6);
  const total = Math.ceil(TL.duration * FPS);
  const per = Math.ceil(total / workers);
  const chunks = [];
  for (let i = 0; i < workers; i++) {
    const f0 = i * per, f1 = Math.min(total, (i + 1) * per);
    if (f0 < f1) chunks.push({ f0, f1, file: path.join(BUILD, `chunk${i}.mp4`), id: i });
  }
  const t0 = Date.now();
  await Promise.all(chunks.map(c => renderChunk(browser, c.f0, c.f1, c.file, c.id)));
  console.log('frames done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  const list = path.join(BUILD, 'chunks.txt');
  fs.writeFileSync(list, chunks.map(c => `file '${c.file}'`).join('\n'));
  await run(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.join(BUILD, 'mix.wav'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
    '-metadata', 'title=' + CONFIG.title, OUT]);
  for (const c of chunks) fs.rmSync(c.file, { force: true });  // intermediate chunks are no longer needed
  fs.rmSync(list, { force: true });
  console.log('WROTE', OUT);
}
await browser.close();
if (ERRORS) { console.error(`FAILED: ${ERRORS} page error(s) above. Fix anim.js before trusting any frame.`); process.exitCode = 1; }
