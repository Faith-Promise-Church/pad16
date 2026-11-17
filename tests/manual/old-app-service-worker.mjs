// Manual check, not part of the test run. Lay the site out as it is served, then run this:
//   npm run build && rm -rf /tmp/site && mkdir -p /tmp/site/pad16/next && cp -r dist/. /tmp/site/pad16/next/
//   git archive origin/main index.html sw.js manifest.webmanifest kits icons | tar -x -C /tmp/site/pad16/
//   (cd /tmp/site && python3 -m http.server 8765 &) ; node tests/manual/old-app-service-worker.mjs chrome   (or webkit)
// Expect: after the update the sample is 60044 bytes and the page marker is NEW-PAGE, also on the slow network line.
//
// A phone that has the old app. Its first preview visit happens under the old app's service worker.
// Later the preview changes (a new page, a sample replaced under the same name). Does the phone ever see it?
import { webkit, chromium } from '@playwright/test';
import fs from 'node:fs';
const which = process.argv[2];
const b = which === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 700 } }), page = await ctx.newPage();
const B = 'http://localhost:8765/pad16/', F = '/tmp/site/pad16/next/kits/Acoustic Set/3 Cajon Bass.wav', I = '/tmp/site/pad16/next/index.html';
const keepF = fs.readFileSync(F), keepI = fs.readFileSync(I);
const reg = () => page.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); });
const see = async label => { await page.waitForSelector('html[data-ready="true"]', { timeout: 20000 }); await page.waitForTimeout(3500);
  console.log(label, JSON.stringify(await page.evaluate(async () => { const r = await fetch('kits/Acoustic%20Set/3%20Cajon%20Bass.wav'); const n = (await r.arrayBuffer()).byteLength;
    const where = []; for (const k of await caches.keys()) if (await (await caches.open(k)).match(new URL('kits/Acoustic%20Set/3%20Cajon%20Bass.wav', location.href).href)) where.push(k);
    return { ctl: navigator.serviceWorker.controller?.scriptURL.replace(location.origin, ''), cajonBassBytes: n, cachedIn: where, marker: document.documentElement.dataset.marker || 'none', standIn: window.pad16.padMeta.filter(m => m.missing).length }; }))); };
try {
  await page.goto(B); await page.waitForTimeout(600); await reg(); await page.reload(); await page.waitForTimeout(600);     // old app, installed
  await page.goto(B + 'next/'); await see('first preview visit (old app SW in charge)');
  await reg(); await page.waitForTimeout(1200); await page.reload(); await see('preview SW installed                     ');
  // the preview is updated: the sample is replaced under the same name, and the page changes
  fs.writeFileSync(F, keepF.subarray(0, 60044)); fs.writeFileSync(I, String(keepI).replace('<html', '<html data-marker="NEW-PAGE"'));
  for (const n of [1, 2, 3]) { await page.reload(); await see(`after the update, reload ${n}               `); }
  // a slow connection (the page takes longer than the 3 second limit)
  await ctx.route('**/pad16/next/', async r => { await new Promise(x => setTimeout(x, 4500)); r.continue(); });
  await page.reload(); await see('slow network (page > 3 s)                ');
} finally { fs.writeFileSync(F, keepF); fs.writeFileSync(I, keepI); await b.close(); }
