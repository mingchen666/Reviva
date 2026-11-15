/* Scenes for ONE problem. This whole file is problem-specific: rewrite it for every new video.
 * Helpers come from engine.js (draw, txt, board, bl, problemCard, hiBox, stamp, puff, slideSeg, rotAbout ...)
 * and phys.js (vec, components, incline, block, trail, simT, graph, clockTag, mtx, bm, bbox, ray ...).
 *
 * Contract with script.json:
 *   - every "scene" id in script.json needs SC.<id> here and a TAGS entry
 *   - SC.<id>(lt, S): lt = seconds since the scene started. Time every animation from S.cue(k) / S.at(k, f),
 *     the moment narration line k starts. Never hardcode absolute seconds.
 *   - MOTION follows the real solution: position(t) / velocity(t) below are the analytic answers, and simT() maps
 *     narration time -> physical time LINEARLY (slow motion is fine, easing is not).
 * Layout: figure in the left half (x 60..900), board on the right (x 930..1870), everything above y = 860.
 *
 * Example problem (replace): 倾角 37° 的足够长粗糙斜面，m = 2 kg 的物块以 v0 = 10 m/s 从底端上滑，μ = 0.5，g = 10 m/s²。
 *   求 (1) 上滑加速度 (2) 上滑最大距离 (3) 能否返回，返回底端的速度。
 */

// ---------------------------------------------------------------- problem image + highlight boxes
const PROBLEM = {
  src: 'problem.png', srcW: 1500, srcH: 640,
  boxes: {
    incline: [[172, 44, 826, 116]],
    mass: [[1228, 44, 1332, 116], [34, 124, 219, 196]],
    v0: [[437, 124, 1420, 196]],
    mu: [[356, 204, 745, 276]],
    q1: [[34, 364, 629, 436]],
    q2: [[34, 444, 675, 516]],
    q3: [[34, 524, 1273, 596]],
  },
};

const TAGS = {
  intro: ['01', '审题 · 读条件', 'Read the problem'],
  force: ['02', '受力分析（上滑）', 'Free-body diagram'],
  up: ['03', '上滑：牛顿第二定律', 'Going up: F = ma'],
  back: ['04', '能否滑回？', 'Will it slide back?'],
  down: ['05', '下滑到底端', 'Sliding back down'],
  outro: ['06', '方法小结', 'Recap'],
};

// ---------------------------------------------------------------- the physics (solved in step 1, verified)
// textbook values: sin37° = 0.6, cos37° = 0.8 (use them, not Math.sin(37°), so pictures match the answers)
const SIN = 0.6, COS = 0.8, TH = Math.atan2(SIN, COS);
const M = 2, Gc = 10, MU = 0.5, V0 = 10;
const A1 = Gc * SIN + MU * Gc * COS;          // 10 m/s², up phase (deceleration)
const T1 = V0 / A1, XMAX = V0 * V0 / (2 * A1); // 1 s, 5 m
const A2 = Gc * SIN - MU * Gc * COS;          // 2 m/s², down phase
const T2 = Math.sqrt(2 * XMAX / A2);          // √5 s
const VEND = A2 * T2;                          // 2√5 m/s
/** distance up the slope (m) at physical time t */
const sPos = t => t <= T1 ? V0 * t - 0.5 * A1 * t * t : XMAX - 0.5 * A2 * (t - T1) ** 2;
/** velocity along the slope (m/s, + = up the slope) */
const vel = t => t <= T1 ? V0 - A1 * t : -A2 * (t - T1);

