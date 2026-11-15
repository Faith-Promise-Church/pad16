// Runs the real engine inside OfflineAudioContext and reports measurements. Used by tests/e2e/offline.spec.ts.
import { Engine } from '../src/engine/engine';
import { defaultPad, defaultClick, PadConfig } from '../src/store/model';
import { stretchLoop } from '../src/engine/stretch';
import { starterPatterns } from '../src/engine/patterns';
import { TimeSig } from '../src/engine/time';

const SR = 48000;
function offline(seconds: number, bpm: number, ts: TimeSig = { num: 4, den: 4 }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const eng = new Engine(ctx, { offline: true, bpm, ts });
  eng.transport.targetBpm = bpm; eng.transport.targetTs = ts;
  return { ctx, eng };
}
/** Times where the signal rises out of silence. */
function onsets(x: Float32Array, thr = 0.02, gapSec = 0.03): number[] {
  const out: number[] = []; let quiet = Math.round(gapSec * SR);
  const gap = quiet;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) > thr) { if (quiet >= gap) out.push(i / SR); quiet = 0; } else quiet++;
  }
  return out;
}
/** A loop with a sharp tick on every beat and silence between, so starts are easy to measure. */
function tickLoop(eng: Engine, bpm: number, beats: number): AudioBuffer {
  const len = Math.round((beats * 60 * SR) / bpm), d = new Float32Array(len);
  for (let b = 0; b < beats; b++) { const o = Math.round((b * 60 * SR) / bpm); for (let k = 0; k < 96; k++) d[o + k] = Math.sin(k * 0.6) * (1 - k / 96) * (b === 0 ? 0.9 : 0.5); }
  return eng.toBuffer([d], SR);
}
/** A loop with tonal content, closer to real material for the stretcher. */
function toneLoop(eng: Engine, bpm: number, beats: number): AudioBuffer {
  const len = Math.round((beats * 60 * SR) / bpm), d = new Float32Array(len);
  for (let b = 0; b < beats; b++) {
    const o = Math.round((b * 60 * SR) / bpm), n = Math.round(0.12 * SR), f = b === 0 ? 880 : 440;
    for (let k = 0; k < n && o + k < len; k++) d[o + k] = Math.sin((2 * Math.PI * f * k) / SR) * Math.exp(-k / (0.03 * SR)) * 0.8;
  }
  return eng.toBuffer([d], SR);
}
const loopPad = (over: Partial<PadConfig>): PadConfig => ({ ...defaultPad(0), mode: 'loop', sync: 'repitch', sourceBpm: 120, lengthBeats: 4, quantize: 'bar', ...over });

