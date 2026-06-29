# 交互式数学网页指南

目标：产出**一个自包含的 HTML 文件**，双击即可在浏览器打开，包含讲解文字、正确渲染的公式、以及**至少一个真正影响图形的交互控件**。

> **网页是视频的“可玩版”，与视频配套交付。** 用分镜里的「共享设计规范」：同一概念、同一记号、同一参数与范围、同一配色。视频里变化的参数 → 网页里就是滑块；视频里的关键标注 → 网页里也画上。让看完视频的人能在网页里亲手复现那些变化。

直接用 `templates/interactive_template.html` 改。本指南解释它的每一块和注意事项。

---

## 1. 技术选型（一个默认 + 逃生口）

| 需求 | 默认方案 | 何时换 |
|------|----------|--------|
| 公式渲染 | **KaTeX**（CDN，自动渲染 `$...$`） | 需复杂排版可换 MathJax |
| 自定义几何/动画 | **`<canvas>` + 原生 JS** | 无 |
| 函数曲线图 | canvas 手绘，或 **function-plot / Plotly**（CDN） | 要缩放拖拽坐标系用 function-plot |
| 控件 | 原生 `<input type="range">` 滑块 + 数字显示 | 无 |

**保持依赖最少**：能用原生 canvas + KaTeX 解决就不引入大库。所有外部库走 CDN，单文件交付。

---

## 2. 文件骨架（核心结构）

**布局规范（默认）：单列居中 + 交互区放页面中间且尺寸偏小 + 先交互、后讲解。** 不要用左右两栏。

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>主题</title>
  <!-- KaTeX：公式 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js"></script>
  <style> /* 见 §4 */ </style>
</head>
<body>
  <div class="wrap">                       <!-- 居中容器 max-width ~760px -->
    <header><h1>标题</h1><p>先动手：…一句引导</p></header>

    <!-- 先交互：交互区居中、画布最大 ~420px -->
    <section class="stage">
      <canvas id="c"></canvas>
      <div class="controls"> 滑块们 </div>
      <div class="readout"> 实时数值（可选） </div>
    </section>

    <hr class="divider">

    <!-- 后讲解 -->
    <section class="explain">
      <h2>原理讲解</h2>
      讲解文字 + 公式（用 $...$ 写）
    </section>
  </div>
  <script> /* 见 §3 */ </script>
</body>
</html>
```

---

## 3. 交互三件套：参数 → draw() → 重绘

核心模式：**所有可调量是变量；任何控件变化就调 `draw()`；`draw()` 读变量、清屏、重画。**

```js
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');

// 1) 参数（与滑块一一对应）
const params = { a: 1, b: 0 };  // 例如 y = a x + b

// 2) 高清屏适配 + 自适应尺寸
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = cv.getBoundingClientRect();
  cv.width = rect.width * dpr;
  cv.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

// 3) 坐标变换：数学坐标 -> 画布像素（把原点放中心，y 向上）
function toPx(x, y, w, h, scale = 40) {
  return [w/2 + x*scale, h/2 - y*scale];
}