// ---------------------------------------------------------------- the figure (left half)
const RUN = 640;                                        // horizontal run of the incline, px
const G = incline([200, 780], TH, RUN, 1, { p: 0 });   // geometry only (p: 0 draws nothing)
const ANG = Math.atan2(G.up[1], G.up[0]);
const DOWN = vmul(G.up, -1);
const PXM = 100, S0 = 220, FS = 8, VS = 12;             // px per metre along the slope, start offset, px per N, px per m/s
const BW = 110, BH = 70;
const blockAt = t => block(G.at(S0 + PXM * sPos(t)), BW, BH, ANG, { p: 0 });   // geometry of the block at time t
const midAt = t => blockAt(t).mid;
/** contact-surface start point for friction (just under the bottom face) */
const fFrom = B => vadd(B.c, vmul(G.n, -5));
const VT = graph({ ox: 130, oy: 340, w: 290, h: 240, xr: [0, 3.4], yr: [-5, 10], xl: 't/s', yl: 'v/(m·s^{-1})', xt: [1, 2, 3], yt: [5, 10] });

function scenery(p = 1) { incline(G.A, TH, RUN, 1, { p, label: '37°' }); }
function drawBlock(B, p = 1, g = 0) {
  if (g > 0.01) glow([...B.corners, B.corners[0]], C.yellow, g, 26);
  block(B.c, BW, BH, ANG, { c: C.blue, label: 'm', p });
}
/** gravity + components + N (a = alpha for the whole group) */
function forcesStatic(B, o = {}) {
  grp(o.a === undefined ? 1 : o.a, () => {
    if (o.mg !== undefined) vec(B.mid, [0, 20 * FS], { c: C.yellow, label: 'mg', p: o.mg, lside: -1 });
    if (o.comp !== undefined) components(B.mid, [0, 20 * FS], G.up, o.comp, { labels: ['mg sinθ', 'mg cosθ'], lside0: 1, lside1: -1 });
    if (o.N !== undefined) vec(B.mid, vmul(G.n, 16 * FS), { c: C.blue, label: 'N', p: o.N });
  });
}

// ---------------------------------------------------------------- scenes
const SC = {};

SC.intro = (lt, S) => {
  const { P, at } = S;
  txt('斜面往返 · 受力分析与牛顿第二定律', 960, 150, { size: 60, p: P(0.2, 0.9) });
  txt('A block up and down a rough incline', 960, 202, { size: 34, f: EN, c: C.blue, p: P(0.6, 0.8) });
  problemCard(P(0.4, 0.7));
  const B = PROBLEM.boxes;
  hiBox(B.incline, C.yellow, at(0, 0.3), lt);
  hiBox(B.mass, C.blue, at(1, 0.1), lt);
  hiBox(B.v0, C.red, at(1, 0.4), lt);
  hiBox(B.mu, C.pink, at(2, 0.1), lt);
  hiBox(B.q1, C.green, at(3, 0.1), lt);
  hiBox(B.q2, C.green, at(3, 0.35), lt);
  hiBox(B.q3, C.green, at(3, 0.6), lt);
  chip('θ = 37°', 330, C.yellow, P(at(0, 0.7), 0.5));
  chip('2 kg · 10 m/s', 700, C.red, P(at(1, 0.8), 0.5));
  chip('μ = 0.5', 1070, C.pink, P(at(2, 0.6), 0.5));
  chip('求 a₁ · x · v', 1450, C.green, P(at(3, 0.8), 0.5));
};

