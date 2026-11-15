/* Chemistry props for explainer videos. Loaded after engine.js, before anim.js. Generic: one problem's scene code
 * goes in anim.js; add a prop here only if several problems need it. Deterministic (no Math.random / Date.now).
 * API summary: reference/animation.md "chem.js API 速查".
 *
 * FORMULA TEXT: every text helper here (and the subtitles) writes chemistry the natural way:
 *   "Cu(NO3)2", "2SO2 + O2", "C12H22O11"  -> digits right after a letter / ")" / "]" become subscripts automatically
 *   "Fe^{3+}", "SO4^{2-}", "e^-", "mol·L^{-1}" -> ^ = superscript (one char, or a {group})
 *   "V_m", "n_{总}"                          -> _ = explicit subscript
 *   leading coefficients ("2SO2"), decimals ("0.3 mol") and numbers after spaces / operators stay normal.
 */

// ---------------------------------------------------------------- formula text
/** split text into runs {t, k: 0 normal | 1 sub | 2 sup}, with automatic chemical subscripts unless plain */
function mruns(s, plain = false) {
  const ch = [...s], runs = [];
  const push = (t, k) => { const l = runs[runs.length - 1]; if (l && l.k === k) l.t += t; else runs.push({ t, k }); };
  let prevSrc = '', prevK = 0;
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if ((c === '_' || c === '^') && i + 1 < ch.length) {
      const k = c === '_' ? 1 : 2;
      if (ch[i + 1] === '{') { const j = ch.indexOf('}', i + 2); push(ch.slice(i + 2, j < 0 ? ch.length : j).join(''), k); i = j < 0 ? ch.length : j; }
      else push(ch[++i], k);
      prevSrc = '}'; prevK = k;
      continue;
    }
    let k = 0;
    if (!plain && /[0-9]/.test(c) && (/[A-Za-z\)\]]/.test(prevSrc) || (prevK === 1 && /[0-9]/.test(prevSrc)))) k = 1;
    push(c, k);
    prevSrc = c; prevK = k;
  }
  return runs;
}
function mwidth(s, size = 40, f = MF, bold = false, plain = false) {
  let w = 0;
  mruns(s, plain).forEach(r => { ctx.font = `${bold ? 'bold ' : ''}${r.k ? size * 0.62 : size}px ${f}`; w += ctx.measureText(r.t).width; });
  return w;
}
/** text with chemistry sub/superscripts. o: {p, size, f, c, al, a, pop, bold, glow, plain}. Returns width. */
function mtx(s, x, y, o = {}) {
  const p = o.p === undefined ? 1 : clamp(o.p);
  if (p <= 0) return 0;
  const size = o.size || 40, f = o.f || MF;
  const runs = mruns(s, o.plain), total = runs.reduce((a, r) => a + [...r.t].length, 0);
  let left = Math.ceil(total * p);
  const w = mwidth(s, size, f, o.bold, o.plain);
  let cx = o.al === 'left' ? x : o.al === 'right' ? x - w : x - w / 2;
  ctx.save();
  if (o.a !== undefined) ctx.globalAlpha *= o.a;
  if (o.pop !== undefined) { const k = back(o.pop); ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y); }
  ctx.fillStyle = o.c || C.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 14; }
  for (const r of runs) {
    if (left <= 0) break;
    const sz = r.k ? size * 0.62 : size;
    ctx.font = `${o.bold ? 'bold ' : ''}${sz}px ${f}`;
    ctx.fillText([...r.t].slice(0, left).join(''), cx, y + (r.k === 1 ? size * 0.28 : r.k === 2 ? -size * 0.34 : 0));
    cx += ctx.measureText(r.t).width; left -= [...r.t].length;
  }
  ctx.restore();
  return w;
}
/** board row i with formulas (same layout as bl() in engine.js). Use this for every board line. */
function bm(i, str, t, lt, o = {}) {
  const p = clamp((lt - t) / Math.max(0.5, [...str].length * 0.05));
  const y = (o.y0 || BY0 + 62) + i * (o.lh || 62);
  mtx(str, o.x || BX0 + 36, y, { size: o.size || 38, c: o.c || C.ink, al: 'left', p });
}
/** boxed answer row on the board (chalk box + glow) */
function bbox(i, str, t, lt, o = {}) {
  const p = clamp((lt - t) / 0.5);
  if (p <= 0) return;
  const size = o.size || 40, y = (o.y0 || BY0 + 62) + i * (o.lh || 62), x = o.x || BX0 + 36;
  const w = mwidth(str, size, MF), col = o.c || C.yellow;
  const box = [[x - 14, y - size * 0.85], [x + w + 18, y - size * 0.85], [x + w + 18, y + size * 0.85], [x - 14, y + size * 0.85], [x - 14, y - size * 0.85]];
  grp(p, () => { fillPts(box, col, 0.08); draw(box, { c: col, w: 3.5, rough: 1.2, seed: i }); });
  mtx(str, x, y, { size, c: col, al: 'left', p: p * 1.5, glow: 'rgba(246,221,122,0.35)' });
}
/** chalk line with a bit more wobble than tech lines */
const chalk = (pts, o = {}) => draw(pts, { rough: 1.1, w: 3.5, ...o });

