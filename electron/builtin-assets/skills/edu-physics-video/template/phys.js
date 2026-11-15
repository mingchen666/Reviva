/* Physics props for explainer videos. Loaded after engine.js, before anim.js. Generic: do not put one problem's
 * scene code here (that goes in anim.js); add a new generic prop here only if several problems need it.
 * Everything is deterministic (no Math.random / Date.now). Screen coords: x right, y DOWN, angles in radians
 * measured from +x toward +y (so "up" is -PI/2). API summary: reference/animation.md "phys.js API 速查".
 */

// ---------------------------------------------------------------- vector math on [x, y]
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const vmul = (a, k) => [a[0] * k, a[1] * k];
const vlen = a => Math.hypot(a[0], a[1]);
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1];
const vunit = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l]; };
const vperp = a => [-a[1], a[0]];                       // rotated +90° (screen: clockwise-looking because y is down)
const polar = (len, ang) => [Math.cos(ang) * len, Math.sin(ang) * len];
const deg = d => d * PI / 180;

// ---------------------------------------------------------------- math text: d_A, n_2, v_0^2, x_{max}
/** split "v_0^2 + x_{max}" into runs {t, k: 0 normal | 1 sub | 2 sup}. `_x` / `^x` take ONE char, `_{..}` a group. */
function mruns(s) {
  const ch = [...s], runs = [];
  const push = (t, k) => { const l = runs[runs.length - 1]; if (l && l.k === k) l.t += t; else runs.push({ t, k }); };
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if ((c === '_' || c === '^') && i + 1 < ch.length) {
      const k = c === '_' ? 1 : 2;
      if (ch[i + 1] === '{') { const j = ch.indexOf('}', i + 2); push(ch.slice(i + 2, j < 0 ? ch.length : j).join(''), k); i = j < 0 ? ch.length : j; }
      else push(ch[++i], k);
    } else push(c, 0);
  }
  return runs;
}
function mwidth(s, size = 40, f = MF, bold = false) {
  let w = 0;
  mruns(s).forEach(r => { ctx.font = `${bold ? 'bold ' : ''}${r.k ? size * 0.62 : size}px ${f}`; w += ctx.measureText(r.t).width; });
  return w;
}
/** like txt() but renders _sub and ^sup. o: {p, size, f, c, al, a, pop, bold, glow: css colour}. Returns width. */
function mtx(s, x, y, o = {}) {
  const p = o.p === undefined ? 1 : clamp(o.p);
  if (p <= 0) return 0;
  const size = o.size || 40, f = o.f || MF;
  const runs = mruns(s), total = runs.reduce((a, r) => a + [...r.t].length, 0);
  let left = Math.ceil(total * p);
  const w = mwidth(s, size, f, o.bold);
  let cx = o.al === 'left' ? x : o.al === 'right' ? x - w : x - w / 2;
  ctx.save();
  if (o.a !== undefined) ctx.globalAlpha *= o.a;
  if (o.pop !== undefined) { const k = back(o.pop); ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y); }
  ctx.fillStyle = o.c || C.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 16; }
  for (const r of runs) {
    if (left <= 0) break;
    const sz = r.k ? size * 0.62 : size;
    ctx.font = `${o.bold ? 'bold ' : ''}${sz}px ${f}`;
    ctx.fillText([...r.t].slice(0, left).join(''), cx, y + (r.k === 1 ? size * 0.28 : r.k === 2 ? -size * 0.32 : 0));
    cx += ctx.measureText(r.t).width; left -= [...r.t].length;
  }
  ctx.restore();
  return w;
}
/** board row with sub/superscripts (same layout as bl() in engine.js) */
function bm(i, str, t, lt, o = {}) {
  const p = clamp((lt - t) / Math.max(0.5, [...str].length * 0.05));
  const y = (o.y0 || BY0 + 62) + i * (o.lh || 62);
  mtx(str, o.x || BX0 + 36, y, { size: o.size || 38, c: o.c || C.ink, al: 'left', p });
}
/** boxed, glowing board row: the answer of one sub-question. Appears over 0.5 s from scene time t. */
function bbox(i, str, t, lt, o = {}) {
  const p = clamp((lt - t) / 0.5);
  if (p <= 0) return;
  const size = o.size || 40, y = (o.y0 || BY0 + 62) + i * (o.lh || 62), x = o.x || BX0 + 36;
  const w = mwidth(str, size, MF), col = o.c || C.yellow;
  const box = [[x - 14, y - size * 0.85], [x + w + 18, y - size * 0.85], [x + w + 18, y + size * 0.85], [x - 14, y + size * 0.85], [x - 14, y - size * 0.85]];
  grp(p, () => { fillPts(box, col, 0.10); draw(box, { c: col, w: 3, rough: 0.4, single: true }); });
  mtx(str, x, y, { size, c: col, al: 'left', p: p * 1.5, glow: 'rgba(255,209,102,0.45)' });
}

