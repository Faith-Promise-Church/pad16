import { describe, it, expect } from 'vitest';
import { beatsPerBar, beatLenQ, isCompound, subsPerBeat, quantBeats, nextBoundary, barBeat, clickEvents, swingOffset, quarterBpm, keyIndex, clampBpm } from '../../src/engine/time';
import { Clock } from '../../src/engine/clock';
import { tapTempo } from '../../src/engine/transport';

const T44 = { num: 4, den: 4 } as const, T68 = { num: 6, den: 8 } as const, T128 = { num: 12, den: 8 } as const, T34 = { num: 3, den: 4 } as const, T78 = { num: 7, den: 8 } as const;

describe('meters', () => {
  it('groups compound meters in dotted quarters', () => {
    expect(isCompound(T68)).toBe(true); expect(isCompound({ num: 9, den: 8 })).toBe(true); expect(isCompound(T128)).toBe(true);
    expect(isCompound(T78)).toBe(false); expect(isCompound(T34)).toBe(false);
    expect(beatsPerBar(T68)).toBe(2); expect(beatsPerBar({ num: 9, den: 8 })).toBe(3); expect(beatsPerBar(T128)).toBe(4);
    expect(beatLenQ(T68)).toBe(1.5); expect(beatLenQ(T44)).toBe(1); expect(beatLenQ({ num: 2, den: 2 })).toBe(2); expect(beatLenQ(T78)).toBe(0.5);
  });
  it('gives MIDI clock the quarter-note tempo', () => {
    expect(quarterBpm(60, T68)).toBe(90); expect(quarterBpm(120, T44)).toBe(120);
  });
  it('clamps tempo to 40..240 in 0.1 steps', () => {
    expect(clampBpm(12)).toBe(40); expect(clampBpm(400)).toBe(240); expect(clampBpm(96.449)).toBe(96.4);
  });
});

describe('bar, beat and quantize boundaries', () => {
  it('finds bar and beat', () => {
    expect(barBeat(0, T44)).toMatchObject({ bar: 0, beat: 0 });
    expect(barBeat(5.5, T44)).toMatchObject({ bar: 1, beat: 1 });
    expect(barBeat(5.5, T44).frac).toBeCloseTo(0.5);
    expect(barBeat(3, T68)).toMatchObject({ bar: 1, beat: 1 });
    expect(barBeat(-4, T44)).toMatchObject({ bar: -1, beat: 0 });
    expect(barBeat(10, T44, 8, 2)).toMatchObject({ bar: 2, beat: 2 });
  });
  it('sizes every quantize value', () => {
    expect(quantBeats('none', T44)).toBe(0); expect(quantBeats('1/16', T44)).toBe(0.25); expect(quantBeats('1/8', T44)).toBe(0.5);
    expect(quantBeats('beat', T44)).toBe(1); expect(quantBeats('1/2bar', T44)).toBe(2); expect(quantBeats('bar', T44)).toBe(4);
    expect(quantBeats('2bars', T44)).toBe(8); expect(quantBeats('4bars', T44)).toBe(16);
    expect(quantBeats('bar', T68)).toBe(2); expect(quantBeats('1/8', T68)).toBeCloseTo(1 / 3); expect(quantBeats('bar', T34)).toBe(3);
  });
  it('snaps to the next boundary and stays put when already on one', () => {
    expect(nextBoundary(0.01, 4)).toBe(4); expect(nextBoundary(4, 4)).toBe(4); expect(nextBoundary(4.0000001, 4)).toBe(4);
    expect(nextBoundary(4.1, 4)).toBe(8); expect(nextBoundary(3.2, 0.5)).toBe(3.5); expect(nextBoundary(2.5, 0)).toBe(2.5);
    expect(nextBoundary(9, 8, 4)).toBe(12);
  });
});

