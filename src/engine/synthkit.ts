// Synthesized stand-in sounds, written as plain sample math so the same code runs in the browser
// (pattern tracks, click defaults, missing-sample fallback) and in Node (scripts/make-acoustic-kit.mjs).
import { biquad, rng, normalize } from './dsp.ts';

type Buf = Float32Array;
const buf = (sr: number, sec: number): Buf => new Float32Array(Math.ceil(sr * sec));
const noise = (sr: number, sec: number, r: () => number): Buf => { const b = buf(sr, sec); for (let i = 0; i < b.length; i++) b[i] = r() * 2 - 1; return b; };
/** Exponential decay envelope with a short linear attack. */
function env(x: Buf, sr: number, attack: number, decay: number, gain = 1): Buf {
  const a = Math.max(1, attack * sr);
  for (let i = 0; i < x.length; i++) x[i] *= gain * (i < a ? i / a : Math.exp(-(i - a) / (decay * sr / 4.6)));
  return x;
}
/** Sine sweeping from f0 to f1 with time constant tau. */
function sweep(sr: number, sec: number, f0: number, f1: number, tau: number): Buf {
  const b = buf(sr, sec); let ph = 0;
  for (let i = 0; i < b.length; i++) { const f = f1 + (f0 - f1) * Math.exp(-i / (tau * sr)); ph += (2 * Math.PI * f) / sr; b[i] = Math.sin(ph); }
  return b;
}
function mix(len: number, ...parts: Array<[Buf, number?, number?]>): Buf {
  const out = new Float32Array(len);
  for (const [p, g = 1, off = 0] of parts) for (let i = 0; i < p.length && i + off < len; i++) out[i + off] += p[i] * g;
  return out;
}
const sat = (x: Buf, drive: number): Buf => { for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive); return x; };
function tail(x: Buf, sr: number, ms = 8): Buf { const n = Math.min(x.length, Math.round((sr * ms) / 1000)); for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n; return x; }

function stomp(sr: number, r: () => number, pitch = 1, len = 0.32): Buf {
  const body = env(sweep(sr, len, 95 * pitch, 46 * pitch, 0.03), sr, 0.002, 0.2);
  const thud = env(biquad(noise(sr, len, r), sr, 'lowpass', 320 * pitch, 0.9), sr, 0.001, 0.07, 0.9);
  const grit = env(biquad(noise(sr, 0.06, r), sr, 'bandpass', 1800, 1.2), sr, 0.0005, 0.02, 0.18);
  return mix(body.length, [body, 1], [thud, 0.8], [grit, 1]);
}
function clap(sr: number, r: () => number, f = 1300, len = 0.34): Buf {
  const n = biquad(noise(sr, len, r), sr, 'bandpass', f, 1.3);
  for (let i = 0; i < n.length; i++) {
    const t = i / sr; let g = 0;
    for (const t0 of [0, 0.011, 0.023]) if (t >= t0 && t < t0 + 0.011) g = Math.max(g, 0.9 * Math.exp(-(t - t0) / 0.004));
    if (t >= 0.034) g = 0.75 * Math.exp(-(t - 0.034) / 0.055);
    n[i] *= g;
  }
  return n;
}
function jingles(sr: number, r: () => number, len: number, decay: number): Buf {
  const a = biquad(noise(sr, len, r), sr, 'highpass', 5200, 0.8);
  const b = biquad(noise(sr, len, r), sr, 'bandpass', 8600, 6);
  const c = biquad(noise(sr, len, r), sr, 'bandpass', 11200, 8);
  const m = mix(a.length, [a, 0.5], [b, 1.4], [c, 1.1]);
  // jingles rattle: a fast tremolo that settles
  for (let i = 0; i < m.length; i++) m[i] *= 0.65 + 0.35 * Math.sin((2 * Math.PI * 47 * i) / sr) * Math.exp(-i / (0.08 * sr));
  return env(m, sr, 0.002, decay);
}
function shake(sr: number, r: () => number, len: number, attack: number, decay: number, f: number, gain: number): Buf {
  const n = biquad(biquad(noise(sr, len, r), sr, 'highpass', f, 0.8), sr, 'lowpass', 12500, 0.7);
  return env(n, sr, attack, decay, gain);
}

export interface SynthSound { id: string; name: string; make: (sr: number) => Buf }
const S = (id: string, name: string, f: (sr: number, r: () => number) => Buf, seed: number): SynthSound =>
  ({ id, name, make: sr => { const b = tail(f(sr, rng(seed)), sr); normalize([b], 0.89); return b; } });