// ---------------------------------------------------------------- construction helpers
/** crisp technical line (little wobble): apparatus, rays, dimension lines */
function tech(pts, o = {}) { return draw(pts, { rough: 0.35, w: 3, single: true, ...o }); }
/** angle arc at (x, y) from a0 to a1 (radians, screen) with a label at radius lr. */
function arcMark(x, y, r, a0, a1, label, p, col = C.yellow, lr) {
  if (p <= 0) return;
  tech(ellPts(x, y, r, r, a0, a1, 24), { c: col, p, w: 3 });
  const am = (a0 + a1) / 2, R2 = lr || r + 30;
  if (label) mtx(label, x + Math.cos(am) * R2, y + Math.sin(am) * R2, { size: 34, c: col, pop: clamp(p * 2 - 1) });
}
/** dimension line with end bars + arrowheads and a label offset `o.off` px to its left-hand side */
function dimLine(x1, y1, x2, y2, label, p, o = {}) {
  if (p <= 0) return;
  const col = o.c || C.yellow, ang = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(ang), ny = Math.cos(ang);
  tech([[x1, y1], [x2, y2]], { c: col, p, w: 2.5 });
  const hd = (x, y, a) => tech([[x - Math.cos(a - 0.4) * 14, y - Math.sin(a - 0.4) * 14], [x, y], [x - Math.cos(a + 0.4) * 14, y - Math.sin(a + 0.4) * 14]], { c: col, w: 2.5 });
  if (p > 0.95) { hd(x2, y2, ang); hd(x1, y1, ang + PI); }
  [[x1, y1], [x2, y2]].forEach(([x, y]) => tech([[x - nx * 12, y - ny * 12], [x + nx * 12, y + ny * 12]], { c: col, w: 2, p }));
  if (label) mtx(label, (x1 + x2) / 2 + nx * (o.off || 30), (y1 + y2) / 2 + ny * (o.off || 30), { size: o.size || 34, c: col, pop: clamp(p * 2 - 1) });
}
/** "angles exaggerated / not to scale" footnote for small-angle problems */
const notToScale = (p, s = '（角度已放大 angles exaggerated）') => txt(s, 80, 845, { size: 24, c: C.gray, al: 'left', p });

// ---------------------------------------------------------------- vectors (forces, velocity, acceleration)
/** arrow from point `from` along screen vector v (px). o: {c, p: grow 0..1, w, label, size, dash, a, head,
 *  lo: sideways label shift px, lside: 1 | -1 (which side for lo)}. The label sits just BEYOND the tip (it never covers
 *  the arrow); shift it sideways with lo when two tips are close. Returns the tip. */
