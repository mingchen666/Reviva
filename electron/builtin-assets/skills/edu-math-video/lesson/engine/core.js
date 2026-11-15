// Shared helpers for the browser engine. Classic script: attaches to globalThis.SV so it works
// from file:// pages and from node tests (import for side effects).
(function (G) {
  const SV = (G.SV = G.SV || {});

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const back = (p) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const lerp = (a, b, p) => a + (b - a) * p;
  // progress of an op at time t (0 before start, 1 after end); optional fade-out at `out`
  const prog = (t, at, dur, out) => {
    let p = dur > 0 ? clamp((t - at) / dur) : t >= at ? 1 : 0;
    if (out != null) p = Math.min(p, 1 - clamp((t - out) / (dur || 0.4)));
    return p;
  };

  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
  };
  v3.norm = (a) => { const l = v3.len(a) || 1; return v3.scale(a, 1 / l); };
  v3.mean = (ps) => ps.reduce((s, p) => v3.add(s, v3.scale(p, 1 / ps.length)), [0, 0, 0]);

  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const u = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L);
    return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy);
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // "{BC1}" → italic math with subscript digits; "$...$" → KaTeX; everything else escaped text.
  function tex(str) {
    const katex = G.katex || SV._katex;
    // a formula keeps the punctuation right after it ("$x$，") so a wrapped line never starts with "，"
    const parts = String(str).split(/(\$[^$]+\$[，。、；：！？,.;:?）)」』]*|\{[^{}]+\})/g);
    return parts.map((part) => {
      const m = /^(\$[^$]+\$)([，。、；：！？,.;:?）)」』]+)$/.exec(part);
      if (m) return `<span class="nb">${tex(m[1])}${esc(m[2])}</span>`;
      if (/^\$[^$]+\$$/.test(part)) {
        const src = part.slice(1, -1);
        return katex ? katex.renderToString(src, { throwOnError: false }) : `<span class="m">${esc(src)}</span>`;
      }
      if (/^\{[^{}]+\}$/.test(part)) {
        const body = esc(part.slice(1, -1)).replace(/(\d+)/g, '<sub>$1</sub>').replace(/'/g, '′');
        return `<span class="m">${body}</span>`;
      }
      return esc(part);
    }).join('');
  }

  // label text for SVG: "C1" → C with subscript 1
  function svgLabel(name) {
    const m = /^([A-Za-z]+′*)(\d*)$/.exec(name);
    if (!m) return esc(name);
    return esc(m[1]) + (m[2] ? `<tspan font-family="KaTeX_Main" font-style="normal" font-size="0.62em" dy="0.32em">${m[2]}</tspan>` : '');
  }

  SV.u = { clamp, ease, back, lerp, prog, v3, segDist, esc };
  SV.tex = tex;
  SV.svgLabel = svgLabel;
})(globalThis);
