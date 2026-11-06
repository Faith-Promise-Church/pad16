#!/usr/bin/env node
// Turns any folder of samples into a Pad16 kit that plays cleanly on iPad.
//
//   node scripts/prepare-kit.mjs <source folder> ["Kit Name"] [options]
//
// For every audio file it:
//   - converts to 16-bit WAV at 48 kHz (the iPad's native rate), stripping MP3/M4A padding
//   - trims silence before the hit and after the tail (one shots and [hold] pads)
//   - leaves [loop] files untrimmed so the seam stays exactly where you cut it
//   - normalizes peaks to -1 dB so pads start at matching levels
// then writes kits/<Kit Name>/ and rebuilds kits/index.json.
//
// File names work the same as in kits/: "5 Snare.wav" goes on pad 5, "[loop]" or "[hold]" sets the mode.
//
// Options:
//   --mono            mix to mono (half the memory; fine for most drums)
//   --peak <dB>       peak level to normalize to (default -1)
//   --no-normalize    keep original levels
//   --no-trim         don't trim silence on any file
//   --replace         overwrite an existing kit with the same name
//
// Needs ffmpeg (Mac: brew install ffmpeg).

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, basename, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const RATE = 48000;
const AUDIO = new Set(['.wav', '.mp3', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.aif', '.aiff', '.caf', '.webm', '.opus', '.wma']);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/* ---------- arguments ---------- */
const opts = { mono: false, peak: -1, normalize: true, trim: true, replace: false };
const pos = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--mono') opts.mono = true;
  else if (a === '--no-normalize') opts.normalize = false;
  else if (a === '--no-trim') opts.trim = false;
  else if (a === '--replace') opts.replace = true;
  else if (a === '--peak') opts.peak = parseFloat(argv[++i]);
  else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
  else if (a.startsWith('--')) fail(`Unknown option ${a}`);
  else pos.push(a);
}
function usage() {
  console.log('Usage: node scripts/prepare-kit.mjs <source folder> ["Kit Name"] [--mono] [--peak -1] [--no-normalize] [--no-trim] [--replace]');
}
function fail(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1); }

if (!pos[0]) { usage(); process.exit(1); }
if (!Number.isFinite(opts.peak) || opts.peak > 0) fail('--peak takes a number of dB at or below 0, like -1');

const src = resolve(pos[0]);
if (!existsSync(src) || !statSync(src).isDirectory()) fail(`Can't find the folder ${src}`);
const kitName = (pos[1] || basename(src)).replace(/[\/\\:*?"<>|]/g, '-').trim();
if (!kitName) fail('Give the kit a name');
const dest = join(ROOT, 'kits', kitName);

const ff = spawnSync('ffmpeg', ['-version']);
if (ff.error) fail("ffmpeg isn't installed. On a Mac run: brew install ffmpeg");

/* ---------- names ---------- */
function parse(file) {
  let base = file.slice(0, -extname(file).length);
  let mode = 'oneshot';
  base = base.replace(/\s*\[(loop|hold|oneshot|one shot)\]\s*/gi, (_, m) => { mode = m.toLowerCase().replace(' ', ''); return ' '; });
  let pad;
  const m = base.match(/^\s*(\d{1,2})(?:[\s._-]+|$)(.*)$/);
  if (m && +m[1] >= 1 && +m[1] <= 16) { pad = +m[1]; base = m[2]; }
  const name = base.replace(/_+/g, ' ').replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Untitled';
  return { pad, name, mode };
}

/* ---------- ffmpeg helpers ---------- */
function run(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, log: r.stderr || '' };
}
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=channels:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  try {
    const j = JSON.parse(r.stdout);
    return { duration: parseFloat(j.format?.duration) || 0, channels: j.streams?.[0]?.channels || 1 };
  } catch (e) { return { duration: 0, channels: 1 }; }
}
const TRIM = [
  'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.001',
  'areverse', 'silenceremove=start_periods=1:start_threshold=-65dB', 'areverse',
  'afade=t=in:d=0.002',
];

/* ---------- go ---------- */
const files = readdirSync(src)
  .filter(f => !f.startsWith('.') && AUDIO.has(extname(f).toLowerCase()) && statSync(join(src, f)).isFile())
  .sort(collator.compare);
if (!files.length) fail(`No audio files in ${src}`);

if (existsSync(dest)) {
  const existing = readdirSync(dest).filter(f => AUDIO.has(extname(f).toLowerCase()));
  if (existing.length && !opts.replace) fail(`kits/${kitName} already exists. Add --replace to overwrite it, or pick another name.`);
  for (const f of existing) rmSync(join(dest, f));
} else mkdirSync(dest, { recursive: true });

console.log(`\nPreparing "${kitName}" from ${files.length} file${files.length === 1 ? '' : 's'}…\n`);

const rows = [];
const warnings = [];
let memory = 0;
const usedPads = new Set();

