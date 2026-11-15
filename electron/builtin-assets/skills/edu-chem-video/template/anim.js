/* Scenes for ONE problem. This whole file is problem-specific: rewrite it for every new video.
 * Helpers come from engine.js (draw, txt, board, problemCard, hiBox, stamp, puff, flyText, glow, bump ...)
 * and chem.js (equation, eqX, valence, bridge, eFlow, tally, iceTable, molMap, molecule, particles, mtx, bm, bbox ...).
 *
 * Contract with script.json:
 *   - every "scene" id in script.json needs SC.<id> here and a TAGS entry
 *   - SC.<id>(lt, S): lt = seconds since the scene started. Time everything from S.at(k, f) (line k, fraction f).
 * Layout (chalkboard): EQUATION STRIP at the top (equation baseline EQY = 222, y 140..300), figure below-left
 * (x 60..900, y 310..860), slate board below-right (bm rows 0..8). Everything above y = 860.
 *
 * Example problem (replace): Cu + HNO3(稀) → Cu(NO3)2 + NO↑ + H2O（未配平），19.2 g Cu 与足量稀硝酸反应。
 *   (1) 配平并用双线桥标电子转移 (2) NO 在标况下的体积 (3) 被还原的 HNO3 的物质的量。
 */

// ---------------------------------------------------------------- problem image + highlight boxes
const PROBLEM = {
  src: 'problem.png', srcW: 1500, srcH: 560,
  boxes: {
    eq: [[724, 44, 1350, 116], [34, 124, 588, 196]],
    mass: [[668, 124, 871, 196]],
    excess: [[951, 124, 1193, 196]],
    q1: [[34, 284, 1319, 356]],
    q2: [[34, 364, 794, 436]],
    q3: [[34, 444, 707, 516]],
  },
};

const TAGS = {
  intro: ['01', '审题', 'Read the problem'],
  valence: ['02', '标化合价', 'Oxidation states'],
  balance: ['03', '电子守恒配平', 'Balance by electrons'],
  bridge: ['04', '双线桥', 'Electron transfer'],
  mole: ['05', '物质的量计算', 'Moles'],
  reduced: ['06', '被还原的硝酸', 'Reduced HNO3'],
  outro: ['07', '方法小结', 'Recap'],
};

// ---------------------------------------------------------------- the chemistry (solved + checked in step 1)
// chem_check.py balance "Cu + HNO3 -> Cu(NO3)2 + NO + H2O"  ->  [3, 8, 3, 2, 4]
const EQ = { l: ['Cu', 'HNO3'], r: ['Cu(NO3)2', 'NO↑', 'H2O'] };
const KF = [3, 8, 3, 2, 4];
const M_CU = 64, N_CU = 19.2 / M_CU, N_NO = N_CU * 2 / 3, V_NO = N_NO * 22.4;   // 0.3, 0.2, 4.48

/** the equation in the strip with coefficients k (null = blank □). Call with {p: 0} first to get the layout only. */
const eqDraw = (k, o = {}) => equation({ ...EQ, k, arrow: o.arrow || '=' }, 960, EQY, { blank: true, ...o });
/** highlighter behind one species of the equation */
const glowIt = (it, col, a) => glow([[it.x0 - 6, EQY + 4], [it.x1 + 6, EQY + 4]], col, a, 60);

// ---------------------------------------------------------------- scenes
const SC = {};

SC.intro = (lt, S) => {
  const { P, at } = S;
  txt('氧化还原 · 配平与计算', 960, 150, { size: 62, p: P(0.2, 0.9) });
  txt('Copper and dilute nitric acid', 960, 202, { size: 34, f: EN, c: C.yellow, p: P(0.6, 0.8) });
  problemCard(P(0.4, 0.7));
  const B = PROBLEM.boxes;
  hiBox(B.eq, C.yellow, at(0, 0.4), lt);
  hiBox(B.mass, C.orange, at(1, 0.1), lt);
  hiBox(B.excess, C.blue, at(1, 0.5), lt);
  hiBox(B.q1, C.green, at(2, 0.1), lt);
  hiBox(B.q2, C.green, at(3, 0.1), lt);
  hiBox(B.q3, C.green, at(3, 0.5), lt);
  chip('未配平', 330, C.yellow, P(at(0, 0.8), 0.5));
  chip('19.2 g Cu', 720, C.orange, P(at(1, 0.8), 0.5));
  chip('配平 · 双线桥', 1120, C.green, P(at(2, 0.7), 0.5));
  chip('求 V(NO)、n', 1520, C.green, P(at(3, 0.8), 0.5));
};