// ---------------------------------------------------------------- the equation strip (top, full width)
const EQY = 222;   // baseline of the equation in the strip
/** faint chalk frame of the strip (y 140..300) */
function eqStrip(p = 1) {
  if (p <= 0) return;
  grp(clamp(p * 2) * 0.9, () => {
    fillPts([[60, 140], [1860, 140], [1860, 300], [60, 300]], 'rgba(0,0,0,0.12)');
    chalk([[60, 300], [1860, 302]], { c: C.ink, w: 2, a: 0.3, p, seed: 4 });
  });
}
/** A chemical equation, centred at (cx, y).
 *  spec: {l: ['Cu', 'HNO3'], r: ['Cu(NO3)2', 'NO↑', 'H2O'], k: [3, 8, 3, 2, 4] (one per species; 1 is hidden;
 *         null / '' -> blank box □ when o.blank), arrow: '=' | '⇌' | '→', above: '△' | '点燃' | '催化剂', below: ''}
 *  o: {size (default 54), c, p (reveal 0..1), coefC (default yellow), pop: [coefficient pop 0..1 per species],
 *      dim: [alpha per species], blank: true, showOne: false}
 *  Returns layout {items: [{x0, x1, xc, fx0, kx (coefficient centre), f, size}], arrow: [x0, x1], y} — eqX(item, 'N') points at an element. */