// 4) 绘制：读参数 -> 清空 -> 画坐标轴 -> 画图形
function draw() {
  const w = cv.clientWidth, h = cv.clientHeight;
  ctx.clearRect(0, 0, w, h);
  drawAxes(w, h);
  ctx.beginPath();
  for (let px = 0; px <= w; px++) {
    const x = (px - w/2) / 40;
    const y = params.a * x + params.b;
    const [sx, sy] = toPx(x, y, w, h);
    px === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = '#5b9cff'; ctx.lineWidth = 2; ctx.stroke();
}

// 5) 绑定滑块
function bindSlider(id, key, label) {
  const el = document.getElementById(id);
  const out = document.getElementById(id + '-val');
  const update = () => { params[key] = parseFloat(el.value); out.textContent = el.value; draw(); };
  el.addEventListener('input', update); update();
}

window.addEventListener('resize', resize);
window.addEventListener('load', () => { resize(); bindSlider('a','a'); bindSlider('b','b'); });
```

滑块 HTML：
```html
<label>斜率 a: <span id="a-val"></span>
  <input id="a" type="range" min="-5" max="5" step="0.1" value="1">
</label>
```

`drawAxes(w,h)` 自己实现：画两条灰线 + 刻度即可。

---

## 4. 样式与可用性（单列居中布局）

```css
:root { --bg:#0f1419; --fg:#e6e6e6; --accent:#5b9cff; --accent2:#ffd166; --muted:#9aa4b2; }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, "PingFang SC", sans-serif;
       background:var(--bg); color:var(--fg); line-height:1.7; }
.wrap { max-width:760px; margin:0 auto; padding:22px 20px 44px; }   /* 整页居中 */
header { text-align:center; margin-bottom:18px; }
header h1 { margin:0 0 .25rem; font-size:1.45rem; }
header p { color:var(--muted); margin:0; font-size:.92rem; }
/* 交互区：居中、尺寸偏小（画布最大 ~420px） */
.stage { max-width:420px; margin:0 auto; }
canvas { width:100%; aspect-ratio:1/1; background:#11161d; border:1px solid #222b36; border-radius:10px; display:block; }
.controls { margin-top:12px; }
.controls label { display:block; margin:8px 0 2px; color:var(--muted); font-size:.92rem; }
input[type=range]{ width:100%; accent-color:var(--accent); }
.readout { margin:12px auto 0; max-width:420px; text-align:center; color:var(--accent2); font-weight:600; }
/* 讲解区：在交互区下方 */
.divider { border:none; border-top:1px solid #222b36; margin:26px auto 0; max-width:680px; }
.explain { max-width:680px; margin:0 auto; }
.explain h2 { font-size:1.05rem; color:var(--muted); font-weight:600; margin:22px 0 6px; }
.explain p { margin:.55rem 0; }
.formula { background:#161c24; border:1px solid #222b36; border-radius:10px; padding:12px 16px; margin:12px 0; }
.katex { font-size:1.05em; }
```

要点：
- **单列居中**：`.wrap` 限宽并 `margin:0 auto`；不要左右两栏。
- **交互区放中间且偏小**：`.stage` 限 `max-width:~420px` 并居中，画布不要铺满整页。
- **先交互、后讲解**：DOM 顺序是 header → stage（交互）→ explain（讲解）。
- canvas 用 `width:100%` + `aspect-ratio`，配合 §3 的 `resize()` 做高清。
- 深色主题 + 高对比，文字用 `--fg`，次要信息 `--muted`。

---

## 5. 公式渲染（KaTeX）

正文里直接写 `$a^2+b^2=c^2$` 或块级 `$$...$$`，末尾自动渲染：
```js
window.addEventListener('load', () => {
  renderMathInElement(document.body, {
    delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]
  });
});
```
（模板已包含这段。）注意：把 `renderMathInElement` 放到 `auto-render` 脚本 `defer` 加载之后调用——用 `load` 事件最稳。

---

## 6. 交互设计建议

- **一个核心交互**胜过五个花哨控件。先确保主参数能拖、图形即时变。
- 滑块旁实时显示数值；关键量同时用 KaTeX 显示公式当前值。
- 极端值要稳：限制 `min/max/step`，`draw()` 里对除零、超界做保护。
- 可加“预设”按钮快速跳到典型情形（如“调到相切”）。
- 想做动画演示加一个“播放”按钮，用 `requestAnimationFrame` 推进某参数。

---

## 7. 验证：无视觉的自动检查（必过）

**写完先跑 `check_web.py`——它把“看不出来”的静默故障变成文字报告，不用看图：**
```bash
python3 .cursor/skills/math-explainer/scripts/check_web.py <主题>/index.html
```
必须 `[PASS]`（无 FAIL）。它会检查：$ 公式配对、KaTeX 是否齐全并被调用、`getElementById` 引用的 id 是否都存在、滑块是否绑了 input 事件、canvas/draw 链路、布局是否单列居中且“先交互后讲解”、以及（若装了 node）内联 JS 语法。`[FAIL]` 按提示逐条修到 0。`[warn]` 是建议，酌情优化。

人工/视觉二次确认（可选）：
```
- [ ] 单个 .html 文件，双击能打开（外部库走 CDN）
- [ ] 公式正确渲染（无残留 $、无乱码）；拖动每个滑块图形实时变化
- [ ] 缩放窗口/手机视口下布局不溢出、canvas 不模糊；控制台无报错
- [ ] 极端参数下不崩、不画出框
```
有视觉能力可在浏览器查看（macOS：`open <主题>/index.html`）做二次确认；**没有视觉能力，靠 `check_web.py` 的 `[PASS]` 即可交付。**
