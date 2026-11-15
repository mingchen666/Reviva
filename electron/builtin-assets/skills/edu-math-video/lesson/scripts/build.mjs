#!/usr/bin/env node
// lesson.json → <dir>/{timeline.json, audio.wav, preview.html, subtitles.srt}
// usage: node build.mjs <lesson.json> [--style chalk|lab|whiteboard|notebook] [--out dir] [--tts engine] [--preview]
//   --preview: no TTS calls, estimated durations, silent preview.html (check layout before paying)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { synthAll, FFMPEG } from './tts.mjs';
import { toSpeak } from './speak.mjs';
import { compile, toSrt, expandIntro } from './compile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STYLES = ['chalk', 'lab', 'whiteboard', 'notebook'];
const SR = 24000;

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; out[k] = v; }
    else out._.push(a);
  }
  return out;
}

export function makePage(timeline, { audio = 'audio.wav' } = {}) {
  const nm = (p) => pathToFileURL(path.join(ROOT, 'node_modules', p)).href;
  const fonts = ['katex/dist/katex.min.css', 'lxgw-wenkai-webfont/style.css', '@fontsource/noto-serif-sc/400.css', '@fontsource/noto-serif-sc/600.css', '@fontsource/noto-sans-sc/400.css', '@fontsource/zcool-kuaile/400.css', '@fontsource/jetbrains-mono/400.css'];
  const eng = (f) => fs.readFileSync(path.join(ROOT, 'engine', f), 'utf8');
  const scripts = `<script src="${nm('katex/dist/katex.min.js')}"></script>\n` + ['core.js', 'figure.js', 'themes.js', 'player.js'].map((f) => `<script>\n${eng(f)}\n</script>`).join('\n');
  const data = JSON.stringify(timeline).replace(/</g, '\\u003c');
  const title = (timeline.meta.title || '解题视频').replace(/[<&]/g, '');
  return eng('page.html')
    .replaceAll('{{TITLE}}', title)
    .replace('{{FONT_LINKS}}', fonts.map((f) => `<link rel="stylesheet" href="${nm(f)}">`).join('\n'))
    .replace('{{THEME_CSS}}', () => eng('themes.css'))
    .replace('{{SCRIPTS}}', () => scripts)
    .replace('{{AUDIO}}', audio ? `<audio id="audio" src="${audio}" preload="auto"></audio>` : '')
    .replace('{{DATA}}', () => data);
}

// mixes every beat's mp3 at its start time into one mono 16-bit WAV
export function mixAudio(timeline, outFile) {
  const n = Math.ceil(timeline.duration * SR);
  const pcm = new Int16Array(n);
  for (const a of timeline.audio) {
    const raw = execFileSync(FFMPEG, ['-v', 'error', '-i', a.file, '-f', 's16le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
    const src = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength >> 1);
    const off = Math.round(a.at * SR);
    for (let i = 0; i < src.length && off + i < n; i++) pcm[off + i] = Math.max(-32768, Math.min(32767, pcm[off + i] + src[i]));
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + n * 2, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(outFile, Buffer.concat([h, Buffer.from(pcm.buffer)]));
}

export async function build(lessonPath, opts = {}) {
  const lesson = expandIntro(JSON.parse(fs.readFileSync(lessonPath, 'utf8')));
  lesson.meta = lesson.meta || {};
  if (opts.style) lesson.meta.style = opts.style;
  if (!STYLES.includes(lesson.meta.style || 'chalk')) throw new Error(`未知风格 ${lesson.meta.style}，可选：${STYLES.join(' / ')}`);
  const outDir = path.resolve(opts.out || path.dirname(lessonPath));
  fs.mkdirSync(outDir, { recursive: true });
  const beats = lesson.scenes.flatMap((s) => s.beats);
  const rate = lesson.meta.speechRate; // doubao-style [-50,100] → speed multiplier for every engine
  const res = synthAll(beats.map((b) => b.speak || toSpeak(b.say || '')), {
    start: path.dirname(path.resolve(lessonPath)), cacheDir: path.join(outDir, 'build', 'tts'),
    engine: opts.tts || lesson.meta.tts, speed: rate ? 1 + rate / 100 : undefined, dry: !!opts.preview,
  });
  const tl = compile(lesson, res.clips);
  tl.tts = { engine: res.engine, voice: res.voice };
  for (const p of res.pron) {
    const b = beats[p.line];
    tl.warnings.push(`读音未固定：「${p.char}」(${p.kind}) 猜测读 ${p.guess}，可能 ${p.readings}  …${p.context}…  （${(b.say || '').slice(0, 20)}）→ 在 say 里写 ${p.char}[拼音]（字幕会自动去掉标注），或加进 pron.json`);
  }
  if (opts.preview) tl.preview_only = true;
  else mixAudio(tl, path.join(outDir, 'audio.wav'));
  fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(tl, null, 1));
  fs.writeFileSync(path.join(outDir, 'preview.html'), makePage(tl, { audio: opts.preview ? null : 'audio.wav' }));
  if (!opts.preview) fs.writeFileSync(path.join(outDir, 'subtitles.srt'), toSrt(tl.captions));
  return { timeline: tl, outDir };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0]) { console.error('usage: node build.mjs <lesson.json> [--style s] [--out dir] [--tts engine] [--preview]'); process.exit(2); }
  build(args._[0], { style: args.style, out: args.out, tts: args.tts, preview: args.preview }).then(({ timeline, outDir }) => {
    console.log(JSON.stringify({ outDir, style: timeline.style, tts: timeline.tts, previewOnly: !!timeline.preview_only, duration: timeline.duration, captions: timeline.captions.length, warnings: timeline.warnings }, null, 1));
  }).catch((e) => { console.error('构建失败：' + e.message); process.exit(1); });
}
