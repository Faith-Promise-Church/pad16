// Captures every view in both themes for docs/DESIGN.md. Dev-only.
//   npm run dev   (in another terminal)   then   node scripts/make-screens.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../docs/screens/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const URL_ = process.env.PAD16_URL || 'http://localhost:5173/';
const exe = process.env.PW_CHROME || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });

// a realistic stage state: the Acoustic Set, a loop playing, a pattern queued, the sub and pad on
const SETUP = `(async () => {
  const a = window.pad16;
  await a.unlock();
  await a.loadKit('Acoustic Set');
  a.patchSong({ name: 'Build My Life', bpm: 72, key: 7, notes: 'Capo 2. Guitar starts.' });
  a.addSong(); a.patchSong({ name: 'Goodness of God', bpm: 63, ts: { num: 6, den: 8 }, key: 9 });
  a.prevSong(); await new Promise(r => setTimeout(r, 300));
  a.patchPad(8, { mode: 'pattern', patternId: 'starter-cajon', name: 'Cajon Groove', group: 'A' });
  a.patchPad(9, { mode: 'pattern', patternId: 'starter-train', name: 'Train Beat', group: 'A' });
  a.patchPad(13, { group: 'B' });
  a.patchSong({ sub: { ...a.song.sub, on: true }, tonic: { ...a.song.tonic, on: true, fadeIn: 0.2 }, click: { ...a.song.click, on: true, sub: '8' } });
  a.eng.pads.trigger(13); a.eng.pads.trigger(8);
  await new Promise(r => setTimeout(r, 3600));
  a.eng.sub.noteOn(31);
  a.eng.pads.trigger(9);
  a.selected = 13; a.emit();
})()`;
const SHOTS = [
  ['perform', ''],
  ['edit', `document.querySelector('[title="Edit pads"]').click()`],
  ['mixer', `window.pad16 && document.querySelector('.mix-open, [title="Mixer"]')?.click()`],
  ['tempo', `document.querySelector('.bpm-btn').click()`],
  ['click', `document.querySelector('[title="Click settings"]').click()`],
  ['songs', `document.querySelector('.song-btn').click()`],
  ['synth', `document.querySelector('.sub-card [title="Sub synth settings"], [title="Sub synth settings"]').click()`],
  ['tonic', `document.querySelector('[title="Tonic pad settings"]').click()`],
  ['sequencer', `window.pad16.selected = 8; document.querySelector('[title="Edit pads"]').click(); [...document.querySelectorAll('.editor .btn')].find(b => b.textContent === 'Edit pattern').click()`],
  ['settings-outputs', `document.querySelector('[title="Settings"]').click()`],
  ['settings-midi', `document.querySelector('[title="Settings"]').click(); [...document.querySelectorAll('.seg-btn')].find(b => b.textContent === 'MIDI').click()`],
  ['settings-diagnostics', `document.querySelector('[title="Settings"]').click(); [...document.querySelectorAll('.seg-btn')].find(b => b.textContent === 'Diagnostics').click()`],
  ['settings-display', `document.querySelector('[title="Settings"]').click(); [...document.querySelectorAll('.seg-btn')].find(b => b.textContent === 'Display').click()`],
];
const SIZES = { landscape: [1366, 1024], portrait: [1024, 1366], phone: [430, 932] };
const only = process.argv[2];

for (const theme of ['dark', 'light']) {
  for (const [sizeName, [width, height]] of Object.entries(SIZES)) {
    const shots = sizeName === 'landscape' ? SHOTS : sizeName === 'portrait' ? SHOTS.filter(s => ['perform', 'edit', 'mixer'].includes(s[0])) : SHOTS.filter(s => ['perform', 'edit'].includes(s[0]));
    for (const [name, action] of shots) {
      if (only && !`${name}-${sizeName}-${theme}`.includes(only)) continue;
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.goto(URL_);
      await page.waitForSelector('html[data-ready="true"]');
      await page.evaluate(t => { const a = window.pad16; a.state.settings.theme = t; a.changed(); }, theme);
      await page.evaluate(SETUP);
      if (action) await page.evaluate(action);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}${name}-${sizeName}-${theme}.png` });
      if (sizeName === 'phone' && name === 'perform') {
        for (const [i, tab] of [[1, 'mix'], [2, 'synth'], [3, 'song']]) {
          await page.evaluate(n => document.querySelectorAll('.tab')[n].click(), i);
          await page.waitForTimeout(300);
          await page.screenshot({ path: `${OUT}${tab}-phone-${theme}.png` });
        }
      }
      await page.close();
      console.log(`${name}-${sizeName}-${theme}`);
    }
  }
}
await browser.close();
