# 写动画：anim.js

先完整读一遍 `template/anim.js`（斜面往返示例，约 280 行），新题照它的结构写。`engine.js` 提供通用绘图函数（与 edu-math-video 同一套 API，只是换成蓝图主题），`phys.js` 提供物理道具（力箭头、斜面、物块、弹簧、光线、图像……）。**不要改 engine.js**；需要新的通用物理道具才改 phys.js，只属于这道题的图形写在 anim.js。

## 文件如何配合

`index.html` 依次加载：`build/timeline.js`（由 render.mjs 从 timeline.json 生成）→ `engine.js` → `phys.js` → `anim.js` → `boot()`。
渲染时 `render.mjs` 对每一帧调用 `renderFrame(t)`：画背景 → 当前幕的 `SC.<id>(lt, S)` → 左上角标签 → 字幕。幕切换时自动交叉淡化 0.75 秒。

`renderFrame(t)` 必须是**确定性的**：同一个 t 画出同一张图。不要用 `Math.random()`、`Date.now()`、`setTimeout`、跨帧累加的变量。需要随机就用 `hash(n)`，需要持续动的东西用全局 `NOW`（当前秒数）。

## 画布版面（1920×1080）

```
y=0    ┌──────────────────────────────────────────────────────────────┐
       │ 01 标签 Tag (x 64~700, y 40~105)                             │
y=130  │ ┌──── 图形区 ────────────┐  ┌──── 横线板 board() ─────────┐ │
       │ │ x 60 ~ 900             │  │ x 930 ~ 1870, y 130 ~ 880    │ │
       │ │ y 130 ~ 860            │  │ bl() 第 0~10 行，行距 62       │ │
       │ │                        │  │ 第 i 行 y = 192 + 62*i       │ │
       │ └────────────────────────┘  └──────────────────────────────┘ │
y=860  │ ········ 画面内容不得低于这里 ········  吉祥物 puff(1790,820,0.5)│
y=914  │            ┌──────── 字幕框（自动）────────┐                  │
y=1044 │            └───────────────────────────────┘                  │
y=1080 └──────────────────────────────────────────────────────────────┘
```
- intro 幕：标题 y=150，英文副标题 y=202，题目卡片在 y 240~730 之间自动适配，条件小标签 `chip()` 在 y=790。截图很高、intro 不放标题和 chip 时，在 anim.js 顶部 `Object.assign(FRAME, { y0: 110, y1: 880 })` 让卡片更大（见 examples/laser-curvature）。
- outro 幕：3 张卡片中心 x=400/960/1520，y=450；之后吉祥物 + 气泡。
- 图形太大放不下时，缩小比例尺（示例里的 `K`），不要把东西画到 y>860。

## 场景函数

```js
SC.solve = (lt, S) => {
  const { P, at } = S;
  fig({ len: 1, D: 1, CD: P(at(0, 0.5), 0.8) });        // 第 0 句说到一半时开始画 CD，0.8 秒画完
  board(1);
  bl(0, '计算 Compute:', 0, lt, { c: C.gray, size: 32 }); // 板子标题行
  bl(1, 'AB² = 3² + 4² = 25', at(0, 0.4), lt);            // 第 0 句 40% 处开始逐字写出
  bl(3, 'CD = 2.5', at(1, 0.2), lt, { c: C.red, size: 50 });
  stamp(1560, 760, '答：CD = 2.5', P(at(1, 0.7), 0.5), C.red, 50);
};
```
- `lt`：本幕开始后的秒数。
- `S.at(k, f)`：第 k 句旁白（从 0 数）开始后，经过这句时长的 f 比例的时刻。`at(k)` = 第 k 句开始。
- `S.P(a, dd=0.7)`：从时刻 a 开始、dd 秒内从 0 线性升到 1 的进度值，之前是 0、之后是 1。几乎所有函数的 `p` 参数都吃这个值。
- `S.cue(k)`、`S.dur(k)`、`S.n`（本幕句数）也可用。
- 缓动：`eio(x)`（慢-快-慢）、`eout(x)`、`back(x)`（带回弹）。例：`lerp(a, b, eio(P(at(2), 1.5)))`。
- 一个元素"只在某段时间显示"：`grp(P(t0, 0.4) * (1 - P(t1, 0.4)), () => {...})`。
- 幕与幕之间图形要连贯：下一幕开头把上一幕结尾的状态直接设为 1（示例 `SC.key` 里 `fig({len: 1, right: 1, D: 1, CD: 1, ...})`）。

