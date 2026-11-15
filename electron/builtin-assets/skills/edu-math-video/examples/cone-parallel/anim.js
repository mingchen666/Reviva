/* 圆锥：侧面积 + 动点线面平行. Solid-geometry example for the edu-math-video skill.
 * Every explanation line: light up what is named (glow/bump) -> ONE motion that shows the reasoning -> leave a mark.
 * One 3D model for everything: the base-circle work happens by turning the camera to a top view (camTween). */
const PROBLEM = {
  src: 'problem.png', srcW: 1480, srcH: 396, boxes: {
    cone: [[132, 18, 599, 61]], diam: [[622, 18, 962, 62]], angle: [[112, 74, 665, 150]], area: [[686, 82, 928, 133]],
    mid: [[115, 177, 475, 223]], circle: [[496, 176, 824, 225]], arc: [[844, 160, 1088, 244]],
    parallel: [[35, 248, 215, 294]], moving: [[237, 248, 629, 297]], goal: [[646, 248, 982, 296]],
  },
};
const TAGS = {
  intro: ['01', '审题 · 逐条读条件', 'Read the problem'],
  area: ['02', '第一问 · 射影与侧面积', 'Projection and lateral area'],
  base: ['03', '第二问 · 转到底面看', 'Top view of the base'],
  parallel: ['04', '从线线平行到面面平行', 'Two pairs of parallel lines'],
  outro: ['05', '方法回顾', 'Recap'],
};

// ---------------------------------------------------------------- 3D model (radius 1, slant 2, height √3)
const H3 = Math.sqrt(3);
const G = { O: [0, 0, 0], A: [-1, 0, 0], B: [1, 0, 0], P: [0, 0, H3], Q: [-0.5, 0, H3 / 2],
  C: [-0.5, H3 / 2, 0], D: [0.5, H3 / 2, 0], M: [0, H3 / 2, 0] };
const OBL = { cx: 465, cy: 610, s: 230, pitch: 0.44, yaw: 0 };   // oblique view
const TOP = { cx: 465, cy: 470, s: 230, pitch: PI / 2, yaw: 0 }; // exact top view (z ignored)
const q = k => pr(G[k]);
const LBL = { P: [0, -30], A: [-30, 6], B: [30, 6], O: [18, 28], Q: [-30, -8], C: [-26, 26], D: [26, 26], M: [0, 30] };
const lab = (k, p = 1, col = C.ink) => ptLabel(k, q(k), LBL[k][0], LBL[k][1], p, col);

/** the cone. top = 0 (oblique) .. 1 (top view): the lateral surface fades out as we look straight down */
function cone(st = {}) {
  const top = st.top || 0, side = 1 - top;
  const ring = [], front = [], back = [];
  for (let i = 0; i <= 120; i++) {
    const a = i / 120 * TAU, p3 = [Math.cos(a), Math.sin(a), 0];
    ring.push(pr(p3)); (Math.sin(a) >= 0 ? front : back).push(pr(p3));
  }
  if (st.baseFill) fillPts(ring, '#fffdf7', 0.8 * st.baseFill);
  draw(front, { w: 4, rough: 0.5, p: st.build === undefined ? 1 : st.build * 2 });
  draw(back, { w: 3.5, rough: 0.5, dash: top > 0.5 ? null : [12, 9], a: 0.8 });
  grp(side, () => {
    L3(G.P, G.A, { w: 5, p: st.build === undefined ? 1 : st.build * 2 - 1 });
    L3(G.P, G.B, { w: 5, p: st.build === undefined ? 1 : st.build * 2 - 1 });
  });
  L3(G.A, G.B, { c: C.gray, w: 3, dash: top > 0.5 ? null : [10, 8] });
  ['A', 'B', 'O'].forEach(k => lab(k));
  grp(side, () => lab('P'));
}

// ---------------------------------------------------------------- scenes
const SC = {};

SC.intro = (lt, S) => {
  const { P, at } = S;
  txt('圆锥 · 侧面积与动点平行', 960, 150, { size: 60, p: P(0.2, 0.9) });
  txt('Cone geometry: area and parallelism', 960, 202, { size: 34, f: EN, c: C.blue, p: P(0.6, 0.8) });
  problemCard(P(0.4, 0.7));
  ['cone', 'diam', 'angle', 'area', 'mid', 'circle', 'arc', 'parallel', 'moving', 'goal']
    .forEach((k, i) => hiBox(PROBLEM.boxes[k], i === 3 || i === 9 ? C.red : C.blue, at(i, 0.12), lt));
  chip('半径 r = 1', 440, C.blue, P(at(1, 0.6), 0.6));
  chip('第一问：求侧面积', 925, C.red, P(at(3, 0.4), 0.6));
  chip('第二问：证线面平行', 1460, C.green, P(at(9, 0.4), 0.6));
};

