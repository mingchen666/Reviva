// Player: builds the stage for a compiled timeline and renders any time t via SV.seek(t).
// mode "render": bare 1280×720 stage for frame capture. mode "preview": scaled stage + controls + audio.
(function (G) {
  const SV = G.SV;
  const { clamp, ease, back, prog, esc } = SV.u;
  const ERASE = 0.5;
  const CAP_HOLD = 1.5; // seconds a caption may stay up after its audio ends

  const call = (x, L) => (typeof x === 'function' ? x(L) : x || '');
  // [\s\S]: KaTeX markup contains newlines
  const mark = (html) => html
    .replace(/\*\*([\s\S]+?)\*\*/g, '<span class="k">$1</span>')
    .replace(/==([\s\S]+?)==/g, '<span class="hl">$1</span>')
    .replace(/!!([\s\S]+?)!!/g, '<span class="concl">$1</span>');
  const ELLIPSE = '<svg class="emph-ellipse" viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M10 22 C 6 4, 92 0, 97 18 C 102 38, 20 42, 6 26 C 3 20, 14 10, 26 7" fill="none" vector-effect="non-scaling-stroke"/></svg>';

  let S = null; // current player state

  function boot(L, opts = {}) {
    const th = SV.themes[L.style];
    if (!th) throw new Error('unknown style ' + L.style);
    const root = opts.root || document.getElementById('stage');
    root.className = `stage th-${L.style}${L.figure ? '' : ' nofig'}`;
    root.innerHTML = SV.svgDefs +
      `<div class="back">${call(th.back, L)}</div>` +
      `<div class="surface">${call(th.surface, L)}<div class="fig"><svg></svg></div><div class="col"></div><div class="tipband"></div></div>` +
      `<div class="front">${call(th.front, L)}</div>` +
      `<div class="cap"><span class="ct"><span class="bs"></span><span class="ov"></span></span></div><div class="nib"></div>`;
    const $ = (s) => root.querySelector(s);
    const col = $('.col'), figEl = $('.fig'), svg = $('.fig svg'), tipband = $('.tipband');
    const anim = []; // {el, at, dur, fx, out, len}
    const lines = {}; // id → {lw, ln, op}
    const writes = L.ops.filter((o) => o.kind === 'write').sort((a, b) => a.at - b.at);

    // ---- text lines ----
    for (const o of writes) {
      const lw = document.createElement('div');
      lw.className = 'lw' + (o.role === 'problem' ? ' q' : '');
      const ln = document.createElement('div');
      ln.className = 'ln' + (o.role ? ' ' + o.role : '');
      let html = mark(SV.tex(o.text));
      if (o.role === 'title') html = th.titleTag && o.tag ? `<span class="tg">${esc(o.tag)}</span>${html}` : `${o.tag ? esc(o.tag) + '　' : ''}${html}`;
      ln.innerHTML = html;
      ln.dataset.fx = 'write';
      lw.appendChild(ln);
      lines[o.id] = { lw, ln, op: o };
      anim.push({ el: ln, at: o.at, dur: o.dur, fx: 'write' });
      ln.querySelectorAll('.hl').forEach((h) => anim.push({ el: h, at: o.at + o.dur, dur: 0.5, fx: 'hl' }));
    }
    // ---- emphasis on lines ----
    for (const o of L.ops.filter((x) => x.kind === 'emph')) {
      const ln = lines[o.target];
      if (!ln) continue;
      if (th.emph === 'ellipse') {
        ln.lw.insertAdjacentHTML('beforeend', ELLIPSE);
        anim.push({ el: ln.lw.lastElementChild.querySelector('path'), at: o.at, dur: o.dur, fx: 'draw', host: ln.lw.lastElementChild });
      } else if (th.emph === 'box') {
        const b = document.createElement('div'); b.className = 'emph-box'; ln.lw.prepend(b);
        anim.push({ el: b, at: o.at, dur: o.dur, fx: 'box' });
      } else {
        const s = document.createElement('div'); s.className = 'emph-stamp'; s.dataset.fx = 'stamp'; s.innerHTML = esc(o.text || '证毕').replace(/\n/g, '<br>');
        ln.lw.appendChild(s);
        anim.push({ el: s, at: o.at, dur: 0.35, fx: 'stamp' });
      }
    }
    // ---- reading the problem: the segment being read turns the theme's highlight colour ----
    for (const o of L.ops.filter((x) => x.kind === 'read')) {
      const ln = lines[o.target];
      if (ln) anim.push({ el: ln.lw, at: o.at, dur: o.dur, out: o.out, fx: 'read' });
    }
    // ---- tips ----
    for (const o of L.ops.filter((x) => x.kind === 'tip')) {
      const d = document.createElement('div');
      d.className = 'tip'; d.dataset.fx = L.style === 'notebook' ? 'pop' : 'fade';
      d.innerHTML = mark(SV.tex(o.text));
      tipband.appendChild(d);
      anim.push({ el: d, at: o.at, dur: o.dur || 0.5, fx: d.dataset.fx, out: o.out });
    }
    // ---- camera tags ----
    const cams = L.ops.filter((x) => x.kind === 'cam').sort((a, b) => a.at - b.at);
    cams.forEach((o, i) => {
      if (!o.tag) return;
      const d = document.createElement('div');
      d.className = 'viewtag'; d.dataset.fx = 'fade'; d.innerHTML = '↻ ' + mark(SV.tex(o.tag));
      figEl.appendChild(d);
      const next = cams[i + 1];
      anim.push({ el: d, at: o.at, dur: 0.5, fx: 'fade', out: o.tagOut ?? (next ? next.at : o.at + (o.dur || 1.6) + 3) });
    });
    // ---- scenes (rail) ----
    root.querySelectorAll('[data-scene]').forEach((el) => { const s = L.scenes[+el.dataset.scene]; anim.push({ el, at: s.at, dur: 0.5, fx: 'on' }); });

    // ---- figure ----
    let fig = null, figOps = [];
    if (L.figure) {
      const ops = L.ops.filter((o) => o.kind === 'fig' || o.kind === 'cam');
      fig = SV.figure.create(L.figure, ops, { sway: th.fig.sway || 0 });
      figOps = [...fig.intro(0.2), ...ops.filter((o) => o.kind === 'fig')];
    }

    S = { L, th, root, col, svg, figEl, anim, lines, writes, fig, figOps, pages: [], report: [], nib: $('.nib'), cap: $('.cap'), capIdx: -1, k: opts.scale || 1,
      part: root.querySelector('[data-part]'), clock: root.querySelector('[data-clock]') };

    const layout = () => {
      // pagination: new page per scene / clear op, or when the column overflows
      const breaks = L.ops.filter((o) => o.kind === 'scene' || o.kind === 'clear').map((o) => o.at).sort((a, b) => a - b);
      const colH = col.clientHeight, colW = col.clientWidth;
      let page = null, bi = 0;
      const newPage = (at) => { const el = document.createElement('div'); el.className = 'page'; col.appendChild(el); page = { el, start: at, n: 0 }; S.pages.push(page); };
      for (const o of writes) {
        let forced = false;
        while (bi < breaks.length && breaks[bi] <= o.at + 1e-6) { forced = true; bi++; }
        if (!page || (forced && page.n)) newPage(forced ? Math.min(o.at, breaks[bi - 1] + ERASE) : o.at);
        const { lw } = lines[o.id];
        page.el.appendChild(lw); page.n++;
        if (o.role === 'problem') {
          // the problem must stay on one page: shrink all its segments together instead of flipping
          const qs = [...page.el.querySelectorAll('.ln.problem')];
          for (let f = 0.86; page.el.scrollHeight > colH + 2 && f >= 0.66; f -= 0.04) qs.forEach((q) => (q.style.fontSize = f.toFixed(2) + 'em'));
          if (page.el.scrollHeight > colH + 2 && !S.report.some((r) => r.id && r.id[0] === 'Q')) S.report.push({ type: 'overflow-y', id: o.id, text: '题目太长，一页放不下：精简 intro 的 show（去掉套话，条件用公式写）' });
          continue;
        }
        if (page.el.scrollHeight > colH + 2 && page.n > 1) { lw.remove(); page.n--; newPage(o.at); page.el.appendChild(lw); page.n++; }
        const { ln } = lines[o.id];
        if (ln.scrollWidth > colW) {
          // shrink slightly-too-long lines; anything needing more than 20% is reported for rewriting
          const f = colW / ln.scrollWidth;
          ln.style.fontSize = Math.max(0.8, f * 0.98) + 'em';
          if (f < 0.8) S.report.push({ type: 'overflow-x', id: o.id, text: o.text, width: Math.round(ln.scrollWidth), max: colW });
        }
        const stamp = lw.querySelector('.emph-stamp');
        if (stamp && ln.offsetWidth + 130 > colW) { stamp.style.left = colW - 112 + 'px'; stamp.style.marginTop = '-118px'; }
        if (page.el.scrollHeight > colH + 2) S.report.push({ type: 'overflow-y', id: o.id, text: o.text });
      }
      if (fig) fig.fit(S.figEl.clientWidth, S.figEl.clientHeight, L.duration, th.fig.labelSize * 1.4);
      // stroke lengths for drawn ellipses (screen space, since they use non-scaling strokes)
      for (const a of anim) if (a.fx === 'draw') {
        const r = a.host.getBoundingClientRect(), k = S.k;
        const A = r.width / k / 2, B = r.height / k / 2;
        a.len = 1.2 * Math.PI * (3 * (A + B) - Math.sqrt((3 * A + B) * (A + 3 * B)));
      }
    };
    S.ready = (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { layout(); S.laid = true; seek(0); });
    return S;
  }

  function seek(t) {
    if (!S || !S.laid) return; // fonts not loaded yet: the figure has not been fitted
    const { L, anim, pages } = S;
    S.t = t;
    // pages: visible from start, wiped away before the next page starts
    pages.forEach((pg, i) => {
      const next = pages[i + 1];
      if (t < pg.start - ERASE) { pg.el.style.visibility = 'hidden'; return; }
      pg.el.style.visibility = 'visible';
      if (next && t >= next.start - ERASE) {
        const q = clamp((t - (next.start - ERASE)) / ERASE);
        if (q >= 1) { pg.el.style.visibility = 'hidden'; return; }
        pg.el.style.clipPath = `inset(-20px -40px -20px ${(q * 105).toFixed(1)}%)`;
      } else pg.el.style.clipPath = '';
    });
    let writing = null;
    for (const a of anim) {
      const p = prog(t, a.at, a.dur, a.out);
      const s = a.el.style;
      s.setProperty('--p', p); s.setProperty('--e', ease(p)); s.setProperty('--b', back(p));
      if (a.fx === 'draw') { const Lh = a.len || 300; s.strokeDasharray = `${Lh} ${Lh * 3}`; s.strokeDashoffset = Lh * (1 - ease(p)); s.opacity = p > 0 ? 1 : 0; }
      if (a.fx === 'write' && p > 0 && p < 1) writing = [a.el, p];
    }
    // figure
    let tip = null;
    if (S.fig) { const r = S.fig.render(t, S.figOps, S.th.fig); S.svg.innerHTML = r.svg; tip = r.tip; }
    // nib follows the writing edge, else the figure pen tip
    const sr = S.root.getBoundingClientRect(), k = S.k;
    let pos = null;
    if (writing) { const r = writing[0].getBoundingClientRect(); pos = [(r.left - sr.left + r.width * writing[1]) / k, (r.top - sr.top + r.height * 0.62) / k]; }
    else if (tip) { const r = S.figEl.getBoundingClientRect(); pos = [(r.left - sr.left) / k + tip[0], (r.top - sr.top) / k + tip[1]]; }
    if (pos) { S.nib.style.opacity = 1; S.nib.style.transform = `translate(${pos[0]}px,${pos[1]}px)`; } else S.nib.style.opacity = 0;
    // captions with karaoke progress driven by TTS word timings
    // a caption stays up through short pauses until the next one replaces it (no blinking);
    // it only fades after a long silence. Opacity is a pure function of t.
    const caps = L.captions;
    let ci = -1, op = 0;
    for (let i = 0; i < caps.length && t >= caps[i].at; i++) ci = i;
    if (ci >= 0) {
      const c = caps[ci], nx = caps[ci + 1], pv = caps[ci - 1];
      const hold = nx ? Math.min(CAP_HOLD, nx.at - c.end) : CAP_HOLD;
      const fadeOut = 1 - clamp((t - (c.end + hold)) / 0.25);
      const fadeIn = pv && c.at - pv.end <= CAP_HOLD ? 1 : clamp((t - c.at) / 0.2);
      op = Math.min(fadeIn, fadeOut);
      if (op <= 0) ci = -1;
    }
    S.cap.style.opacity = op;
    if (ci !== S.capIdx) {
      S.capIdx = ci;
      const tx = ci < 0 ? '' : caps[ci].text;
      S.cap.querySelector('.bs').textContent = tx; S.cap.querySelector('.ov').textContent = tx;
    }
    if (ci >= 0) {
      const c = L.captions[ci], w = c.words || [];
      let kp;
      if (w.length) { let n = 0; for (const x of w) { if (t >= x.e) n += 1; else if (t > x.s) n += (t - x.s) / (x.e - x.s); } kp = n / w.length; }
      else kp = clamp((t - c.at) / (c.end - c.at));
      S.cap.style.setProperty('--kp', kp);
    }
    if (S.part) { let pi = 0; L.scenes.forEach((s, i) => { if (t >= s.at) pi = i; }); S.part.textContent = pi + 1; }
    if (S.clock) { const m = Math.floor(t / 60), sec = t - m * 60; S.clock.textContent = `${String(m).padStart(2, '0')}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`; }
  }

  SV.boot = boot;
  SV.seek = seek;
  SV.state = () => S;
  SV.report = () => (S ? S.report.slice() : []);

  // ---------- preview UI ----------
  SV.preview = function (L) {
    document.body.classList.add('pv');
    const wrap = document.getElementById('vp'), stage = document.getElementById('stage');
    const audio = document.getElementById('audio');
    const bar = document.getElementById('bar');
    // scene markers first: `innerHTML +=` would rebuild the bar and leave fill/knob pointing at detached nodes
    bar.insertAdjacentHTML('beforeend', L.scenes.map((s) => `<i class="mk" style="left:${(s.at / L.duration) * 100}%" title="${esc(s.title)}"></i>`).join(''));
    const fill = bar.querySelector('.fill'), knob = bar.querySelector('.knob');
    const tm = document.getElementById('tm'), btn = document.getElementById('play'), sel = document.getElementById('style');
    const big = document.getElementById('bigplay');
    let playing = false, dragging = false, t = 0, last = performance.now();
    const fitScale = () => { const k = wrap.clientWidth / 1280; stage.style.transform = `scale(${k})`; wrap.style.height = 720 * k + 'px'; if (S) S.k = k; return k; };
    const start = (style) => { L.style = style; const st = boot(L, { scale: fitScale() }); st.ready.then(() => seek(t)); };
    sel.innerHTML = Object.entries(SV.themes).map(([id, th]) => `<option value="${id}" ${id === L.style ? 'selected' : ''}>${th.name}</option>`).join('');
    sel.onchange = () => start(sel.value);
    const syncAudio = () => { if (!audio) return; audio.currentTime = t; if (playing && !dragging) audio.play().catch(() => {}); else audio.pause(); };
    const setPlaying = (p) => {
      if (p && t >= L.duration - 0.05) t = 0; // replay from the start
      playing = p; btn.textContent = p ? '❚❚' : '▶'; if (big) big.hidden = true; syncAudio();
    };
    btn.onclick = () => setPlaying(!playing);
    wrap.addEventListener('click', () => setPlaying(!playing)); // click the picture to play / pause
    if (big) big.addEventListener('click', (e) => { e.stopPropagation(); setPlaying(true); });
    const at = (e) => { const r = bar.getBoundingClientRect(); t = clamp((e.clientX - r.left) / r.width) * L.duration; };
    bar.addEventListener('pointerdown', (e) => { dragging = true; at(e); syncAudio(); bar.setPointerCapture(e.pointerId); });
    bar.addEventListener('pointermove', (e) => { if (dragging) at(e); });
    const endDrag = () => { if (dragging) { dragging = false; syncAudio(); } };
    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);
    addEventListener('resize', fitScale);
    document.addEventListener('keydown', (e) => {
      if (e.target === sel) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); t = clamp(t + (e.code === 'ArrowLeft' ? -5 : 5), 0, L.duration); syncAudio(); }
    });
    start(L.style);
    const loop = (now) => {
      requestAnimationFrame(loop); // first, so one bad frame can never freeze the player
      const dt = (now - last) / 1000; last = now;
      if (playing && !dragging) {
        t = audio && !audio.paused ? audio.currentTime : t + dt;
        if (t >= L.duration) { t = L.duration; playing = false; btn.textContent = '▶'; audio && audio.pause(); }
      }
      seek(t);
      fill.style.width = knob.style.left = (t / L.duration) * 100 + '%';
      tm.textContent = `${t.toFixed(1)} / ${L.duration.toFixed(1)}s`;
    };
    requestAnimationFrame(loop);
  };
})(globalThis);