// 02: free-body diagram, one force per line, each force grows out of the block when it is named
SC.force = (lt, S) => {
  const { P, at } = S;
  scenery(P(0.1, 1.0));
  const B = blockAt(0);
  drawBlock(B, P(0.7, 0.6), bump(lt, at(0, 0.05), 1.4));
  const front = vadd(B.mid, vmul(G.up, BW / 2 + 4));
  if (lt > at(3)) glow([front, vadd(front, vmul(G.up, V0 * VS))], C.red, bump(lt, at(3, 0.02), 1.2));
  vec(front, vmul(G.up, V0 * VS), { c: C.red, label: 'v_0', p: P(1.0, 0.6), lside: -1 });
  // gravity -> components (dashed projections, then two purple arrows)
  if (lt > at(1)) glow([B.mid, vadd(B.mid, [0, 20 * FS])], C.yellow, bump(lt, at(1, 0.05), 1.2));
  if (lt > at(2)) glow([B.mid, vadd(B.mid, vmul(G.n, -16 * FS))], C.purple, bump(lt, at(2, 0.05), 1.2));
  forcesStatic(B, { mg: P(at(0, 0.45), 0.8), comp: P(at(1, 0.25), 1.6), N: P(at(2, 0.7), 0.4) });
  // N = the perpendicular component turned around: the copy swings from below the block to above it
  const e = eio(P(at(2, 0.2), 1.1));
  if (e < 1) slideSeg(B.mid, vadd(B.mid, vmul(G.n, -16 * FS)), B.mid, vadd(B.mid, vmul(G.n, 16 * FS)), e, { c: C.blue, w: 6 });
  // kinetic friction: opposite to the RELATIVE MOTION. Chevrons running up the slope show that motion first.
  const mv = P(at(3, 0.05), 0.4) * (1 - P(at(3, 0.95), 0.4));
  if (mv > 0) flow([vadd(G.at(S0 + BW + 20), vmul(G.n, BH + 30)), vadd(G.at(S0 + BW + 330), vmul(G.n, BH + 30))], { c: C.red, a: 0.8 * mv, gap: 70, speed: 140 });
  vec(fFrom(B), vmul(DOWN, 8 * FS), { c: C.pink, label: 'f', p: P(at(3, 0.4), 1.2), lside: -1, w: 5 });
  board(1);
  bm(0, '对象：物块，m = 2 kg', at(0, 0.05), lt, { c: C.gray, size: 34 });
  bm(1, 'G = mg = 20 N', at(0, 0.5), lt, { c: C.yellow });
  bm(2, 'mg sinθ = 20 × 0.6 = 12 N', at(1, 0.35), lt, { c: C.purple });
  bm(3, 'mg cosθ = 20 × 0.8 = 16 N', at(1, 0.6), lt, { c: C.purple });
  bm(4, 'N = mg cosθ = 16 N', at(2, 0.4), lt, { c: C.blue });
  bm(6, '上滑 ⇒ f 沿斜面向下', at(3, 0.15), lt, { c: C.pink });
  bm(7, 'f = μN = 0.5 × 16 = 8 N', at(3, 0.55), lt, { c: C.pink });
};

