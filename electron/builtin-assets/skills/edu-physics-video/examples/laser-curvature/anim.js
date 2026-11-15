/* EXAMPLE (optics, competition level): 激光测曲率 — measuring a phone-battery bulge with a laser and a glass block.
 * Shows: light rays (ray/spot), refraction at a surface, small-angle approximations with "angles exaggerated",
 * a 3D effect explained with a front view of the screen (components of a displacement), and an arc/tangent argument.
 * Scenes: problem -> intro (apparatus) -> slab (lateral shift) -> snell -> arc (central angle, R) -> outro.
 * Ported from a standalone prototype, so it times things with q = S.cue / d = S.dur instead of S.at(k, f):
 * q(k) + d(k) * f  is exactly  S.at(k, f).
 */

const PROBLEM = {
  src: 'problem.png', srcW: 1298, srcH: 856,
  boxes: {   // per narration line of the "problem" scene (source-image pixels)
    arc: [[55, 95, 790, 235], [800, 55, 1295, 235]],
    glass: [[895, 305, 1275, 350], [55, 352, 285, 402], [470, 540, 990, 592]],
    spots: [[335, 352, 1275, 402], [55, 405, 1275, 525], [1015, 495, 1250, 775]],
    ask: [[55, 540, 470, 592], [55, 640, 710, 795]],
  },
};

// this screenshot is tall and the problem scene has no title/chips under it: let the card use more of the screen
Object.assign(FRAME, { y0: 110, y1: 880 });

const TAGS = {
  problem: ['00', '题目', 'The problem'],
  intro: ['01', '实验装置', 'The setup'],
  slab: ['02', '平行玻璃块的侧移', 'Lateral shift'],
  snell: ['03', '折射定律', "Snell's law"],
  arc: ['04', '圆心角与曲率半径', 'Central angle & radius'],
  outro: ['05', '小结', 'Recap'],
};
const SC = {};

// the problem card, one highlight per narration line as it is read
SC.problem = (lt, S) => {
  const { P, at } = S;
  const ta = 1 - P(at(0, 0.75), 0.6);
  grp(ta, () => {
    txt('激光测曲率 · 手机屏幕鼓包检测', 960, 400, { size: 90, p: P(0.2, 1.1) });
    txt('Measuring a bulge with a laser', 960, 500, { size: 50, f: EN, c: C.blue, p: P(0.9, 0.8) });
    ray([[360, 580], [1560, 580]], P(1.2, 1.0), { w: 4 });
    spot(1560, 580, P(2.1, 0.3));
  });
  problemCard(P(at(0, 0.7), 0.6));
  const B = PROBLEM.boxes;
  hiBox(B.arc, C.yellow, at(1, 0.05), lt);
  hiBox(B.glass, C.blue, at(2, 0.05), lt);
  hiBox(B.spots, C.red, at(3, 0.05), lt);
  hiBox(B.ask, C.green, at(4, 0.05), lt);
};