const H = {
  /** Four bars of click: worst distance from the grid, in ms. */
  async click(bpm = 120, ts: TimeSig = { num: 4, den: 4 }, sub: 'off' | '8' | '16' | '3' = 'off', bars = 4) {
    const beatSec = 60 / bpm, bpb = ts.den === 8 && ts.num % 3 === 0 ? ts.num / 3 : ts.num, { ctx, eng } = offline(bars * bpb * beatSec + 0.3, bpm, ts);
    eng.click.setSettings({ ...defaultClick(), on: true, sub, accent: 1, beat: 1, subLevel: 1 });
    const t0 = eng.transport.start(0);
    eng.scheduler.advanceTo(t0 + bars * bpb * beatSec - 0.001);
    const x = (await ctx.startRendering()).getChannelData(0), found = onsets(x, 0.02, 0.01);
    const per = sub === 'off' ? 1 : sub === '8' ? (bpb === ts.num ? 2 : 3) : sub === '16' ? (bpb === ts.num ? 4 : 6) : 3;
    const expected = Array.from({ length: bars * bpb * per }, (_, i) => t0 + (i * beatSec) / per);
    const worst = Math.max(...expected.map((t, i) => Math.abs((found[i] ?? 99) - t))) * 1000;
    return { count: found.length, expected: expected.length, worstMs: worst };
  },
  /** Count-in then click off: count-in ticks must sound, later ones must not. */
  async countIn() {
    const { ctx, eng } = offline(5, 120);
    eng.click.setSettings({ ...defaultClick(), on: false });
    const t0 = eng.transport.start(1);
    eng.scheduler.advanceTo(4.9);
    const found = onsets((await ctx.startRendering()).getChannelData(0), 0.02, 0.01);
    return { count: found.length, first: found[0], beatZero: t0 };
  },
  /** A loop triggered mid-bar with 1 bar quantize: where it actually starts against the bar line. */
  async queuedLoop(pressAt = 0.7, quantize: PadConfig['quantize'] = 'bar') {
    const { ctx, eng } = offline(6, 120);
    eng.pads.setPad(0, loopPad({ quantize }), tickLoop(eng, 120, 4));
    const t0 = eng.transport.start(0);
    eng.virtualNow = pressAt;
    const stateBefore = eng.pads.view(0).state;
    eng.pads.trigger(0);
    const queued = eng.pads.view(0).state;
    eng.scheduler.advanceTo(5.9);
    const found = onsets((await ctx.startRendering()).getChannelData(0), 0.02, 0.01);
    return { stateBefore, queued, start: found[0], barLine: eng.clock.timeAt(4), t0, errSamples: Math.round((found[0] - eng.clock.timeAt(4)) * SR), ticks: found.length };
  },
  /** Launching a synced pad while stopped starts the transport with the pad on the downbeat. */
  async launchStartsTransport() {
    const { ctx, eng } = offline(3, 120);
    eng.pads.setPad(0, loopPad({}), tickLoop(eng, 120, 4));
    eng.virtualNow = 0.2;
    eng.pads.trigger(0);
    const running = eng.transport.running, beatZero = eng.clock.timeAt(0);
    eng.scheduler.advanceTo(2.9);
    const found = onsets((await ctx.startRendering()).getChannelData(0), 0.02, 0.01);
    return { running, errSamples: Math.round((found[0] - beatZero) * SR) };
  },
  /** Tempo change mid-bar: click spacing before and after the next bar line. */
  async tempoChange() {
    const { ctx, eng } = offline(8, 120);
    eng.click.setSettings({ ...defaultClick(), on: true, accent: 1, beat: 1 });
    const t0 = eng.transport.start(0);
    eng.virtualNow = 0.5;
    eng.transport.setBpm(90);
    const pending = eng.transport.pending;
    eng.scheduler.advanceTo(7.9);
    const f = onsets((await ctx.startRendering()).getChannelData(0), 0.02, 0.01);
    const gaps = f.slice(1).map((t, i) => t - f[i]);
    return { pending, t0, gaps: gaps.slice(0, 9), barLine: f[4] - t0 };
  },
  /** Stop modes: when the loop's audio actually ends after a stop request at pressAt. */
  async stopModes(stopMode: PadConfig['stopMode'], pressAt = 2.5) {
    const { ctx, eng } = offline(8, 120);
    const len = Math.round(2 * SR), d = new Float32Array(len); for (let i = 0; i < len; i++) d[i] = 0.5 * Math.sin(i * 0.2);
    eng.pads.setPad(0, loopPad({ stopMode, fadeBeats: 4, quantize: 'bar' }), eng.toBuffer([d], SR));
    eng.pads.trigger(0);
    const t0 = eng.clock.timeAt(0);
    eng.scheduler.advanceTo(pressAt);
    eng.virtualNow = pressAt;
    eng.pads.trigger(0);
    const state = eng.pads.view(0).state;
    for (let t = pressAt; t < 7.9; t += 0.1) { eng.virtualNow = t; eng.scheduler.advanceTo(t + 0.12); }
    const x = (await ctx.startRendering()).getChannelData(0);
    let last = 0; for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]) > 0.003) { last = i; break; }
    const at = (sec: number) => { let p = 0; const o = Math.round(sec * SR); for (let i = o; i < o + 480; i++) p = Math.max(p, Math.abs(x[i])); return p; };
    return { state, endBeat: ((last / SR - t0) * 120) / 60, pressBeat: ((pressAt - t0) * 120) / 60, midFade: at(pressAt + 1), before: at(pressAt - 0.2) };
  },
  /** Exclusive group: pad B launched while pad A plays. A must stop where B starts. */
  async groups() {
    const { ctx, eng } = offline(8, 120);
    const mk = (f: number) => { const d = new Float32Array(2 * SR); for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / SR); return eng.toBuffer([d], SR); };
    eng.pads.setPad(0, loopPad({ group: 'A' }), mk(200));
    eng.pads.setPad(1, loopPad({ group: 'A' }), mk(1000));
    eng.pads.trigger(0);
    const t0 = eng.clock.timeAt(0);
    eng.scheduler.advanceTo(2.6); eng.virtualNow = 2.6;
    eng.pads.trigger(1);
    const states = [eng.pads.view(0).state, eng.pads.view(1).state];
    for (let t = 2.6; t < 7.9; t += 0.1) { eng.virtualNow = t; eng.scheduler.advanceTo(t + 0.12); }
    const x = (await ctx.startRendering()).getChannelData(0);
    // zero crossings per 20 ms tell the two tones apart
    const rate = (sec: number) => { let z = 0; const o = Math.round(sec * SR); for (let i = o + 1; i < o + 960; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) z++; return z * 50; };
    const boundary = t0 + 4;      // bar 2 at 120
    return { states, before: rate(boundary - 0.05), after: rate(boundary + 0.03), finalA: eng.pads.view(0).state, finalB: eng.pads.view(1).state };
  },
  /** A starter pattern on a pad: hit times of the first bar against the grid. */
  async pattern() {
    const { ctx, eng } = offline(5, 120);
    const pat = starterPatterns()[0];
    pat.tracks.forEach((t, i) => { if (i > 0) t.mute = true; });
    eng.pads.patterns = () => pat;
    eng.pads.trackBuffer = () => tickLoop(eng, 600, 1);
    eng.pads.setPad(0, { ...defaultPad(0), mode: 'pattern', patternId: pat.id }, null);
    eng.pads.trigger(0);
    const t0 = eng.clock.timeAt(0);
    eng.scheduler.advanceTo(t0 + 3.99);
    const f = onsets((await ctx.startRendering()).getChannelData(0), 0.02, 0.01);
    return { count: f.length, worstMs: Math.max(...f.map((t, i) => Math.abs(t - (t0 + i * 0.5)))) * 1000 };
  },
  /** 32 bars of a loop at a tempo other than its own. Reports how far each bar's downbeat is from the grid. */
  async alignment(mode: 'stretch' | 'repitch', sourceBpm = 100, bpm = 110, bars = 32) {
    const barSec = (4 * 60) / bpm, { ctx, eng } = offline(bars * barSec + 0.5, bpm);
    const loop = toneLoop(eng, sourceBpm, 4);
    eng.pads.setPad(0, loopPad({ sync: mode, sourceBpm, lengthBeats: 4 }), loop);
    let stretchedLen = 0, expectLen = Math.round(barSec * SR);
    if (mode === 'stretch') {
      const s = await stretchLoop(loop, sourceBpm, bpm, 4);
      stretchedLen = s.length;
      eng.pads.pads[0].stretched = { bpm, buffer: s };
    }
    eng.pads.trigger(0);
    const t0 = eng.clock.timeAt(0);
    eng.scheduler.advanceTo(t0 + bars * barSec - 0.01);
    const x = (await ctx.startRendering()).getChannelData(0);
    // the downbeat is the 880 Hz hit: find the energy peak near each bar line
    const errs: number[] = [];
    for (let b = 0; b < bars; b++) {
      const c = Math.round((t0 + b * barSec) * SR), w = Math.round(0.04 * SR);
      let best = 0, at = c;
      for (let i = Math.max(0, c - w); i < Math.min(x.length - 64, c + w); i++) { let e = 0; for (let k = 0; k < 64; k++) e += x[i + k] * x[i + k]; if (e > best) { best = e; at = i; } }
      errs.push(((at - c) / SR) * 1000);
    }
    const spread = Math.max(...errs) - Math.min(...errs);
    return { first: errs[0], last: errs[bars - 1], driftMs: errs[bars - 1] - errs[0], spreadMs: spread, worstMs: Math.max(...errs.map(Math.abs)), stretchedLen, expectLen };
  },
  /** The limiter keeps the program output under the -1 dB ceiling however hard it is driven. */
  async limiter() {
    const { ctx, eng } = offline(1, 120);
    const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 8; o.frequency.value = 100;
    o.connect(g); g.connect(eng.mixer.input('drums')); o.start();
    const x = (await ctx.startRendering()).getChannelData(0);
    let p = 0; for (const v of x) p = Math.max(p, Math.abs(v));
    return { peak: p };
  },
  /** Split mode: click only on the left, program only on the right. */
  async split() {
    const { ctx, eng } = offline(1.2, 120);
    eng.mixer.apply({ ...eng.mixer.routing, mode: 'split' });
    eng.click.setSettings({ ...defaultClick(), on: true });
    eng.transport.start(0);
    eng.scheduler.advanceTo(1.1);
    const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.3; o.frequency.value = 220;
    o.connect(g); g.connect(eng.mixer.input('loops')); o.start(0.3); o.stop(0.5);
    const r = await ctx.startRendering(), L = r.getChannelData(0), R = r.getChannelData(1);
    const pk = (x: Float32Array, a: number, b: number) => { let p = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) p = Math.max(p, Math.abs(x[i])); return p; };
    return { clickL: pk(L, 0.05, 0.1), clickR: pk(R, 0.05, 0.1), toneL: pk(L, 0.35, 0.45), toneR: pk(R, 0.35, 0.45) };
  },
  /** Sub synth: plays the right pitch, releases to silence, and stays silent when switched off. */
  async sub() {
    const { ctx, eng } = offline(2, 120);
    eng.sub.setSettings({ ...eng.sub.settings, on: true });
    eng.virtualNow = 0.1; eng.sub.noteOn(45);            // A2 = 110 Hz
    eng.virtualNow = 1.0; eng.sub.noteOff(45);
    const x = (await ctx.startRendering()).getChannelData(0);
    let z = 0; for (let i = Math.round(0.4 * SR) + 1; i < Math.round(0.9 * SR); i++) if (x[i - 1] < 0 && x[i] >= 0) z++;
    const pk = (a: number, b: number) => { let p = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) p = Math.max(p, Math.abs(x[i])); return p; };
    let first = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.005) { first = i; break; }
    return { hz: z / 0.5, held: pk(0.4, 0.9), tail: pk(1.8, 2.0), before: pk(0, 0.09), onsetMs: (first / SR - 0.1) * 1000 };
  },
};
(window as any).H = H;