// 02: oxidation states. A number line shows each element's state moving: up = loses e-, down = gains e-
const vY = v => 800 - v * 82;            // oxidation state -> y on the number line
SC.valence = (lt, S) => {
  const { P, at } = S;
  eqStrip(1);
  const L = eqDraw([null, null, null, null, null], { p: 0 });
  glowIt(L.items[0], C.blue, bump(lt, at(1, 0.05), 1.4)); glowIt(L.items[2], C.blue, bump(lt, at(1, 0.3), 1.4));
  glowIt(L.items[1], C.red, bump(lt, at(2, 0.05), 1.4)); glowIt(L.items[3], C.red, bump(lt, at(2, 0.3), 1.4));
  eqDraw([null, null, null, null, null], { arrow: '→', p: P(0.1, 1.2) });
  // line 0: a chalk underline sweeps the equation ("look for the elements that change")
  const sw = P(at(0, 0.2), Math.max(1, S.dur(0) * 0.6));
  if (sw > 0 && sw < 1) chalk([[L.items[0].x0, EQY + 44], [lerp(L.items[0].x0, L.items[4].x1, sw), EQY + 44]], { c: C.yellow, w: 4 });
  valence(eqX(L.items[0], 'Cu'), EQY, '0', P(at(1, 0.15), 0.4), C.blue);
  valence(eqX(L.items[2], 'Cu'), EQY, '+2', P(at(1, 0.5), 0.4), C.blue);
  valence(eqX(L.items[1], 'N'), EQY, '+5', P(at(2, 0.15), 0.4), C.red);
  valence(eqX(L.items[3], 'N'), EQY, '+2', P(at(2, 0.5), 0.4), C.red);
  // number line
  const np = P(at(0, 0.4), 1.0);
  if (np > 0) {
    chalk([[200, vY(-0.6)], [200, vY(5.6)]], { c: C.ink, w: 3, p: np });
    txt('化合价', 200, vY(5.6) - 26, { size: 28, c: C.gray, p: np });
    for (let v = 0; v <= 5; v++) {
      chalk([[190, vY(v)], [210, vY(v)]], { w: 2.5, p: np });
      mtx(v ? '+' + v : '0', 168, vY(v), { size: 26, c: C.gray, al: 'right', plain: true, a: np });
    }
  }
  const cu = eio(P(at(1, 0.3), 1.3)), nn = eio(P(at(2, 0.3), 1.3));
  if (lt > at(1, 0.1)) {
    token('Cu', 330, vY(2 * cu), C.blue, P(at(1, 0.1), 0.4));
    if (cu > 0.05) { arrow([[390, vY(0)], [390, vY(2 * cu)]], { c: C.blue, w: 4, head: 14 }); mtx('升 2，失 2e^-', 420, vY(1), { size: 28, c: C.blue, al: 'left', pop: clamp(cu * 2 - 1) }); }
  }
  if (lt > at(2, 0.1)) {
    token('N', 620, vY(5 - 3 * nn), C.red, P(at(2, 0.1), 0.4));
    if (nn > 0.05) { arrow([[680, vY(5)], [680, vY(5 - 3 * nn)]], { c: C.red, w: 4, head: 14 }); mtx('降 3，得 3e^-', 710, vY(3.5), { size: 28, c: C.red, al: 'left', pop: clamp(nn * 2 - 1) }); }
  }
  // line 3: the roles fly from the number line to the equation
  const r1 = eio(P(at(3, 0.1), 0.9)), r2 = eio(P(at(3, 0.45), 0.9));
  const t1 = [L.items[0].xc, EQY + 58], t2 = [L.items[1].xc, EQY + 58];
  if (r1 > 0 && r1 < 1) flyText('还原剂', [330, vY(2)], t1, r1, { c: C.blue, size: 30 });
  if (r2 > 0 && r2 < 1) flyText('氧化剂', [620, vY(2)], t2, r2, { c: C.red, size: 30 });
  if (r1 >= 1) txt('还原剂', ...t1, { size: 26, c: C.blue });
  if (r2 >= 1) txt('氧化剂', ...t2, { size: 26, c: C.red });
  board(1);
  bm(0, '标出变价元素的化合价：', at(0, 0.1), lt, { c: C.gray, size: 34 });
  bm(1, 'Cu：0 → +2，升 2，失 2e^-', at(1, 0.4), lt, { c: C.blue });
  bm(2, 'N：+5 → +2，降 3，得 3e^-', at(2, 0.4), lt, { c: C.red });
  bm(4, '还原剂 Cu（被氧化）', at(3, 0.2), lt, { c: C.blue });
  bm(5, '氧化剂 HNO3（被还原）', at(3, 0.55), lt, { c: C.red });
};