// 03: along the slope the two forces add; F = ma; then the block REALLY decelerates (slow motion) and the v-t graph grows
SC.up = (lt, S) => {
  const { P, at } = S;
  scenery();
  const run = at(2, 0.05), win = S.dur(2) * 0.75;
  const tp = simT(lt, run, win, T1);                  // physical time
  const B = blockAt(tp);
  const fade = 1 - P(at(2), 0.4);                     // side forces leave when the motion starts
  forcesStatic(B, { mg: 1, N: 1, a: 0.3 * fade });
  grp(fade, () => {
    const sinEnd = vadd(B.mid, vmul(DOWN, 12 * FS));
    if (lt < at(0, 0.9)) glow([B.mid, sinEnd], C.purple, bump(lt, at(0, 0.05), 1.3));
    vec(B.mid, vmul(DOWN, 12 * FS), { c: C.purple, label: 'mg sinθ', lside: 1 });
    vec(fFrom(B), vmul(DOWN, 8 * FS), { c: C.pink, label: 'f', lside: -1 });
    // tip-to-tail: a copy of f slides to the end of mg sinθ, then the green resultant appears under them
    const e = eio(P(at(0, 0.3), 1.0));
    slideSeg(fFrom(B), vadd(fFrom(B), vmul(DOWN, 8 * FS)), sinEnd, vadd(sinEnd, vmul(DOWN, 8 * FS)), e, { c: C.pink, w: 5 });
    const off = vmul(G.n, -44);
    vec(vadd(B.mid, off), vmul(DOWN, 20 * FS), { c: C.green, label: 'F合 = 20 N', p: P(at(0, 0.7), 0.6), lside: -1, w: 6 });
  });
  drawBlock(B);
  // acceleration arrow above the block (constant during the whole up phase)
  const aFrom = vadd(B.mid, vmul(G.n, 78));
  const ae = P(at(1, 0.25), 0.8);
  vec(aFrom, vmul(DOWN, A1 * 8), { c: C.green, label: `a_1 = ${countTo(0, 10, ae)} m/s^2`, p: ae, lside: 1, size: 30 });
  // velocity arrow at the front face, shrinking with v(t)
  const v = vel(tp), front = vadd(B.mid, vmul(G.up, BW / 2 + 4));
  if (v > 0.05) vec(front, vmul(G.up, v * VS), { c: C.red, label: lt > run ? `v = ${v.toFixed(1)}` : 'v_0', lside: -1, size: 30 });
  if (lt > run) {
    trail(t => vadd(midAt(t), vmul(G.n, -BH / 2 - 14)), 0, tp, { c: C.red });
    clockTag(560, 830, tp);
    txt(`慢放 ×${(T1 / win).toFixed(2)}`, 150, 830, { size: 30, c: C.gray, al: 'left' });
  }
  VT.draw(P(at(2), 0.5));
  if (lt > run) { VT.curve(vel, 0, tp); VT.cursor(tp, vel, C.red); }
  const dp = P(at(2, 0.85), 0.5);
  const d0 = vadd(G.at(S0), vmul(G.n, -60)), d1 = vadd(G.at(S0 + PXM * XMAX), vmul(G.n, -60));
  dimLine(d0[0], d0[1], d1[0], d1[1], 'x = 5 m', dp, { off: -34 });
  board(1);
  bm(0, '沿斜面：两力同向（向下）', at(0, 0.05), lt, { c: C.gray, size: 34 });
  bm(1, 'F合 = mg sinθ + f = 12 + 8 = 20 N', at(0, 0.4), lt, { c: C.green });
  bm(2, 'a_1 = F合 / m = 20 / 2', at(1, 0.15), lt);
  bm(3, '   = 10 m/s^2（沿斜面向下）', at(1, 0.5), lt, { c: C.green });
  bm(5, 'x = v_0^2 / 2a_1 = 100 / 20 = 5 m', at(2, 0.3), lt, { c: C.yellow });
  bm(6, 't_1 = v_0 / a_1 = 1 s', at(2, 0.6), lt);
  bbox(8, '(1) a_1 = 10 m/s^2    (2) x = 5 m', at(2, 0.85), lt);
};

