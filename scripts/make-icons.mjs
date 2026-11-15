// Renders the app icon (a 4x4 grid with one lit pad) at every size the web manifest and iOS need.
// Dev-only: uses the Chrome that Playwright drives.  node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** The mark. pad is the inset as a fraction of the canvas: maskable icons need a wide safe zone. */
export function svg(size, inset = 0.19, radius = 0) {
  const s = size, m = s * inset, gap = s * 0.035, cell = (s - 2 * m - 3 * gap) / 4, r = cell * 0.2;
  let cells = '';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const lit = x === 2 && y === 1;
    cells += `<rect x="${(m + x * (cell + gap)).toFixed(2)}" y="${(m + y * (cell + gap)).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="${r.toFixed(2)}" fill="${lit ? '#3DDC84' : '#1E2125'}" stroke="${lit ? '#3DDC84' : '#3A3F46'}" stroke-width="${(s * 0.004).toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" rx="${radius}" fill="#0B0C0E"/>${cells}</svg>`;
}
const web = [['public/icons/icon-192.png', 192, 0.16], ['public/icons/icon-512.png', 512, 0.16], ['public/icons/icon-maskable-512.png', 512, 0.24], ['public/icons/apple-touch-icon.png', 180, 0.16]];
const ios = [['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 0.16]];
const exe = process.env.PW_CHROME || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const browser = await chromium.launch({ executablePath: exe });
for (const [file, size, inset] of [...web, ...ios]) {
  const dir = join(ROOT, file, '..');
  if (file.startsWith('ios/') && !existsSync(join(ROOT, 'ios'))) continue;
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0">${svg(size, inset)}</body>`);
  writeFileSync(join(ROOT, file), await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }));
  await page.close();
  console.log(file);
}
writeFileSync(join(ROOT, 'public/icons/icon.svg'), svg(512, 0.16));
await browser.close();