function vec(from, v, o = {}) {
  const p = o.p === undefined ? 1 : clamp(o.p);
  const L = vlen(v);
  if (p <= 0.01 || L < 1) return null;
  const tip = vadd(from, vmul(v, eout(p)));
  grp(o.a === undefined ? 1 : o.a, () => {
    arrow([from, tip], { c: o.c || C.blue, w: o.w || 5, head: o.head || Math.min(22, 8 + L * 0.12), rough: 0.4, single: true, dash: o.dash });
    if (o.label) {
      const size = o.size || 36, u = vunit(v), n = vmul(vperp(u), o.lside || 1);
      const far = 12 + 0.5 * (mwidth(o.label, size) * Math.abs(u[0]) + size * Math.abs(u[1]));
      const q = vadd(tip, vadd(vmul(u, far), vmul(n, o.lo || 0)));
      mtx(o.label, q[0], q[1], { size, c: o.c || C.blue, pop: clamp(p * 2 - 1) });
    }
  });
  return tip;
}
/** vector given by length and screen angle */
const vecA = (from, len, ang, o) => vec(from, polar(len, ang), o);
/** resolve v into components along unit direction `axis` and its perpendicular. e: 0..1 animation —
 *  dashed projection lines draw first, then the two component arrows grow. o: {c, labels: [along, perp]}.
 *  Returns {a: along-vector, b: perp-vector}. */
function components(from, v, axis, e, o = {}) {
  const u = vunit(axis), a = vmul(u, vdot(v, u)), b = vsub(v, a), col = o.c || C.purple;
  if (e <= 0) return { a, b };
  const tip = vadd(from, v);
  tech([tip, vadd(from, a)], { c: C.gray, dash: [7, 7], w: 2, p: clamp(e * 2) });
  tech([tip, vadd(from, b)], { c: C.gray, dash: [7, 7], w: 2, p: clamp(e * 2) });
  const lb2 = o.labels || [];
  vec(from, a, { c: col, p: clamp(e * 2 - 0.6), w: 4, label: lb2[0], lside: o.lside0 || -1 });
  vec(from, b, { c: col, p: clamp(e * 2 - 0.8), w: 4, label: lb2[1], lside: o.lside1 || 1 });
  return { a, b };
}

// ---------------------------------------------------------------- scenery: surfaces, blocks, inclines
/** ground / wall surface from a to b with hatching on side `side` (1 = right of a->b, i.e. below a left->right line) */
function ground(a, b, o = {}) {
  const p = o.p === undefined ? 1 : o.p;
  if (p <= 0) return;
  tech([a, b], { c: o.c || C.ink, w: o.w || 4, p });
  const u = vunit(vsub(b, a)), n = vmul(vperp(u), o.side || 1), L = vlen(vsub(b, a)), gap = o.gap || 24;
  for (let s = gap / 2; s < L * p; s += gap) {
    const q = vadd(a, vmul(u, s));
    tech([q, vadd(q, vadd(vmul(n, 16), vmul(u, -12)))], { c: C.gray, w: 1.8, a: 0.7 });
  }
}
/** incline: bottom corner A (the angle θ is at A), horizontal run `run` px, rising toward dir (1 = right, -1 = left).
 *  Returns {A, T (top), F (foot of the vertical), up: unit vector up the slope, n: outward normal, th,
 *  at(s): point at distance s px up the slope from A}. o: {p, label (e.g. 'θ = 37°'), fill} */
function incline(A, th, run, dir = 1, o = {}) {
  const p = o.p === undefined ? 1 : o.p;
  const F = [A[0] + dir * run, A[1]], T = [F[0], A[1] - run * Math.tan(th)];
  const up = vunit(vsub(T, A)), n = dir > 0 ? [up[1], -up[0]] : [-up[1], up[0]];
  const r = { A, T, F, up, n, th, at: s => vadd(A, vmul(up, s)) };
  if (p <= 0) return r;
  if (o.fill !== false) fillPts([A, T, F], C.land, 0.8 * clamp(p * 2));
  tech([A, T, F, A], { c: C.ink, w: 4, p });
  ground(vadd(A, [-dir * 60, 0]), vadd(F, [dir * 60, 0]), { p, side: dir > 0 ? 1 : -1 });
  const a0 = dir > 0 ? -th : PI, a1 = dir > 0 ? 0 : PI + th;
  arcMark(A[0], A[1], 70, a0, a1, o.label === undefined ? 'θ' : o.label, clamp(p * 2 - 1), C.yellow, 110);
  return r;
}
/** rectangular block resting with the centre of its bottom face at `c`, bottom tilted by screen angle `ang`.
 *  Returns {c, mid (centre of mass), corners, u (along bottom), n (out of top face)}. o: {c: colour, label, p, a} */
