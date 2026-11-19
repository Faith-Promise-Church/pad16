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

// a realistic stage state: the ready-made set on its default layout, the Chorus scene on, a pad queued, Ambient, Bass and the click on
const SETUP = `(async () => {
  const a = window.pad16;
  await a.unlock();
  a.patchSong({ sub: { ...a.song.sub, on: true }, tonic: { ...a.song.tonic, on: true, fadeIn: 0.2 }, click: { ...a.song.click, on: true } });
  a.launchSceneAt(2);
  await new Promise(r => setTimeout(r, 4200));
  a.eng.sub.noteOn(36);
  a.selected = 4; a.emit();
})()`;
// some Perform shots catch a scene change in flight: Build pressed just after a bar line, so it is still waiting when the picture is taken
const QUEUE = `(async () => {
  const a = window.pad16, e = a.eng;
  while (e.clock.barBeatAt(e.clock.beatAt(e.now())).beat !== 0) await new Promise(r => setTimeout(r, 20));
  a.launchSceneAt(3);
})()`;
const IN_FLIGHT = ['portrait', 'fold-portrait', 'phone-landscape'];
const dest = (d, section) => `(async () => { const a = window.pad16; a.setEdit(true, '${d}'); await new Promise(r => setTimeout(r, 150));` +
  (section ? `[...document.querySelectorAll('.dest-pane[data-dest="${d}"] .sec-tab')].find(b => b.textContent === '${section}').click();` : '') + ` })()`;
const SHOTS = [
  ['perform', ''],
  ['edit-pads', dest('pads')],
  ['edit-loops', dest('loops')],
  ['sequencer', `(async () => { const a = window.pad16; a.setEdit(true, 'pads'); a.select(4); await new Promise(r => setTimeout(r, 150)); [...document.querySelectorAll('.editor .btn')].find(b => b.textContent === 'Edit pattern').click(); })()`],
  ['song-set-list', dest('song', 'Set list')],
  ['song-this-song', dest('song', 'This song')],
  ['song-tempo', dest('song', 'Tempo and click')],
  ['song-scenes', dest('song', 'Scenes')],
  ['scene-editor', dest('song', 'Scenes').replace(' })()', ` await new Promise(r => setTimeout(r, 150)); document.querySelectorAll('.scene-row .song-pick')[2].click(); })()`)],
  ['song-ambient', dest('song', 'Ambient')],
  ['song-bass', dest('song', 'Bass')],
  ['edit-mix', dest('mix')],
  ['setup-audio', dest('setup', 'Audio')],
  ['setup-midi', dest('setup', 'MIDI')],
  ['setup-display', dest('setup', 'Display')],
  ['setup-backup', dest('setup', 'Backup')],
  ['setup-diagnostics', dest('setup', 'Diagnostics')],
];
// iPad both ways, a folding phone opened up both ways, a phone both ways
const SIZES = { landscape: [1366, 1024], portrait: [1024, 1366], 'fold-landscape': [951, 669], 'fold-portrait': [669, 951], phone: [393, 852], 'phone-landscape': [852, 393] };
const FEW = { portrait: ['perform', 'edit-pads', 'edit-mix'], 'fold-landscape': ['perform'], 'fold-portrait': ['perform', 'edit-pads'], phone: ['perform', 'edit-pads', 'song-tempo', 'song-scenes', 'edit-mix'], 'phone-landscape': ['perform'] };
const only = process.argv[2];

for (const theme of ['dark', 'light']) {
  for (const [sizeName, [width, height]] of Object.entries(SIZES)) {
    const shots = FEW[sizeName] ? SHOTS.filter(x => FEW[sizeName].includes(x[0])) : SHOTS;
    for (const [name, action] of shots) {
      if (only && !`${name}-${sizeName}-${theme}`.includes(only)) continue;
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.goto(URL_);
      await page.waitForSelector('html[data-ready="true"]');
      await page.evaluate(t => { const a = window.pad16; a.state.settings.theme = t; a.changed(); }, theme);
      await page.evaluate(SETUP);
      await page.addStyleTag({ content: '.toast { display: none }' });        // start-up messages are not part of the design
      if (action) await page.evaluate(action);
      if (name === 'perform' && IN_FLIGHT.includes(sizeName)) await page.evaluate(QUEUE);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}${name}-${sizeName}-${theme}.png` });
      await page.close();
      console.log(`${name}-${sizeName}-${theme}`);
    }
  }
}
await browser.close();
