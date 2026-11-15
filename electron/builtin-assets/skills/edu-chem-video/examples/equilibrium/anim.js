/* EXAMPLE (chemical equilibrium): 三段式 — rate, equilibrium constant, conversion.
 * Shows: ⇌ equation strip, a molecule box whose molecules convert in the right ratio (each molecule = 0.5 mol),
 * the ICE table filled row by row (coefficients fly in from the equation), c-t curves, n -> c conversion,
 * substituting into the K expression, and a conversion bar.
 * Scenes: intro -> ice -> rate -> kc -> conv -> outro.
 */

const PROBLEM = {
  src: 'problem.png', srcW: 1500, srcH: 560,
  boxes: {
    vessel: [[80, 44, 441, 116]], init: [[567, 44, 1046, 116]], eq: [[126, 124, 722, 196]],
    eqm: [[756, 124, 1438, 196], [34, 204, 358, 276]],
    q1: [[34, 284, 894, 356]], q2: [[34, 364, 662, 436]], q3: [[34, 444, 482, 516]],
  },
};

const TAGS = {
  intro: ['01', '审题', 'Read the problem'],
  ice: ['02', '三段式', 'ICE table'],
  rate: ['03', '反应速率', 'Rate'],
  kc: ['04', '平衡常数', 'Equilibrium constant'],
  conv: ['05', '转化率', 'Conversion'],
  outro: ['06', '方法小结', 'Recap'],
};

// ---------------------------------------------------------------- the chemistry (checked in step 1)
const EQ = { l: ['SO2(g)', 'O2(g)'], r: ['SO3(g)'], k: [2, 1, 2], arrow: '⇌' };
const V = 2, N0 = [4, 2, 0], DN = [-2, -1, 2], NE = [2, 1, 2];          // mol
const CE = NE.map(n => n / V);                                            // 1, 0.5, 1 mol/L
const K = CE[2] ** 2 / (CE[0] ** 2 * CE[1]);                              // 2
const g = t => (t < 5 ? 1 - (1 - t / 5) ** 2 : 1);                       // progress of the reaction in time (reaches equilibrium at 5 min)
const cOf = (i, t) => N0[i] / V + DN[i] / V * g(t);

