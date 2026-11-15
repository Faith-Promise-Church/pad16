import { describe, it, expect } from 'vitest';
import { parseTags } from '../../src/engine/tags';
import { detectTempo, findOnsets } from '../../src/engine/detect';
import { SOUND_BY_ID, SOUNDS, shakerLoop } from '../../src/engine/synthkit';
import { bakeLoopCrossfade, encodeWav, decodeWav, peak } from '../../src/engine/dsp';

describe('file-name tags', () => {
  it('reads pad numbers and modes like the first version did', () => {
    expect(parseTags('05 Snare.wav')).toMatchObject({ pad: 5, name: 'Snare' });
    expect(parseTags('12 Swell [loop].wav')).toMatchObject({ pad: 12, name: 'Swell', mode: 'loop' });
    expect(parseTags('Kick.wav')).toMatchObject({ name: 'Kick' });
    expect(parseTags('Kick.wav').pad).toBeUndefined();
    expect(parseTags('3_Pad_Swell [hold].m4a')).toMatchObject({ pad: 3, name: 'Pad Swell', mode: 'hold' });
    expect(parseTags('17 Too High.wav').pad).toBeUndefined();
  });
  it('reads tempo, bars and group tags', () => {
    expect(parseTags('Groove [loop] [92bpm] [4bars].wav')).toMatchObject({ name: 'Groove', mode: 'loop', bpm: 92, bars: 4 });
    expect(parseTags('9 Shaker 92bpm [group:a].wav')).toMatchObject({ pad: 9, name: 'Shaker', bpm: 92, group: 'A' });
    expect(parseTags('Cajon_118.5bpm_2bars.wav')).toMatchObject({ name: 'Cajon', bpm: 118.5, bars: 2 });
    expect(parseTags('Loop [1bar] [Group:D].wav')).toMatchObject({ bars: 1, group: 'D' });
    expect(parseTags('Pad C [baked].wav')).toMatchObject({ name: 'Pad C', baked: true });
  });
  it('ignores numbers that are not tags', () => {
    expect(parseTags('808 Kick.wav')).toMatchObject({ name: '808 Kick' });
    expect(parseTags('808 Kick.wav').bpm).toBeUndefined();
    expect(parseTags('Take 2.wav').bars).toBeUndefined();
    expect(parseTags('Loop [999bpm].wav').bpm).toBeUndefined();
  });
});

function makeLoop(bpm: number, bars: number, sr = 44100): Float32Array {
  const beat = (60 / bpm) * sr, len = Math.round(bars * 4 * beat), out = new Float32Array(len);
  const add = (id: string, at: number, g: number) => { const s = SOUND_BY_ID[id].make(sr); for (let i = 0; i < s.length; i++) out[(Math.round(at) + i) % len] += s[i] * g; };
  for (let b = 0; b < bars * 4; b++) {
    add(b % 2 === 0 ? 'thick-kick' : 'snare', b * beat, 0.8);
    add('shaker-forward', b * beat, 0.3); add('shaker-back', (b + 0.5) * beat, 0.3);
  }
  return out;
}

describe('tempo detection', () => {
  for (const bpm of [72, 96, 120, 140]) for (const bars of [2, 4]) {
    it(`finds ${bpm} BPM in a generated ${bars}-bar loop`, () => {
      const g = detectTempo([makeLoop(bpm, bars)], 44100, { num: 4, den: 4 });
      expect(Math.abs(g.bpm - bpm)).toBeLessThan(0.5);
      expect(g.bars).toBe(bars);
      expect(g.confidence).toBeGreaterThan(0.5);
    });
  }
  it('trusts tags first', () => {
    const x = makeLoop(120, 2);
    expect(detectTempo([x], 44100, { num: 4, den: 4 }, { bpm: 60 })).toMatchObject({ bpm: 60, bars: 1, method: 'tag', confidence: 1 });
    expect(detectTempo([x], 44100, { num: 4, den: 4 }, { bars: 4 }).bpm).toBeCloseTo(240, 0);
  });
  it('reads 6/8 loops in dotted-quarter beats', () => {
    const sr = 44100, x = new Float32Array(Math.round(sr * 4));      // 2 bars of 6/8 at 60
    expect(detectTempo([x], sr, { num: 6, den: 8 })).toMatchObject({ bars: 4, lengthBeats: 8 });
  });
  it('finds onsets', () => {
    const on = findOnsets(makeLoop(120, 1), 44100);
    expect(on.length).toBeGreaterThanOrEqual(6); expect(on.length).toBeLessThanOrEqual(12);
  });
});

describe('sample helpers', () => {
  it('makes every stand-in sound audible and finite', () => {
    for (const s of SOUNDS) {
      const b = s.make(48000);
      expect(b.length).toBeGreaterThan(400);
      expect(peak([b])).toBeGreaterThan(0.5); expect(peak([b])).toBeLessThanOrEqual(0.9);
      expect(b.every(Number.isFinite)).toBe(true);
    }
  });
  it('builds a shaker loop of exact length', () => {
    expect(shakerLoop(48000, 96, 4).length).toBe(Math.round((4 * 60 * 48000) / 96));
  });
  it('bakes a loop crossfade that joins end to start', () => {
    const n = 48000, x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 100.37 * i) / 48000);
    const y = bakeLoopCrossfade(x, 4800);
    expect(y.length).toBe(n - 4800);
    // the sample after the last one is the original continuation, which the start now fades from
    expect(Math.abs(y[0] - x[n - 4800])).toBeLessThan(1e-6);
    expect(Math.abs(y[4800] - x[4800])).toBeLessThan(1e-6);
    // seam step is no bigger than the signal's own largest step
    let maxStep = 0; for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
    expect(Math.abs(y[0] - y[y.length - 1])).toBeLessThanOrEqual(maxStep * 1.05);
  });
  it('round-trips WAV', () => {
    const a = new Float32Array([0, 0.5, -0.5, 0.25]), b = new Float32Array([1, -1, 0, 0.125]);
    const d = decodeWav(encodeWav([a, b], 48000));
    expect(d.sampleRate).toBe(48000); expect(d.channels.length).toBe(2);
    expect(Array.from(d.channels[0]).map(v => +v.toFixed(3))).toEqual([0, 0.5, -0.5, 0.25]);
    expect(d.channels[1][1]).toBe(-1);
  });
});