// 03: electrons lost = gained. Two rows of electrons grow group by group until equal (LCM), the group counts fly
// into the equation as coefficients; then an atom tally fills in the rest.
SC.balance = (lt, S) => {
  const { P, at } = S;
  eqStrip(1);
  const pk = [P(at(1, 0.35), 0.4), P(at(2, 0.6), 0.4), P(at(1, 0.5), 0.4), P(at(1, 0.7), 0.4), P(at(3, 0.3), 0.4)];
  const k = KF.map((v, i) => (pk[i] > 0 ? v : null));
  const L = eqDraw(k, { p: 0 });
  glowIt(L.items[1], C.yellow, bump(lt, at(2, 0.1), 1.6)); glowIt(L.items[4], C.yellow, bump(lt, at(3, 0.05), 1.6));
  eqDraw(k, { arrow: lt > at(3, 0.8) ? '=' : '→', pop: pk });
  [['Cu', 0, '0'], ['Cu', 2, '+2']].forEach(([e, i, v]) => valence(eqX(L.items[i], e), EQY, v, 1, C.blue));
  [['N', 1, '+5'], ['N', 3, '+2']].forEach(([e, i, v]) => valence(eqX(L.items[i], e), EQY, v, 1, C.red));
  // electron rows (lines 0-1)
  const rows = 1 - P(at(2, 0.05), 0.5);
  grp(rows, () => {
    const steps = ['L', 'G', 'L', 'G', 'L'], prog = P(at(0, 0.15), Math.max(1.5, S.dur(0) * 0.7)) * steps.length;
    let nl = 0, ng = 0;
    steps.forEach((s, i) => { if (prog > i) { if (s === 'L') nl += 2; else ng += 3; } });
    const X = j => 140 + j * 62;
    mtx('失电子：每个 Cu 失 2e^-', 110, 400, { size: 28, c: C.blue, al: 'left' });
    mtx('得电子：每个 NO 得 3e^-', 110, 560, { size: 28, c: C.red, al: 'left' });
    for (let j = 0; j < nl; j++) { fillPts(ellPts(X(j), 460, 17, 17), C.blue, 0.8); txt('−', X(j), 459, { size: 24, f: MF, c: THEME.cardSolid }); }
    for (let j = 0; j < ng; j++) { fillPts(ellPts(X(j), 620, 17, 17), C.red, 0.8); txt('−', X(j), 619, { size: 24, f: MF, c: THEME.cardSolid }); }
    for (let g = 0; g < nl / 2; g++) chalk([[X(2 * g) - 20, 492], [X(2 * g + 1) + 20, 492]], { c: C.blue, w: 3, seed: g });
    for (let g = 0; g < ng / 3; g++) chalk([[X(3 * g) - 20, 652], [X(3 * g + 2) + 20, 652]], { c: C.red, w: 3, seed: g + 9 });
    const done = P(at(0, 0.15) + Math.max(1.5, S.dur(0) * 0.7), 0.5);
    if (done > 0) {
      chalk([[X(5) + 31, 430], [X(5) + 31, 680]], { c: C.yellow, w: 3, dash: [10, 8], p: done });
      mtx('6e^-', X(5) + 31, 712, { size: 34, c: C.yellow, pop: done });
      mtx('×3', X(5) + 90, 460, { size: 36, c: C.blue, pop: done });
      mtx('×2', X(5) + 90, 620, { size: 36, c: C.red, pop: done });
    }
    // line 1: the group counts fly up into the coefficient slots
    const f1 = eio(P(at(1, 0.05), 0.8)), f2 = eio(P(at(1, 0.4), 0.8));
    if (f1 > 0 && f1 < 1) { flyText('3', [X(5) + 90, 460], [L.items[0].kx, EQY], f1, { c: C.yellow }); flyText('3', [X(5) + 90, 460], [L.items[2].kx, EQY], f1, { c: C.yellow }); }
    if (f2 > 0 && f2 < 1) flyText('2', [X(5) + 90, 620], [L.items[3].kx, EQY], f2, { c: C.yellow });
  });
  // atom tally (lines 2-3): values follow the coefficients as they are found (counting up)
  const tp = P(at(2, 0.05), 0.5);
  if (tp > 0) {
    const k1 = 8 * P(at(2, 0.3), 1.0), k4 = 4 * P(at(3, 0.15), 1.0);
    tally(470, 360, [
      { el: 'Cu', l: 3, r: 3 },
      { el: 'N', l: k1, r: 3 * 2 + 2 },
      { el: 'H', l: k1, r: 2 * k4 },
      { el: 'O', l: 3 * k1, r: 3 * 6 + 2 + k4 },
    ], { u: 10, max: 24, p: tp, hi: lt < at(3) ? 'N' : lt < at(3, 0.5) ? 'H' : 'O', mark: lt > at(2, 0.3) });
  }
  board(1);
  bm(0, '电子守恒：失电子数 = 得电子数', at(0, 0.05), lt, { c: C.gray, size: 34 });
  bm(1, '2 × 3 = 3 × 2 = 6', at(0, 0.6), lt, { c: C.yellow });
  bm(2, 'Cu、Cu(NO3)2 配 3，NO 配 2', at(1, 0.3), lt);
  bm(4, 'N：3 × 2 + 2 = 8 ⇒ HNO3 配 8', at(2, 0.3), lt);
  bm(5, 'H：8 ⇒ H2O 配 4', at(3, 0.15), lt);
  bm(6, 'O：24 = 24 ✓', at(3, 0.55), lt, { c: C.green });
  bbox(8, '3Cu + 8HNO3 = 3Cu(NO3)2 + 2NO↑ + 4H2O', at(3, 0.8), lt, { size: 32 });
};