**把图形写成一个带开关的函数**（示例的 `fig(st)`）：`st` 里每个键是一个元素的进度 0~1（不传 = 不画）。每幕只需决定哪些元素开、何时开。

## engine.js API 速查

所有坐标是画布像素；`o` 为可选参数对象。颜色用 `C.ink / red / blue / green / yellow / purple / gray / pink`，面板底色 `THEME.card`。
物理配色约定见 visual-design.md（重力黄、弹力蓝、摩擦粉、分力紫、合力/加速度绿、速度/光线红）。

**画线**
| 函数 | 说明 |
|---|---|
| `draw(pts, o)` | 手绘折线。`o.p` 画出进度，`o.c` 颜色，`o.w` 线宽(4)，`o.a` 透明度，`o.dash:[12,10]` 虚线，`o.rough` 抖动(1.7，0=直)，`o.single` 单笔，`o.seed` |
| `line(x1,y1,x2,y2,o)` | 线段 |
| `arrow(pts, o)` | 带箭头折线，`o.head` 箭头大小 |
| `circ(cx,cy,r,o)` | 手绘圆 |
| `ellPts(cx,cy,rx,ry,a0,a1,n)` | 椭圆/圆弧点列，配合 draw / fillPts |
| `quadPts(x0,y0,cx,cy,x1,y1)` | 二次曲线点列 |
| `fnPts(f, x0, x1, toScreen)` | 函数 y=f(x) 的点列（配合 `axes().S`） |
| `fillPts(pts, col, a)` | 填充多边形（半透明着色用 a=0.1~0.25） |
| `along(pts, u)` | 折线上比例 u 处的点 `{x,y,ang}`（动点沿路径运动） |
| `flow(pts, o)` | 沿路径移动的箭头 V 形（表示运动方向） |
| `mid(p,q)`、`mix2(p,q,t)`、`lerp`、`clamp` | 点运算 |

**几何标注**
| 函数 | 说明 |
|---|---|
| `dot(x,y,col,r)` | 实心点 |
| `ptLabel('A', q, dx, dy, p, col)` | 点 q 画点并在偏移 (dx,dy) 处写字母；偏移朝图形外侧，约 30~40px |
| `rightM(V, A, B, col, size, p)` | 直角符号 |
| `angM(V, A, B, col, r, p)` | 角的弧线 |
| `tickM(p, q, n, col, pp)` | 等长标记（n 条短杠） |
| `paraM(p, q, col, pp)` | 平行标记（中点处的 >） |

**文字**
| 函数 | 说明 |
|---|---|
| `txt(s, x, y, o)` | 文字，`o.p` 打字机进度，`o.size`，`o.f` 字体（默认 ZH 可爱中文；`EN` 手写英文；`MF` 算式），`o.al` 'center'/'left'/'right'，`o.c`，`o.pop` 弹出进度，`o.bold`。返回宽度 |
| `lb(zh, en, x, y, o)` | 中文+下方英文小字 |
| `board(p)` | 右侧横线板 |
| `bl(i, str, t, lt, o)` | 板子第 i 行（可小数），从 t 时刻逐字写出。`o.size` 默认 38（重点 44~50），`o.c`。**每行 ≤ 约 40 个字符**，超出会出板 |
| `stamp(x, y, str, p, col, size, rot)` | 盖章效果（最终答案） |
| `chip(str, x, col, p)` | intro 幕题目下方的条件小标签（y=790） |
| `bubble(x, y, str, p, o)` | 对话气泡 |
| `token(ch, x, y, col, k)` | 圆形字符标记（行程题里的"甲""乙"） |
| `puff(x, y, s, o)` | 吉祥物小气团：`s` 大小（角落 0.5，结尾 1.3），`o.look:[dx,dy]` 看的方向，`o.wave` 挥手，`o.mood:'wow'` |

**讲解动作**（设计方法见 visual-design.md）
| 函数 | 说明 |
|---|---|
| `bump(lt, t0, dur=1.2)` | t0 起 0→1→0 的脉冲值：配合 glow 在"提到"时闪一下 |
| `glow(pts, col, a, w=22)` | 荧光笔：在元素**下面**画粗的半透明线（先调用它再画元素） |
| `slideSeg(a, b, c, d, e, o)` | 线段 a-b 的复制品平移+旋转+伸缩到 c-d（e = 0..1，用 `eio(P(...))`）：相等、平行、对应 |
| `movePoly(pts, dx, dy, rot, k)` | 多边形绕自身重心平移/旋转/缩放后的新点列：全等叠合、相似缩放 |
| `tween(P0, P1, e)` | 两组点之间插值（形变、展开） |
| `callout(from, to, p, col)` | 从图上一点到板子某行的弯曲虚线箭头 |
| `flyText(str, from, to, e, o)` | 数值标签从图上沿弧线飞到板子（"代入"）；`blPos(i, dx)` 给出板子第 i 行的位置 |
| `countTo(v0, v1, e, dec)` | 随进度计数的数字字符串 |
| `camTween(A, B, e)` | 在两个相机姿态之间插值；`pitch: PI/2` 为正俯视图 |