export const SOUNDS: SynthSound[] = [
  S('stomp', 'Stomp', (sr, r) => stomp(sr, r), 11),
  S('group-stomp', 'Group Stomp', (sr, r) => {
    const parts: Array<[Buf, number, number]> = [];
    for (let k = 0; k < 6; k++) parts.push([stomp(sr, r, 0.85 + r() * 0.4, 0.34), 0.5 + r() * 0.5, Math.round(r() * 0.035 * sr)]);
    return mix(Math.ceil(sr * 0.42), ...parts);
  }, 12),
  S('cajon-bass', 'Cajon Bass', (sr, r) => mix(Math.ceil(sr * 0.4),
    [env(sweep(sr, 0.4, 110, 62, 0.02), sr, 0.001, 0.26)],
    [env(biquad(noise(sr, 0.2, r), sr, 'bandpass', 170, 1.5), sr, 0.001, 0.09), 1.2],
    [env(biquad(noise(sr, 0.05, r), sr, 'bandpass', 2600, 1), sr, 0.0005, 0.015), 0.2]), 13),
  S('djembe-bass', 'Djembe Bass', (sr, r) => mix(Math.ceil(sr * 0.6),
    [env(sweep(sr, 0.6, 96, 68, 0.03), sr, 0.002, 0.42)],
    [env(sweep(sr, 0.3, 172, 118, 0.03), sr, 0.002, 0.16), 0.35],
    [env(biquad(noise(sr, 0.08, r), sr, 'bandpass', 700, 1), sr, 0.001, 0.03), 0.3]), 14),
  S('thick-kick', 'Thick Kick', (sr, r) => sat(mix(Math.ceil(sr * 0.55),
    [env(sweep(sr, 0.55, 170, 44, 0.028), sr, 0.001, 0.42), 1.3],
    [env(biquad(noise(sr, 0.03, r), sr, 'highpass', 2500, 0.7), sr, 0.0003, 0.008), 0.35]), 1.6), 15),
  S('808-kick', '808 Kick', sr => sat(env(sweep(sr, 1.1, 125, 47, 0.045), sr, 0.001, 0.95, 1.2), 1.2), 16),
  S('clap', 'Clap', (sr, r) => clap(sr, r), 21),
  S('group-clap', 'Group Clap', (sr, r) => {
    const parts: Array<[Buf, number, number]> = [];
    for (let k = 0; k < 7; k++) parts.push([clap(sr, r, 950 + r() * 900, 0.36), 0.45 + r() * 0.55, Math.round(r() * 0.04 * sr)]);
    return mix(Math.ceil(sr * 0.45), ...parts);
  }, 22),
  S('tambourine-head', 'Tambourine With Head', (sr, r) => mix(Math.ceil(sr * 0.35),
    [jingles(sr, r, 0.35, 0.2)],
    [env(sweep(sr, 0.12, 230, 170, 0.02), sr, 0.001, 0.07), 0.7],
    [env(biquad(noise(sr, 0.05, r), sr, 'bandpass', 900, 1), sr, 0.0005, 0.02), 0.4]), 23),
  S('tambourine-no-head', 'Tambourine Without Head', (sr, r) => jingles(sr, r, 0.45, 0.3), 24),
  S('cajon-slap', 'Cajon Slap', (sr, r) => mix(Math.ceil(sr * 0.25),
    [env(biquad(noise(sr, 0.25, r), sr, 'bandpass', 2900, 0.9), sr, 0.0005, 0.07)],
    [env(biquad(noise(sr, 0.25, r), sr, 'highpass', 5500, 0.7), sr, 0.001, 0.12), 0.35],
    [env(sweep(sr, 0.1, 260, 205, 0.01), sr, 0.0005, 0.05), 0.5]), 25),
  S('snap', 'Snap', (sr, r) => mix(Math.ceil(sr * 0.12),
    [env(biquad(noise(sr, 0.12, r), sr, 'bandpass', 2300, 3.5), sr, 0.0003, 0.035)],
    [env(biquad(noise(sr, 0.02, r), sr, 'highpass', 4000, 0.7), sr, 0.0002, 0.004), 0.5, Math.round(0.012 * sr)]), 26),
  S('snare', 'Snare', (sr, r) => mix(Math.ceil(sr * 0.32),
    [env(biquad(noise(sr, 0.32, r), sr, 'highpass', 1300, 0.7), sr, 0.001, 0.19), 0.8],
    [env(sweep(sr, 0.15, 205, 150, 0.03), sr, 0.001, 0.1), 0.7]), 27),
  S('shaker-forward', 'Shaker Forward', (sr, r) => shake(sr, r, 0.16, 0.018, 0.07, 4800, 0.8), 31),
  S('shaker-back', 'Shaker Back', (sr, r) => shake(sr, r, 0.14, 0.03, 0.05, 5600, 0.55), 32),
  S('shaker-accent', 'Shaker Accent', (sr, r) => shake(sr, r, 0.2, 0.006, 0.09, 4200, 1), 33),
  S('click-accent', 'Click Accent', sr => mix(Math.ceil(sr * 0.05), [env(sweep(sr, 0.05, 1760, 1760, 1), sr, 0.0005, 0.03)], [env(sweep(sr, 0.05, 3520, 3520, 1), sr, 0.0005, 0.012), 0.4]), 41),
  S('click-beat', 'Click Beat', sr => env(sweep(sr, 0.04, 1175, 1175, 1), sr, 0.0005, 0.025), 42),
  S('click-sub', 'Click Subdivision', sr => env(sweep(sr, 0.03, 880, 880, 1), sr, 0.0005, 0.014, 0.8), 43),
];
export const SOUND_BY_ID: Record<string, SynthSound> = Object.fromEntries(SOUNDS.map(s => [s.id, s]));

/** One bar of sixteenth-note shaker at the given tempo: forward and back strokes, accents on the beats. */
export function shakerLoop(sr: number, bpm = 96, beats = 4): Buf {
  const len = Math.round((beats * 60 * sr) / bpm), out = new Float32Array(len), step = len / (beats * 4);
  const r = rng(77);
  const acc = SOUND_BY_ID['shaker-accent'].make(sr), fwd = SOUND_BY_ID['shaker-forward'].make(sr), back = SOUND_BY_ID['shaker-back'].make(sr);
  for (let i = 0; i < beats * 4; i++) {
    const src = i % 4 === 0 ? acc : i % 2 === 0 ? fwd : back, g = (i % 4 === 0 ? 0.95 : i % 2 === 0 ? 0.6 : 0.42) * (0.9 + r() * 0.2);
    const o = Math.round(i * step);
    // wrap the tail around so the loop point is seamless
    for (let k = 0; k < src.length; k++) out[(o + k) % len] += src[k] * g;
  }
  normalize([out], 0.8);
  return out;
}
