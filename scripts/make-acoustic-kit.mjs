// Writes kits/Acoustic Set/ and the stand-in pad set from the synthesized sounds in src/engine/synthkit.ts.
// These are placeholders so the kit plays on day one. Replace them with real recordings: see SAMPLES.md.
// Needs Node 22.18 or newer (it imports TypeScript directly):  node scripts/make-acoustic-kit.mjs
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SOUND_BY_ID, shakerLoop } from '../src/engine/synthkit.ts';
import { encodeWav, biquad, rng, normalize, bakeLoopCrossfade } from '../src/engine/dsp.ts';

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
function fresh(dir) {
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.wav')) rmSync(join(dir, f));
  mkdirSync(dir, { recursive: true });
}
const kit = join(ROOT, 'kits', 'Acoustic Set');
fresh(kit);
for (const [pad, name, id] of SLOTS) writeFileSync(join(kit, `${pad ? pad + ' ' : ''}${name}.wav`), encodeWav([SOUND_BY_ID[id].make(SR)], SR));
writeFileSync(join(kit, '14 Shaker Loop [loop] [96bpm] [1bars].wav'), encodeWav([shakerLoop(SR, 96, 4)], SR));

// A soft root-and-fifth drone in C, baked to loop. One sample only, so the app pitch-shifts it to the other keys
// and labels that as a fallback until real pads in all 12 keys are added.
function drone(sec) {
  const n = Math.round(sec * SR), out = new Float32Array(n), r = rng(5);
  for (const [midi, g] of [[36, 0.9], [43, 0.6], [48, 0.7], [55, 0.4], [60, 0.3], [64, 0.12]]) {
    for (const det of [-6, 0, 7]) {
      const f = 440 * Math.pow(2, (midi - 69 + det / 100) / 12), ph = r() * 6.28, lfo = 0.05 + r() * 0.1, lp = r() * 6.28;
      for (let i = 0; i < n; i++) {
        const t = i / SR, a = 0.75 + 0.25 * Math.sin(2 * Math.PI * lfo * t + lp);
        out[i] += g * a * (Math.sin(2 * Math.PI * f * t + ph) + 0.3 * Math.sin(4 * Math.PI * f * t + ph) + 0.12 * Math.sin(6 * Math.PI * f * t));
      }
    }
  }
  biquad(out, SR, 'lowpass', 1800, 0.7);
  return out;
}
const pads = join(ROOT, 'kits', 'Stand-in Pad');
fresh(pads);
const baked = bakeLoopCrossfade(drone(14), 2 * SR);
normalize([baked], 0.5);
writeFileSync(join(pads, 'Pad C [baked].wav'), encodeWav([baked], SR));

spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-kits.mjs')], { stdio: 'inherit' });