for (const file of files) {
  const { pad, name, mode } = parse(file);
  const ext = extname(file).toLowerCase();
  let padNo = pad;
  if (pad && usedPads.has(pad)) { warnings.push(`Two files are numbered ${pad}; "${file}" will go on the next free pad.`); padNo = undefined; }
  if (pad) usedPads.add(pad);

  const outName = `${padNo ? padNo + ' ' : ''}${name}${mode !== 'oneshot' ? ` [${mode}]` : ''}.wav`;
  const out = join(dest, outName);
  const input = join(src, file);

  let chain = opts.trim && mode !== 'loop' ? [...TRIM] : [];
  let gain = 0;

  // pass 1: measure the peak after trimming
  if (opts.normalize) {
    const measure = filters => {
      const m = run(['-i', input, '-af', [...filters, 'volumedetect'].join(','), '-f', 'null', '-']);
      const mv = m.log.match(/max_volume:\s*(-?[\d.]+|-inf) dB/);
      return { ok: m.ok, peak: mv && mv[1] !== '-inf' ? parseFloat(mv[1]) : null };
    };
    let r = measure(chain);
    if (r.peak === null && chain.length) {
      // trimming took the whole file: it's very quiet, so keep it whole
      r = measure([]);
      if (r.peak !== null) { chain = []; warnings.push(`"${file}" is very quiet; kept it untrimmed.`); }
    }
    if (!r.ok) { warnings.push(`Couldn't read "${file}", skipped.`); continue; }
    if (r.peak === null) { warnings.push(`"${file}" is silent, skipped.`); continue; }
    gain = Math.min(opts.peak - r.peak, 30);
  }

  // pass 2: write the WAV
  const write = (filters, g) => {
    const af = [...filters];
    if (opts.normalize && Math.abs(g) > 0.05) af.push(`volume=${g.toFixed(2)}dB`);
    const args = ['-y', '-i', input, '-vn', '-map_metadata', '-1'];
    if (af.length) args.push('-af', af.join(','));
    if (opts.mono) args.push('-ac', '1');
    args.push('-ar', String(RATE), '-c:a', 'pcm_s16le', out);
    return run(args);
  };
  const w = write(chain, gain);
  let info = w.ok ? probe(out) : { duration: 0 };

  // trimming took the whole file: it's very quiet, so keep it whole
  if (w.ok && info.duration < 0.005 && chain.length) {
    let g = 0;
    if (opts.normalize) {
      const m = run(['-i', input, '-af', 'volumedetect', '-f', 'null', '-']).log.match(/max_volume:\s*(-?[\d.]+) dB/);
      g = m ? Math.min(opts.peak - parseFloat(m[1]), 30) : 0;
    }
    write([], g); info = probe(out); gain = g;
    warnings.push(`"${file}" is very quiet; kept it untrimmed.`);
  }
  if (!w.ok || info.duration <= 0) { warnings.push(`Couldn't convert "${file}", skipped.`); continue; }

  if (mode === 'loop' && ['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wma'].includes(ext)) {
    warnings.push(`Loop "${file}" came from a compressed file. Listen for a gap or click where it repeats; a WAV source is safer.`);
  }

  memory += info.duration * info.channels * RATE * 4;
  rows.push({ pad: padNo, name, mode, file: outName, duration: info.duration, channels: info.channels, gain });
}

if (rows.length > 16) warnings.push(`${rows.length} files but only 16 pads; the extras won't load.`);

/* ---------- report ---------- */
const w = n => Math.max(...rows.map(r => String(n(r)).length), 4);
const cols = [
  ['Pad', r => r.pad || 'next'],
  ['Name', r => r.name],
  ['Mode', r => ({ oneshot: 'one shot', hold: 'hold', loop: 'loop' })[r.mode]],
  ['Length', r => r.duration < 1 ? `${Math.round(r.duration * 1000)} ms` : `${r.duration.toFixed(2)} s`],
  ['Ch', r => r.channels === 1 ? 'mono' : 'stereo'],
  ['Gain', r => opts.normalize ? `${r.gain >= 0 ? '+' : ''}${r.gain.toFixed(1)} dB` : '-'],
];
const widths = cols.map(([h, f]) => Math.max(h.length, w(f)));
console.log(cols.map(([h], i) => h.padEnd(widths[i])).join('  '));
console.log(widths.map(n => '-'.repeat(n)).join('  '));
for (const r of rows) console.log(cols.map(([, f], i) => String(f(r)).padEnd(widths[i])).join('  '));

const mb = memory / 1048576;
console.log(`\nMemory on the iPad once loaded: about ${mb.toFixed(0)} MB${mb > 100 ? ' (heavy: try --mono or shorter samples)' : ''}`);
if (warnings.length) { console.log('\nCheck these:'); warnings.forEach(x => console.log(`  • ${x}`)); }

/* ---------- index ---------- */
console.log('');
const idx = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-kits.mjs')], { stdio: 'inherit' });
if (idx.status !== 0) fail('Building kits/index.json failed');

console.log(`\nDone: kits/${kitName}/`);
console.log('Try it:  python3 -m http.server   then open http://localhost:8000');
console.log(`Ship it: git add kits && git commit -m "Add ${kitName}" && git push\n`);