describe('subdivision grids', () => {
  it('counts subdivisions per beat in simple and compound meters', () => {
    expect(subsPerBeat(T44, 'off')).toBe(1); expect(subsPerBeat(T44, '8')).toBe(2); expect(subsPerBeat(T44, '16')).toBe(4); expect(subsPerBeat(T44, '3')).toBe(3);
    expect(subsPerBeat(T68, '8')).toBe(3); expect(subsPerBeat(T68, '16')).toBe(6); expect(subsPerBeat(T68, '3')).toBe(3);
    expect(subsPerBeat(T78, '8')).toBe(1); expect(subsPerBeat(T78, '16')).toBe(2);
  });
  it('lays out a 4/4 bar of eighths', () => {
    const ev = clickEvents(0, 4, T44, '8');
    expect(ev.map(e => e.kind)).toEqual(['accent', 'sub', 'beat', 'sub', 'beat', 'sub', 'beat', 'sub']);
    expect(ev.map(e => e.beat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });
  it('lays out 6/8 with eighths as two groups of three', () => {
    const ev = clickEvents(0, 2, T68, '8');
    expect(ev.map(e => e.kind)).toEqual(['accent', 'sub', 'sub', 'beat', 'sub', 'sub']);
  });
  it('accents every bar and never drifts over many bars', () => {
    const ev = clickEvents(0, 400, T34, '3');
    expect(ev.length).toBe(1200);
    expect(ev.filter(e => e.kind === 'accent').length).toBe(Math.ceil(400 / 3));
    expect(ev[1199].beat).toBeCloseTo(400 - 1 / 3, 9);
  });
  it('splits windows without losing or repeating ticks', () => {
    const whole = clickEvents(0, 16, T44, '16');
    const parts = [...clickEvents(0, 3.33, T44, '16'), ...clickEvents(3.33, 9.1, T44, '16'), ...clickEvents(9.1, 16, T44, '16')];
    expect(parts).toEqual(whole);
  });
  it('handles a count-in before beat zero', () => {
    const ev = clickEvents(-4, 0, T44, 'off');
    expect(ev.map(e => e.kind)).toEqual(['accent', 'beat', 'beat', 'beat']);
  });
});

describe('swing', () => {
  it('delays only the off steps', () => {
    expect(swingOffset(0, 66)).toBe(0); expect(swingOffset(2, 75)).toBe(0);
    expect(swingOffset(1, 50)).toBe(0); expect(swingOffset(1, 75)).toBeCloseTo(0.5); expect(swingOffset(3, 66.6667)).toBeCloseTo(1 / 3, 3);
    expect(swingOffset(1, 99)).toBeCloseTo(0.5);
  });
});

describe('clock tempo map', () => {
  it('maps time and beats both ways', () => {
    const c = new Clock(120, T44, 10);
    expect(c.beatAt(12)).toBeCloseTo(4); expect(c.timeAt(8)).toBeCloseTo(14);
  });
  it('applies a tempo change at the next bar line', () => {
    const c = new Clock(120, T44, 0);
    c.restart(1, 0);
    const beat = c.setAtNextBar(1.3, 60);          // 0.6 beats in
    expect(beat).toBe(4);
    expect(c.timeAt(4)).toBeCloseTo(3);
    expect(c.timeAt(5)).toBeCloseTo(4);            // one beat at 60
    expect(c.beatAt(2.5)).toBeCloseTo(3);          // still 120 before the bar line
    expect(c.barBeatAt(4.5)).toMatchObject({ bar: 1, beat: 0 });
  });
  it('replaces a queued change with a newer one', () => {
    const c = new Clock(120, T44, 0); c.restart(0, 0);
    c.setAtNextBar(0.5, 90); c.setAtNextBar(0.6, 100);
    expect(c.segments.length).toBe(2); expect(c.bpm).toBe(100);
  });
  it('keeps beat position continuous when changed while stopped', () => {
    const c = new Clock(100, T44, 0);
    const b = c.beatAt(3); c.setNow(3, 140);
    expect(c.beatAt(3)).toBeCloseTo(b); expect(c.bpm).toBe(140);
  });
  it('counts bars through a count-in', () => {
    const c = new Clock(120, T44, 0); c.restart(0, -4);
    expect(c.barBeatAt(-4)).toMatchObject({ bar: -1, beat: 0 }); expect(c.barBeatAt(0)).toMatchObject({ bar: 0, beat: 0 });
    expect(c.timeAt(0)).toBeCloseTo(2);
  });
});

describe('tap tempo', () => {
  it('averages the last four gaps', () => {
    expect(tapTempo([0])).toBeNull();
    expect(tapTempo([0, 500])).toBe(120);
    expect(tapTempo([0, 500, 1000, 1500, 2000])).toBe(120);
    expect(tapTempo([0, 100, 700, 1300, 1900, 2500])).toBe(100);
  });
});

describe('keys', () => {
  it('parses key names', () => {
    expect(keyIndex('C')).toBe(0); expect(keyIndex('Db')).toBe(1); expect(keyIndex('C#')).toBe(1); expect(keyIndex('B')).toBe(11);
    expect(keyIndex('F#m')).toBe(6); expect(keyIndex('H')).toBe(-1); expect(keyIndex('Cb')).toBe(11);
  });
});