const AP = { beamY: 430, cx: 760, R: 1400, py: 452, screenX: 1300 };
AP.cy = AP.py + AP.R;
const arcY = x => AP.cy - Math.sqrt(AP.R * AP.R - (x - AP.cx) ** 2);
const arcAng = x => Math.asin((x - AP.cx) / AP.R);   // tangent slope angle (screen coords: + means descending to the right)
SC.intro = (lt, S) => {
  const q = S.cue, d = S.dur, P = (a, dd) => clamp((lt - a) / dd);
  const ap = P(0.1, 1.2);
  // laser box
  tech([[110, 405], [280, 405], [280, 455], [110, 455], [110, 405]], { c: C.ink, w: 3, p: ap });
  tech([[280, 418], [300, 418], [300, 442], [280, 442]], { c: C.ink, w: 3, p: ap });
  txt('激光器 laser', 195, 500, { size: 30, c: C.gray, p: ap * 2 - 1 });
  // arch
  const arcPts = []; for (let x = 420; x <= 1100; x += 10) arcPts.push([x, arcY(x)]);
  tech(arcPts, { c: C.ink, w: 4, p: ap });
  for (let x = 430; x <= 1090; x += 26) tech([[x, arcY(x) + 4], [x - 16, arcY(x) + 22]], { c: C.gray, w: 1.5, a: 0.6 * ap });
  txt('圆柱拱 arch', 760, 560, { size: 30, c: C.gray, p: ap * 2 - 1 });
  const XA = 520, XB = 1000;
  [['A', XA], ['P', AP.cx], ['B', XB]].forEach(([s, x], i) => {
    const y = arcY(x); dot2(x, y, 5, ap);
    txt(s, x + (i === 1 ? 0 : 0), y + 34, { size: 36, f: MF, c: C.ink, p: ap * 2 - 1 });
  });
  // screen
  tech([[AP.screenX, 260], [AP.screenX, 610]], { c: C.ink, w: 7, p: ap });
  txt('屏幕 screen', AP.screenX, 645, { size: 30, c: C.gray, p: ap * 2 - 1 });
  // beam
  const bp = P(q(0) + 0.2, 1.2);
  const blk = P(q(1), 0.5);
  const toB = eio(P(q(1) + d(1) * 0.5, 1.0));
  const bx = lerp(XA, XB, toB);
  const shift = blk * lerp(-14, 16, toB);
  if (blk > 0) glassBlock(bx, arcY(bx), 210, 64, arcAng(bx), blk);
  const inX = bx - 105, outX = bx + 105;
  const beam = blk > 0 ? [[300, AP.beamY], [inX, AP.beamY], [outX, AP.beamY + shift], [AP.screenX, AP.beamY + shift]] : [[300, AP.beamY], [AP.screenX, AP.beamY]];
  ray(beam, bp);
  if (bp >= 1) spot(AP.screenX, AP.beamY + shift, 1);
  txt('O', AP.screenX + 26, AP.beamY - 26, { size: 34, f: MF, c: C.ink, p: P(q(0) + 1.2, 0.4) });
  // inset: screen view
  const ip = P(q(1) + 0.2, 0.8);
  if (ip > 0) {
    grp(ip, () => {
      ctx.save(); ctx.fillStyle = THEME.card; ctx.fillRect(1420, 210, 420, 420); ctx.restore();
      tech([[1420, 210], [1840, 210], [1840, 630], [1420, 630], [1420, 210]], { c: C.ink, w: 3 });
      tech([[1630, 220], [1630, 620]], { c: C.gray, dash: [8, 8], w: 2 });
      tech([[1430, 420], [1830, 420]], { c: C.gray, dash: [8, 8], w: 2 });
      txt('屏幕正视图 screen view', 1630, 190, { size: 26, c: C.gray });
      txt('O', 1612, 446, { size: 30, f: MF });
      const A2 = [1630 - 110 * Math.sin(0.44), 420 - 110 * Math.cos(0.44)], B2 = [1630 + 130 * Math.sin(0.61), 420 + 130 * Math.cos(0.61)];
      const cur = [lerp(A2[0], B2[0], toB), lerp(A2[1], B2[1], toB)];
      if (toB < 1) { tech([[1630, 420], A2], { c: C.red, dash: [6, 6], w: 2, a: 1 - toB }); mtx('d_A', 1560, 360, { size: 30, c: C.red, a: 1 - toB }); arcMark(1630, 420, 46, -PI / 2 - 0.44, -PI / 2, 'θ_A', 1 - toB, C.yellow, 76); }
      if (toB > 0) { tech([[1630, 420], B2], { c: C.red, dash: [6, 6], w: 2, a: toB }); mtx('d_B', 1720, 500, { size: 30, c: C.red, a: toB }); arcMark(1630, 420, 46, PI / 2 - 0.61, PI / 2, 'θ_B', toB, C.yellow, 76); }
      spot(cur[0], cur[1], 1);
      dot2(1630, 420, 4, 1);
    });
  }
};
function dot2(x, y, r, a = 1, col = C.ink) { if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore(); }