function equation(spec, cx, y, o = {}) {
  const size = o.size || 54, gap = size * 0.5, plusW = mwidth('+', size), coefC = o.coefC || C.yellow;
  const all = [...spec.l, ...spec.r], nl = spec.l.length;
  const ks = all.map((_, i) => (spec.k ? spec.k[i] : null));
  const coefStr = k => (k === null || k === undefined || k === '' ? (o.blank ? '□' : '') : (String(k) === '1' && !o.showOne ? '' : String(k)));
  const condW = Math.max(mwidth(spec.above || '', size * 0.5), mwidth(spec.below || '', size * 0.5));
  const arrowW = Math.max(size * 1.6, condW + size * 0.6);
  const wItem = (f, i) => { const cs = coefStr(ks[i]); return (cs ? mwidth(cs, size, MF, false, true) + size * 0.08 : 0) + mwidth(f, size); };
  let total = 0;
  all.forEach((f, i) => { total += wItem(f, i); if (i !== nl - 1 && i !== all.length - 1) total += plusW + 2 * gap; });
  total += arrowW + 2 * gap;
  let x = cx - total / 2;
  const items = [], P = o.p === undefined ? 1 : o.p;
  const reveal = i => clamp(P * (all.length + 1) - i);
  let arrowSpan = null;
  all.forEach((f, i) => {
    const cs = coefStr(ks[i]), a = (o.dim ? o.dim[i] : 1) * clamp(reveal(i) * 2);
    const cw = cs ? mwidth(cs, size, MF, false, true) + size * 0.08 : 0;
    const it = { x0: x, fx0: x + cw, x1: x + wItem(f, i), f, size, y, kx: x + (cw ? (cw - size * 0.08) / 2 : -size * 0.3) };
    it.xc = (it.x0 + it.x1) / 2;
    if (a > 0) {
      if (cs) {
        const pop = o.pop ? o.pop[i] : undefined, blank = cs === '□';
        mtx(cs, x + (cw - size * 0.08) / 2, y, { size, c: blank ? C.gray : coefC, a, pop: pop === undefined ? undefined : pop, plain: true });
      }
      mtx(f, it.fx0, y, { size, c: o.c || C.ink, al: 'left', a });
    }
    items.push(it);
    x = it.x1;
    if (i === nl - 1) {
      const ap = clamp(reveal(nl) * 2);
      const ax0 = x + gap, ax1 = x + gap + arrowW;
      if (ap > 0) {
        const t = spec.arrow || '=';
        if (t === '⇌') {
          arrow2([ax0, y - 7], [ax1, y - 7], ap, 1); arrow2([ax1, y + 7], [ax0, y + 7], ap, -1);
        } else if (t === '→') {
          arrow([[ax0, y], [ax1, y]], { w: 3.5, head: 14, rough: 0.6, p: ap });
        } else {
          chalk([[ax0, y - 7], [ax1, y - 7]], { p: ap, w: 3.5, seed: 1 }); chalk([[ax0, y + 7], [ax1, y + 7]], { p: ap, w: 3.5, seed: 2 });
        }
        if (spec.above) mtx(spec.above, (ax0 + ax1) / 2, y - size * 0.62, { size: size * 0.5, c: C.ink, a: ap });
        if (spec.below) mtx(spec.below, (ax0 + ax1) / 2, y + size * 0.62, { size: size * 0.5, c: C.ink, a: ap });
      }
      arrowSpan = [ax0, ax1];
      x = ax1 + gap;
    } else if (i !== all.length - 1) {
      if (a > 0) mtx('+', x + gap + plusW / 2, y, { size, a });
      x += plusW + 2 * gap;
    }
  });
  return { items, arrow: arrowSpan, y, size };
}
/** half-arrow (reversible ⇌): a line with a one-sided barb */
function arrow2(a, b, p, side) {
  const e = chalk([a, b], { p, w: 3.5 });
  if (e && p > 0.95) { const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); chalk([[b[0] - Math.cos(ang) * 16 + Math.sin(ang) * 10 * -side, b[1] - Math.sin(ang) * 16 - Math.cos(ang) * 10 * -side], b], { w: 3.5 }); }
}
/** x centre of the n-th occurrence of `sub` inside a drawn formula item (from equation().items) */
function eqX(it, sub, n = 0) {
  let idx = -1;
  for (let k = 0; k <= n; k++) idx = it.f.indexOf(sub, idx + 1);
  if (idx < 0) return it.xc;
  const a = mwidth(it.f.slice(0, idx), it.size), b = mwidth(it.f.slice(0, idx + sub.length), it.size);
  return it.fx0 + (a + b) / 2;
}
/** oxidation state written above (side -1) or below (side 1) an element at x: "+5", "0", "−2" */
function valence(x, y, str, p, col = C.ink, side = -1) {
  if (p <= 0) return;
  mtx(str, x, y + side * 54, { size: 30, c: col, pop: p, plain: true });
}
/** 双线桥 / 单线桥: a chalk bracket from element a to element b (points [x, y] at the formula's edge), bulging to
 *  side (-1 above, 1 below) by h px, arrow at b, label in the middle ("失去 3×2e^-"). Returns the path for eFlow(). */
