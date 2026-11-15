// Figure engine: solid3d (rotatable, auto hidden lines), plane2d, graph.
// All three share one model: named points in 3D (2D figures use z=0), a projection that may
// depend on t (camera keyframes), and a list of timed drawing ops. render(t) is pure.
(function (G) {
  const SV = G.SV;
  const { clamp, ease, back, prog, v3, segDist, esc } = SV.u;
  const RAD = Math.PI / 180;
  const Z = { face: 0, poly: 0, grid: 0, axes: 1, seg: 2, curve: 2, rt: 3, angle: 3, par: 3, dot: 4, label: 5, text: 5 };

  function camBasis(az, el) {
    const a = az * RAD, e = el * RAD;
    return {
      r: [Math.sin(a), -Math.cos(a), 0],
      up: [Math.sin(e) * Math.cos(a), Math.sin(e) * Math.sin(a), Math.cos(e)],
      view: [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), -Math.sin(e)],
    };
  }
  const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

  function create(spec, opsIn, opts = {}) {
    const type = spec.type || 'solid3d';
    const ops = opsIn.map((o) => ({ ...o }));
    const P = {};
    const to3 = (v) => (v.length === 2 ? [v[0], v[1], 0] : v.slice());
    for (const [k, v] of Object.entries(spec.points || {})) P[k] = to3(v);
    const on = { ...(spec.on || {}) };
    const addPoint = (o) => {
      if (o.mid) { P[o.name] = v3.scale(v3.add(P[o.mid[0]], P[o.mid[1]]), 0.5); on[o.name] = on[o.name] || o.mid; }
      else P[o.name] = to3(o.pos);
      if (o.on) on[o.name] = o.on;
    };
    (spec.extra || []).forEach(addPoint);
    ops.filter((o) => o.op === 'point').forEach(addPoint);
    const baseNames = Object.keys(spec.points || {});
    const CEN = spec.center ? to3(spec.center) : v3.mean(baseNames.map((n) => P[n]));

    // ---- faces / edges (solid3d) ----
    const faces = (spec.faces || []).map((names) => {
      const q = names.map((n) => P[n]);
      let n = v3.cross(v3.sub(q[1], q[0]), v3.sub(q[2], q[0]));
      if (v3.dot(n, v3.sub(v3.mean(q), CEN)) < 0) n = v3.scale(n, -1);
      return { names, n: v3.norm(n), o: q[0] };
    });
    const edgeKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    const edges = [];
    const seen = new Set();
    const pushEdge = (a, b) => { const k = edgeKey(a, b); if (!seen.has(k)) { seen.add(k); edges.push([a, b]); } };
    faces.forEach((f) => f.names.forEach((n, i) => pushEdge(n, f.names[(i + 1) % f.names.length])));
    (spec.edges || []).forEach(([a, b]) => pushEdge(a, b));

    const EPS = 1e-6;
    const onPlane = (f, p) => Math.abs(v3.dot(f.n, v3.sub(p, f.o))) < 1e-6;
    const inside = (p) => faces.every((f) => v3.dot(f.n, v3.sub(p, f.o)) <= EPS);
    function isHidden(pa, pb, view) {
      if (type !== 'solid3d' || !faces.length) return false;
      if (!inside(pa) || !inside(pb)) return false;
      return !faces.some((f) => onPlane(f, pa) && onPlane(f, pb) && v3.dot(f.n, view) < 0);
    }

    // ---- camera ----
    const home = { az: 225, el: 24, ...(spec.camera && spec.camera.home) };
    const sway = opts.sway || 0;
    function bestView(names, from) {
      const f = faces.find((x) => x.names.length === names.length && names.every((n) => x.names.includes(n)));
      const n = f ? f.n : v3.norm(v3.cross(v3.sub(P[names[1]], P[names[0]]), v3.sub(P[names[2]], P[names[0]])));
      const pts = Object.values(P);
      let best = null;
      for (let az = 0; az < 360; az += 10) for (const el of [12, 20, 28, 36]) {
        const B = camBasis(az, el);
        const facing = -v3.dot(n, B.view);
        if (facing < 0.35) continue;
        const scr = pts.map((p) => [v3.dot(p, B.r), -v3.dot(p, B.up)]);
        let md = Infinity;
        for (let i = 0; i < scr.length; i++) for (let j = i + 1; j < scr.length; j++) md = Math.min(md, Math.hypot(scr[i][0] - scr[j][0], scr[i][1] - scr[j][1]));
        // points off the target face should not project inside it (they would crowd its labels)
        const poly = names.map((nm) => { const p = P[nm]; return [v3.dot(p, B.r), -v3.dot(p, B.up)]; });
        let inside = 0;
        Object.entries(P).forEach(([nm, p], i) => { if (!names.includes(nm) && pointInPoly(scr[i], poly)) inside++; });
        const score = 2 * Math.min(facing, 0.82) + 4 * md - 0.6 * inside - 0.25 * Math.abs(wrap180(az - from.az)) / 180 - 0.01 * Math.abs(el - from.el);
        if (!best || score > best.score) best = { az, el, score };
      }
      return best ? { az: best.az, el: best.el } : { ...from };
    }
    // resolve camera ops into absolute keyframes once
    const camOps = ops.filter((o) => o.kind === 'cam').sort((a, b) => a.at - b.at);
    { let cur = { ...home };
      for (const o of camOps) {
        let tgt;
        if (o.face) tgt = bestView(o.face, cur);
        else if (o.home) tgt = { ...home };
        else tgt = { az: o.az != null ? o.az : cur.az + (o.daz || 0), el: o.el != null ? o.el : cur.el + (o.del || 0) };
        tgt.az = cur.az + wrap180(tgt.az - cur.az);
        o.from = { ...cur }; o.to = tgt; cur = tgt;
      } }
    function camera(t) {
      let c = { ...home };
      for (const o of camOps) {
        if (t < o.at) break;
        const p = ease(clamp((t - o.at) / (o.dur || 1.6)));
        c = { az: o.from.az + (o.to.az - o.from.az) * p, el: o.from.el + (o.to.el - o.from.el) * p };
        if (p < 1) break;
      }
      if (sway) c.az += sway * Math.sin((2 * Math.PI * t) / 14);
      return c;
    }

    // ---- projection ----
    function rawProj(t) {
      if (type === 'solid3d') {
        const c = camera(t), B = camBasis(c.az, c.el);
        const f = (p) => { const q = v3.sub(p, CEN); return [v3.dot(q, B.r), -v3.dot(q, B.up)]; };
        f.view = B.view; return f;
      }
      const f = (p) => [p[0], -p[1]]; f.view = [0, 0, -1]; return f;
    }
    let fitCache = null;
    function fit(w, h, duration, pad = 0) {
      if (type === 'graph') {
        const v = spec.view || { xmin: -5, xmax: 5, ymin: -5, ymax: 5 };
        let sx = w / (v.xmax - v.xmin), sy = h / (v.ymax - v.ymin);
        if (spec.equalAspect !== false) sx = sy = Math.min(sx, sy);
        const cx = (v.xmin + v.xmax) / 2, cy = (v.ymin + v.ymax) / 2;
        fitCache = { s: 1, sx, sy, cx, cy, w, h };
        return;
      }
      const ts = [0];
      for (let i = 1; i <= 120; i++) ts.push((duration * i) / 120);
      camOps.forEach((o) => ts.push(o.at + (o.dur || 1.6)));
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const t of ts) {
        const pr = rawProj(t);
        for (const p of Object.values(P)) { const [x, y] = pr(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
      const s = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1)) * (spec.zoom || 0.9);
      fitCache = { s, sx: s, sy: s, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, h };
    }
    function proj(t) {
      const F = fitCache, pr = rawProj(t);
      const g = (p) => { const [x, y] = pr(p); return [(x - F.cx * (type === 'graph' ? 1 : 1)) * F.sx + F.w / 2, (y + (type === 'graph' ? F.cy : -F.cy)) * F.sy + F.h / 2]; };
      g.view = pr.view; return g;
    }

    // ---- intro ops: draw the given figure at the start ----
    function intro(t0 = 0.2) {
      const out = [];
      let t = t0;
      if (type === 'graph') {
        out.push({ op: 'axes', at: t, dur: 0.8 }); t += 0.5;
      }
      edges.forEach(([a, b]) => { out.push({ op: 'seg', a, b, role: 'edge', at: t, dur: 0.35 }); t += 0.07; });
      faces.forEach((f, i) => out.push({ op: 'face', pts: f.names, at: t0 + 0.1 * i, dur: 0.6 }));
      (spec.given || []).forEach(([a, b]) => { out.push({ op: 'seg', a, b, role: 'given', at: t, dur: 0.3 }); t += 0.08; });
      (spec.marks || []).forEach((m) => out.push({ ...m, at: t, dur: 0.3 }));
      (spec.curves || []).forEach((c) => { out.push({ op: 'curve', ...c, at: t, dur: 1.2 }); t += 0.4; });
      const labels = spec.labels === false ? [] : Object.keys(spec.points || {}).concat((spec.extra || []).map((e) => e.name));
      labels.forEach((n, i) => out.push({ op: 'label', p: n, at: t0 + 0.3 + i * 0.05, dur: 0.3 }));
      Object.keys(on).filter((n) => labels.includes(n)).forEach((n) => out.push({ op: 'dot', p: n, at: t, dur: 0.25 }));
      out.introEnd = t + 0.4;
      return out;
    }

    // ---- drawing ----
    const pt = (n) => { if (!P[n]) throw new Error('unknown point ' + n); return P[n]; };
    const attr = (o) => Object.entries(o).filter(([, v]) => v != null && v !== false).map(([k, v]) => `${k}="${v}"`).join(' ');
    function line(a, b, R, extra = {}) {
      return `<line ${attr({ x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1), stroke: R.c, 'stroke-width': R.w, 'stroke-linecap': 'round', 'stroke-dasharray': R.dash, opacity: (R.o ?? 1).toFixed(3), filter: R.glow ? 'url(#svGlow)' : null, ...extra })}/>`;
    }
    function arrowHead(a, b, R, size = 12) {
      let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const p1 = [b[0] - dx * size - dy * size * 0.45, b[1] - dy * size + dx * size * 0.45], p2 = [b[0] - dx * size + dy * size * 0.45, b[1] - dy * size - dx * size * 0.45];
      return `<polygon points="${b.join(',')} ${p1.join(',')} ${p2.join(',')}" fill="${R.c}" opacity="${R.o ?? 1}"/>`;
    }

    function render(t, allOps, theme) {
      const pr = proj(t), S = (n) => pr(pt(n));
      const roles = theme.roles;
      const active = allOps.map((o) => ({ o, p: prog(t, o.at, o.dur, o.out) })).filter((x) => x.p > 0 && x.o.op);
      active.sort((x, y) => (Z[x.o.op] ?? 2) - (Z[y.o.op] ?? 2));
      let svg = '', tip = null;
      const segs = [];
      const c0 = pr(CEN);
      const labelBoxes = [];
      const F = fitCache;
      const dataToScr = (x, y) => pr([x, y, 0]);

      for (const { o, p } of active) {
        const e = ease(p);
        switch (o.op) {
          case 'seg': {
            const a3 = pt(o.a), b3 = pt(o.b);
            const a = pr(a3), b = pr(b3);
            const x = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
            if (p < 1) tip = x;
            const R0 = roles[o.role || 'edge'] || roles.edge;
            const hidden = o.role !== 'axis' && isHidden(a3, b3, pr.view);
            const hm = hidden ? (o.role === 'edge' || !o.role ? theme.hid : theme.hidAcc) : {};
            const R = { ...R0, dash: o.dash ? theme.hid.dash || '8 8' : hm.dash, o: (R0.o ?? 1) * (hm.o ?? 1) * (o.fade != null ? o.fade : 1), w: R0.w * (hm.w ?? 1) };
            svg += line(a, x, R);
            if (o.arrow && p >= 1) svg += arrowHead(a, b, R);
            segs.push([a, b]);
            break;
          }
          case 'face': case 'poly': {
            const R = roles[o.op === 'face' ? 'face' : o.role || 'tri'];
            if (!R && !o.fill) break;
            svg += `<polygon points="${o.pts.map((n) => S(n).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${o.fill || R.f}" opacity="${((o.opacity ?? R.o) * e).toFixed(3)}"/>`;
            break;
          }
          case 'rt': {
            const v = pt(o.v), u1 = v3.norm(v3.sub(pt(o.a), v)), u2 = v3.norm(v3.sub(pt(o.b), v)), k = o.size || 0.28 * diam() / 3;
            const q = [v3.add(v, v3.scale(u1, k)), v3.add(v3.add(v, v3.scale(u1, k)), v3.scale(u2, k)), v3.add(v, v3.scale(u2, k))].map((x) => pr(x).map((n) => n.toFixed(1)).join(','));
            svg += `<polyline points="${q.join(' ')}" fill="none" stroke="${(roles[o.role] || roles.edge).c}" stroke-width="1.6" opacity="${0.75 * e}"/>`;
            break;
          }
          case 'angle': {
            const v = pt(o.v), u1 = v3.norm(v3.sub(pt(o.a), v)), u2 = v3.norm(v3.sub(pt(o.b), v));
            const ang = Math.acos(clamp(v3.dot(u1, u2), -1, 1)), r = o.r || diam() / 9, n = 20;
            const perp = v3.norm(v3.sub(u2, v3.scale(u1, v3.dot(u1, u2))));
            const arc = [];
            for (let i = 0; i <= n * e; i++) { const g = (ang * i) / n; arc.push(pr(v3.add(v, v3.add(v3.scale(u1, r * Math.cos(g)), v3.scale(perp, r * Math.sin(g)))))); }
            const R = roles[o.role || 'key'] || roles.key;
            svg += `<polyline points="${arc.map((q) => q.map((x) => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${R.c}" stroke-width="2.4" stroke-linecap="round"/>`;
            if (o.text && p >= 1) {
              const mid = v3.norm(v3.add(u1, u2)), q = pr(v3.add(v, v3.scale(mid, r * 1.75)));
              svg += `<text x="${q[0]}" y="${q[1]}" text-anchor="middle" dominant-baseline="middle" font-family="KaTeX_Main" font-size="${theme.labelSize * 0.8}" fill="${R.c}">${esc(o.text)}</text>`;
            }
            break;
          }
          case 'par': {
            const a = S(o.a), b = S(o.b), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
            const k = 8 * back(p), c = (roles[o.role || 'key'] || roles.key).c;
            const ticks = o.n || 1; let s = '';
            for (let i = 0; i < ticks; i++) {
              const off = (i - (ticks - 1) / 2) * 9, mm = [m[0] + dx * off, m[1] + dy * off];
              s += `<polyline points="${mm[0] - dx * k - dy * k * 0.8},${mm[1] - dy * k + dx * k * 0.8} ${mm[0] + dx * k * 0.4},${mm[1] + dy * k * 0.4} ${mm[0] - dx * k + dy * k * 0.8},${mm[1] - dy * k - dx * k * 0.8}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="${Math.min(1, p * 3)}"/>`;
            }
            svg += s;
            break;
          }
          case 'dot': {
            const q = S(o.p);
            svg += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${(5 * back(p)).toFixed(2)}" fill="${o.role && roles[o.role] ? roles[o.role].c : theme.dot}"/>`;
            break;
          }
          case 'axes': {
            const R = roles.axis || roles.edge;
            if (type === 'graph') {
              const v = spec.view || { xmin: -5, xmax: 5, ymin: -5, ymax: 5 };
              const ax0 = dataToScr(v.xmin, 0), ax1 = dataToScr(v.xmax, 0), ay0 = dataToScr(0, v.ymin), ay1 = dataToScr(0, v.ymax);
              const ex = [ax0[0] + (ax1[0] - ax0[0]) * e, ax0[1]], ey = [ay0[0], ay0[1] + (ay1[1] - ay0[1]) * e];
              svg += line(ax0, ex, R) + line(ay0, ey, R);
              if (p >= 1) {
                svg += arrowHead(ax0, ax1, R) + arrowHead(ay0, ay1, R);
                const step = spec.tick || 1;
                for (let x = Math.ceil(v.xmin / step) * step; x <= v.xmax - step * 0.5; x += step) if (Math.abs(x) > 1e-9) {
                  const q = dataToScr(x, 0); svg += line([q[0], q[1] - 4], [q[0], q[1] + 4], { ...R, w: 1.5 });
                  svg += `<text x="${q[0]}" y="${q[1] + 20}" text-anchor="middle" font-family="KaTeX_Main" font-size="${theme.labelSize * 0.62}" fill="${theme.labelColor}" opacity=".8">${+x.toFixed(2)}</text>`;
                }
                for (let y = Math.ceil(v.ymin / step) * step; y <= v.ymax - step * 0.5; y += step) if (Math.abs(y) > 1e-9) {
                  const q = dataToScr(0, y); svg += line([q[0] - 4, q[1]], [q[0] + 4, q[1]], { ...R, w: 1.5 });
                  svg += `<text x="${q[0] - 10}" y="${q[1]}" text-anchor="end" dominant-baseline="middle" font-family="KaTeX_Main" font-size="${theme.labelSize * 0.62}" fill="${theme.labelColor}" opacity=".8">${+y.toFixed(2)}</text>`;
                }
                const o0 = dataToScr(0, 0);
                svg += `<text x="${o0[0] - 12}" y="${o0[1] + 18}" font-family="KaTeX_Math" font-style="italic" font-size="${theme.labelSize * 0.7}" fill="${theme.labelColor}">O</text>`;
                svg += `<text x="${ax1[0] - 4}" y="${ax1[1] + 24}" font-family="KaTeX_Math" font-style="italic" font-size="${theme.labelSize * 0.8}" fill="${theme.labelColor}">x</text>`;
                svg += `<text x="${ay1[0] + 12}" y="${ay1[1] + 8}" font-family="KaTeX_Math" font-style="italic" font-size="${theme.labelSize * 0.8}" fill="${theme.labelColor}">y</text>`;
              }
            } else {
              // 3D coordinate axes from an origin point
              const O = pt(o.origin), len = o.len || diam() * 0.75, names = o.names || ['x', 'y', 'z'];
              const dirs = o.dirs || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
              dirs.forEach((d, i) => {
                const a = pr(O), b3 = v3.add(O, v3.scale(v3.norm(d), len)), b = pr(b3);
                const x = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
                svg += line(a, x, R);
                segs.push([a, b]);
                if (p >= 1) {
                  svg += arrowHead(a, b, R);
                  let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1;
                  svg += `<text x="${b[0] + (dx / L) * 18}" y="${b[1] + (dy / L) * 18}" text-anchor="middle" dominant-baseline="middle" font-family="KaTeX_Math" font-style="italic" font-size="${theme.labelSize * 0.85}" fill="${R.c}">${esc(names[i])}</text>`;
                }
              });
            }
            break;
          }
          case 'curve': {
            const f = compileFn(o.f), R = roles[o.role || 'key'] || roles.key;
            const v = spec.view || { xmin: -5, xmax: 5, ymin: -5, ymax: 5 };
            const x0 = o.from ?? v.xmin, x1 = o.to ?? v.xmax, N = 160, pts = [];
            for (let i = 0; i <= N * e; i++) {
              const x = x0 + ((x1 - x0) * i) / N, y = f(x);
              if (!isFinite(y) || y < v.ymin || y > v.ymax) { pts.push(null); continue; }
              pts.push(dataToScr(x, y));
            }
            let d = '', pen = false;
            for (const q of pts) { if (!q) { pen = false; continue; } d += (pen ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); pen = true; }
            const last = pts.filter(Boolean).pop(); if (p < 1 && last) tip = last;
            svg += `<path d="${d}" fill="none" stroke="${R.c}" stroke-width="${R.w}" stroke-linecap="round" stroke-linejoin="round" ${R.glow ? 'filter="url(#svGlow)"' : ''}/>`;
            for (let i = 1; i < pts.length; i++) if (pts[i] && pts[i - 1]) segs.push([pts[i - 1], pts[i]]);
            if (o.label && p >= 1 && last) svg += `<text x="${last[0] + 8}" y="${last[1] - 10}" font-family="KaTeX_Math" font-style="italic" font-size="${theme.labelSize * 0.8}" fill="${R.c}">${esc(o.label)}</text>`;
            break;
          }
          case 'label': {
            const q = S(o.p);
            const w = [q[0] - c0[0], q[1] - c0[1]], wl = Math.hypot(...w) || 1;
            const d = placeLabel(q, [w[0] / wl, w[1] / wl], segs, labelBoxes, theme.labelSize);
            labelBoxes.push([q[0] + d[0], q[1] + d[1]]);
            svg += `<text x="${(q[0] + d[0]).toFixed(1)}" y="${(q[1] + d[1]).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="KaTeX_Math" font-style="italic" font-size="${theme.labelSize}" fill="${theme.labelColor}" opacity="${e.toFixed(3)}">${SV.svgLabel(o.text || o.p)}</text>`;
            break;
          }
          case 'text': {
            const q = o.p ? S(o.p) : pr(to3(o.pos));
            const R = roles[o.role || 'key'] || roles.key;
            svg += `<text x="${q[0] + (o.dx || 0)}" y="${q[1] + (o.dy || 0)}" text-anchor="middle" dominant-baseline="middle" font-family="KaTeX_Main" font-size="${theme.labelSize * 0.8}" fill="${R.c}" opacity="${e}">${esc(o.text)}</text>`;
            break;
          }
        }
      }
      return { svg, tip };
    }

    function diam() {
      const ps = Object.values(P); let m = 0;
      for (const a of ps) for (const b of ps) m = Math.max(m, v3.len(v3.sub(a, b)));
      return m || 1;
    }

    return { type, P, faces, edges, home, camera, bestView, isHidden: (a, b, view) => isHidden(pt(a), pt(b), view), fit, proj, intro, render, camOps };
  }

  // label placement: candidate positions around the point, scored by distance to drawn lines
  // and other labels, with a slight bias outward from the figure centre.
  function placeLabel(q, out, segs, boxes, size) {
    let best = -1e9, bd = [size, 0];
    for (const r of [size * 1.0, size * 1.45]) for (let i = 0; i < 24; i++) {
      const g = (i * Math.PI) / 12, d = [Math.cos(g) * r, Math.sin(g) * r], c = [q[0] + d[0], q[1] + d[1]];
      let m = size * 1.3;
      for (const [a, b] of segs) m = Math.min(m, segDist(c, a, b));
      for (const bx of boxes) m = Math.min(m, Math.hypot(c[0] - bx[0], c[1] - bx[1]) * 0.6);
      const sc = m + 3 * ((d[0] / r) * out[0] + (d[1] / r) * out[1]) - (r - size) * 0.35;
      if (sc > best) { best = sc; bd = d; }
    }
    return bd;
  }

  function pointInPoly(q, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  function compileFn(src) {
    const body = String(src).replace(/\^/g, '**').replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|abs|log|exp|PI|E|floor|ceil|min|max|pow)\b/g, 'Math.$1').replace(/\bln\(/g, 'Math.log(');
    // eslint-disable-next-line no-new-func
    return new Function('x', `return (${body});`);
  }

  SV.figure = { create, camBasis, compileFn, placeLabel };
})(globalThis);