function block(c, w, h, ang = 0, o = {}) {
  const u = [Math.cos(ang), Math.sin(ang)], n = [Math.sin(ang), -Math.cos(ang)];
  const P = (a, b) => vadd(c, vadd(vmul(u, a), vmul(n, b)));
  const corners = [P(-w / 2, 0), P(w / 2, 0), P(w / 2, h), P(-w / 2, h)];
  const r = { c, mid: P(0, h / 2), corners, u, n };
  const p = o.p === undefined ? 1 : o.p;
  if (p <= 0) return r;
  scaleAt(r.mid[0], r.mid[1], back(p), () => grp(o.a === undefined ? 1 : o.a, () => {
    fillPts(corners, THEME.cardSolid);
    fillPts(corners, o.c || C.blue, 0.22);
    tech([...corners, corners[0]], { c: o.c || C.blue, w: 4 });
    if (o.label) txt(o.label, r.mid[0], r.mid[1] + 2, { size: Math.min(h * 0.55, 36), f: MF, c: C.ink });
  }));
  return r;
}
/** ball / particle */
function ball(x, y, r, o = {}) {
  const p = o.p === undefined ? 1 : o.p;
  if (p <= 0) return;
  scaleAt(x, y, back(p), () => {
    fillPts(ellPts(x, y, r, r), THEME.cardSolid);
    fillPts(ellPts(x, y, r, r), o.c || C.red, 0.35);
    circ(x, y, r, { c: o.c || C.red, w: 3.5, rough: 0.4, seed: 3 });
    if (o.label) txt(o.label, x, y + 1, { size: r * 1.1, f: MF });
  });
}
/** coil spring from a to b (it stretches / compresses with the endpoints). o: {n: coils, wd: half-width, c, p} */
function spring(a, b, o = {}) {
  const d = vsub(b, a), L = vlen(d), u = vunit(d), nrm = vperp(u), n = o.n || 10, wd = o.wd || 16, lead = Math.min(24, L * 0.15);
  const pts = [a, vadd(a, vmul(u, lead))];
  for (let i = 0; i < n * 2; i++) {
    const s = lead + (L - 2 * lead) * (i + 0.5) / (n * 2);
    pts.push(vadd(vadd(a, vmul(u, s)), vmul(nrm, i % 2 ? -wd : wd)));
  }
  pts.push(vsub(b, vmul(u, lead)), b);
  tech(pts, { c: o.c || C.gray, w: 3, p: o.p });
}
/** pulley wheel at c, radius r, spinning by angle rot */
function pulley(c, r, rot = 0, o = {}) {
  fillPts(ellPts(c[0], c[1], r, r), THEME.cardSolid);
  circ(c[0], c[1], r, { c: o.c || C.ink, w: 4, rough: 0.3 });
  for (let k = 0; k < 3; k++) tech([c, vadd(c, polar(r * 0.8, rot + k * TAU / 3))], { c: C.gray, w: 2 });
  dot(c[0], c[1], C.ink, 5);
}

// ---------------------------------------------------------------- motion: follow the REAL solution in time
/** Physical time for an animation: as scene time lt goes from t0 to t0 + dur, returns 0 .. T LINEARLY.
 *  Never ease physical motion (eio would fake the kinematics): the block must obey x(t) of the solution. */