// 04: at rest on top: compare the pulls, friction flips, new (smaller) net force
SC.back = (lt, S) => {
  const { P, at } = S;
  scenery();
  const B = blockAt(T1), sinEnd = vadd(B.mid, vmul(DOWN, 12 * FS));
  VT.draw(1); VT.curve(vel, 0, T1); VT.cursor(T1, vel, C.red);
  trail(t => vadd(midAt(t), vmul(G.n, -BH / 2 - 14)), 0, T1, { c: C.red, a: 0.35 });
  forcesStatic(B, { mg: 1, N: 1, a: 0.3 });
  if (lt < at(1)) glow([B.mid, sinEnd], C.purple, bump(lt, at(0, 0.2), 1.4));
  vec(B.mid, vmul(DOWN, 12 * FS), { c: C.purple, label: 'mg sinθ', size: 30 });
  drawBlock(B);
  // line 0: maximum static friction (dashed, up the slope); its copy is laid on mg sinθ -> 4 N sticks out
  const fS = fFrom(B), fUp = vadd(fS, vmul(G.up, 8 * FS));
  const solid = P(at(1, 0.55), 0.3);
  vec(fS, vmul(G.up, 8 * FS), { c: C.pink, label: solid < 1 ? 'f_{max}' : 'f', p: P(at(0, 0.35), 0.6), dash: solid < 0.5 ? [10, 8] : undefined, lside: -1, size: 30 });
  const e = eio(P(at(0, 0.55), 0.9));
  if (lt < at(1, 0.2)) slideSeg(fS, fUp, B.mid, vadd(B.mid, vmul(DOWN, 8 * FS)), e, { c: C.pink, w: 6 });
  if (e >= 1) glow([vadd(B.mid, vmul(DOWN, 8 * FS)), sinEnd], C.green, 1 - P(at(2, 0.3), 0.5), 18);
  // line 1: the old kinetic friction (down the slope, from going up) swings round to point up the slope
  const mv = P(at(1, 0.05), 0.4) * (1 - P(at(2), 0.4));   // chevrons: the block is about to move DOWN the slope
  if (mv > 0) flow([vadd(G.at(S0 + PXM * XMAX - BW), vmul(G.n, BH + 30)), vadd(G.at(S0 + PXM * XMAX - BW - 330), vmul(G.n, BH + 30))], { c: C.red, a: 0.8 * mv, gap: 70, speed: 140 });
  const r = eio(P(at(1, 0.2), 1.4));
  if (lt > at(1, 0.1) && r < 1) {
    const pts = rotAbout([fS, vadd(fS, vmul(DOWN, 8 * FS))], fS, PI * r);
    arrow(pts, { c: C.pink, w: 5, head: 16, rough: 0.4, single: true, a: 0.8 });
  }
  // line 2: net force 12 - 8 = 4 N down the slope; a2
  const ne = P(at(2, 0.15), 0.8);
  vec(vadd(B.mid, vmul(G.n, -44)), vmul(DOWN, 4 * FS), { c: C.green, label: 'F合', p: ne, w: 6, size: 30, lo: 30, lside: 1 });
  const ae = P(at(2, 0.5), 0.8);
  vec(vadd(B.mid, vmul(G.n, 78)), vmul(DOWN, A2 * 8), { c: C.green, label: `a_2 = ${countTo(0, 2, ae)}`, p: ae, size: 30 });
  board(1);
  bm(0, '停下时 v = 0，比较：', at(0, 0.05), lt, { c: C.gray, size: 34 });
  bm(1, 'mg sinθ = 12 N（下滑趋势）', at(0, 0.25), lt, { c: C.purple });
  bm(2, 'f_{max} ≈ μmg cosθ = 8 N', at(0, 0.45), lt, { c: C.pink });
  bm(4, '12 N > 8 N ⇒ 会下滑', at(1, 0.1), lt, { c: C.yellow });
  bm(5, '摩擦力反向：沿斜面向上', at(1, 0.45), lt, { c: C.pink });
  bm(7, 'a_2 = (12 − 8) / 2 = 2 m/s^2', at(2, 0.4), lt, { c: C.green });
};

