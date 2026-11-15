// Fills any empty slot in kits/Acoustic Set/ with a synthesized stand-in from src/engine/synthkit.ts.
// Stand-ins are placeholders so every slot plays. Replace them with real recordings: see SAMPLES.md.
// Needs Node 22.18 or newer (it imports TypeScript directly):  node scripts/make-acoustic-kit.mjs
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SOUND_BY_ID, shakerLoop } from '../src/engine/synthkit.ts';
import { encodeWav } from '../src/engine/dsp.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SR = 48000;
// The exact slots from the brief. 16 go on pads; Shaker Accent is the seventeenth and is kept as a pattern-track sample.
const SLOTS = [
  [1, 'Stomp', 'stomp'], [2, 'Group Stomp', 'group-stomp'], [3, 'Cajon Bass', 'cajon-bass'], [4, 'Djembe Bass', 'djembe-bass'],
  [5, 'Thick Kick', 'thick-kick'], [6, '808 Kick', '808-kick'],
  [7, 'Clap', 'clap'], [8, 'Group Clap', 'group-clap'], [9, 'Tambourine With Head', 'tambourine-head'], [10, 'Tambourine Without Head', 'tambourine-no-head'],
  [11, 'Cajon Slap', 'cajon-slap'], [12, 'Snap', 'snap'], [13, 'Snare', 'snare'],
  [15, 'Shaker Forward', 'shaker-forward'], [16, 'Shaker Back', 'shaker-back'], [0, 'Shaker Accent', 'shaker-accent'],
];
// Never overwrites: a slot that already has a file (a real recording, or an earlier stand-in) is left alone.
// Delete a file first if you want its stand-in back.
const kit = join(ROOT, 'kits', 'Acoustic Set');
mkdirSync(kit, { recursive: true });
const have = readdirSync(kit).map(f => f.toLowerCase());
const taken = pad => have.some(f => f.startsWith(pad + ' '));
let made = 0;
for (const [pad, name, id] of SLOTS) {
  const file = `${pad ? pad + ' ' : ''}${name}.wav`;
  if (pad ? taken(pad) : have.includes(file.toLowerCase())) continue;
  writeFileSync(join(kit, file), encodeWav([SOUND_BY_ID[id].make(SR)], SR)); made++;
}
if (!taken(14)) { writeFileSync(join(kit, '14 Shaker Loop [loop] [96bpm] [1bars].wav'), encodeWav([shakerLoop(SR, 96, 4)], SR)); made++; }
console.log(`Acoustic Set: wrote ${made} stand-in${made === 1 ? '' : 's'}, kept ${have.length} existing file${have.length === 1 ? '' : 's'}.`);

spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-kits.mjs')], { stdio: 'inherit' });
