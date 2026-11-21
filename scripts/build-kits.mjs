// Scans kits/<Name>/ and writes kits/index.json for the app.
// Runs in the GitHub Action on every push; run it locally with: node scripts/build-kits.mjs
//
// It indexes two places when they exist: kits/ in this repo, and kits/ in the private sounds repo
// (PAD16_SOUNDS, or a folder named pad16-sounds beside this one). The build copies both into the app.
//
// A folder is a KIT (16 pads) unless every audio file in it is named by key, in which case it is a PAD SET for the tonic pad,
// or every file is a click sound (Click Accent, Click Beat, Click Sub), in which case it is a CLICK SET.
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
// The folder named Library is the sample library, not a kit: Library/<Category>/<file>. Its files are listed for the
// library browser. A name ending "80bpm 2bar" is a loop with that tempo and length; anything else is a one shot.
// Library/meta.json can add to or correct what the name says, per file: type, bpm, beats, note, from, anchorMs.
// Click set file names:
//   "Click Accent.wav" (beat 1), "Click Beat.wav", "Click Sub.wav" (subdivisions). A missing one uses the built-in sound.

import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTags, padKey, clickSlot } from './lib/tags.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AUDIO = new Set(['.wav', '.mp3', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.aif', '.aiff', '.caf', '.webm']);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const soundsDir = () => { if (process.env.PAD16_SOUNDS === 'none') return null; const d = process.env.PAD16_SOUNDS ? resolve(process.env.PAD16_SOUNDS) : resolve(ROOT, '../pad16-sounds'); return existsSync(join(d, 'kits')) ? d : null; };

/** Length of a WAV file in seconds, read from its header. Null for other formats. */
function wavSeconds(file) {
  const fd = openSync(file, 'r');
  try {
    const head = Buffer.alloc(12); readSync(fd, head, 0, 12, 0);
    if (head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WAVE') return null;
    let pos = 12, rate = 0; const size = statSync(file).size, ch = Buffer.alloc(24);
    while (pos + 8 <= size) {
      readSync(fd, ch, 0, 24, pos);
      const id = ch.toString('latin1', 0, 4), len = ch.readUInt32LE(4);
      if (id === 'fmt ') rate = ch.readUInt32LE(16);                    // bytes a second
      if (id === 'data') return rate ? Math.round(Math.min(len, size - pos - 8) / rate * 1000) / 1000 : null;
      pos += 8 + len + (len % 2);
    }
    return null;
  } finally { closeSync(fd); }
}

/** The sample library: every audio file under Library/<Category>/. */
function scanLibrary(dir) {
  let meta = {};
  try { meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')); } catch { /* optional */ }
  const items = [];
  for (const cat of readdirSync(dir).sort(collator.compare)) {
    const full = join(dir, cat);
    if (cat.startsWith('.') || !statSync(full).isDirectory()) continue;
    for (const file of readdirSync(full).sort(collator.compare)) {
      if (file.startsWith('.') || !AUDIO.has(extname(file).toLowerCase())) continue;
      const stem = file.slice(0, -extname(file).length), tag = /\s+(\d+(?:\.\d+)?)bpm\s+(\d+(?:\.\d+)?)bars?$/i.exec(stem);
      const m = meta[cat + '/' + file] || {}, secs = wavSeconds(join(full, file));
      const bpm = m.bpm ?? (tag ? +tag[1] : undefined), beats = m.beats ?? (tag ? Math.round(+tag[2] * 4) : undefined);
      items.push({
        cat, file, name: (tag ? stem.slice(0, tag.index) : stem).replace(/\b0+(\d)/g, '$1'), type: m.type || (tag ? 'loop' : 'shot'),
        ...(bpm ? { bpm } : {}), ...(beats ? { beats } : {}), ...(secs ? { secs } : {}),
        ...(m.anchorMs ? { anchorMs: m.anchorMs } : {}), ...(m.note ? { note: m.note } : {}), ...(m.from ? { from: m.from } : {}),
      });
    }
  }
  return items;
}

function build(KITS, label) {
const kits = [], padsets = [], clicksets = []; let library = [];
for (const dir of readdirSync(KITS).sort(collator.compare)) {
  if (dir.startsWith('.')) continue;
  const full = join(KITS, dir);
  if (!statSync(full).isDirectory()) continue;
  if (dir === 'Library') { library = scanLibrary(full); console.log(`Library: ${library.length} sounds in ${new Set(library.map(i => i.cat)).size} categories`); continue; }
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

  if (files.every(f => clickSlot(f))) {
    const slots = {};
    for (const f of files) { const k = clickSlot(f); if (!(k in slots)) slots[k] = f; }
    clicksets.push({ name: dir, dir, files: slots });
    console.log(`${dir}: click set (${Object.keys(slots).join(', ')})`);
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

writeFileSync(join(KITS, 'index.json'), JSON.stringify({ kits, padsets, clicksets, ...(library.length ? { library } : {}) }, null, library.length ? 1 : 2) + '\n');
console.log(`Wrote ${label}/index.json with ${kits.length} kit${kits.length === 1 ? '' : 's'}, ${padsets.length} pad set${padsets.length === 1 ? '' : 's'}, ${clicksets.length} click set${clicksets.length === 1 ? '' : 's'}${library.length ? ` and ${library.length} library sounds` : ''}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const own = join(ROOT, 'kits'), sounds = soundsDir();
  if (!existsSync(own) && !sounds) mkdirSync(own);
  if (existsSync(own)) build(own, 'kits');
  if (sounds) build(join(sounds, 'kits'), 'pad16-sounds/kits');
}