**容器**
| 函数 | 说明 |
|---|---|
| `grp(a, fn)` | 以透明度 a 画 fn 里的内容（淡入淡出） |
| `scaleAt(x, y, k, fn)` | 以 (x,y) 为中心缩放 |

**题目卡片**：`problemCard(p)`、`hiBox(box, col, t, lt)`（见下节）。

**坐标系**：
```js
const ax = axes({ ox: 300, oy: 600, sx: 70, sy: 70, xr: [-3, 5], yr: [-2, 5], step: 1 });
ax.draw(P(0.3, 1.2), true);                                        // 画坐标轴（第二个参数 true = 网格）
draw(fnPts(x => (x - 1) ** 2 - 1, -1.2, 3.2, ax.S), { c: C.blue, w: 5, p: P(at(0), 1.5) });
ptLabel('P', ax.S([1, -1]), 30, 20, 1, C.red);                     // ax.S([x,y]) 数学坐标 → 屏幕坐标
```
范围要算好：`ox + xr[0]*sx ≥ 60`，`ox + xr[1]*sx ≤ 880`，`oy - yr[1]*sy ≥ 150`，`oy - yr[0]*sy ≤ 850`。

**立体几何（斜二测风格相机）**：
```js
CAM.cx = 470; CAM.cy = 520; CAM.s = 160; CAM.target = [0, 0, 1];   // 在 anim.js 顶层设置
// 世界坐标：x 向右，y 朝向观众（画在下方），z 向上
const G = { A: [-2, 0, 0], B: [2, 0, 0], P: [0, 0, 2], ... };
L3(G.A, G.B);                      // 3D 线段
L3(G.A, G.C, { hidden: true });    // 被挡住的棱画虚线（课本规范），画完看截图确认哪些该虚
draw(arc3(G.O, G.A, G.P, 0.4), { c: C.red, w: 3 });   // 3D 角弧
const q = pr(G.P);                 // 3D 点 → 屏幕 [x,y]，用于 ptLabel / fillPts
```
想让图形缓慢转动增加立体感：场景里 `CAM.yaw = 0.2 + 0.14 * Math.sin(NOW * 0.42);`（每帧都设，保证确定性）。

**行程/动点题**：用时间参数算位置，不要逐帧累加。
```js
const at_s = s => s <= 60 ? mix2(A, B, s / 60) : mix2(B, C_, (s - 60) / 80);   // 路程 s → 屏幕位置
const tau = lerp(-10, 7.5, eio(P(at(1), 3)));                                     // 动画里的"题目时间"
const pj = at_s(4 * (tau + 10));  token('甲', ...pj, C.red);
```
并在图形区左上角实时显示时间和路程（`txt(\`t = ${tau.toFixed(1)} s\`, 90, 180, {al: 'left'})`）。

## phys.js API 速查

坐标是屏幕像素，y 向下；角度是弧度，从 +x 转向 +y（"向上" = −PI/2）。向量是 `[x, y]` 数组。

**向量小工具**：`vadd(a,b)`、`vsub`、`vmul(a,k)`、`vlen`、`vdot`、`vunit`、`vperp(a)`（转 90°）、`polar(len, ang)`、`deg(37)`。

**文字（带上下标）**
| 函数 | 说明 |
|---|---|
| `mtx(s, x, y, o)` | 像 `txt`，但 `d_A`、`v_0^2`、`x_{max}` 渲染成下标/上标。o: `{p, size, c, al, a, pop, bold, glow}` |
| `mwidth(s, size, font)` | mtx 文本宽度 |
| `bm(i, str, t, lt, o)` | 板子第 i 行（同 `bl`，但支持上下标）。物理板书一律用 `bm` |
| `bbox(i, str, t, lt, o)` | 板子第 i 行的发光答案框："(1) a_1 = 10 m/s^2" |
| 字幕 | 引擎的字幕也用 mtx 渲染，script.json 的 zh/en 里直接写 `d_A`、`v^2` |