// 04: double bridges drawn on the equation, electrons travel along them; then 6 electrons hop across
SC.bridge = (lt, S) => {
  const { P, at } = S;
  eqStrip(1);
  const L = eqDraw(KF, { p: 0 });
  glowIt(L.items[0], C.blue, bump(lt, at(0, 0.05), 1.4)); glowIt(L.items[2], C.blue, bump(lt, at(0, 0.3), 1.4));
  glowIt(L.items[1], C.red, bump(lt, at(1, 0.05), 1.4)); glowIt(L.items[3], C.red, bump(lt, at(1, 0.3), 1.4));
  eqDraw(KF);
  const lose = bridge([eqX(L.items[0], 'Cu'), EQY + 36], [eqX(L.items[2], 'Cu'), EQY + 36], '失去 3×2e^-', P(at(0, 0.3), 1.0), { side: 1, h: 54, c: C.blue });
  const gain = bridge([eqX(L.items[1], 'N'), EQY - 40], [eqX(L.items[3], 'N'), EQY - 40], '得到 2×3e^-', P(at(1, 0.3), 1.0), { side: -1, h: 50, c: C.red });
  const fl = 1 - P(at(2, 0.2), 0.5);
  eFlow(lose, P(at(0, 0.6), 0.4) * fl, { c: C.blue });
  eFlow(gain, P(at(1, 0.6), 0.4) * fl, { c: C.red });
  // line 2: the six electrons go from the "lost" box to the "gained" box one by one
  const bp = P(at(2, 0.05), 0.5);
  if (bp > 0) {
    const A = [520, 560], B = [1400, 560];
    grp(bp, () => {
      [[A, '失 3×2e^- = 6e^-', C.blue], [B, '得 2×3e^- = 6e^-', C.red]].forEach(([c, s, col], i) => {
        const box = [[c[0] - 230, c[1] - 70], [c[0] + 230, c[1] - 70], [c[0] + 230, c[1] + 70], [c[0] - 230, c[1] + 70], [c[0] - 230, c[1] - 70]];
        fillPts(box, THEME.card); chalk(box, { c: col, w: 3.5, seed: i });
        mtx(s, c[0], c[1], { size: 40, c: col });
      });
    });
    let moved = 0;
    for (let j = 0; j < 6; j++) {
      const e = eio(P(at(2, 0.15 + j * 0.1), 0.7));
      if (e >= 1) moved++;
      if (e > 0 && e < 1) {
        const q = along(quadPts(A[0] + 150, A[1] - 80, 960, 380, B[0] - 150, B[1] - 80, 30), e);
        fillPts(ellPts(q.x, q.y, 16, 16), C.yellow, 0.95); txt('−', q.x, q.y - 1, { size: 26, f: MF, c: THEME.cardSolid });
      }
    }
    mtx(`转移电子 ${moved}e^-`, 960, 740, { size: 56, c: C.yellow, pop: bp });
  }
};