function bridge(a, b, label, p, o = {}) {
  const side = o.side || -1, h = o.h || 60, col = o.c || C.blue;
  const pts = [a, [a[0], a[1] + side * h], [b[0], b[1] + side * h], b];
  if (p > 0) {
    arrow(pts, { c: col, w: 3.5, head: 14, rough: 0.5, p });
    if (label) {
      const lx = (a[0] + b[0]) / 2, ly = a[1] + side * h + side * 26;
      mtx(label, lx, ly, { size: o.size || 30, c: col, pop: clamp(p * 2 - 1) });
    }
  }
  return pts;
}
/** electrons running along a path (bridge) while a > 0: "电子从这里转移到那里" */
function eFlow(path, a = 1, o = {}) {
  if (a <= 0.01) return;
  const n = o.n || 4, sp = o.speed || 0.35;
  for (let k = 0; k < n; k++) {
    const u = ((k / n + NOW * sp) % 1 + 1) % 1, q = along(path, u);
    grp(a * Math.sin(PI * u), () => {
      fillPts(ellPts(q.x, q.y, 11, 11), o.c || C.yellow, 0.9);
      txt('−', q.x, q.y - 1, { size: 22, f: MF, c: THEME.cardSolid });
    });
  }
}

// ---------------------------------------------------------------- conservation & bookkeeping
/** atom tally for "原子守恒": rows [{el: 'N', l: 8, r: 8}], values may be animated (non-integers are rounded for
 *  display). Left bars grow to the left (reactants), right bars to the right (products); ✓ when equal.
 *  (x, y) = centre top. o: {u: px per atom (default 14), rh: row height, p, hi: element to highlight, max: largest count} */
function tally(x, y, rows, o = {}) {
  const u = o.u || 14, rh = o.rh || 56, p = o.p === undefined ? 1 : o.p;
  if (p <= 0) return;
  const maxBar = (o.max || Math.max(...rows.map(r => Math.max(r.l, r.r)))) * u;   // ✓ column sits right of the longest bar
  grp(clamp(p * 2), () => {
    txt('反应物', x - 150, y, { size: 26, c: C.gray }); txt('生成物', x + 150, y, { size: 26, c: C.gray });
    chalk([[x, y + 22], [x, y + 30 + rows.length * rh]], { c: C.gray, w: 2, a: 0.6 });
    rows.forEach((r, i) => {
      const yy = y + 56 + i * rh, L = Math.max(0, r.l) * u * p, R = Math.max(0, r.r) * u * p, ok = Math.abs(r.l - r.r) < 1e-6;
      if (o.hi === r.el) fillPts([[x - maxBar - 90, yy - rh / 2 + 4], [x + maxBar + 140, yy - rh / 2 + 4], [x + maxBar + 140, yy + rh / 2 - 4], [x - maxBar - 90, yy + rh / 2 - 4]], C.yellow, 0.10);
      if (L > 0.5) fillPts([[x - 30, yy - 12], [x - 30 - L, yy - 12], [x - 30 - L, yy + 12], [x - 30, yy + 12]], C.blue, 0.55);
      if (R > 0.5) fillPts([[x + 30, yy - 12], [x + 30 + R, yy - 12], [x + 30 + R, yy + 12], [x + 30, yy + 12]], C.red, 0.55);
      txt(r.el, x, yy, { size: 30, f: MF, c: C.ink });
      txt(String(Math.round(r.l)), x - 44 - L, yy, { size: 28, f: MF, c: C.blue, al: 'right' });
      txt(String(Math.round(r.r)), x + 44 + R, yy, { size: 28, f: MF, c: C.red, al: 'left' });
      if (o.mark !== false) txt(ok ? '✓' : '≠', x + 30 + maxBar + 90, yy, { size: 30, c: ok ? C.green : C.red });
    });
  });
}
/** "以物质的量为中心" map: n in the middle, m / N / V / c around it, edges labelled ÷M ×N_A ×V_m ×V.
 *  o: {r: spoke length, vals: {m: '19.2 g', n: '0.3 mol', ...}, hi: [['m', 'n', progress], ['n', 'V', progress]],
 *      only: ['m', 'n', 'V'] (nodes to draw), p}. Returns node positions {n, m, N, V, c}. */