// 02: radius -> projection (PA collapses onto AO) -> 60° -> PA = 2·OA (two copies of OA) -> unroll into a half disc
SC.area = (lt, S) => {
  const { P, at } = S;
  Object.assign(CAM, OBL);
  const unroll = eio(P(at(4, 0.2), 1.6));
  grp(1 - 0.75 * unroll, () => {
    glow([q('A'), q('B')], C.blue, bump(lt, at(0, 0.05)));
    cone({ build: P(0.1, 1.2), baseFill: 1 });
    slideSeg(q('A'), q('B'), q('A'), q('O'), eio(P(at(0, 0.3), 0.9)), { c: C.blue });           // half of AB -> OA
    if (lt > at(0, 0.5)) txt(`r = ${countTo(0, 1, P(at(0, 0.5), 0.6), 0)}`, 330, 690, { size: 34, f: MF, c: C.blue });
    // projection: P drops to O along the axis, the moving end drags PA down onto AO
    const drop = eio(P(at(1, 0.35), 1.2)), Pd = mix3(G.P, G.O, drop);
    L3(G.P, G.O, { c: C.blue, dash: [10, 8], p: P(at(1, 0.05), 0.7), w: 3.5 });
    rightM(q('O'), q('P'), q('B'), C.blue, 22, P(at(1, 0.3), 0.4));
    if (drop > 0 && drop < 1) { L3(G.A, Pd, { c: C.blue, w: 4, a: 0.7 }); dot(...pr(Pd), C.blue, 7); }
    glow([q('A'), q('O')], C.blue, P(at(1, 0.8), 0.4) * (1 - P(at(2, 0.2), 0.4)));
    // the angle at A grows, its value counts
    glow([q('A'), q('P')], C.red, bump(lt, at(2, 0.05)) + bump(lt, at(3, 0.5)));
    draw(arc3(G.A, G.O, G.P, 0.3), { c: C.red, w: 4, p: P(at(2, 0.2), 0.9), rough: 0.3 });
    if (lt > at(2, 0.2)) txt(`${countTo(0, 60, P(at(2, 0.2), 0.9), 0)}°`, 300, 575, { size: 34, f: MF, c: C.red });
    // PA = 2·OA: two copies of OA lay themselves end to end along PA
    const M1 = mix3(G.A, G.P, 0.5);
    slideSeg(q('A'), q('O'), q('A'), pr(M1), eio(P(at(3, 0.2), 0.8)), { c: C.blue, w: 6 });
    slideSeg(q('A'), q('O'), pr(M1), q('P'), eio(P(at(3, 0.45), 0.8)), { c: C.blue, w: 6 });
    if (lt > at(3, 0.7)) txt('l = 2', 250, 400, { size: 38, f: MF, c: C.red, pop: P(at(3, 0.7), 0.5) });
  });
  // lateral surface cut along PA and flattened: a sector of radius l = 2 and angle 2πr/l = π (half disc)
  if (unroll > 0) {
    const u = unrollCone(unroll, { base3: G.O, r: 1, l: 2, apex3: G.P, apex2: [465, 300], Ls: 300, dir: PI / 2, c: C.red });
    grp(P(at(4, 0.6), 0.5), () => {
      txt('l = 2', 330, 380, { size: 34, f: MF, c: C.red });
      txt('圆心角 = 2πr / l = π', 640, 250, { size: 32, c: C.red });
      txt('半圆面积 = ½ π · 2² = 2π', 465, 690, { size: 34, c: C.red });
    });
  }
  board();
  bl(0, '用直角三角形求母线', 0, lt, { size: 34, c: C.gray });
  bl(1, 'r = OA = AB ÷ 2 = 1', at(0, 0.1), lt, { c: C.blue });
  bl(2, 'PO ⊥ 底面，PA 的射影是 AO', at(1, 0.15), lt, { size: 36 });
  bl(3, '∠PAO = π/3 = 60°', at(2, 0.1), lt, { c: C.red });
  bl(4, 'cos 60° = OA / PA = 1/2', at(3, 0.08), lt);
  bl(5, 'l = PA = 2', at(3, 0.55), lt, { c: C.red, size: 44 });
  bl(7, 'S侧 = πrl = π × 1 × 2', at(4, 0.1), lt, { size: 41 });
  stamp(1400, 744, 'S侧 = 2π', P(at(4, 0.75)), C.red, 57);
};