// 05: moles. m(Cu) -> n(Cu) -> n(NO) -> V(NO); a light point travels each conversion and the value counts up
const NODE = { A: [250, 440], B: [690, 440], C: [690, 730], D: [250, 730] };
function node(c, top, val, p, col = C.ink) {
  if (p <= 0) return;
  scaleAt(c[0], c[1], back(p), () => {
    const box = [[c[0] - 130, c[1] - 62], [c[0] + 130, c[1] - 62], [c[0] + 130, c[1] + 62], [c[0] - 130, c[1] + 62], [c[0] - 130, c[1] - 62]];
    fillPts(box, THEME.card); chalk(box, { c: col, w: 3, seed: c[0] });
    mtx(top, c[0], c[1] - 24, { size: 32, c: C.gray });
    if (val) mtx(val, c[0], c[1] + 24, { size: 38, c: C.orange });
  });
}
function link(a, b, p, label, lpos, col = C.ink) {
  if (p <= 0) return;
  const d = vunit(vsub(b, a)), s = vadd(a, vmul(d, Math.abs(d[0]) > 0.5 ? 140 : 72)), t = vsub(b, vmul(d, Math.abs(d[0]) > 0.5 ? 140 : 72));
  arrow([s, t], { c: col, w: 4, head: 16, p });
  if (p < 1) { const q = mix2(s, t, eio(p)); fillPts(ellPts(q[0], q[1], 10, 10), C.yellow, 1); }
  if (label) mtx(label, lpos[0], lpos[1], { size: 28, c: C.purple, pop: clamp(p * 2 - 1) });
}
SC.mole = (lt, S) => {
  const { P, at } = S;
  eqStrip(1);
  const L = eqDraw(KF, { p: 0 });
  glowIt(L.items[0], C.orange, bump(lt, at(0, 0.05), 1.4));
  glow([[L.items[0].kx - 18, EQY], [L.items[0].kx + 18, EQY]], C.yellow, bump(lt, at(1, 0.05), 1.6), 60);
  glow([[L.items[3].kx - 18, EQY], [L.items[3].kx + 18, EQY]], C.yellow, bump(lt, at(1, 0.05), 1.6), 60);
  glowIt(L.items[3], C.orange, bump(lt, at(2, 0.05), 1.4) + bump(lt, at(3, 0.05), 1.4));
  eqDraw(KF);
  const eB = P(at(0, 0.55), 0.8), eC = P(at(2, 0.3), 0.8), eD = P(at(3, 0.45), 1.0);
  node(NODE.A, 'm(Cu)', '19.2 g', P(at(0, 0.05), 0.5));
  link(NODE.A, NODE.B, P(at(0, 0.3), 0.8), '÷ 64 g/mol', [470, 395]);
  node(NODE.B, 'n(Cu)', eB > 0 ? `${countTo(0, N_CU, eB, 1)} mol` : '', P(at(0, 0.35), 0.5));
  // line 1: coefficients 3 and 2 fly down from the equation to the conversion arrow
  const f = eio(P(at(1, 0.2), 1.0));
  if (f > 0 && f < 1) { flyText('3', [L.items[0].kx, EQY], [800, 585], f, { c: C.yellow }); flyText('2', [L.items[3].kx, EQY], [880, 585], f, { c: C.yellow }); }
  if (f >= 1) mtx('3 : 2', 840, 585, { size: 40, c: C.yellow });
  link(NODE.B, NODE.C, P(at(2, 0.05), 0.8), '', null);
  node(NODE.C, 'n(NO)', eC > 0 ? `${countTo(0, N_NO, eC, 1)} mol` : '', P(at(2, 0.1), 0.5));
  link(NODE.C, NODE.D, P(at(3, 0.2), 0.8), '× 22.4 L/mol', [470, 685]);
  node(NODE.D, 'V(NO) 标况', eD > 0 ? `${countTo(0, V_NO, eD, 2)} L` : '', P(at(3, 0.25), 0.5));
  board(1);
  bm(0, 'n(Cu) = m / M = 19.2 g ÷ 64 g/mol', at(0, 0.2), lt);
  bm(1, '      = 0.3 mol', at(0, 0.6), lt, { c: C.orange });
  bm(2, 'n(Cu) : n(NO) = 3 : 2', at(1, 0.3), lt, { c: C.yellow });
  bm(3, 'n(NO) = 0.3 × 2/3 = 0.2 mol', at(2, 0.2), lt, { c: C.orange });
  bm(5, 'V(NO) = n·V_m = 0.2 × 22.4', at(3, 0.2), lt);
  bm(6, '      = 4.48 L', at(3, 0.6), lt, { c: C.orange });
  bbox(8, '(2) V(NO) = 4.48 L', at(3, 0.8), lt);
};

