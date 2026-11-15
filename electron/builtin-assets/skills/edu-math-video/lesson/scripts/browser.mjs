// Opens a built preview.html in headless Chrome in render mode, ready for SV.seek(t).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export async function launch() {
  try { return await chromium.launch({ channel: 'chrome' }); }
  catch { return await chromium.launch(); }
}

export async function openStage(browser, outDir, { scale = 1.5 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(pathToFileURL(path.join(outDir, 'preview.html')).href + '?mode=render', { waitUntil: 'load' });
  await page.evaluate(() => SV.state().ready);
  if (errors.length) throw new Error('页面错误：' + errors.join(' | '));
  const seek = (t) => page.evaluate((t) => SV.seek(t), t);
  // the first capture after load can show stale compositor tiles (a second copy of the board at the bottom):
  // take one throwaway screenshot so every real frame is clean
  await seek(0);
  await page.screenshot();
  return { page, seek, errors };
}