// 03: the SAME model seen from above. Arc sweeps 60°, OM drops, the angle at O turns onto C, CM doubles to CD, CD slides onto OB
SC.base = (lt, S) => {
  const { P, at } = S;
  camTween(OBL, TOP, eio(P(0.05, 1.3)));
  const r = CAM.s, O2 = q('O');
  cone({ top: (CAM.pitch - OBL.pitch) / (PI / 2 - OBL.pitch), baseFill: 1 });
  // arc AC grows while the radius sweeps from OA to OC
  const sw = eio(P(at(0, 0.2), 1.2)), a = PI - sw * PI / 3;   // C lies below AB in the top view: sweep that way
  const R = [O2[0] + r * Math.cos(a), O2[1] + r * Math.sin(a)];
  glow(ellPts(O2[0], O2[1], r, r, PI, a, 30), C.red, 1, 16);
  draw([O2, R], { c: C.blue, w: 5, rough: 0.4 });
  if (sw > 0.02) angM(O2, q('A'), R, C.red, 55, 1);
  if (lt > at(0, 0.3)) txt(`${countTo(0, 60, sw, 0)}°`, O2[0] - 95, O2[1] + 58, { size: 32, f: MF, c: C.red });
  lab('C', P(at(0, 0.7), 0.5), C.blue);
  // chord CD, then OM ⟂ CD grows, halves marked, CM slides onto MD
  draw([q('C'), q('D')], { c: C.blue, w: 5, p: P(at(0, 0.8), 0.6) });
  lab('D', P(at(0, 0.9), 0.5), C.blue);
  draw([O2, q('M')], { c: C.gray, dash: [10, 8], p: P(at(1, 0.1), 0.8), single: true });
  rightM(q('M'), q('D'), O2, C.gray, 20, P(at(1, 0.35), 0.4)); lab('M', P(at(1, 0.3), 0.4));
  slideSeg(q('C'), q('M'), q('M'), q('D'), eio(P(at(1, 0.5), 0.9)), { c: C.green, w: 6 });
  tickM(q('C'), q('M'), 1, C.green, P(at(1, 0.85), 0.3)); tickM(q('M'), q('D'), 1, C.green, P(at(1, 0.85), 0.3));
  // alternate angles: the 60° arc at O turns 180° about the midpoint of OC and lands at C
  const wedge = [O2, ...ellPts(O2[0], O2[1], 80, 80, PI - PI / 3, PI, 20)];
  const turn = eio(P(at(2, 0.25), 1.4));
  glow([O2, q('C')], C.yellow, bump(lt, at(2, 0.05)));
  glow([q('A'), q('B')], C.yellow, bump(lt, at(2, 0.05))); glow([q('C'), q('D')], C.yellow, bump(lt, at(2, 0.05)));
  if (turn > 0) {  // the 60° wedge at O spins half a turn about the midpoint of OC and lands at C (alternate angles)
    const w2 = rotAbout(wedge, mid(O2, q('C')), PI * turn);
    fillPts(w2, C.green, 0.35); draw(w2.slice(1), { c: C.green, w: 5, rough: 0.3 });
  }
  if (turn >= 1) txt('60°', q('C')[0] + 70, q('C')[1] - 28, { size: 30, f: MF, c: C.green });
  // CM = 1/2 counts, CD = 1
  glow([q('C'), q('M')], C.green, bump(lt, at(3, 0.1), 1.4));
  if (lt > at(3, 0.2)) txt(`CM = ${countTo(0, 0.5, P(at(3, 0.2), 0.8), 1)}`, q('M')[0], q('M')[1] + 72, { size: 32, f: MF, c: C.green });
  // CD slides onto OB: parallel AND equal
  const sl = eio(P(at(4, 0.2), 1.1));
  slideSeg(q('C'), q('D'), O2, q('B'), sl, { c: C.red, w: 7 });
  paraM(q('C'), q('D'), C.red, P(at(4, 0.7), 0.3)); paraM(O2, q('B'), C.red, P(at(4, 0.7), 0.3));
  // parallelogram OCDB fills, OC slides onto BD
  fillPts([O2, q('C'), q('D'), q('B')], C.green, 0.16 * P(at(5, 0.1), 0.6));
  slideSeg(O2, q('C'), q('B'), q('D'), eio(P(at(5, 0.35), 1.0)), { c: C.blue, w: 7 });
  paraM(O2, q('C'), C.blue, P(at(5, 0.75), 0.3)); paraM(q('B'), q('D'), C.blue, P(at(5, 0.75), 0.3));
  board();
  bl(0, '先把弧长转成圆心角', 0, lt, { size: 34, c: C.gray });
  bl(1, '∠AOC = 弧长 / r = π/3', at(0, 0.1), lt, { c: C.blue, size: 38 });
  bl(2, 'OM ⊥ CD  ⇒  CM = MD', at(1, 0.1), lt, { size: 37 });
  bl(3, '∠OCM = ∠COA = 60°', at(2, 0.15), lt, { c: C.green, size: 39 });
  bl(4, 'CM = OC cos 60° = 1/2', at(3, 0.12), lt, { size: 38 });
  bl(5, 'CD = 2CM = 1 = OB', at(3, 0.65), lt, { size: 40 });
  bl(6, 'CD ∥ OB，且 CD = OB', at(4, 0.1), lt, { c: C.red });
  bl(7, 'OCDB 是平行四边形', at(5, 0.1), lt, { size: 40 });
  stamp(1400, 770, 'OC ∥ BD', P(at(5, 0.7)), C.blue, 48);
};

