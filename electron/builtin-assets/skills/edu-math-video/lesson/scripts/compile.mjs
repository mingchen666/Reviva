// Pure compiler: lesson.json + per-beat TTS results → absolute-time timeline.
import { toSpeak, stripPron } from './speak.mjs';

export const GAP = 0.35;
export const ERASE = 0.5;
export const FIG_DUR = { seg: 0.7, poly: 0.5, face: 0.5, dot: 0.25, point: 0.3, angle: 0.7, rt: 0.3, par: 0.35, label: 0.3, axes: 0.9, curve: 1.6, text: 0.4 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const SUBS = '₀₁₂₃₄₅₆₇₈₉';

// $\sqrt{3}$ ≈ 2 glyphs: a command counts as one, braces / ^ / _ as none
const texGlyphs = (src) => src.replace(/\\[a-zA-Z]+/g, 'x').replace(/[{}^_\\\s]/g, '');
export const visibleText = (s) => String(s).replace(/\$([^$]*)\$/g, (_, t) => texGlyphs(t)).replace(/\*\*|==|!!/g, '').replace(/[{}]/g, '');
export const writeDur = (s) => clamp(visibleText(s).length * 0.085, 0.5, 2.4);
// caption text: {BC1} → BC₁, markup removed
export const captionText = (s) => stripPron(s).replace(/\{([^{}]+)\}/g, (_, x) => x.replace(/\d/g, (d) => SUBS[d])).replace(/\*\*|==|!!/g, '').replace(/\$([^$]*)\$/g, '$1');

// Formulas typed as plain Unicode (4√3, x², n₁, 1/2, θ) look rough on the board: they must be $…$ (KaTeX).
const RAW_MATH = /[√¹²³⁰⁴-⁹⁻₀-₉½⅓⅔¼¾θαβγφπ]|\d\s*\/\s*\d|[)|]\s*\/\s*[(|√\d]/;
export function rawMath(s) {
  const rest = String(s).replace(/\$[^$]*\$/g, ' ').replace(/\{[^{}]+\}/g, 'X');
  return RAW_MATH.test(rest) ? String(s).slice(0, 40) : null;
}

const norm = (s) => toSpeak(stripPron(s)).replace(/[\s，。、；：！？,.!?（）()“”"'—-]/g, '');

// time (seconds from beat start) at which `anchor` is spoken, or null
export function anchorTime(anchor, beat, voice) {
  if (anchor == null) return null;
  if (typeof anchor === 'number') return anchor;
  const words = voice.words || [];
  let joined = '';
  const owner = [];
  words.forEach((w, i) => { const n = norm(w.w); joined += n; for (let k = 0; k < n.length; k++) owner.push(i); });
  const key = norm(anchor);
  const idx = key ? joined.indexOf(key) : -1;
  if (idx >= 0) return words[owner[idx]].s;
  const say = stripPron(beat.say || '');
  const j = say.indexOf(anchor);
  if (j >= 0 && say.length) return (j / say.length) * voice.duration;
  return null;
}

export const CAP_MAX = 26;
// long narration → several subtitle lines, split at punctuation, timed by the TTS word stream
export function splitCaption(text, voice, t0, max = CAP_MAX) {
  const parts = text.match(/[^，。；：！？,;]+[，。；：！？,;]*/g) || [text];
  const lines = [];
  for (const p of parts) { if (lines.length && (lines[lines.length - 1] + p).length <= max) lines[lines.length - 1] += p; else lines.push(p); }
  const words = (voice.words || []).map((w) => ({ s: t0 + w.s, e: t0 + w.e }));
  const total = lines.reduce((n, l) => n + l.length, 0), d = voice.duration;
  let c = 0;
  return lines.map((l, k) => {
    const f0 = c / total, f1 = (c + l.length) / total; c += l.length;
    let at, end, ws = [];
    if (words.length) {
      const i0 = Math.round(f0 * words.length), i1 = Math.max(i0 + 1, Math.round(f1 * words.length));
      ws = words.slice(i0, i1);
      at = k === 0 ? t0 : ws[0] ? ws[0].s : t0 + f0 * d;
      end = k === lines.length - 1 ? t0 + d : ws.length ? ws[ws.length - 1].e : t0 + f1 * d;
    } else { at = t0 + f0 * d; end = t0 + f1 * d; }
    return { at, end, text: l.trim(), words: ws };
  });
}

// "intro": [{show, say, speak?}] → an opening scene that shows the whole problem and reads it segment by segment.
// Idempotent: build.mjs expands before TTS (the intro beats need voices too), compile() again for direct callers.
export function expandIntro(lesson) {
  if (!Array.isArray(lesson.intro) || !lesson.intro.length) return lesson;
  const { intro, ...rest } = lesson;
  const scene = {
    title: '题目', short: '读题', problem: true,
    beats: intro.map((seg) => ({ say: seg.say, speak: seg.speak, pause: seg.pause, show: seg.show })),
  };
  return { ...rest, scenes: [scene, ...(lesson.scenes || [])] };
}

export function compile(lesson, voices) {
  lesson = expandIntro(lesson);
  const ops = [], captions = [], audio = [], scenes = [], warnings = [];
  if (!lesson.scenes[0] || !lesson.scenes[0].problem) warnings.push('缺少读题开场：在 lesson.json 顶层加 "intro"（显示并朗读题目），见 lesson-schema.md');
  let cur = 0.6, id = 0, bi = 0, lastWrite = null, writeFree = 0;
  const byId = {};
  const lint = (s) => { const r = s != null && rawMath(s); if (r) warnings.push(`公式请用 $…$（KaTeX）写，不要用纯文本符号："${r}"`); };
  lesson.scenes.forEach((sc, si) => {
    const sAt = si === 0 ? 0.3 : cur;
    ops.push({ kind: 'scene', at: sAt, index: si });
    scenes.push({ title: sc.title || '', short: sc.short || sc.title || '', at: sAt });
    const tStart = sAt + (si === 0 ? 0.6 : ERASE);
    lint(sc.title); lint(sc.goal);
    if (sc.title || sc.goal) {
      const w = { kind: 'write', id: 'L' + id++, role: 'title', tag: sc.title, text: sc.goal || '', at: Math.max(tStart, writeFree), dur: writeDur(sc.goal || sc.title) };
      ops.push(w); lastWrite = w.id; writeFree = w.at + w.dur;
    }
    cur = tStart + 0.3;
    const segs = [];
    if (sc.problem) {
      // the whole problem appears at once (quick staggered sweep), then each segment lights up while it is read
      sc.beats.forEach((b, k) => {
        lint(b.show);
        const w = { kind: 'write', id: 'Q' + k, role: 'problem', text: b.show || '', at: Math.max(tStart + 0.2, writeFree) + k * 0.15, dur: 0.6 };
        ops.push(w); segs.push(w.id);
      });
      writeFree = ops[ops.length - 1].at + 0.6; lastWrite = segs[segs.length - 1];
      cur = writeFree + 0.3;
    }
    for (const [k, beat] of sc.beats.entries()) {
      const v = voices[bi++];
      if (!v) throw new Error('missing TTS result for beat ' + bi);
      const t0 = cur, d = v.duration;
      if (beat.say) captions.push(...splitCaption(captionText(beat.say), v, t0));
      audio.push({ file: v.file, at: t0 });
      if (sc.problem) ops.push({ kind: 'read', target: segs[k], at: t0, dur: 0.25, out: t0 + d });
      const acts = beat.do || [];
      let end = t0 + d;
      acts.forEach((a, i) => {
        let rel = anchorTime(a.at, beat, v);
        if (a.at != null && rel == null) warnings.push(`锚点未找到："${a.at}"（${(beat.say || '').slice(0, 20)}…），已按顺序排布`);
        if (rel == null) rel = acts.length > 1 ? (i / acts.length) * d * 0.9 : 0;
        let at = t0 + rel + (a.delay || 0);
        let op;
        lint(a.write); lint(a.tip); lint(a.tag);
        if (a.write != null) {
          at = Math.max(at, writeFree + 0.05);
          op = { kind: 'write', id: a.id || 'L' + id++, text: a.write, role: a.role, at, dur: a.dur || writeDur(a.write) };
          lastWrite = op.id; writeFree = at + op.dur;
        } else if (a.fig) {
          const { fig, at: _a, delay, hold, show, ...rest } = a;
          op = { kind: 'fig', op: fig, ...rest, at, dur: a.dur || FIG_DUR[fig] || 0.5 };
          if (hold) op.out = at + hold;
          if (fig === 'point' && show !== false) {
            ops.push({ kind: 'fig', op: 'dot', p: a.name, at, dur: 0.25 }, { kind: 'fig', op: 'label', p: a.name, at, dur: 0.3 });
          }
        } else if (a.cam) {
          op = { kind: 'cam', at, dur: a.dur || 1.6, tag: a.tag };
          if (a.cam === 'face') op.face = a.target;
          else if (a.cam === 'home') op.home = true;
          else if (a.cam === 'spin') { op.daz = a.daz || 0; op.del = a.del || 0; }
          else { op.az = a.az; op.el = a.el; }
          if (a.tagOut) op.tagOut = at + a.tagOut;
        } else if (a.emph != null) {
          op = { kind: 'emph', target: a.emph === true || a.emph === 'last' ? lastWrite : a.emph, text: a.text, at: Math.max(at, writeFree), dur: a.dur || 0.8 };
        } else if (a.tip != null) {
          op = { kind: 'tip', text: a.tip, at, dur: 0.5, out: at + (a.hold || 4) };
        } else if (a.hide != null) {
          const target = byId[a.hide];
          if (target) target.out = at; else warnings.push(`hide 目标不存在：${a.hide}`);
          return;
        } else if (a.clear) {
          op = { kind: 'clear', at: Math.max(at, writeFree) };
        } else {
          warnings.push('无法识别的动作：' + JSON.stringify(a));
          return;
        }
        if (a.id) byId[a.id] = op;
        ops.push(op);
        if (op.kind !== 'tip') end = Math.max(end, op.at + (op.dur || 0));
      });
      cur = Math.max(end, writeFree) + (beat.pause ?? GAP);
    }
    cur += 0.4;
  });
  ops.sort((a, b) => a.at - b.at);
  return {
    meta: lesson.meta || {},
    style: (lesson.meta && lesson.meta.style) || 'chalk',
    figure: lesson.figure || null,
    scenes, ops, captions, audio,
    duration: +(cur + 1.2).toFixed(3),
    warnings,
  };
}

export function toSrt(captions) {
  const ts = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  return captions.map((c, i) => `${i + 1}\n${ts(c.at)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
}