SC.slab = (lt, S) => {
  const q = S.cue, d = S.dur, P = (a, dd) => clamp((lt - a) / dd);
  board(1);
  ctx.save(); ctx.translate(-110, 0);   // this figure is wide: keep it left of the board (x < 930)
  const x0 = 400, x1 = 640, E = [400, 400], i = 32 * PI / 180, r = 19 * PI / 180;
  const gp = P(0.2, 0.9);
  fillPts([[x0, 190], [x1, 190], [x1, 770], [x0, 770]], 'rgba(108,200,255,0.12)', gp);
  tech([[x0, 190], [x0, 770]], { c: C.blue, w: 4, p: gp }); tech([[x1, 190], [x1, 770]], { c: C.blue, w: 4, p: gp });
  mtx('n_1', 230, 640, { size: 40, c: C.gray, p: gp }); mtx('n_2', 520, 700, { size: 40, c: C.blue, p: gp }); mtx('n_1', 820, 300, { size: 40, c: C.gray, p: gp });
  dimLine(x0, 165, x1, 165, 's', P(0.8, 0.6), { off: -28 });
  const u = [Math.cos(i), Math.sin(i)];
  const start = [E[0] - 280, E[1] - 280 * Math.tan(i)], X = [x1, E[1] + (x1 - x0) * Math.tan(r)], end = [X[0] + 300, X[1] + 300 * Math.tan(i)];
  const t0 = q(0), d0 = d(0);
  const lp = P(t0 + 0.3, d0 * 0.6);
  ray([start, E, X, end], lp);
  tech([[E[0] - 110, E[1]], [E[0] + 130, E[1]]], { c: C.gray, dash: [8, 8], w: 2, p: P(t0 + 0.8, 0.5) });
  txt('法线 normal', E[0] - 110, E[1] + 26, { size: 24, c: C.gray, al: 'left', p: P(t0 + 1.0, 0.5) });
  // parallel marks
  const pm = P(t0 + d0 * 0.7, 0.5);
  if (pm > 0) [[start, E], [X, end]].forEach(([a, b]) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    for (let k = 0; k < 2; k++) tech([[mx - 10 + k * 10 - 5, my - 14 + k * 0], [mx + 5 + k * 10 - 5, my + 12]], { c: C.yellow, w: 3, a: pm });
  });
  txt('出射 ∥ 入射', 880, 760, { size: 32, c: C.yellow, pop: pm });
  // extended incident + delta
  const t1 = q(1), d1 = d(1);
  const ext = [E[0] + 530, E[1] + 530 * Math.tan(i)];
  tech([E, ext], { c: C.red, dash: [10, 10], w: 2.5, a: 0.7, p: P(t1 + 0.1, 0.8) });
  arcMark(E[0], E[1], 110, r, i, 'δ', P(t1 + d1 * 0.3, 0.6), C.yellow, 150);
  mtx('L ≈ s', (E[0] + X[0]) / 2 + 40, (E[1] + X[1]) / 2 + 70, { size: 32, c: C.blue, pop: P(t1 + d1 * 0.5, 0.5) });
  // lateral shift d
  const t2 = q(2), d2 = d(2);
  const Xt = [X[0] + u[0] * 150, X[1] + u[1] * 150];
  const w2 = [X[0] - E[0], X[1] - E[1]], tt = w2[0] * u[0] + w2[1] * u[1];
  const F = [E[0] + u[0] * (tt + 150), E[1] + u[1] * (tt + 150)];
  dimLine(Xt[0], Xt[1], F[0], F[1], 'd ≈ s·δ', P(t1 + d1 * 0.75, 0.6), { off: -95 });
  // line 2: the shift is carried unchanged along the parallel rays all the way to the screen
  const cs = eio(P(t2 + 0.2, Math.max(1.2, d2 * 0.6)));
  if (cs > 0) fillPts([Xt, F, [F[0] + u[0] * 230 * cs, F[1] + u[1] * 230 * cs], [Xt[0] + u[0] * 230 * cs, Xt[1] + u[1] * 230 * cs]], C.yellow, 0.25);
  if (cs > 0) slideSeg(Xt, F, [Xt[0] + u[0] * 230, Xt[1] + u[1] * 230], [F[0] + u[0] * 230, F[1] + u[1] * 230], cs, { c: C.yellow, w: 5 });
  ctx.restore();
  notToScale(P(1, 0.8));
  bm(0, '平行玻璃块 ⇒ 出射光 ∥ 入射光', t0 + d0 * 0.45, lt);
  bm(1, '玻璃内光程 L = s / cos r ≈ s', t1 + 0.2, lt);
  bm(2, '侧移 d = L·sin δ ≈ s·δ', t1 + d1 * 0.6, lt, { c: C.blue });
  bm(3, '屏上偏移 = 侧移', t2 + 0.2, lt);
  bbox(5, '(1)  δ_A = d_A / s', t2 + d2 * 0.55, lt, { size: 46 });
};

