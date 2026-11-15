#!/usr/bin/env node
// One shot: build → check (→ render only with --render).
// usage: node make.mjs <lesson.json> [--style s] [--tts engine] [--out dir] [--preview | --render] [--force]
//   --preview: free layout check (no TTS, estimated timing)
//   default:   real TTS + preview.html (plays in a browser); no MP4
//   --render:  also export video.mp4 — only after the user said they want the MP4
import path from 'node:path';
import { build, parseArgs } from './build.mjs';
import { check } from './check.mjs';
import { render } from './render.mjs';

const a = parseArgs(process.argv.slice(2));
if (!a._[0]) { console.error('usage: node make.mjs <lesson.json> [--style s] [--tts engine] [--out dir] [--preview | --render] [--force]'); process.exit(2); }
try {
  const { timeline, outDir } = await build(a._[0], { style: a.style, out: a.out, tts: a.tts, preview: a.preview });
  const c = await check(outDir);
  const summary = { outDir, style: timeline.style, tts: timeline.tts, previewOnly: !!timeline.preview_only, duration: timeline.duration, warnings: timeline.warnings, layout: c.report, sheets: c.sheets, frames: c.shots.length, report: path.join(outDir, 'check', 'report.json') };
  if ((c.report.length || timeline.warnings.length) && !a.force) {
    console.log(JSON.stringify({ ...summary, rendered: false, hint: '先修正 layout / warnings（或加 --force 忽略）' }, null, 1));
    process.exit(3);
  }
  if (!a.render || a.preview) { console.log(JSON.stringify({ ...summary, rendered: false, preview: path.join(outDir, 'preview.html'), next: a.preview ? undefined : '打开 preview.html 给用户看，再问要不要导出 MP4（node render.mjs <outDir>）' }, null, 1)); process.exit(0); }
  const r = await render(outDir);
  console.log(JSON.stringify({ ...summary, rendered: true, video: r.video, cover: path.join(outDir, 'cover.png'), srt: path.join(outDir, 'subtitles.srt'), preview: path.join(outDir, 'preview.html'), renderSeconds: r.seconds }, null, 1));
} catch (e) {
  console.error('失败：' + e.message);
  process.exit(1);
}