const eqDraw = (o = {}) => equation(EQ, 960, EQY, o);
const BOX = [90, 330, 580, 820];
/** molecule box: progress e (0 = start, 1 = equilibrium); each molecule stands for 0.5 mol */
function box(e, o = {}) {
  const [x0, y0, x1, y1] = o.box || BOX;
  fillPts([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 'rgba(0,0,0,0.12)');
  chalk([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], { c: C.ink, w: 3, a: 0.7 });
  txt('2 L', x1 - 34, y0 + 28, { size: 26, c: C.gray });
  particles([x0, y0, x1, y1], [
    { name: 'SO2', n: 8 - 4 * e }, { name: 'O2', n: 4 - 2 * e }, { name: 'SO3', n: 4 * e },
  ], { r: o.r || 15 });
  txt('每个分子 = 0.5 mol', (x0 + x1) / 2, y1 + 24, { size: 22, c: C.gray });
}

const SC = {};

SC.intro = (lt, S) => {
  const { P, at } = S;
  txt('化学平衡 · 三段式', 960, 150, { size: 62, p: P(0.2, 0.9) });
  txt('Rate, K and conversion from one ICE table', 960, 202, { size: 34, f: EN, c: C.yellow, p: P(0.6, 0.8) });
  problemCard(P(0.4, 0.7));
  const B = PROBLEM.boxes;
  hiBox(B.vessel, C.gray, at(0, 0.2), lt); hiBox(B.init, C.orange, at(0, 0.5), lt);
  hiBox(B.eq, C.yellow, at(1, 0.1), lt); hiBox(B.eqm, C.blue, at(2, 0.1), lt);
  hiBox(B.q1, C.green, at(3, 0.05), lt); hiBox(B.q2, C.green, at(3, 0.3), lt); hiBox(B.q3, C.green, at(3, 0.6), lt);
  chip('V = 2 L', 320, C.gray, P(at(0, 0.8), 0.5));
  chip('可逆 ⇌', 720, C.yellow, P(at(1, 0.6), 0.5));
  chip('平衡 SO₃ 2 mol', 1140, C.blue, P(at(2, 0.7), 0.5));
  chip('求 v · K · α', 1560, C.green, P(at(3, 0.8), 0.5));
};

// 02: the ICE table, with the molecule box reacting in the same ratio
SC.ice = (lt, S) => {
  const { P, at } = S;
  eqStrip(1);
  const L = eqDraw({ p: 0 });
  L.items.forEach((it, i) => glow([[it.x0 - 4, EQY], [it.x0 + 34, EQY]], C.yellow, bump(lt, at(2, 0.05 + i * 0.1), 1.2), 56));
  eqDraw();
  const e = P(at(2, 0.3), Math.max(1.5, S.dur(2) * 0.6));
  grp(P(at(1, 0.05), 0.5), () => box(e));
  const fly = c => eio(P(at(2, 0.25 + c * 0.12), 0.8));
  const cell = iceTable(650, 340, {
    cols: ['2SO2', 'O2', '2SO3'], rows: ['起始', '转化', '平衡'], unit: 'n/mol', cw: 210, lw: 140, rh: 78,
    cells: [['4', '2', '0'], ['2', '1', '2'], [P(at(3, 0.25), 0.6) < 1 ? '4 − 2' : '2', P(at(3, 0.4), 0.6) < 1 ? '2 − 1' : '1', P(at(3, 0.55), 0.6) < 1 ? '0 + 2' : '2']],
    rev: (r, c) => (r === 0 ? P(at(1, 0.2 + c * 0.2), 0.4) : r === 1 ? (fly(c) >= 1 ? 1 : 0) : P(at(3, 0.1 + c * 0.15), 0.4)),
    colors: [C.ink, C.yellow, C.green], p: P(at(0, 0.3), 1.0),
  });
  [0, 1, 2].forEach(c => { const f = fly(c); if (f > 0 && f < 1) flyText(String(EQ.k[c]), [L.items[c].kx, EQY], cell(1, c), f, { c: C.yellow }); });
  txt('转化量之比 = 系数比 2 : 1 : 2', 1005, 700, { size: 32, c: C.yellow, p: P(at(2, 0.7), 0.8) });
  txt('平衡 = 起始 − 转化（生成物：起始 + 转化）', 1005, 760, { size: 30, c: C.green, p: P(at(3, 0.7), 0.8) });
};

// 03: c-t curves grow; then Δc and Δt are drawn on the graph
SC.rate = (lt, S) => {
  const { P, at } = S;
  eqStrip(1); eqDraw();
  const G = graph({ ox: 150, oy: 790, w: 640, h: 400, xr: [0, 8], yr: [0, 2.2], xl: 't/min', yl: 'c/(mol·L^{-1})', xt: [5], yt: [0.5, 1, 1.5, 2] });
  G.draw(P(0.1, 0.8));
  const tp = 8 * P(at(0, 0.1), Math.max(1.5, S.dur(0) * 0.8));
  const cols = [C.blue, C.red, C.green], names = ['SO2', 'O2', 'SO3'];
  [0, 1, 2].forEach(i => {
    G.curve(t => cOf(i, t), 0, tp, { c: cols[i] });
    if (tp >= 8) { const q = G.S([8, cOf(i, 8)]); mtx(names[i], q[0] + 14, q[1] - (i === 0 ? 18 : i === 2 ? -18 : 0), { size: 28, c: cols[i], al: 'left' }); }
  });
  const d = P(at(1, 0.1), 0.8), dt = P(at(1, 0.35), 0.8);
  if (d > 0) {
    const a = G.S([5, 2]), b = G.S([5, 1]);
    chalk([G.S([0, 2]), a], { c: C.gray, dash: [8, 8], w: 2 });
    arrow([a, mix2(a, b, d)], { c: C.yellow, w: 4, head: 14 });
    mtx('Δc = 1', a[0] + 18, (a[1] + b[1]) / 2, { size: 30, c: C.yellow, al: 'left', pop: d });
  }
  if (dt > 0) {
    const a = G.S([0, 0.25]), b = G.S([5, 0.25]);
    arrow([a, mix2(a, b, dt)], { c: C.purple, w: 4, head: 14 });
    mtx('Δt = 5 min', (a[0] + b[0]) / 2, a[1] - 26, { size: 28, c: C.purple, pop: dt });
  }
  board(1);
  bm(0, 'c(SO2)：4/2 = 2 → 2/2 = 1 mol·L^{-1}', at(0, 0.3), lt, { size: 34 });
  bm(1, 'Δc(SO2) = 1 mol·L^{-1}', at(0, 0.7), lt, { c: C.yellow });
  bm(3, 'v(SO2) = Δc / Δt = 1 ÷ 5', at(1, 0.3), lt);
  const ve = P(at(1, 0.6), 0.8);
  if (ve > 0) bm(4, `       = ${countTo(0, 0.2, ve, 1)} mol·L^{-1}·min^{-1}`, at(1, 0.6), lt, { c: C.orange });
  bbox(6, '(1) 0.2 mol·L^{-1}·min^{-1}', at(1, 0.85), lt);
};

// 04: n -> c (divide by V), then the concentrations fly into the K expression
SC.kc = (lt, S) => {
  const { P, at } = S;
  eqStrip(1); eqDraw();
  const dv = P(at(0, 0.4), 1.0);
  const cell = iceTable(90, 330, {
    cols: ['SO2', 'O2', 'SO3'], rows: ['平衡 n', '平衡 c'], unit: '', cw: 160, lw: 160, rh: 70,
    cells: [NE.map(String), NE.map((n, i) => countTo(n, CE[i], dv, i === 1 ? 1 : 0))],
    rev: (r, c) => (r === 0 ? 1 : P(at(0, 0.3), 0.4)), colors: [C.ink, C.orange],
  });
  txt('÷ 2 L', 740, cell(1, 0)[1], { size: 30, c: C.purple, al: 'left', pop: P(at(0, 0.3), 0.5) });
  // K expression (fraction) and the substituted fraction
  const KX = 160, KY = 690;
  const kp = P(at(1, 0.05), 0.6);
  grp(kp, () => {
    mtx('K =', KX, KY, { size: 44, al: 'left' });
    mtx('c^2(SO3)', KX + 200, KY - 44, { size: 38 });
    chalk([[KX + 80, KY], [KX + 330, KY]], { w: 3 });
    mtx('c^2(SO2)·c(O2)', KX + 200, KY + 44, { size: 38 });
    mtx('=', KX + 370, KY, { size: 44 });
    chalk([[KX + 410, KY], [KX + 620, KY]], { w: 3 });
  });
  const tgt = [[KX + 515, KY - 44], [KX + 470, KY + 44], [KX + 580, KY + 44]];   // where 1^2 (SO3), 1^2 (SO2), 0.5 (O2) land
  const src = [cell(1, 2), cell(1, 0), cell(1, 1)], lab = ['1^2', '1^2 ×', '0.5'];
  lab.forEach((s, j) => {
    const e = eio(P(at(1, 0.25 + j * 0.2), 0.8));
    if (e > 0 && e < 1) flyText(s.replace('^2', '').replace(' ×', ''), src[j], tgt[j], e, { c: C.orange });
    if (e >= 1) mtx(s, ...tgt[j], { size: 38, c: C.orange });
  });
  // line 2: chalk sweeps under the whole expression while it is read, then the result counts up and gets ringed
  const sw = P(at(2, 0.05), Math.max(1.2, S.dur(2) * 0.5));
  if (sw > 0 && sw < 1) chalk([[KX, KY + 96], [lerp(KX, KX + 760, sw), KY + 96]], { c: C.yellow, w: 4 });
  const ke = P(at(2, 0.55), 1.2);
  if (ke > 0) mtx(`= ${countTo(0, K, ke, 0)}`, KX + 660, KY, { size: 54, c: C.yellow, al: 'left', pop: ke });
  if (ke > 0.5) circ(KX + 715, KY, 64, { c: C.yellow, w: 3.5, p: clamp(ke * 2 - 1), sq: 0.7 });
  board(1);
  bm(0, '平衡浓度 c = n / V：', at(0, 0.1), lt, { c: C.gray, size: 34 });
  bm(1, 'c(SO2) = 1，c(O2) = 0.5，c(SO3) = 1', at(1, 0.2), lt, { size: 34, c: C.orange });
  bm(3, 'K = c^2(SO3) / [c^2(SO2)·c(O2)]', at(2, 0.1), lt);
  bm(4, '  = 1^2 / (1^2 × 0.5) = 2', at(2, 0.45), lt, { c: C.yellow });
  bbox(6, '(2) K = 2', at(2, 0.8), lt);
  txt('K 用浓度，不是物质的量！', 1400, 820, { size: 30, c: C.red, p: P(at(0, 0.6), 0.8) });
};

// 05: conversion bar grows to half; the molecule box shows the equilibrium mixture
SC.conv = (lt, S) => {
  const { P, at } = S;
  eqStrip(1); eqDraw();
  box(1, { box: [90, 330, 580, 610], r: 13 });
  const b0 = [120, 730], W0 = 700;
  const bp = P(at(0, 0.2), 0.8), cp = P(at(0, 0.55), Math.max(1, S.dur(0) * 0.4));
  if (bp > 0) {
    chalk([b0, [b0[0] + W0 * bp, b0[1]], [b0[0] + W0 * bp, b0[1] + 60], [b0[0], b0[1] + 60], b0], { c: C.blue, w: 3 });
    mtx('起始 SO2 4 mol', b0[0], b0[1] - 30, { size: 28, c: C.blue, al: 'left', a: bp });
  }
  if (cp > 0) {
    fillPts([b0, [b0[0] + W0 * 0.5 * cp, b0[1]], [b0[0] + W0 * 0.5 * cp, b0[1] + 60], [b0[0], b0[1] + 60]], C.green, 0.5);
    mtx('转化 2 mol', b0[0] + W0 * 0.25, b0[1] + 92, { size: 28, c: C.green, pop: cp });
  }
  const pe = P(at(1, 0.4), 1.0);
  if (pe > 0) mtx(`α = ${countTo(0, 50, pe, 0)}%`, 640, 690, { size: 48, c: C.yellow, al: 'left', pop: pe });
  board(1);
  bm(0, '转化率 α = 转化量 / 起始量 × 100%', at(0, 0.1), lt, { size: 34 });
  bm(2, 'α(SO2) = 2 mol ÷ 4 mol', at(1, 0.1), lt);
  bm(3, '       = 50%', at(1, 0.45), lt, { c: C.yellow });
  bbox(5, '(3) α(SO2) = 50%', at(1, 0.75), lt);
  stamp(1600, 800, '答：50%', P(at(1, 0.85), 0.5), C.yellow, 44);
};

SC.outro = (lt, S) => {
  const { P, at } = S;
  const cards = [
    ['三段式', '起始 · 转化 · 平衡', 'ICE table', C.blue],
    ['系数比', '转化量之比', 'ratios', C.yellow],
    ['浓度', 'c = n / V', 'concentration', C.orange],
    ['K 与 α', '用平衡浓度', 'K & conversion', C.green],
  ];
  grp(1 - P(at(1), 0.5), () => {
    cards.forEach(([top, zh, en, col], i) => {
      const x = 330 + i * 420, y = 540, p = P(at(0, 0.05 + i * 0.2), 0.6);
      if (p <= 0) return;
      scaleAt(x, y, back(p), () => {
        const pts = [[x - 175, y - 150], [x + 175, y - 148], [x + 177, y + 150], [x - 175, y + 152], [x - 175, y - 150]];
        fillPts(pts, THEME.card); chalk(pts, { c: col, w: 4, seed: i });
        txt(top, x, y - 80, { size: 46, c: col }); txt(zh, x, y + 10, { size: 36 }); txt(en, x, y + 80, { size: 30, f: EN, c: C.gray });
      });
    });
    grp(P(0.2, 0.6), () => { eqStrip(1); eqDraw(); });
  });
  grp(P(at(1), 0.5), () => {
    puff(640, 580, 1.3 * back(P(at(1, 0.05), 0.6)), { wave: true });
    bubble(1200, 450, '0.2 · K = 2 · 50%', P(at(1, 0.2), 0.5), { size: 54, c: C.yellow });
    txt('三段式解平衡', 960, 170, { size: 72, pop: P(at(1, 0.4), 0.6) });
    txt('See you next time!', 960, 250, { size: 40, f: EN, c: C.yellow, pop: P(at(1, 0.6), 0.6) });
  });
};