SC.snell = (lt, S) => {
  const q = S.cue, d = S.dur, P = (a, dd) => clamp((lt - a) / dd);
  board(1);
  const E = [520, 470], i = 38 * PI / 180, r = 22 * PI / 180;
  const gp = P(0.2, 0.9);
  fillPts([[520, 180], [900, 180], [900, 780], [520, 780]], 'rgba(108,200,255,0.12)', gp);
  tech([[520, 180], [520, 780]], { c: C.blue, w: 4, p: gp });
  mtx('n_1  (空气 air)', 250, 700, { size: 36, c: C.gray, p: gp });
  mtx('n_2  (玻璃 glass)', 700, 260, { size: 36, c: C.blue, p: gp });
  tech([[250, E[1]], [860, E[1]]], { c: C.gray, dash: [8, 8], w: 2, p: P(0.6, 0.6) });
  const start = [E[0] - 300 * Math.cos(i), E[1] - 300 * Math.sin(i)], end = [E[0] + 320 * Math.cos(r), E[1] + 320 * Math.sin(r)];
  const t0 = q(0), d0 = d(0);
  ray([start, E, end], P(t0 + 0.2, Math.max(1.4, d0 * 0.6)));
  // line 2: the angle of incidence i fills in as the answer for i_A is read
  const ip = P(q(2) + 0.2, Math.max(1.2, d(2) * 0.7));
  if (ip > 0) fillPts([E, ...ellPts(E[0], E[1], 90, 90, PI, PI + i * eio(ip), 24)], C.yellow, 0.35);
  arcMark(E[0], E[1], 90, PI, PI + i, 'i', P(t0 + d0 * 0.3, 0.5), C.yellow, 125);
  arcMark(E[0], E[1], 100, 0, r, 'r', P(t0 + d0 * 0.45, 0.5), C.blue, 135);
  const t1 = q(1), d1 = d(1);
  tech([E, [E[0] + 340 * Math.cos(i), E[1] + 340 * Math.sin(i)]], { c: C.red, dash: [10, 10], w: 2.5, a: 0.7, p: P(t1 + 0.1, 0.6) });
  arcMark(E[0], E[1], 190, r, i, 'δ = i − r', P(t1 + d1 * 0.2, 0.6), C.yellow, 250);
  notToScale(P(1, 0.8));
  bm(0, 'n_1 sin i = n_2 sin r', t0 + 0.4, lt);
  bm(1, '小角度：n_1 i = n_2 r', t0 + d0 * 0.6, lt, { c: C.blue });
  bm(2, 'δ = i − r = i (1 − n_1/n_2)', t1 + 0.3, lt);
  bm(3, '⇒ i = n_2 δ / (n_2 − n_1)', t1 + d1 * 0.6, lt, { c: C.blue });
  bbox(5, '(2)  i_A = n_2 d_A / [(n_2 − n_1) s]', q(2) + d(2) * 0.3, lt, { size: 40 });
};