// 04: back to 3D. Q slides to the midpoint, triangle AOQ doubles into APB (midline), then plane QOC TRANSLATES by OB
// and lands inside plane PBD. Finally T runs along OC and QT stays inside the green plane.
SC.parallel = (lt, S) => {
  const { P, at } = S;
  camTween(TOP, OBL, eio(P(0.05, 1.3)));
  const top = (CAM.pitch - OBL.pitch) / (PI / 2 - OBL.pitch);
  const planes = P(at(4, 0.1), 0.6);
  fillPts([q('P'), q('B'), q('D')], C.blue, 0.16 * planes);
  cone({ top });
  L3(G.O, G.C, { c: C.blue, w: 4 }); L3(G.B, G.D, { c: C.blue, w: 4 }); L3(G.C, G.D, { c: C.gray, w: 3 });
  lab('C', 1, C.blue); lab('D', 1, C.blue);
  // Q slides down PA from P to the midpoint, then OQ is drawn
  const Qs = mix3(G.A, G.Q, 1), seek = eio(P(at(0, 0.05), 0.9));
  const Qm = mix3(G.P, Qs, seek);
  if (seek < 1) dot(...pr(Qm), C.green, 8);
  lab('Q', P(at(0, 0.4), 0.4), C.green);
  L3(G.O, G.Q, { c: C.green, w: 5, p: P(at(0, 0.5), 0.7) });
  // triangle PAB lit, midpoints ticked
  const tri = bump(lt, at(1, 0.02), S.dur(1));
  fillPts([q('P'), q('A'), q('B')], C.yellow, 0.3 * tri);
  [['P', 'A'], ['A', 'B'], ['B', 'P']].forEach(([a, b]) => glow([q(a), q(b)], C.yellow, tri));
  if (lt < at(2)) {  // midpoints: AQ lands on QP, AO lands on OB
    slideSeg(q('A'), q('Q'), q('Q'), q('P'), eio(P(at(1, 0.2), 0.9)), { c: C.green, w: 6 });
    slideSeg(q('A'), q('O'), q('O'), q('B'), eio(P(at(1, 0.5), 0.9)), { c: C.blue, w: 6 });
  }
  [['A', 'Q'], ['Q', 'P']].forEach(([a, b]) => tickM(q(a), q(b), 1, C.green, P(at(1, 0.45), 0.4)));
  [['A', 'O'], ['O', 'B']].forEach(([a, b]) => tickM(q(a), q(b), 2, C.blue, P(at(1, 0.75), 0.4)));
  // midline: small triangle AOQ scaled x2 about A becomes APB; then OQ slides onto BP
  const grow = eio(P(at(2, 0.05), 1.0));
  if (grow > 0 && lt < at(2, 0.9)) fillPts(rotAbout([q('A'), q('O'), q('Q')], q('A'), 0, 1 + grow), C.green, 0.22);
  slideSeg(q('O'), q('Q'), q('B'), q('P'), eio(P(at(2, 0.45), 0.9)), { c: C.green, w: 7 });
  paraM(q('O'), q('Q'), C.green, P(at(2, 0.8), 0.3)); paraM(q('B'), q('P'), C.green, P(at(2, 0.8), 0.3));
  // second pair: OC ∥ BD, carried over from the base
  glow([q('O'), q('C')], C.blue, bump(lt, at(3, 0.05))); glow([q('B'), q('D')], C.blue, bump(lt, at(3, 0.3)));
  if (lt < at(4)) slideSeg(q('O'), q('C'), q('B'), q('D'), eio(P(at(3, 0.25), 1.0)), { c: C.blue, w: 7 });  // OC translates onto BD
  paraM(q('O'), q('C'), C.blue, P(at(3, 0.6), 0.3)); paraM(q('B'), q('D'), C.blue, P(at(3, 0.6), 0.3));
  // plane QOC moves by the vector OB: O -> B, Q -> midpoint of PB, C -> D. It lands inside plane PBD.
  const mv = eio(P(at(4, 0.3), 1.4)), OB = G.B, sh = p3 => [p3[0] + OB[0] * mv, p3[1] + OB[1] * mv, p3[2] + OB[2] * mv];
  fillPts([q('Q'), q('O'), q('C')], C.green, 0.25 * planes);
  if (mv > 0 && lt < at(5, 0.1)) {
    const tri = [G.Q, G.O, G.C].map(sh);
    fillPts(tri.map(pr), C.green, 0.3); draw([...tri, tri[0]].map(pr), { c: C.green, w: 4, dash: [10, 7], single: true });
  }
  // T runs along OC, QT follows and never leaves the green plane
  const run = P(at(5, 0.1), 0.4);
  if (run > 0) {
    const u = 0.5 + 0.42 * Math.sin(PI * 2 * (lt - at(5, 0.1)) / 3.2);
    const T = mix3(G.O, G.C, u);
    glow([q('Q'), pr(T)], C.red, 0.5 * run);
    grp(run, () => { L3(G.Q, T, { c: C.red, w: 6 }); ptLabel('T', pr(T), 30, -16, 1, C.red); });
  }
  board();
  bl(0, '两组相交直线分别平行', 0, lt, { size: 34, c: C.gray });
  bl(1, '连接 OQ', at(0, 0.12), lt);
  bl(2, 'O、Q 是 AB、AP 的中点', at(1, 0.15), lt, { size: 38 });
  bl(3, 'OQ ∥ BP（中位线）', at(2, 0.1), lt, { c: C.green, size: 41 });
  bl(4, 'OC ∥ BD（底面结论）', at(3, 0.1), lt, { c: C.blue, size: 41 });
  bl(5, 'OQ ∩ OC = O，BP ∩ BD = B', at(3, 0.55), lt, { size: 32 });
  bl(6, '平面 QOC ∥ 平面 PBD', at(4, 0.15), lt, { c: C.green, size: 39 });
  bl(7, 'T ∈ OC  ⇒  QT ⊂ 平面 QOC', at(5, 0.1), lt, { size: 35 });
  stamp(1395, 780, 'QT ∥ 平面 PBD', P(at(6, 0.35)), C.red, 47);
};

