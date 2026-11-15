// The built-in drum kit from the first version, synthesized offline. Sounds are unchanged.
const SR = 44100;
type Build = (oc: OfflineAudioContext, out: AudioNode) => void;
function noise(oc: OfflineAudioContext, sec: number) {
  const b = oc.createBuffer(1, Math.ceil(SR * sec), SR), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = oc.createBufferSource(); s.buffer = b; return s;
}
function env(oc: OfflineAudioContext, peak: number, attack: number, decay: number, t0 = 0) {
  const g = oc.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}
function filt(oc: OfflineAudioContext, type: BiquadFilterType, f: number, q = 0.7) { const b = oc.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function osc(oc: OfflineAudioContext, type: OscillatorType, f: number) { const o = oc.createOscillator(); o.type = type; o.frequency.value = f; return o; }

const KIT: Array<[string, number, Build]> = [
  ['Kick', 0.6, (oc, out) => { const o = osc(oc, 'sine', 150); o.frequency.exponentialRampToValueAtTime(42, 0.14); const g = env(oc, 1, 0.002, 0.5); o.connect(g).connect(out); o.start(); }],
  ['Snare', 0.35, (oc, out) => { const n = noise(oc, 0.35); n.connect(filt(oc, 'highpass', 1200)).connect(env(oc, 0.7, 0.001, 0.2)).connect(out); n.start();
    const o = osc(oc, 'triangle', 190); o.frequency.exponentialRampToValueAtTime(140, 0.08); o.connect(env(oc, 0.6, 0.001, 0.1)).connect(out); o.start(); }],
  ['Hat', 0.12, (oc, out) => { const n = noise(oc, 0.12); n.connect(filt(oc, 'highpass', 7500)).connect(env(oc, 0.5, 0.001, 0.05)).connect(out); n.start(); }],
  ['Open Hat', 0.6, (oc, out) => { const n = noise(oc, 0.6); n.connect(filt(oc, 'highpass', 7000)).connect(env(oc, 0.45, 0.002, 0.45)).connect(out); n.start(); }],
  ['Clap', 0.4, (oc, out) => { const n = noise(oc, 0.4); const g = oc.createGain(); g.gain.setValueAtTime(0, 0);
    [0, 0.012, 0.024].forEach(t => { g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01); });
    g.gain.setValueAtTime(0.7, 0.036); g.gain.exponentialRampToValueAtTime(0.0001, 0.3);
    n.connect(filt(oc, 'bandpass', 1400, 1.2)).connect(g).connect(out); n.start(); }],
  ['Rim', 0.1, (oc, out) => { const o = osc(oc, 'square', 1750); o.connect(filt(oc, 'bandpass', 1750, 4)).connect(env(oc, 0.8, 0.001, 0.04)).connect(out); o.start(); }],
  ['Low Tom', 0.6, (oc, out) => { const o = osc(oc, 'sine', 120); o.frequency.exponentialRampToValueAtTime(78, 0.3); o.connect(env(oc, 0.9, 0.002, 0.45)).connect(out); o.start(); }],
  ['High Tom', 0.45, (oc, out) => { const o = osc(oc, 'sine', 200); o.frequency.exponentialRampToValueAtTime(135, 0.25); o.connect(env(oc, 0.85, 0.002, 0.35)).connect(out); o.start(); }],
  ['Cowbell', 0.4, (oc, out) => { const g = env(oc, 0.35, 0.001, 0.32); const bp = filt(oc, 'bandpass', 800, 1.5);
    [540, 800].forEach(f => { const o = osc(oc, 'square', f); o.connect(bp); o.start(); }); bp.connect(g).connect(out); }],
  ['Shaker', 0.18, (oc, out) => { const n = noise(oc, 0.18); n.connect(filt(oc, 'bandpass', 6500, 1)).connect(env(oc, 0.6, 0.025, 0.12)).connect(out); n.start(); }],
  ['Crash', 1.8, (oc, out) => { const n = noise(oc, 1.8); n.connect(filt(oc, 'highpass', 3800)).connect(env(oc, 0.4, 0.002, 1.7)).connect(out); n.start(); }],
  ['Blip', 0.15, (oc, out) => { const o = osc(oc, 'sine', 1320); o.frequency.exponentialRampToValueAtTime(880, 0.05); o.connect(env(oc, 0.6, 0.001, 0.12)).connect(out); o.start(); }],
  ['Bass C', 0.8, (oc, out) => { const o = osc(oc, 'sawtooth', 65.41); const lp = filt(oc, 'lowpass', 900, 3); lp.frequency.exponentialRampToValueAtTime(180, 0.5);
    o.connect(lp).connect(env(oc, 0.7, 0.004, 0.7)).connect(out); o.start(); }],
  ['Bass Eb', 0.8, (oc, out) => { const o = osc(oc, 'sawtooth', 77.78); const lp = filt(oc, 'lowpass', 900, 3); lp.frequency.exponentialRampToValueAtTime(180, 0.5);
    o.connect(lp).connect(env(oc, 0.7, 0.004, 0.7)).connect(out); o.start(); }],
  ['Stab Cm', 0.7, (oc, out) => { const lp = filt(oc, 'lowpass', 2600, 1); lp.frequency.exponentialRampToValueAtTime(500, 0.5); const g = env(oc, 0.28, 0.005, 0.6);
    [261.63, 311.13, 392.0, 523.25].forEach(f => { const o = osc(oc, 'sawtooth', f); o.detune.value = Math.random() * 10 - 5; o.connect(lp); o.start(); });
    lp.connect(g).connect(out); }],
  ['Pluck G', 0.6, (oc, out) => { const o = osc(oc, 'triangle', 392); const o2 = osc(oc, 'sine', 784); const g = env(oc, 0.6, 0.002, 0.5);
    o.connect(g); o2.connect(env(oc, 0.2, 0.002, 0.15)).connect(out); g.connect(out); o.start(); o2.start(); }],
];
export const BUILTIN_NAMES = KIT.map(k => k[0]);

export async function renderBuiltinKit(): Promise<Array<AudioBuffer | null>> {
  const OAC: typeof OfflineAudioContext = (globalThis as any).OfflineAudioContext || (globalThis as any).webkitOfflineAudioContext;
  return Promise.all(KIT.map(async ([, sec, build]) => {
    try { const oc = new OAC(1, Math.ceil(SR * sec), SR); build(oc, oc.destination); return await oc.startRendering(); }
    catch { return null; }
  }));
}