SC.arc = (lt, S) => {
  const q = S.cue, d = S.dur, P = (a, dd) => clamp((lt - a) / dd);
  board(1);
  // ---- phase A: screen view decomposition
  const pa = 1 - P(q(3) - 0.2, 0.5);
  grp(pa, () => {
    const O = [440, 480];
    ctx.save(); ctx.fillStyle = THEME.card; ctx.fillRect(140, 180, 600, 600); ctx.restore();
    tech([[140, 180], [740, 180], [740, 780], [140, 780], [140, 180]], { c: C.ink, w: 3, p: P(0.1, 0.8) });
    tech([[O[0], 190], [O[0], 770]], { c: C.gray, dash: [8, 8], w: 2 }); tech([[150, O[1]], [730, O[1]]], { c: C.gray, dash: [8, 8], w: 2 });
    txt('屏幕正视图 screen view', 440, 160, { size: 26, c: C.gray });
    txt('O', O[0] - 20, O[1] + 26, { size: 32, f: MF });
    const tA = 25 * PI / 180, tB = 35 * PI / 180;
    const A2 = [O[0] - 230 * Math.sin(tA), O[1] - 230 * Math.cos(tA)], B2 = [O[0] + 260 * Math.sin(tB), O[1] + 260 * Math.cos(tB)];
    const t0 = q(0), d0 = d(0);
    const ap = P(t0 + 0.2, 0.8);
    tech([O, A2], { c: C.red, w: 3, p: ap }); spot(A2[0], A2[1], ap);
    mtx('d_A', A2[0] - 60, (A2[1] + O[1]) / 2 - 20, { size: 34, c: C.red, pop: ap });
    arcMark(O[0], O[1], 70, -PI / 2 - tA, -PI / 2, 'θ_A', P(t0 + d0 * 0.4, 0.5), C.yellow, 100);
    txt('法线横向偏 → 光斑同向偏', 440, 830, { size: 30, c: C.ink, p: P(t0 + d0 * 0.55, 0.8) });
    const t1 = q(1), d1 = d(1);
    const vp = P(t1 + d1 * 0.35, 0.7);
    if (vp > 0) {
      tech([[O[0] + 6, O[1]], [O[0] + 6, A2[1]]], { c: C.blue, w: 6, p: vp });
      tech([[O[0] + 6, A2[1]], [A2[0], A2[1]]], { c: C.gray, w: 3, dash: [6, 6], p: vp });
      mtx('d_A cos θ_A', O[0] + 20, (O[1] + A2[1]) / 2, { size: 32, c: C.blue, al: 'left', pop: vp });
      txt('纸外分量 out of plane', A2[0] - 10, A2[1] - 34, { size: 24, c: C.gray, pop: P(t1 + d1 * 0.6, 0.5) });
    }
    const t2 = q(2), d2 = d(2);
    const bp = P(t2 + d2 * 0.5, 0.7);
    if (bp > 0) {
      tech([O, B2], { c: C.red, w: 3, p: bp }); spot(B2[0], B2[1], bp);
      mtx('d_B', B2[0] + 20, (B2[1] + O[1]) / 2 + 10, { size: 34, c: C.red, pop: bp });
      arcMark(O[0], O[1], 70, PI / 2 - tB, PI / 2, 'θ_B', bp, C.yellow, 100);
      tech([[O[0] - 6, O[1]], [O[0] - 6, B2[1]]], { c: C.blue, w: 6, p: P(t2 + d2 * 0.7, 0.6) });
    }
  });
  // ---- phase B: arc geometry
  const pb = P(q(3) - 0.2, 0.6);
  grp(pb, () => {
    const Cc = [470, 860], R = 480, aA = 32 * PI / 180, aB = 26 * PI / 180;
    const at = a => [Cc[0] + R * Math.sin(a), Cc[1] - R * Math.cos(a)];
    const A = at(-aA), B = at(aB), Pp = at(0);
    const t3 = q(3), d3 = d(3);
    const g1 = P(t3, 1.0);
    const arcPts = []; for (let k = 0; k <= 40; k++) arcPts.push(at(-aA - 0.08 + (aA + aB + 0.16) * k / 40));
    tech(arcPts, { c: C.ink, w: 3, p: g1, a: 0.5 });
    const mid = []; for (let k = 0; k <= 30; k++) mid.push(at(-aA + (aA + aB) * k / 30));
    tech(mid, { c: C.blue, w: 7, p: g1 });
    const lp = [Cc[0] + (R + 45) * Math.sin(-aA / 2), Cc[1] - (R + 45) * Math.cos(-aA / 2)];
    mtx('l', lp[0], lp[1], { size: 40, c: C.blue, pop: g1 });
    [['A', A, -30, 30], ['P', Pp, 0, -30], ['B', B, 30, 30]].forEach(([s, pt, dx, dy]) => { dot2(pt[0], pt[1], 5, g1); txt(s, pt[0] + dx, pt[1] + dy, { size: 36, f: MF, p: g1 }); });
    const rp = P(t3 + d3 * 0.2, 0.8);
    tech([Cc, A], { c: C.gray, w: 2.5, p: rp }); tech([Cc, B], { c: C.gray, w: 2.5, p: rp });
    tech([Cc, Pp], { c: C.gray, w: 2, dash: [8, 8], p: rp });
    dot2(Cc[0], Cc[1], 5, rp); txt('圆心', Cc[0] + 16, Cc[1] + 20, { size: 26, c: C.gray, al: 'left', p: rp });
    // tangents
    const tp = P(t3 + d3 * 0.1, 0.8);
    const tA = [Math.cos(aA), -Math.sin(aA)], tB = [Math.cos(aB), Math.sin(aB)];
    tech([[A[0] - tA[0] * 150, A[1] - tA[1] * 150], [A[0] + tA[0] * 190, A[1] + tA[1] * 190]], { c: C.yellow, w: 3.5, p: tp });
    tech([[B[0] - tB[0] * 190, B[1] - tB[1] * 190], [B[0] + tB[0] * 150, B[1] + tB[1] * 150]], { c: C.yellow, w: 3.5, p: tp });
    tech([[A[0] - 200, A[1]], [A[0] + 60, A[1]]], { c: C.gray, dash: [6, 6], w: 2, p: tp });
    tech([[B[0] - 60, B[1]], [B[0] + 200, B[1]]], { c: C.gray, dash: [6, 6], w: 2, p: tp });
    arcMark(A[0], A[1], 120, PI - aA, PI, 'α_A', P(t3 + d3 * 0.3, 0.5), C.yellow, 160);
    arcMark(B[0], B[1], 120, 0, aB, 'α_B', P(t3 + d3 * 0.35, 0.5), C.yellow, 160);
    glassBlock(A[0], A[1], 150, 44, -aA, P(t3 + d3 * 0.1, 0.6));
    // central angle
    const cp = P(t3 + d3 * 0.55, 0.6);
    arcMark(Cc[0], Cc[1], 150, -PI / 2 - aA, -PI / 2, 'α_A', cp, C.yellow, 185);
    arcMark(Cc[0], Cc[1], 150, -PI / 2, -PI / 2 + aB, 'α_B', cp, C.yellow, 185);
    arcMark(Cc[0], Cc[1], 95, -PI / 2 - aA, -PI / 2 + aB, 'φ', P(t3 + d3 * 0.75, 0.5), C.red, 70);
    // line 4: the φ arc sweeps again from the α_A side to the α_B side: "the two angles make φ"
    const sw = P(q(4) + 0.2, Math.max(1.2, d(4) * 0.6));
    if (sw > 0) fillPts([Cc, ...ellPts(Cc[0], Cc[1], 130, 130, -PI / 2 - aA, -PI / 2 - aA + (aA + aB) * eio(sw), 30)], C.red, 0.35 * (1 - P(q(5), 0.5)));
    const t5 = q(5), d5 = d(5);
    const rr = P(t5 + d5 * 0.3, 0.6);
    if (rr > 0) { tech([Cc, Pp], { c: C.green, w: 5, p: rr }); mtx('R', Cc[0] + 18, Cc[1] - R * 0.55, { size: 40, c: C.green, al: 'left', pop: rr }); }
  });
  bm(0, '光斑位移 ∥ 法线横向分量', q(0) + d(0) * 0.45, lt);
  bm(1, '竖直分量 ↔ 切线倾角 α', q(1) + d(1) * 0.4, lt, { c: C.blue });
  bm(2, 'α_A = i_A cos θ_A ,  α_B = i_B cos θ_B', q(2) + d(2) * 0.3, lt);
  bm(3, '切线 ⊥ 半径 ⇒ 切线夹角 = 圆心角', q(3) + 0.3, lt);
  bm(4, 'φ = α_A + α_B', q(3) + d(3) * 0.6, lt, { c: C.red, size: 42 });
  bm(5, 'φ = n_2(d_A cos θ_A + d_B cos θ_B) / [(n_2 − n_1)s]', q(4) + 0.3, lt, { size: 29 });
  bm(6, 'R = l / φ', q(5) + 0.2, lt, { c: C.green, size: 42 });
  bbox(8, 'R = (n_2 − n_1) s l / [n_2 (d_A cos θ_A + d_B cos θ_B)]', q(5) + d(5) * 0.5, lt, { size: 28 });
};