// 06: of the 8 HNO3, 2 are reduced (-> NO) and 6 only act as an acid (-> nitrate)
SC.reduced = (lt, S) => {
  const { P, at } = S;
  eqStrip(1);
  const L = eqDraw(KF, { p: 0 });
  glowIt(L.items[1], C.yellow, bump(lt, at(0, 0.05), 1.6));
  glowIt(L.items[3], C.red, bump(lt, at(2, 0.05), 1.6));
  eqDraw(KF);
  const bins = P(at(1, 0.02), 0.5);
  const RB = [250, 700], BB = [660, 700];
  grp(bins, () => {
    [[RB, 200, '→ NO：N 降价，被还原', C.red], [BB, 300, '→ Cu(NO3)2：N 不变，酸性', C.blue]].forEach(([c, hw, s, col], i) => {
      const box = [[c[0] - hw / 2 - 20, c[1] - 70], [c[0] + hw / 2 + 20, c[1] - 70], [c[0] + hw / 2 + 20, c[1] + 70], [c[0] - hw / 2 - 20, c[1] + 70], [c[0] - hw / 2 - 20, c[1] - 70]];
      glow(box, col, i === 0 ? bump(lt, at(2, 0.1), 1.6) : 0, 20);
      chalk(box, { c: col, w: 3, seed: i });
      mtx(s, c[0], c[1] + 100, { size: 26, c: col });
    });
  });
  for (let i = 0; i < 8; i++) {
    const start = [150 + i * 95, 430];
    const tgt = i < 2 ? [RB[0] - 50 + i * 100, RB[1]] : [BB[0] - 120 + ((i - 2) % 3) * 120, BB[1] - 30 + Math.floor((i - 2) / 3) * 62];
    const e = eio(P(at(1, 0.1 + (i < 2 ? i * 0.06 : 0.15 + (i - 2) * 0.05)), 0.9));
    const q = mix2(start, tgt, e);
    molecule(q[0], q[1] - Math.sin(PI * e) * 60, 'HNO3', { r: 13, k: back(P(at(0, 0.1 + i * 0.08), 0.4)) });
  }
  txt('8 个 HNO₃', 480, 360, { size: 30, c: C.gray, p: P(at(0, 0.7), 0.5) });
  const ne = P(at(2, 0.4), 0.8);
  if (ne > 0) mtx(`${countTo(0, N_NO, ne, 1)} mol`, RB[0], RB[1] - 105, { size: 40, c: C.yellow, pop: ne });
  board(1);
  bm(0, '8 HNO3 中：', at(0, 0.3), lt, { c: C.gray, size: 34 });
  bm(1, '2 个 → NO（被还原）', at(1, 0.25), lt, { c: C.red });
  bm(2, '6 个 → Cu(NO3)2（酸性）', at(1, 0.6), lt, { c: C.blue });
  bm(4, 'n(被还原 HNO3) = n(NO) = 0.2 mol', at(2, 0.2), lt, { size: 34 });
  bm(5, '（共消耗 HNO3 0.3×2 + 0.2 = 0.8 mol）', at(2, 0.55), lt, { c: C.gray, size: 30 });
  bbox(7, '(3) 0.2 mol', at(2, 0.7), lt);
  stamp(1600, 820, '答：0.2 mol', P(at(2, 0.85), 0.5), C.yellow, 44);
};