const simT = (lt, t0, dur, T) => clamp((lt - t0) / dur) * T;
/** trajectory trace of pos(t) (-> [x, y] screen) from t0 to t1. o: {c, w, dash, dots: spacing in s for a
 *  strobe (频闪) picture instead of a line} */
function trail(pos, t0, t1, o = {}) {
  if (t1 <= t0) return;
  if (o.dots) {
    for (let t = t0; t <= t1 + 1e-9; t += o.dots) { const q = pos(t); dot(q[0], q[1], o.c || C.red, o.r || 6); }
    return;
  }
  const pts = [], n = Math.max(2, Math.ceil((t1 - t0) / (o.dt || 0.02)));
  for (let i = 0; i <= n; i++) pts.push(pos(t0 + (t1 - t0) * i / n));
  tech(pts, { c: o.c || C.red, w: o.w || 3, dash: o.dash || [10, 8], a: o.a === undefined ? 0.8 : o.a });
}
/** stopwatch readout "t = 1.20 s" at (x, y) */
function clockTag(x, y, t, o = {}) {
  const r = 22;
  circ(x, y, r, { c: C.gray, w: 3, rough: 0.3 });
  tech([[x, y - r], [x, y - r - 8]], { c: C.gray, w: 4 });
  tech([[x, y], vadd([x, y], polar(r * 0.75, -PI / 2 + (t % 1) * TAU))], { c: C.yellow, w: 3 });
  mtx(`t = ${t.toFixed(o.dec === undefined ? 2 : o.dec)} s`, x + 38, y, { size: o.size || 34, c: C.ink, al: 'left' });
}
/** labelled live value: "v = 7.35 m/s" */
const readout = (x, y, name, val, unit, o = {}) =>
  mtx(`${name} = ${val.toFixed(o.dec === undefined ? 2 : o.dec)} ${unit}`, x, y, { size: o.size || 34, c: o.c || C.ink, al: o.al || 'left' });

// ---------------------------------------------------------------- graphs: v-t, x-t, F-x ...
/** graph panel. o: {ox, oy (screen origin), w, h (px), xr: [0, xmax], yr: [ymin, ymax], xl: 't/s', yl: 'v/(m·s^{-1})',
 *  xt: [tick values], yt: [tick values]}. Returns {S: ([x, y]) -> screen, draw(p), curve(f, x0, x1, o), area(f, x0, x1, col, a),
 *  cursor(x, f, col)} — draw the curve only up to the current physical time so the graph grows with the motion. */