SC.outro = (lt, S) => {
  const q = S.cue, d = S.dur, P = (a, dd) => clamp((lt - a) / dd);
  const nodes = [['侧移', 'δ = d / s'], ['折射定律', 'i = n_2δ/(n_2−n_1)'], ['竖直分量', 'α = i cos θ'], ['相加', 'φ = α_A + α_B'], ['弧长', 'R = l / φ']];
  const ca = 1 - P(q(1) + d(1) * 0.55, 0.5);
  grp(ca, () => {
    nodes.forEach(([zh, f], i) => {
      const x = 220 + i * 370, y = 400, p = P(q(0) + d(0) * (0.05 + i * 0.17), 0.5);
      if (p <= 0) return;
      scaleAt(x, y, back(p), () => {
        ctx.save(); ctx.fillStyle = THEME.card; ctx.fillRect(x - 160, y - 90, 320, 180); ctx.restore();
        tech([[x - 160, y - 90], [x + 160, y - 90], [x + 160, y + 90], [x - 160, y + 90], [x - 160, y - 90]], { c: i === 4 ? C.green : C.blue, w: 3 });
        txt(zh, x, y - 40, { size: 36, c: C.gray });
        mtx(f, x, y + 25, { size: 34, c: i === 4 ? C.green : C.ink });
      });
      if (i < 4) ray([[x + 165, y], [x + 205, y]], P(q(0) + d(0) * (0.12 + i * 0.17), 0.3), { w: 4, pulse: false });
    });
    const fp = P(q(0) + d(0) * 0.9, 0.6);
    if (fp > 0) {
      ctx.save(); ctx.fillStyle = THEME.card; ctx.fillRect(300, 580, 1320, 130); ctx.restore();
      tech([[300, 580], [1620, 580], [1620, 710], [300, 710], [300, 580]], { c: C.yellow, w: 3, a: fp });
      mtx('R = (n_2 − n_1) s l / [n_2 (d_A cos θ_A + d_B cos θ_B)]', 960, 645, { size: 50, c: C.yellow, pop: fp, glow: 'rgba(255,209,102,0.5)' });
    }
  });
  const ga = P(q(1) + d(1) * 0.55, 0.5);
  grp(ga, () => {
    ray([[200, 560], [1720, 560]], ga, { w: 5 });
    txt('激光测曲率', 960, 380, { size: 96, pop: ga });
    txt('Thanks for watching!', 960, 480, { size: 48, f: EN, c: C.blue, pop: P(q(1) + d(1) * 0.7, 0.5) });
    spot(1720, 560, ga);
  });
};