SC.outro = (lt, S) => {
  const { P, at } = S;
  const cards = [
    ['标价态', '找变价元素', 'oxidation states', C.blue],
    ['电子守恒', '失 = 得 定系数', 'electrons', C.yellow],
    ['原子守恒', '补全其余', 'atoms', C.green],
    ['物质的量', 'n = m/M', 'moles', C.orange],
    ['分清作用', '被还原 / 酸性', 'two roles', C.red],
  ];
  grp(1 - P(at(1), 0.5), () => {
    cards.forEach(([top, zh, en, col], i) => {
      const x = 220 + i * 370, y = 520, p = P(at(0, 0.05 + i * 0.16), 0.6);
      if (p <= 0) return;
      scaleAt(x, y, back(p), () => {
        const pts = [[x - 160, y - 150], [x + 160, y - 148], [x + 162, y + 150], [x - 160, y + 152], [x - 160, y - 150]];
        fillPts(pts, THEME.card);
        chalk(pts, { c: col, w: 4, seed: i });
        txt(top, x, y - 80, { size: 44, c: col });
        txt(zh, x, y + 10, { size: 36 });
        txt(en, x, y + 80, { size: 30, f: EN, c: C.gray });
      });
      if (i < 4) arrow([[x + 168, y], [x + 202, y]], { c: C.gray, w: 4, head: 12, p: P(at(0, 0.12 + i * 0.16), 0.3) });
    });
    grp(P(0.2, 0.6), () => { eqStrip(1); eqDraw(KF, { size: 46 }); });
  });
  grp(P(at(1), 0.5), () => {
    puff(640, 580, 1.3 * back(P(at(1, 0.05), 0.6)), { wave: true });
    bubble(1180, 450, '4.48 L · 0.2 mol', P(at(1, 0.2), 0.5), { size: 54, c: C.yellow });
    txt('电子守恒 + 原子守恒', 960, 170, { size: 72, pop: P(at(1, 0.4), 0.6) });
    txt('See you next problem!', 960, 250, { size: 40, f: EN, c: C.yellow, pop: P(at(1, 0.6), 0.6) });
  });
};
