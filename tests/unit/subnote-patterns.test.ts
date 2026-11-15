import { describe, it, expect } from 'vitest';
import { SubNotes } from '../../src/engine/subnote';
import { renderPattern, starterPatterns, emptyPattern, resizePattern, patternSteps, patternBeats } from '../../src/engine/patterns';

describe('sub synth note priority', () => {
  it('plays the lowest held key and falls back when it is released', () => {
    const s = new SubNotes();
    expect(s.noteOn(40)).toEqual({ type: 'attack', note: 40 });
    expect(s.noteOn(45)).toBeNull();                               // higher key: no change
    expect(s.noteOn(36)).toEqual({ type: 'legato', note: 36 });    // lower key takes over
    expect(s.noteOff(36)).toEqual({ type: 'legato', note: 40 });   // back to the next lowest
    expect(s.noteOff(45)).toBeNull();
    expect(s.noteOff(40)).toEqual({ type: 'release' });
    expect(s.sounding).toBeNull();
  });
  it('ignores keys outside the range', () => {
    const s = new SubNotes();
    expect(s.noteOn(48)).toBeNull(); expect(s.noteOn(20)).toBeNull(); expect(s.noteOn(21)).toEqual({ type: 'attack', note: 21 });
    expect(s.noteOn(47)).toBeNull(); expect(s.held).toEqual([21, 47]);
  });
  it('holds the note with the pedal after the key is released', () => {
    const s = new SubNotes();
    s.noteOn(33); s.pedal(true);
    expect(s.noteOff(33)).toBeNull();
    expect(s.sounding).toBe(33); expect(s.sustained).toBe(true);
    expect(s.pedal(false)).toEqual({ type: 'release' });
    expect(s.sounding).toBeNull();
  });
  it('lets a new key replace the pedal-held note, even a higher one', () => {
    const s = new SubNotes();
    s.noteOn(33); s.pedal(true); s.noteOff(33);
    expect(s.noteOn(40)).toEqual({ type: 'attack', note: 40 });
    expect(s.noteOff(40)).toBeNull();                              // pedal still down: holds the new note
    expect(s.sounding).toBe(40);
    expect(s.pedal(false)).toEqual({ type: 'release' });
  });
  it('keeps sounding on pedal up while a key is still held', () => {
    const s = new SubNotes();
    s.noteOn(30); s.pedal(true);
    expect(s.pedal(false)).toBeNull();
    expect(s.sounding).toBe(30);
    expect(s.noteOff(30)).toEqual({ type: 'release' });
  });
  it('ignores the pedal when pedal response is off', () => {
    const s = new SubNotes(); s.pedalEnabled = false;
    s.noteOn(30); s.pedal(true);
    expect(s.noteOff(30)).toEqual({ type: 'release' });
  });
  it('releases everything on all off and on a range change', () => {
    const s = new SubNotes();
    s.noteOn(30); s.noteOn(35);
    expect(s.allOff()).toEqual({ type: 'release' }); expect(s.held).toEqual([]); expect(s.allOff()).toBeNull();
    s.noteOn(30);
    expect(s.setRange(36, 47)).toEqual({ type: 'release' });
    expect(s.noteOn(30)).toBeNull();
  });
  it('handles a repeated note on and a stray note off', () => {
    const s = new SubNotes();
    s.noteOn(30); expect(s.noteOn(30)).toBeNull(); expect(s.held).toEqual([30]);
    expect(s.noteOff(44)).toBeNull();
  });
});

describe('pattern rendering', () => {
  it('turns steps into timed events with three velocity levels', () => {
    const p = emptyPattern('t', 'T', { num: 4, den: 4 });
    p.tracks[0].steps[0] = 3; p.tracks[0].steps[4] = 2; p.tracks[1].steps[6] = 1;
    expect(renderPattern(p)).toEqual([{ beat: 0, track: 0, vel: 1 }, { beat: 1, track: 0, vel: 0.75 }, { beat: 1.5, track: 1, vel: 0.35 }]);
  });
  it('applies swing to off steps, track level and mute', () => {
    const p = emptyPattern('t', 'T', { num: 4, den: 4 });
    p.swing = 75; p.tracks[0].steps[1] = 2; p.tracks[0].level = 0.5; p.tracks[1].steps[0] = 3; p.tracks[1].mute = true;
    const ev = renderPattern(p);
    expect(ev.length).toBe(1); expect(ev[0].beat).toBeCloseTo(0.375); expect(ev[0].vel).toBeCloseTo(0.375);
  });
  it('adapts the grid to the meter', () => {
    const p = emptyPattern('t', 'T', { num: 6, den: 8 });
    expect(patternSteps(p)).toBe(12); expect(patternBeats(p)).toBe(2);
    const t = emptyPattern('t', 'T', { num: 4, den: 4 }, 2, '3');
    expect(patternSteps(t)).toBe(24); expect(patternBeats(t)).toBe(8);
    t.tracks[0].steps[1] = 2;
    expect(renderPattern(t)[0].beat).toBeCloseTo(1 / 3);
  });
  it('keeps steps that still fit when resized', () => {
    const p = emptyPattern('t', 'T', { num: 4, den: 4 });
    p.tracks[0].steps[0] = 3; p.tracks[0].steps[8] = 2; p.tracks[0].steps[3] = 1;
    const r = resizePattern(p, { num: 4, den: 4 }, 2, '16');
    expect(patternSteps(r)).toBe(32); expect(r.tracks[0].steps[0]).toBe(3); expect(r.tracks[0].steps[16]).toBe(3); expect(r.tracks[0].steps[24]).toBe(2);
    const t = resizePattern(p, { num: 4, den: 4 }, 1, '3');
    expect(t.tracks[0].steps[0]).toBe(3); expect(t.tracks[0].steps[6]).toBe(2); expect(t.tracks[0].steps.filter(Boolean).length).toBe(2);
  });
  it('ships six starter patterns that render inside their length', () => {
    const ps = starterPatterns();
    expect(ps.map(p => p.name)).toEqual(['Stomp and clap', 'Cajon groove', 'Train-beat shaker', '6/8 ballad', 'Half time', 'Build']);
    for (const p of ps) {
      const ev = renderPattern(p);
      expect(ev.length).toBeGreaterThan(3);
      expect(p.tracks.length).toBe(8);
      for (const t of p.tracks) expect(t.steps.length).toBe(patternSteps(p));
      for (const e of ev) { expect(e.beat).toBeGreaterThanOrEqual(0); expect(e.beat).toBeLessThan(patternBeats(p)); }
    }
    expect(renderPattern(ps[0]).filter(e => e.track === 0).map(e => e.beat)).toEqual([0, 1, 2, 3]);
  });
});