SC.outro = (lt, S) => {
  const { P, at } = S;
  Object.assign(CAM, OBL);
  fillPts([q('P'), q('B'), q('D')], C.blue, 0.16); fillPts([q('Q'), q('O'), q('C')], C.green, 0.25);
  cone({});
  L3(G.O, G.C, { c: C.blue, w: 4 }); L3(G.B, G.D, { c: C.blue, w: 4 }); L3(G.O, G.Q, { c: C.green, w: 5 });
  lab('C', 1, C.blue); lab('D', 1, C.blue); lab('Q', 1, C.green);
  const T = mix3(G.O, G.C, 0.5 + 0.42 * Math.sin(PI * 2 * lt / 3.2));
  L3(G.Q, T, { c: C.red, w: 6 }); ptLabel('T', pr(T), 30, -16, 1, C.red);
  board();
  bl(0, '两问，两条思路', 0, lt, { size: 36, c: C.gray });
  bl(1, '① 射影 → 夹角 → 母线 → 展开', at(0, 0.05), lt, { size: 38 });
  bl(2, 'S侧 = 2π', at(0, 0.5), lt, { c: C.red, size: 52 });
  bl(4, '② 俯视底面 → 平行四边形', at(1, 0.1), lt, { size: 38 });
  bl(5, '中位线 → 面面平行', at(1, 0.55), lt, { size: 41, c: C.green });
  bl(7, 'T 在 OC 上任意移动', at(2, 0.1), lt, { size: 38 });
  stamp(1400, 782, 'QT ∥ 平面 PBD', P(at(2, 0.45)), C.red, 46);
};