function graph(o) {
  const [xa, xb] = o.xr, [ya, yb] = o.yr;
  const Y = y => o.oy - (y / (yb - ya)) * o.h;   // y = 0 sits at oy; negative values (ya < 0) go below it
  const SS = ([x, y]) => [o.ox + (x - xa) / (xb - xa) * o.w, Y(y)];
  function drawG(p = 1) {
    if (p <= 0) return;
    const yTop = Y(yb), yBot = Y(ya);
    arrow([[o.ox, o.oy], [o.ox + o.w + 30, o.oy]], { w: 3, p, head: 13, rough: 0.3, single: true });
    arrow([[o.ox, Math.max(yBot, o.oy)], [o.ox, yTop - 30]], { w: 3, p, head: 13, rough: 0.3, single: true });
    grp(clamp(p * 2 - 1), () => {
      mtx(o.xl || 't/s', o.ox + o.w + 40, o.oy + 30, { size: 28, c: C.gray, al: 'left' });
      mtx(o.yl || 'v', o.ox + 12, yTop - 44, { size: 28, c: C.gray, al: 'left' });
      txt('O', o.ox - 20, o.oy + 22, { size: 26, f: MF, c: C.gray });
      (o.xt || []).forEach(x => { const [px] = SS([x, 0]); tech([[px, o.oy - 6], [px, o.oy + 6]], { c: C.ink, w: 2 }); mtx(String(x), px, o.oy + 26, { size: 24, c: C.gray }); });
      (o.yt || []).forEach(y => { const py = Y(y); tech([[o.ox - 6, py], [o.ox + 6, py]], { c: C.ink, w: 2 }); mtx(String(y), o.ox - 14, py, { size: 24, c: C.gray, al: 'right' }); });
    });
  }
  const pts = (f, x0, x1, n = 80) => { const r = []; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; r.push(SS([x, f(x)])); } return r; };
  return {
    S: SS, draw: drawG,
    curve(f, x0, x1, co = {}) { if (x1 > x0) tech(pts(f, x0, x1), { c: co.c || C.red, w: co.w || 4, dash: co.dash }); },
    /** shaded area between f and the t-axis (displacement on a v-t graph) */
    area(f, x0, x1, col = C.red, a = 0.18) { if (x1 > x0) fillPts([SS([x0, 0]), ...pts(f, x0, x1), SS([x1, 0])], col, a); },
    /** moving dot on the curve at x + dashed guides to both axes */
    cursor(x, f, col = C.yellow) {
      const q = SS([x, f(x)]);
      tech([q, [q[0], o.oy]], { c: col, dash: [6, 6], w: 2, a: 0.7 }); tech([q, [o.ox, q[1]]], { c: col, dash: [6, 6], w: 2, a: 0.7 });
      dot(q[0], q[1], col, 8);
    },
  };
}
/** energy / momentum bar chart. items: [{label, v, c}], vmax = value of a full bar (px height h). Bars animate
 *  smoothly between values, so pass the live values each frame. o: {w: bar width, gap, p} */
function bars(x, y, h, items, vmax, o = {}) {
  const bw = o.w || 56, gap = o.gap || 34, p = o.p === undefined ? 1 : o.p;
  if (p <= 0) return;
  grp(clamp(p * 2), () => {
    tech([[x - 16, y], [x + items.length * (bw + gap), y]], { c: C.ink, w: 3 });
    items.forEach((it, i) => {
      const x0 = x + i * (bw + gap), hh = h * clamp(it.v / vmax, -1, 1) * p;
      if (Math.abs(hh) > 0.5) { fillPts([[x0, y], [x0 + bw, y], [x0 + bw, y - hh], [x0, y - hh]], it.c, 0.75); tech([[x0, y], [x0, y - hh], [x0 + bw, y - hh], [x0 + bw, y]], { c: it.c, w: 2.5 }); }
      mtx(it.label, x0 + bw / 2, y + 30, { size: 28, c: it.c });
    });
  });
}