**力与矢量**
| 函数 | 说明 |
|---|---|
| `vec(from, v, o)` | 从 from 沿屏幕向量 v 画箭头，返回箭尖。o: `{c, p: 生长 0..1, w, label, size, dash, a, lo, lside}`；标签自动放在箭尖外侧，`lo` 侧移 |
| `vecA(from, len, ang, o)` | 长度 + 角度版 |
| `components(from, v, axis, e, o)` | 沿 axis 及其垂直方向分解：投影虚线 → 两个分力生长。o: `{c, labels: ['mg sinθ', 'mg cosθ'], lside0, lside1}`；返回 `{a, b}` |
| 比例 | 一幕里 `const FS = 8`（px/N）、`VS = 12`（px per m/s），所有箭头按它算长度 |

**场景**
| 函数 | 说明 |
|---|---|
| `incline(A, th, run, dir, o)` | 斜面：A 为有角的底角，水平长 run，dir 1 向右升 / −1 向左升。返回 `{A, T, F, up, n, th, at(s)}`；`o.p: 0` 只算几何不画 |
| `block(c, w, h, ang, o)` | 物块，c = 底面中心，ang = 底面倾角（斜面上用 `Math.atan2(G.up[1], G.up[0])`）。返回 `{c, mid, corners, u, n}`；`o.p: 0` 只算几何 |
| `ground(a, b, o)` | 地面/墙面 + 阴影线（`o.side` 选哪一侧） |
| `ball(x, y, r, o)`、`spring(a, b, o)`、`pulley(c, r, rot)` | 小球、弹簧（随端点伸缩）、滑轮 |
| `tech(pts, o)` | 细直的"工程线"（装置、辅助线） |
| `dimLine(x1, y1, x2, y2, label, p, o)` | 尺寸线（两端挡板 + 箭头 + 标签，`o.off` 标签偏移） |
| `arcMark(x, y, r, a0, a1, label, p, col, lr)` | 角弧 + 标签 |
| `notToScale(p)` | 左下角"（角度已放大）" |

**运动与图像**
| 函数 | 说明 |
|---|---|
| `simT(lt, t0, dur, T)` | 旁白时间 → 物理时间（线性，0..T）。物体位置只能用它 + 解析解 |
| `trail(pos, t0, t1, o)` | 轨迹：`pos(t) → [x, y]`；`o.dots: 0.1` 画成频闪点 |
| `clockTag(x, y, t)`、`readout(x, y, name, val, unit)` | 计时器、实时读数 |
| `graph(o)` | v-t / x-t 图：`{ox, oy, w, h, xr, yr, xl, yl, xt, yt}` → `{S, draw(p), curve(f, x0, x1, o), area(f, x0, x1, col, a), cursor(x, f, col)}` |
| `bars(x, y, h, items, vmax, o)` | 能量 / 动量柱：`items = [{label, v, c}]`，每帧传实时值 |

**光学与电磁**
| 函数 | 说明 |
|---|---|
| `ray(pts, p, o)` | 发光光线（脉冲沿光线跑），返回当前光头位置 |
| `spot(x, y, a, col)` | 屏上光斑 |
| `refractDir(d, n, n1, n2)` | 折射后的单位方向（全反射返回 null） |
| `glassBlock(cx, cy, w, h, ang, p)` | 玻璃砖 |
| `bField(x0, y0, x1, y1, 'in'|'out', o)`、`eField(x0, y0, x1, y1, ang, o)`、`charge(x, y, '+'|'-')` | 磁场 ×/·、匀强电场箭头、点电荷 |

**解析解写在 anim.js 顶部**（template 的写法）：
```js
const SIN = 0.6, COS = 0.8, TH = Math.atan2(SIN, COS);   // 课本近似值，和答案一致
const A1 = 10, T1 = 1, XMAX = 5, A2 = 2, T2 = Math.sqrt(5);
const sPos = t => t <= T1 ? V0 * t - 0.5 * A1 * t * t : XMAX - 0.5 * A2 * (t - T1) ** 2;
const vel  = t => t <= T1 ? V0 - A1 * t : -A2 * (t - T1);
const G = incline([200, 780], TH, 640, 1, { p: 0 });
const blockAt = t => block(G.at(S0 + PXM * sPos(t)), BW, BH, ANG, { p: 0 });
```

## 题目图片与高亮框