function molMap(cx, cy, o = {}) {
  const R = o.r || 190, p = o.p === undefined ? 1 : o.p;
  const pos = { n: [cx, cy], m: [cx - R, cy], V: [cx + R, cy], N: [cx, cy - R * 0.72], c: [cx, cy + R * 0.72] };
  const names = { n: 'n', m: 'm', V: 'V(气)', N: 'N', c: 'c' };
  const edge = { m: ['×M', '÷M'], V: ['×V_m', '÷V_m'], N: ['×N_A', '÷N_A'], c: ['÷V', '×V'] };
  const nodes = o.only || ['n', 'm', 'V', 'N', 'c'];
  if (p <= 0) return pos;
  grp(clamp(p * 2), () => {
    nodes.filter(k => k !== 'n').forEach(k => {
      const a = pos.n, b = pos[k], d = vunit(vsub(b, a));
      chalk([vadd(a, vmul(d, 62)), vsub(b, vmul(d, 52))], { c: C.gray, w: 2.5, a: 0.7, seed: k.length });
      const m = mid(a, b), nrm = [-d[1], d[0]];
      mtx(edge[k][0], m[0] + nrm[0] * 22, m[1] + nrm[1] * 22 - (Math.abs(d[0]) > 0.5 ? 6 : 0), { size: 24, c: C.purple });
    });
    nodes.forEach(k => {
      const [x, y] = pos[k], r = k === 'n' ? 62 : 52;
      fillPts(ellPts(x, y, r, r), THEME.cardSolid);
      circ(x, y, r, { c: k === 'n' ? C.orange : C.ink, w: 3.5, seed: x * 0.1 });
      mtx(names[k], x, y - (o.vals && o.vals[k] ? 14 : 0), { size: k === 'n' ? 38 : 32, c: k === 'n' ? C.orange : C.ink });
      if (o.vals && o.vals[k]) mtx(o.vals[k], x, y + 20, { size: 24, c: C.yellow });
    });
  });
  (o.hi || []).forEach(([a, b, e]) => {
    if (e <= 0) return;
    const A = pos[a], B = pos[b], d = vunit(vsub(B, A));
    const s = vadd(A, vmul(d, a === 'n' ? 64 : 54)), t = vsub(B, vmul(d, b === 'n' ? 64 : 54));
    arrow([s, t], { c: C.yellow, w: 6, head: 18, rough: 0.5, p: e });
    if (e < 1) { const q = mix2(s, t, eio(e)); fillPts(ellPts(q[0], q[1], 9, 9), C.yellow, 1); }
  });
  return pos;
}
/** 三段式 table. o: {cols: ['2SO2', 'O2', '2SO3'], rows: ['起始', '转化', '平衡'], unit: 'n/mol',
 *  cells: [[...], [...], [...]] strings, rev: (r, c) => 0..1 reveal, cw (col width), rh, hi: [r, c] cell to glow}.
 *  Returns cell(r, c) -> [x, y] centre (r = -1 is the header row). */
