// Scans kits/<Kit Name>/ for audio files and writes kits/index.json for the app's Kit menu.
// Runs automatically in the GitHub Action on every push; run it locally with: node scripts/build-kits.mjs
//
// File naming inside a kit folder:
//   "05 Snare.wav"         -> pad 5, named "Snare"   (a leading 1-16 picks the pad)
//   "Kick.wav"             -> next free pad, in alphabetical order
//   "12 Swell [loop].wav"  -> [loop] or [hold] sets the play mode (default is one shot)

import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const KITS = join(ROOT, 'kits');
const AUDIO = new Set(['.wav', '.mp3', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.aif', '.aiff', '.caf', '.webm']);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

if (!existsSync(KITS)) mkdirSync(KITS);

function parse(file) {
  let base = file.slice(0, -extname(file).length);
  let mode;
  base = base.replace(/\s*\[(loop|hold|oneshot|one shot)\]\s*/gi, (_, m) => {
    mode = m.toLowerCase().replace(' ', '');
    return ' ';
  });
  let pad;
  const m = base.match(/^\s*(\d{1,2})(?:[\s._-]+|$)(.*)$/);
  if (m && +m[1] >= 1 && +m[1] <= 16) { pad = +m[1]; base = m[2]; }
  const name = base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return { pad, name, mode };
}

const kits = [];
for (const dir of readdirSync(KITS).sort(collator.compare)) {
  if (dir.startsWith('.')) continue;
  const full = join(KITS, dir);
  if (!statSync(full).isDirectory()) continue;

  const files = readdirSync(full)
    .filter(f => !f.startsWith('.') && AUDIO.has(extname(f).toLowerCase()) && statSync(join(full, f)).isFile())
    .sort(collator.compare);

  const taken = new Map();
  const loose = [];
  for (const file of files) {
    const p = parse(file);
    if (p.pad && !taken.has(p.pad)) taken.set(p.pad, { file, ...p });
    else loose.push({ file, ...p, pad: undefined });
  }
  for (const entry of loose) {
    let n = 1;
    while (taken.has(n) && n <= 16) n++;
    if (n > 16) { console.warn(`  ${dir}: no free pad for "${entry.file}", skipped`); continue; }
    taken.set(n, { ...entry, pad: n });
  }

  const pads = [...taken.values()]
    .sort((a, b) => a.pad - b.pad)
    .map(({ pad, file, name, mode }) => ({ pad, file, name: name || `Pad ${pad}`, ...(mode && mode !== 'oneshot' ? { mode } : {}) }));

  if (pads.length) {
    kits.push({ name: dir, dir, pads });
    console.log(`${dir}: ${pads.length} pad${pads.length === 1 ? '' : 's'}`);
  }
}

writeFileSync(join(KITS, 'index.json'), JSON.stringify({ kits }, null, 2) + '\n');
console.log(`Wrote kits/index.json with ${kits.length} kit${kits.length === 1 ? '' : 's'}.`);
