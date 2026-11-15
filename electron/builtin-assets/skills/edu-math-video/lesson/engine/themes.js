// Theme definitions: map semantic roles → visuals. Lessons never mention colors or fonts.
(function (G) {
  const SV = (G.SV = G.SV || {});

  const OWL = `<svg class="owl" viewBox="0 0 160 190"><ellipse cx="80" cy="182" rx="50" ry="6" fill="#0001"/><path d="M30 70 L22 30 L52 52 Z M130 70 L138 30 L108 52 Z" fill="#e67700"/><ellipse cx="80" cy="112" rx="62" ry="66" fill="#f59f00"/><ellipse cx="80" cy="130" rx="38" ry="42" fill="#ffe8cc"/><path d="M62 128 q6 5 12 0 M86 128 q6 5 12 0 M74 146 q6 5 12 0" stroke="#f0b37a" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="56" cy="90" r="21" fill="#fff" stroke="#e67700" stroke-width="3"/><circle cx="104" cy="90" r="21" fill="#fff" stroke="#e67700" stroke-width="3"/><circle cx="59" cy="92" r="10" fill="#212529"/><circle cx="101" cy="92" r="10" fill="#212529"/><circle cx="62" cy="88" r="3.5" fill="#fff"/><circle cx="104" cy="88" r="3.5" fill="#fff"/><rect class="lid" x="34" y="68" width="44" height="44" rx="22" fill="#f59f00"/><rect class="lid" x="82" y="68" width="44" height="44" rx="22" fill="#f59f00"/><path d="M72 106 L88 106 L80 120 Z" fill="#e8590c"/><path d="M48 176 l6 -10 l6 10 M100 176 l6 -10 l6 10" stroke="#e8590c" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 40 L80 22 L122 40 L80 58 Z" fill="#343a40"/><rect x="62" y="44" width="36" height="14" rx="3" fill="#343a40"/><path d="M122 40 L124 66" stroke="#fab005" stroke-width="3"/><circle cx="124" cy="68" r="5" fill="#fab005"/></svg>`;

  SV.themes = {
    chalk: {
      name: '粉笔黑板',
      emph: 'ellipse',
      back: '',
      front: `<div class="tray"></div><div class="stick" style="left:120px;width:62px;background:linear-gradient(#fff,#e6e3d6)"></div><div class="stick" style="left:196px;width:44px;background:linear-gradient(#fff3a6,#f0d75a)"></div><div class="stick" style="left:252px;width:30px;background:linear-gradient(#ffc6d3,#f08aa4)"></div><div class="eraser"></div>`,
      surface: (L) => (L.meta.topic ? `<div class="corner">${SV.u.esc(L.meta.topic)}</div>` : ''),
      fig: { labelSize: 24, labelColor: '#f2f1e8', dot: '#ffe36e', hid: { dash: '9 9', o: 0.8, w: 0.85 }, hidAcc: { dash: '12 9' },
        roles: { edge: { c: '#efeee6', w: 2.6 }, given: { c: '#efeee6', w: 2, o: 0.8 }, aux: { c: '#94d6ff', w: 3 }, key: { c: '#ffe36e', w: 5 }, axis: { c: '#cfd8cf', w: 2 }, tri: { f: '#ffe36e', o: 0.13 }, plane: { f: '#94d6ff', o: 0.15 }, plane2: { f: '#ffa3b8', o: 0.14 } } },
    },
    lab: {
      name: '几何实验室',
      emph: 'box',
      back: '',
      front: (L) => `<div class="rail">${L.scenes.map((s, i) => `${i ? '<div class="link"></div>' : ''}<div class="node" data-scene="${i}"><i>${i + 1}</i>${SV.u.esc(s.short || s.title)}</div>`).join('')}</div><div class="hud"><b>PART <span data-part>1</span> / ${L.scenes.length}</b><br><span data-clock>00:00.0</span></div>`,
      surface: () => '',
      fig: { labelSize: 22, labelColor: '#e6e8ec', dot: '#ffd166', sway: 10, hid: { o: 0.4, w: 0.8 }, hidAcc: { o: 0.75 },
        roles: { edge: { c: '#a9b3c2', w: 2 }, given: { c: '#a9b3c2', w: 1.5, o: 0.7 }, aux: { c: '#58c4dd', w: 3, glow: 1 }, key: { c: '#ffd166', w: 4.5, glow: 1 }, axis: { c: '#7d8696', w: 1.8 }, tri: { f: '#ffd166', o: 0.12 }, plane: { f: '#58c4dd', o: 0.2 }, plane2: { f: '#ff7b72', o: 0.16 }, face: { f: '#a9b3c2', o: 0.05 } } },
    },
    whiteboard: {
      name: '白板马克笔',
      emph: 'ellipse',
      back: `<div class="wbf"><i class="cc tl"></i><i class="cc tr"></i><i class="cc bl"></i><i class="cc br"></i></div>`,
      front: `<div class="tray"><div class="lip"></div><i class="end l"></i><i class="end r"></i><div class="pen" style="left:70px;--c:#1f3a93;--r:-1deg"></div><div class="pen" style="left:250px;--c:#e03131;--r:1.5deg"></div><div class="pen" style="left:420px;--c:#1b8a3a;--r:-.5deg"></div><div class="eraser"></div></div>`,
      surface: () => '',
      titleTag: true,
      fig: { labelSize: 25, labelColor: '#1f3a93', dot: '#e03131', hid: { dash: '10 9', o: 0.8, w: 0.85 }, hidAcc: { dash: '13 9' },
        roles: { edge: { c: '#1f3a93', w: 3 }, given: { c: '#1f3a93', w: 2.2, o: 0.7 }, aux: { c: '#1b8a3a', w: 3.4 }, key: { c: '#e03131', w: 5.5 }, axis: { c: '#5c6a95', w: 2 }, tri: { f: '#ffd43b', o: 0.28 }, plane: { f: '#1b8a3a', o: 0.12 }, plane2: { f: '#e03131', o: 0.1 } } },
    },
    notebook: {
      name: '方格本',
      emph: 'stamp',
      back: `<div class="holes"></div><div class="margin"></div><div class="tape"></div>`,
      front: OWL,
      surface: () => '',
      fig: { labelSize: 24, labelColor: '#343a40', dot: '#e8590c', hid: { dash: '8 8', o: 0.8, w: 0.85 }, hidAcc: { dash: '12 8' },
        roles: { edge: { c: '#343a40', w: 2.6 }, given: { c: '#343a40', w: 2, o: 0.65 }, aux: { c: '#1971c2', w: 3.2 }, key: { c: '#e8590c', w: 5.5 }, axis: { c: '#868e96', w: 2 }, tri: { f: '#ffd43b', o: 0.32 }, plane: { f: '#4dabf7', o: 0.16 }, plane2: { f: '#ff8787', o: 0.14 } } },
    },
  };

  SV.svgDefs = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
 <filter id="svChalk" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.85" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="s"/><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="2" result="w"/><feDisplacementMap in="s" in2="w" scale="2.2"/></filter>
 <filter id="svMarker"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="9" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="1.8"/></filter>
 <filter id="svStamp"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2 0 0 0 1.75" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>
 <filter id="svGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</svg>`;
})(globalThis);