function iceTable(x, y, o) {
  const cw = o.cw || 170, rh = o.rh || 66, lw = o.lw || 150, nc = o.cols.length, nr = o.rows.length;
  const cell = (r, c) => [x + lw + cw * (c + 0.5), y + rh * (r + 1.5)];
  const p = o.p === undefined ? 1 : o.p;
  if (p <= 0) return cell;
  grp(clamp(p * 2), () => {
    const x1 = x + lw + cw * nc, y1 = y + rh * (nr + 1);
    chalk([[x, y + rh], [x1, y + rh]], { c: C.ink, w: 3, p, seed: 1 });
    chalk([[x + lw, y], [x + lw, y1]], { c: C.ink, w: 3, p, seed: 2 });
    for (let r = 1; r < nr; r++) chalk([[x + 10, y + rh * (r + 1)], [x1, y + rh * (r + 1)]], { c: C.gray, w: 1.5, a: 0.4, seed: r + 5 });
    if (o.unit) mtx(o.unit, x + lw / 2, y + rh / 2, { size: 24, c: C.gray });
    o.cols.forEach((f, c) => mtx(f, ...cell(-1, c), { size: 34 }));
    o.rows.forEach((n, r) => txt(n, x + lw / 2, cell(r, 0)[1], { size: 30, c: C.gray }));
  });
  if (o.hi) { const [hx, hy] = cell(o.hi[0], o.hi[1]); fillPts([[hx - cw / 2 + 6, hy - rh / 2 + 6], [hx + cw / 2 - 6, hy - rh / 2 + 6], [hx + cw / 2 - 6, hy + rh / 2 - 6], [hx - cw / 2 + 6, hy + rh / 2 - 6]], C.yellow, 0.15 * (o.hiA === undefined ? 1 : o.hiA)); }
  (o.cells || []).forEach((row, r) => row.forEach((s, c) => {
    const e = o.rev ? o.rev(r, c) : 1;
    if (s && e > 0) mtx(s, ...cell(r, c), { size: 32, c: (o.colors && o.colors[r]) || C.ink, pop: e });
  }));
  return cell;
}

// ---------------------------------------------------------------- particles: molecules, beakers, bubbles
/** chalk-pastel CPK colours */
const ATOM = { H: '#eef0ea', O: '#f49a8c', N: '#9fd0f2', C: '#9aa79f', S: '#f6dd7a', Cl: '#b6e39f', Cu: '#e7a46b', Na: '#cdb6f2', Fe: '#d9a27a' };
const ATOM_R = { H: 0.62, O: 0.9, N: 0.92, C: 0.95, S: 1.05, Cl: 1.05, Cu: 1.1, Na: 1.1, Fe: 1.1 };
/** ball molecules: atoms as [element, dx, dy] in units of the base radius */
const MOLS = {
  H2: [['H', -0.55, 0], ['H', 0.55, 0]], O2: [['O', -0.7, 0], ['O', 0.7, 0]], N2: [['N', -0.7, 0], ['N', 0.7, 0]],
  Cl2: [['Cl', -0.8, 0], ['Cl', 0.8, 0]], HCl: [['H', -0.75, 0], ['Cl', 0.45, 0]], NO: [['N', -0.65, 0], ['O', 0.65, 0]],
  H2O: [['O', 0, 0], ['H', -0.85, 0.55], ['H', 0.85, 0.55]], CO2: [['C', 0, 0], ['O', -1.25, 0], ['O', 1.25, 0]],
  SO2: [['S', 0, 0], ['O', -1.0, 0.65], ['O', 1.0, 0.65]], NO2: [['N', 0, 0], ['O', -0.95, 0.6], ['O', 0.95, 0.6]],
  SO3: [['S', 0, 0], ['O', 0, -1.2], ['O', -1.05, 0.65], ['O', 1.05, 0.65]],
  NH3: [['N', 0, -0.15], ['H', -0.85, 0.5], ['H', 0.85, 0.5], ['H', 0, 0.85]],
  CH4: [['C', 0, 0], ['H', -0.85, -0.6], ['H', 0.85, -0.6], ['H', -0.85, 0.6], ['H', 0.85, 0.6]],
  HNO3: [['N', 0, 0], ['O', 0, -1.15], ['O', -1.0, 0.65], ['O', 1.0, 0.65], ['H', 1.75, 0.95]],
  Cu: [['Cu', 0, 0]], Fe: [['Fe', 0, 0]], Na: [['Na', 0, 0]],
};
/** draw a ball molecule at (x, y). o: {r: base radius px (default 14), rot, a, k: pop scale, label} */
function molecule(x, y, name, o = {}) {
  const atoms = MOLS[name]; if (!atoms) throw new Error(`chem.js: no molecule preset '${name}' (add it to MOLS)`);
  const r = o.r || 14, rot = o.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot), k = o.k === undefined ? 1 : o.k;
  if (k <= 0.01) return;
  scaleAt(x, y, k, () => grp(o.a === undefined ? 1 : o.a, () => {
    const pts = atoms.map(([el, dx, dy]) => [el, x + (dx * cs - dy * sn) * r, y + (dx * sn + dy * cs) * r]);
    pts.sort((a, b) => (ATOM_R[a[0]] || 1) - (ATOM_R[b[0]] || 1)).reverse();
    pts.forEach(([el, px, py]) => {
      const rr = r * (ATOM_R[el] || 1);
      fillPts(ellPts(px, py, rr, rr, 0, TAU, 24), ATOM[el] || C.gray, 0.88);
      draw(ellPts(px, py, rr, rr, 0, TAU, 24), { c: THEME.cardSolid, w: 2, rough: 0.2, single: true, a: 0.7 });
      fillPts(ellPts(px - rr * 0.3, py - rr * 0.3, rr * 0.25, rr * 0.25, 0, TAU, 12), '#ffffff', 0.35);
    });
    if (o.label) mtx(o.label, x, y + r * 2.2, { size: 22, c: C.gray });
  }));
}
/** molecules wandering in a box (deterministic). groups: [{name: 'SO2', n: 8}, ...]; molecule #i of a group keeps
 *  its identity when n changes, so converting molecules just disappear from one group and appear in another.
 *  box = [x0, y0, x1, y1]. o: {r, speed, flash: {name: 0..1} pop new ones} */