`anim.js` 顶部：
```js
const PROBLEM = {
  src: 'problem.png', srcW: 1500, srcH: 240,          // 图片真实像素尺寸
  boxes: {                                            // 源图片像素坐标 [x0, y0, x1, y1]；折行的短语给多个框
    AC: [[773, 44, 915, 116]],
    mid: [[1123, 44, 1422, 116], [34, 124, 184, 196]],
  },
};
```
intro 幕：
```js
problemCard(P(0.4, 0.7));                             // 卡片 + 图片（自动缩放居中）
hiBox(PROBLEM.boxes.AC, C.blue, at(1, 0.2), lt);      // 读到第 1 句的 20% 时框出
chip('AC = 3', 800, C.blue, P(at(1, 0.8), 0.5));      // 下方小标签
```
坐标来源：
- **文字题**：`make_problem_png.py --text ... --mark ...` 直接输出 `srcW/srcH/boxes`，并生成 `problem.preview.png`，打开看一眼。`--mark` 的短语必须与 `--text` 里的字符完全一致（全角/半角、空格）。
- **截图**：
  1. 截图里有多道题或大片空白 → `PY SKILL/scripts/problem_boxes.py crop raw.png x0 y0 x1 y1 PROJ/problem.png`。
  2. `problem_boxes.py grid PROJ/problem.png` → 打开 `problem.grid.png`，每 50px 一条线、每 100px 标数字，读出每个条件的范围。
  3. `problem_boxes.py check PROJ/problem.png '{"AC":[[x0,y0,x1,y1]], ...}'` → 打开 `problem.check.png` 确认红框罩住文字，不对就改数再 check。
  4. 手机拍照歪斜、太暗时，告诉用户最好给清晰截图；或者改用文字题方式重新生成图片。

## 审查清单

先跑 `node render.mjs motion`（见 visual-design.md），通过后再看截图。

每次 `stills auto` + `contact_sheet.py` 之后，逐张对照。**写下你实际看到的内容，不要凭印象打勾**；看不清的地方用读图工具直接打开对应的单张 `build/stills/*.png`：
- [ ] **题目图片文字完整**：放大看 intro 截图，没有 ☒/□ 方框、缺字、乱码（缺字体时 ² − √ 等符号会变方框）
- [ ] **没有 JS 报错**（render.mjs 没打印 `FAILED` / `PAGE ERROR`）
- [ ] **不压字幕**：所有图形、文字、吉祥物都在 y ≤ 860
- [ ] **不出界**：板子上的文字没超出右边框（x ≤ 1850），图形没进入板子区域
- [ ] **不重叠**：点的字母、长度标注、算式标签互不遮挡；与线条交叉处可读
- [ ] **同步**：每张截图（=某句旁白快结束时）里，这句话提到的东西都已经出现，还没提到的还没出现
- [ ] **intro**：每句读题都框出了对应条件，框的位置准确
- [ ] **图形完整**：storyboard 顶部图形清单里的每个点、每条线段、每个关系都画出来了（题目说 DE∥BC，就必须有 DE，而且真的平行）
- [ ] **正确**：图上数值、板子算式、字幕与你第 1 步的解答完全一致；力的方向对（摩擦力与相对运动相反、N 垂直接触面、重力竖直向下），箭头长度比例对（12 N 比 8 N 长）；物体停下、反向的时刻与解一致
- [ ] **结尾**：outro 有答案；`zz_end.png` 画面完整
- [ ] 板子一幕内最多 ~9 行；再多就分成两幕

需要看动画中间状态时：`node render.mjs stills 12.5,13,13.5`（秒数可从 `build/timeline.json` 里每句的 start/end 查）。

浏览器预览：配音生成后（`render.mjs stills` 会写 `build/timeline.js`）直接 `open PROJ/index.html`，不需要服务器；点画面或空格 播放/暂停，拖进度条跳转，←/→ 快退/快进 5 秒。

## 常见坑
- 用了 anim.js 里没定义的函数名 → 截图时报 `PAGE ERROR ... is not defined`，该帧后半部分空白。
- 在 `SC.xxx` 外面（顶层）用 `NOW`、`lt` 计算东西 → 只算一次，不会动。
- `bl()` 的 t 参数写成了进度（0~1）而不是时刻：`bl(1, '...', at(0, 0.5), lt)` 才对。
- `P()` 的第一个参数写成 `at(k)` 以外的绝对秒数 → 换配音后错位。
- 题目图片不显示 → `PROBLEM.src` 文件名不对，或 srcW/srcH 与实际尺寸不符（高亮框会整体偏移）。
- 大量 `fillPts` 叠加不透明色 → 挡住下面的线；着色用 a ≤ 0.25。