// 05: the block REALLY slides back (slow motion), then compare speeds and the two equal areas on the v-t graph
SC.down = (lt, S) => {
  const { P, at } = S;
  scenery();
  const run = at(0, 0.1), win = S.dur(0) * 0.8;
  const tp = T1 + simT(lt, run, win, T2);
  const B = blockAt(tp);
  trail(t => vadd(midAt(t), vmul(G.n, -BH / 2 - 14)), 0, T1, { c: C.red, a: 0.35 });
  trail(t => vadd(midAt(t), vmul(G.n, -BH / 2 - 30)), T1, tp, { c: C.blue });
  vec(fFrom(B), vmul(G.up, 8 * FS), { c: C.pink, label: 'f', lside: -1, a: 0.6 });
  drawBlock(B);
  vec(vadd(B.mid, vmul(G.n, 78)), vmul(DOWN, A2 * 8), { c: C.green, label: 'a_2', lside: 1, size: 30 });
  const v = -vel(tp), rear = vadd(B.mid, vmul(DOWN, BW / 2 + 4));
  if (lt > at(1)) glow([rear, vadd(rear, vmul(DOWN, v * VS))], C.red, bump(lt, at(1, 0.05), 1.4));
  if (v > 0.05) vec(rear, vmul(DOWN, v * VS), { c: C.red, label: `v = ${v.toFixed(1)}`, lside: 1, size: 30 });
  // line 1: ghost of the starting velocity for comparison
  const gp = P(at(1, 0.4), 0.6);
  const gFrom = vadd(G.at(S0 + BW / 2 + 4), vmul(G.n, BH / 2 + 60));
  vec(gFrom, vmul(G.up, V0 * VS), { c: C.red, label: 'v_0 = 10', p: gp, dash: [10, 8], lside: -1, size: 30, a: 0.7 });
  clockTag(560, 830, tp);
  txt(`慢放 ×${(T2 / win).toFixed(2)}`, 150, 830, { size: 30, c: C.gray, al: 'left' });
  VT.draw(1);
  const a1 = P(at(1, 0.55), 0.6), a2 = P(at(1, 0.7), 0.6);
  VT.area(vel, 0, T1, C.red, 0.3 * a1); VT.area(vel, T1, T1 + T2, C.blue, 0.3 * a2);
  VT.curve(vel, 0, tp); VT.cursor(tp, vel, C.red);
  if (a1 > 0) { const q = VT.S([0.35, 3]); mtx('5 m', q[0], q[1], { size: 26, c: C.red, pop: a1 }); }
  if (a2 > 0) { const q = VT.S([2.1, -1.4]); mtx('5 m', q[0], q[1], { size: 26, c: C.blue, pop: a2 }); }
  board(1);
  bm(0, '由静止下滑 x = 5 m：', at(0, 0.05), lt, { c: C.gray, size: 34 });
  bm(1, 'v^2 = 2a_2 x = 2 × 2 × 5 = 20', at(0, 0.35), lt);
  bm(2, 'v = 2√5 m/s ≈ 4.5 m/s', at(1, 0.1), lt, { c: C.red, size: 44 });
  bm(4, 'v-t 图：两块面积相等（都是 5 m）', at(1, 0.6), lt, { c: C.gray, size: 32 });
  bbox(6, '(3) 能滑回，v = 2√5 m/s', at(1, 0.35), lt);
  stamp(1560, 790, '答：v = 2√5 m/s', P(at(1, 0.8), 0.5), C.red, 46);
};

SC.outro = (lt, S) => {
  const { P, at } = S;
  const cards = [
    ['选对象', '物块', 'the object', C.blue],
    ['画受力', 'G · N · f', 'forces', C.yellow],
    ['定摩擦', '与运动方向相反', 'against motion', C.pink],
    ['牛顿第二定律', 'a = F合 / m', 'F = ma', C.green],
    ['运动学', 'v² = 2ax', 'kinematics', C.red],
  ];
  grp(1 - P(at(1), 0.5), () => {
    cards.forEach(([top, zh, en, col], i) => {
      const x = 220 + i * 370, y = 440, p = P(at(0, 0.05 + i * 0.16), 0.6);
      if (p <= 0) return;
      scaleAt(x, y, back(p), () => {
        const pts = [[x - 160, y - 150], [x + 160, y - 148], [x + 162, y + 150], [x - 160, y + 152], [x - 160, y - 150]];
        fillPts(pts, THEME.card);
        draw(pts, { c: col, w: 4, seed: i });
        txt(top, x, y - 80, { size: 44, c: col });
        txt(zh, x, y + 10, { size: 38 });
        txt(en, x, y + 80, { size: 30, f: EN, c: C.gray });
      });
      if (i < 4) arrow([[x + 168, y], [x + 202, y]], { c: C.gray, w: 4, head: 12, p: P(at(0, 0.12 + i * 0.16), 0.3) });
    });
  });
  grp(P(at(1), 0.5), () => {
    puff(640, 560, 1.3 * back(P(at(1, 0.05), 0.6)), { wave: true });
    bubble(1180, 430, '10 m/s² · 5 m · 2√5 m/s', P(at(1, 0.2), 0.5), { size: 50, c: C.yellow });
    txt('受力分析 + 牛顿第二定律', 960, 160, { size: 72, pop: P(at(1, 0.4), 0.6) });
    txt('See you next problem!', 960, 238, { size: 40, f: EN, c: C.blue, pop: P(at(1, 0.6), 0.6) });
  });
};