function particles(box, groups, o = {}) {
  const [x0, y0, x1, y1] = box, pad = (o.r || 14) * 2, sp = o.speed === undefined ? 0.06 : o.speed;
  const tri = u => { const f = ((u % 2) + 2) % 2; return f < 1 ? f : 2 - f; };   // bounce 0..1..0
  groups.forEach((g, gi) => {
    const n = Math.round(g.n);
    for (let i = 0; i < n; i++) {
      const s = gi * 101 + i * 7.3;
      const u = tri(hash(s) * 2 + NOW * sp * (0.6 + hash(s + 1))), v = tri(hash(s + 2) * 2 + NOW * sp * (0.6 + hash(s + 3)));
      molecule(lerp(x0 + pad, x1 - pad, u), lerp(y0 + pad, y1 - pad, v), g.name, { r: o.r || 14, rot: hash(s + 4) * TAU + NOW * 0.5 * (hash(s + 5) - 0.5) });
    }
  });
}
/** beaker: (x, y) = bottom centre. o: {w, h, level 0..1, c: liquid colour, label, p} */
function beaker(x, y, o = {}) {
  const w = o.w || 220, h = o.h || 260, p = o.p === undefined ? 1 : o.p, lv = o.level === undefined ? 0.55 : o.level;
  if (p <= 0) return;
  const L = x - w / 2, R = x + w / 2, top = y - h;
  if (lv > 0) fillPts([[L + 4, y - 4], [R - 4, y - 4], [R - 4, y - h * lv], [L + 4, y - h * lv]], o.c || C.blue, 0.28 * clamp(p * 2));
  chalk([[L - 14, top], [L, top + 14], [L, y - 10], [L + 10, y], [R - 10, y], [R, y - 10], [R, top + 14], [R + 8, top]], { c: C.ink, w: 4, p });
  for (let k = 1; k <= 3; k++) chalk([[L, y - h * k / 4], [L + 26, y - h * k / 4]], { c: C.gray, w: 2, a: 0.6 * p });
  if (o.label) mtx(o.label, x, y + 34, { size: 28, c: C.gray, a: p });
}
/** rising bubbles in a column (gas being produced). a = intensity 0..1 */
function bubbles(x0, x1, yBottom, yTop, a = 1, o = {}) {
  if (a <= 0.01) return;
  const n = o.n || 10;
  for (let i = 0; i < n; i++) {
    const u = ((hash(i * 3.7) + NOW * (0.25 + hash(i) * 0.3)) % 1);
    const x = lerp(x0, x1, hash(i * 1.9)) + Math.sin(NOW * 3 + i) * 4, y = lerp(yBottom, yTop, u), r = 4 + hash(i * 5.1) * 6;
    grp(a * (1 - u * 0.6), () => circ(x, y, r, { c: o.c || C.ink, w: 2, rough: 0.2, single: true, over: 0 }));
  }
}

