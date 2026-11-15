// TTS bridge: every engine (glm / doubao / minimax / edge / say) lives in the skill's shared/tts.py, so both
// pipelines share keys, caching and pronunciation control. Returns per-beat {file, duration, words}.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_TTS = path.join(ROOT, '..', 'shared', 'tts.py');

// ffmpeg: $FFMPEG > ffmpeg-static here or in the workspace's shared node_modules > system ffmpeg
const upwards = (d) => (path.dirname(d) === d ? [d] : [d, ...upwards(path.dirname(d))]);
export const FFMPEG = process.env.FFMPEG
  || [ROOT, ...upwards(process.cwd())].map((d) => path.join(d, 'node_modules', 'ffmpeg-static', 'ffmpeg')).find((f) => fs.existsSync(f))
  || 'ffmpeg';

// python with requests + pypinyin (PY env var wins; macOS: /usr/bin/python3 usually has them)
export function python() {
  for (const c of [process.env.PY, '/usr/bin/python3', 'python3', 'python'].filter(Boolean)) {
    try { execFileSync(c, ['-c', 'import requests, pypinyin'], { stdio: 'ignore' }); return c; } catch {}
  }
  throw new Error('找不到装了 requests + pypinyin 的 python：python3 -m pip install --user requests pypinyin（或设置 PY=...）');
}

// texts → {engine, voice, clips:[{file, duration, words}], pron:[...]}; dry = estimated durations, no API calls
export function synthAll(texts, { start, cacheDir, engine, speed, dry = false }) {
  const jobs = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-tts-')), 'jobs.json');
  fs.writeFileSync(jobs, JSON.stringify({ start, cache: cacheDir, texts, engine, speed, dry, ffmpeg: FFMPEG }));
  const r = spawnSync(python(), [SHARED_TTS, 'batch', jobs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 });
  fs.rmSync(path.dirname(jobs), { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`TTS 失败（shared/tts.py 退出码 ${r.status}），见上方输出`);
  return JSON.parse(r.stdout);
}
