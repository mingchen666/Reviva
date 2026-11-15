#!/usr/bin/env node
// Frame-by-frame capture of preview.html (render mode) → H.264 MP4 with the narration track.
// usage: node render.mjs <outDir> [--fps 30] [--workers 4] [--scale 1.5] [--from 0 --to 20]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { launch, openStage } from './browser.mjs';
import { parseArgs } from './build.mjs';
import { FFMPEG } from './tts.mjs';

function encoder(file, fps) {
  const ff = spawn(FFMPEG, ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));
  return { write, end: () => { ff.stdin.end(); return done; } };
}

async function renderRange(browser, outDir, f0, f1, fps, scale, file, onFrame) {
  const { page, seek } = await openStage(browser, outDir, { scale });
  const enc = encoder(file, fps);
  for (let f = f0; f < f1; f++) {
    await seek(f / fps);
    await enc.write(await page.screenshot({ type: 'jpeg', quality: 92 }));
    onFrame();
  }
  await page.close();
  await enc.end();
}

export async function render(outDir, { fps = 30, workers = Math.min(4, Math.max(1, os.cpus().length >> 1)), scale = 1.5, from = 0, to } = {}) {
  const tl = JSON.parse(fs.readFileSync(path.join(outDir, 'timeline.json'), 'utf8'));
  if (tl.preview_only) throw new Error('这是 --preview 构建（没有配音）：先去掉 --preview 重新构建，再渲染');
  const end = Math.min(to ?? tl.duration, tl.duration);
  const F0 = Math.floor(from * fps), F1 = Math.ceil(end * fps), N = F1 - F0;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-video-'));
  const browser = await launch();
  let done = 0;
  const t0 = Date.now();
  const tick = () => { done++; if (done % 30 === 0 || done === N) process.stderr.write(`\r渲染 ${done}/${N} 帧 (${((done / N) * 100).toFixed(0)}%)  ${((Date.now() - t0) / 1000).toFixed(0)}s`); };
  try {
    const per = Math.ceil(N / workers), segs = [];
    await Promise.all(Array.from({ length: workers }, (_, i) => {
      const a = F0 + i * per, b = Math.min(F1, a + per);
      if (a >= b) return null;
      const file = path.join(tmp, `seg${i}.mp4`); segs.push(file);
      return renderRange(browser, outDir, a, b, fps, scale, file, tick);
    }));
    process.stderr.write('\n');
    segs.sort();
    fs.writeFileSync(path.join(tmp, 'list.txt'), segs.map((s) => `file '${s}'`).join('\n'));
    const video = path.join(outDir, 'video.mp4');
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'),
      '-ss', String(from), '-t', String(end - from), '-i', path.join(outDir, 'audio.wav'),
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', video]);
    // cover: the frame right after the final emphasis (or 70% through)
    const emph = tl.ops.filter((o) => o.kind === 'emph').pop();
    const tc = emph ? Math.min(tl.duration - 0.1, emph.at + 1.2) : tl.duration * 0.7;
    const { page, seek } = await openStage(browser, outDir, { scale });
    await seek(tc);
    await page.screenshot({ path: path.join(outDir, 'cover.png') });
    return { video, frames: N, seconds: (Date.now() - t0) / 1000 };
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  render(path.resolve(a._[0]), { fps: a.fps ? +a.fps : undefined, workers: a.workers ? +a.workers : undefined, scale: a.scale ? +a.scale : undefined, from: a.from ? +a.from : 0, to: a.to ? +a.to : undefined })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => { console.error('渲染失败：' + e.message); process.exit(1); });
}