// ---------------------------------------------------------------- graphs (c-t, n-t, titration curves ...)
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const vmul = (a, k) => [a[0] * k, a[1] * k];
const vunit = a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
/** graph panel. o: {ox, oy (origin), w, h (px for the whole yr range), xr, yr, xl: 't/min', yl: 'c/(mol·L^{-1})',
 *  xt, yt: tick values}. Returns {S, draw(p), curve(f, x0, x1, o), area(f, x0, x1, col, a), cursor(x, f, col)} */
function graph(o) {
  const [xa, xb] = o.xr, [ya, yb] = o.yr;
  const Y = y => o.oy - (y / (yb - ya)) * o.h;
  const SS = ([x, y]) => [o.ox + (x - xa) / (xb - xa) * o.w, Y(y)];
  function drawG(p = 1) {
    if (p <= 0) return;
    const yTop = Y(yb);
    arrow([[o.ox, o.oy], [o.ox + o.w + 30, o.oy]], { w: 3, p, head: 13, rough: 0.6 });
    arrow([[o.ox, Math.max(Y(ya), o.oy)], [o.ox, yTop - 30]], { w: 3, p, head: 13, rough: 0.6 });
    grp(clamp(p * 2 - 1), () => {
      mtx(o.xl || 't', o.ox + o.w + 40, o.oy + 30, { size: 26, c: C.gray, al: 'left' });
      mtx(o.yl || 'c', o.ox + 12, yTop - 44, { size: 26, c: C.gray, al: 'left' });
      txt('O', o.ox - 20, o.oy + 22, { size: 26, f: MF, c: C.gray });
      (o.xt || []).forEach(x => { const [px] = SS([x, 0]); chalk([[px, o.oy - 6], [px, o.oy + 6]], { w: 2 }); mtx(String(x), px, o.oy + 26, { size: 24, c: C.gray, plain: true }); });
      (o.yt || []).forEach(y => { const py = Y(y); chalk([[o.ox - 6, py], [o.ox + 6, py]], { w: 2 }); mtx(String(y), o.ox - 14, py, { size: 24, c: C.gray, al: 'right', plain: true }); });
    });
  }
  const pts = (f, x0, x1, n = 80) => { const r = []; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; r.push(SS([x, f(x)])); } return r; };
  return {
    S: SS, draw: drawG,
    curve(f, x0, x1, co = {}) { if (x1 > x0) chalk(pts(f, x0, x1), { c: co.c || C.red, w: co.w || 4, dash: co.dash, rough: 0.6 }); },
    area(f, x0, x1, col = C.red, a = 0.18) { if (x1 > x0) fillPts([SS([x0, 0]), ...pts(f, x0, x1), SS([x1, 0])], col, a); },
    cursor(x, f, col = C.yellow) { const q = SS([x, f(x)]); dot(q[0], q[1], col, 8); },
  };
}
