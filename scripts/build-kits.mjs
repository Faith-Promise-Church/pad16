// Scans kits/<Name>/ and writes kits/index.json for the app.
// Runs in the GitHub Action on every push; run it locally with: node scripts/build-kits.mjs
//
// A folder is a KIT (16 pads) unless every audio file in it is named by key, in which case it is a PAD SET for the tonic pad.
//
// Kit file names:
//   "05 Snare.wav"                      pad 5, named "Snare" (a leading 1-16 picks the pad)
//   "Kick.wav"                          next free pad, in alphabetical order
//   "12 Swell [loop].wav"               [loop] or [hold] sets the play mode (default is one shot)
//   "9 Groove [loop] [92bpm] [4bars]"   source tempo and length for tempo sync
//   "10 Shaker [loop] [group:a]"        exclusive group A to D
//   Files beyond 16 are kept as extras: not on a pad, but pattern tracks can use them.
// Pad set file names:
//   "Pad C.wav", "Pad Db.wav" ... one per key. "[baked]" means the loop crossfade is already in the file.

import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTags, padKey } from './lib/tags.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const KITS = join(ROOT, 'kits');
const AUDIO = new Set(['.wav', '.mp3', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.aif', '.aiff', '.caf', '.webm']);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

if (!existsSync(KITS)) mkdirSync(KITS);

const kits = [], padsets = [];
for (const dir of readdirSync(KITS).sort(collator.compare)) {
  if (dir.startsWith('.')) continue;
  const full = join(KITS, dir);
  if (!statSync(full).isDirectory()) continue;
  const files = readdirSync(full)
    .filter(f => !f.startsWith('.') && AUDIO.has(extname(f).toLowerCase()) && statSync(join(full, f)).isFile())
    .sort(collator.compare);
  if (!files.length) continue;

  if (files.every(f => padKey(f) >= 0)) {
    const keys = {};
    for (const f of files) { const k = padKey(f); if (!(k in keys)) keys[k] = { file: f, ...(parseTags(f).baked ? { baked: true } : {}) }; }
    padsets.push({ name: dir, dir, keys });
    console.log(`${dir}: pad set, ${Object.keys(keys).length} of 12 keys`);
    continue;
  }

  const taken = new Map(), loose = [], extras = [];
  for (const file of files) {
    const p = parseTags(file);
    if (p.pad && !taken.has(p.pad)) taken.set(p.pad, { file, ...p });
    else loose.push({ file, ...p, pad: undefined });
  }
  for (const entry of loose) {
    let n = 1;
    while (taken.has(n) && n <= 16) n++;
    if (n > 16) { extras.push({ file: entry.file, name: entry.name || entry.file }); continue; }
    taken.set(n, { ...entry, pad: n });
  }
  const pads = [...taken.values()].sort((a, b) => a.pad - b.pad).map(({ pad, file, name, mode, bpm, bars, group }) => ({
    pad, file, name: name || `Pad ${pad}`, ...(mode && mode !== 'oneshot' ? { mode } : {}), ...(bpm ? { bpm } : {}), ...(bars ? { bars } : {}), ...(group ? { group } : {}),
  }));
  kits.push({ name: dir, dir, pads, ...(extras.length ? { extras } : {}) });
  console.log(`${dir}: ${pads.length} pad${pads.length === 1 ? '' : 's'}${extras.length ? `, ${extras.length} extra sample${extras.length === 1 ? '' : 's'} for patterns` : ''}`);
}

writeFileSync(join(KITS, 'index.json'), JSON.stringify({ kits, padsets }, null, 2) + '\n');
console.log(`Wrote kits/index.json with ${kits.length} kit${kits.length === 1 ? '' : 's'} and ${padsets.length} pad set${padsets.length === 1 ? '' : 's'}.`);