// ---------------------------------------------------------------- optics
/** glowing light ray along pts, revealed up to p (0..1), with light pulses running along it. o: {c, w, dash, pulse: false, a} */
function ray(pts, p = 1, o = {}) {
  if (p <= 0.001) return null;
  const r = resample(pts, 4), L = r[r.length - 1][2], lim = L * clamp(p);
  const col = o.c || C.red;
  const path = () => { ctx.beginPath(); let k = 0; for (const q of r) { if (q[2] > lim) break; k++ ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.a !== undefined) ctx.globalAlpha *= o.a;
  if (o.dash) ctx.setLineDash(o.dash);
  ctx.shadowColor = col; ctx.shadowBlur = 22; ctx.strokeStyle = col; ctx.lineWidth = o.w || 5; path(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#ffe6e6'; ctx.lineWidth = 1.6; path(); ctx.stroke();
  if (o.pulse !== false && !o.dash) {
    let idx = 0;
    for (let s = (NOW * 320) % 170; s < lim; s += 170) {
      while (idx < r.length - 1 && r[idx][2] < s) idx++;
      ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(r[idx][0], r[idx][1], 3.2, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
  let i = 0; while (i < r.length - 1 && r[i + 1][2] <= lim) i++;
  return { x: r[i][0], y: r[i][1] };
}
/** bright spot where a ray hits a screen */
function spot(x, y, a = 1, col = C.red) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, col); g.addColorStop(1, 'rgba(255,80,80,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill(); ctx.restore();
}
/** refraction direction: unit incoming direction d hits a surface with unit normal nrm (pointing back toward the
 *  incoming side), index n1 -> n2. Returns the refracted unit direction, or null for total internal reflection. */
function refractDir(d, nrm, n1, n2) {
  const ci = -vdot(d, nrm), k = n1 / n2, s2 = k * k * (1 - ci * ci);
  if (s2 > 1) return null;
  return vunit(vadd(vmul(d, k), vmul(nrm, k * ci - Math.sqrt(1 - s2))));
}
/** glass slab: (cx, cy) = centre of its bottom face, tilted by ang */
function glassBlock(cx, cy, w, h, ang, p = 1) {
  if (p <= 0) return;
  const c = Math.cos(ang), s = Math.sin(ang), ux = [c, s], uy = [s, -c];
  const P = (a, b) => [cx + ux[0] * a + uy[0] * b, cy + ux[1] * a + uy[1] * b];
  const pts = [P(-w / 2, 0), P(w / 2, 0), P(w / 2, h), P(-w / 2, h), P(-w / 2, 0)];
  fillPts(pts, 'rgba(108,200,255,0.16)', clamp(p * 2));
  tech(pts, { c: C.blue, w: 3.5, p });
  tech([P(-w / 2 + 12, h - 10), P(-w / 2 + 40, h - 10)], { c: '#ffffff', w: 2, a: 0.5 * p });
}

// ---------------------------------------------------------------- electromagnetism
/** uniform magnetic field symbols in a rectangle: dir 'in' (×) or 'out' (·) */
function bField(x0, y0, x1, y1, dir = 'in', o = {}) {
  const g = o.gap || 70, col = o.c || C.purple, p = o.p === undefined ? 1 : o.p;
  if (p <= 0) return;
  grp(p, () => {
    for (let y = y0 + g / 2; y < y1; y += g) for (let x = x0 + g / 2; x < x1; x += g) {
      if (dir === 'in') { tech([[x - 9, y - 9], [x + 9, y + 9]], { c: col, w: 3 }); tech([[x - 9, y + 9], [x + 9, y - 9]], { c: col, w: 3 }); }
      else dot(x, y, col, 5);
    }
  });
}
/** uniform electric field: parallel arrows in a rectangle pointing along ang */
function eField(x0, y0, x1, y1, ang = PI / 2, o = {}) {
  const g = o.gap || 90, col = o.c || C.purple, p = o.p === undefined ? 1 : o.p;
  if (p <= 0) return;
  const vertical = Math.abs(Math.sin(ang)) > 0.7;
  for (let k = (vertical ? x0 : y0) + g / 2; k < (vertical ? x1 : y1); k += g) {
    const a = vertical ? [k, Math.sin(ang) > 0 ? y0 : y1] : [Math.cos(ang) > 0 ? x0 : x1, k];
    const b = vertical ? [k, Math.sin(ang) > 0 ? y1 : y0] : [Math.cos(ang) > 0 ? x1 : x0, k];
    arrow([a, b], { c: col, w: 2.5, p, head: 12, rough: 0.3, single: true, a: 0.7 });
  }
}
/** point charge: sign '+' | '-' */
function charge(x, y, sign = '+', r = 20, o = {}) {
  const col = o.c || (sign === '+' ? C.red : C.blue);
  fillPts(ellPts(x, y, r, r), col, 0.3); circ(x, y, r, { c: col, w: 3, rough: 0.3 });
  tech([[x - r * 0.5, y], [x + r * 0.5, y]], { c: C.ink, w: 3 });
  if (sign === '+') tech([[x, y - r * 0.5], [x, y + r * 0.5]], { c: C.ink, w: 3 });
}
