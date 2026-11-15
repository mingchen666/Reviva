import { launch, openStage } from './scripts/browser.mjs';

const outDir = process.argv[2];
const browser = await launch();
try {
  const { page } = await openStage(browser, outDir, { scale: 1 });
  const info = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const stage = document.querySelector('#stage');
    return {
      stage: r('#stage'), stageStyle: stage.getAttribute('style'),
      fig: r('.fig'), col: r('.col'), surface: r('.surface'),
      bodyClass: document.body.className,
      pages: [...document.querySelectorAll('.page')].map((p) => {
        const b = p.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), n: p.querySelectorAll('.lw').length, vis: p.style.visibility, clip: p.style.clipPath };
      }),
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally { await browser.close(); }
