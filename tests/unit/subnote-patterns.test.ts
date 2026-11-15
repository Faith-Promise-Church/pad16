import { describe, it, expect } from 'vitest';
import { SubNotes } from '../../src/engine/subnote';
import { renderPattern, starterPatterns, rigPatterns, RIG_PAD_PATTERNS, upgradePattern, emptyPattern, resizePattern, patternSteps, patternBeats } from '../../src/engine/patterns';
import { rigPads, normalizeState, defaultState } from '../../src/store/model';

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
  it('turns steps into timed events with eight velocity levels', () => {
    const p = emptyPattern('t', 'T', { num: 4, den: 4 });
    p.tracks[0].steps[0] = 8; p.tracks[0].steps[4] = 6; p.tracks[1].steps[6] = 3; p.tracks[1].steps[7] = 1;
    expect(renderPattern(p)).toEqual([{ beat: 0, track: 0, vel: 1 }, { beat: 1, track: 0, vel: 0.75 }, { beat: 1.5, track: 1, vel: 0.375 }, { beat: 1.75, track: 1, vel: 0.125 }]);
  });
  it('applies swing to off steps, track level and mute', () => {
    const p = emptyPattern('t', 'T', { num: 4, den: 4 });
    p.swing = 75; p.tracks[0].steps[1] = 6; p.tracks[0].level = 0.5; p.tracks[1].steps[0] = 3; p.tracks[1].mute = true;
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
    expect(ps.slice(0, 6).map(p => p.name)).toEqual(['Stomp and clap', 'Cajon groove', 'Train-beat shaker', '6/8 ballad', 'Half time', 'Build']);
    for (const p of ps) {
      const ev = renderPattern(p);
      expect(ev.length).toBeGreaterThan(0); expect(p.lv).toBe(8);
      expect(p.tracks.length).toBe(8);
      for (const t of p.tracks) expect(t.steps.length).toBe(patternSteps(p));
      for (const e of ev) { expect(e.beat).toBeGreaterThanOrEqual(0); expect(e.beat).toBeLessThan(patternBeats(p)); }
    }
    expect(renderPattern(ps[0]).filter(e => e.track === 0).map(e => e.beat)).toEqual([0, 1, 2, 3]);
  });
  it('brings patterns saved on the old three-level scale onto the eight-level scale, once', () => {
    const old = emptyPattern('o', 'Old', { num: 4, den: 4 }); delete (old as any).lv;
    old.tracks[0].steps[0] = 3; old.tracks[0].steps[4] = 2; old.tracks[0].steps[6] = 1;
    const up = upgradePattern(old);
    expect([up.tracks[0].steps[0], up.tracks[0].steps[4], up.tracks[0].steps[6], up.lv]).toEqual([8, 6, 3, 8]);
    expect(renderPattern(up).map(e => e.vel)).toEqual([1, 0.75, 0.375]);
    expect(upgradePattern(up)).toBe(up);
    // a saved state from before the change is upgraded on load, and gains the new default patterns
    const saved: any = defaultState(); saved.patterns = [old];
    const st = normalizeState(JSON.parse(JSON.stringify(saved)));
    expect(st.patterns.find(p => p.id === 'o')!.tracks[0].steps[0]).toBe(8);
    expect(st.patterns.some(p => p.id === 'rig-kick-build')).toBe(true);
  });
});

describe('default pad layout', () => {
  const by = Object.fromEntries(rigPatterns().map(p => [p.id, p]));
  const hits = (id: string) => renderPattern(by[id]).map(e => [e.beat, e.vel]);
  const beats = (id: string) => renderPattern(by[id]).map(e => e.beat);
  it('puts the 80 BPM shaker on pad 1, stretched, and a pattern on every other pad', () => {
    const pads = rigPads();
    expect(pads[0]).toMatchObject({ name: 'Shaker', mode: 'loop', sync: 'stretch', sourceBpm: 80, lengthBeats: 32 });
    expect(pads.slice(1).every(p => p.mode === 'pattern')).toBe(true);
    expect(pads.slice(1).map(p => p.patternId)).toEqual(RIG_PAD_PATTERNS);
    for (const id of RIG_PAD_PATTERNS) expect(by[id], id).toBeTruthy();
    expect(pads.map(p => p.group).join('')).toBe('AA' + 'BBBB' + 'CCCCCCC');       // tambos, cajon loops, kick loops
    expect(defaultState().songs[0]).toMatchObject({ bpm: 80, kit: 'rig' });
  });
  it('tambourine on 2 and 4, on 4 alone, and claps on 2 and 4 with rotating takes', () => {
    expect(beats('rig-tambo-2-4')).toEqual([1, 3]); expect(beats('rig-tambo-4')).toEqual([3]);
    expect(renderPattern(by['rig-clap-2-4']).map(e => [e.beat, e.track])).toEqual([[1, 0], [3, 1], [5, 2], [7, 0]]);
  });
  it('kick loops: on 1, 1-and and 3-and with weaker off beats, syncopated, four on the floor', () => {
    expect(hits('rig-kick-1')).toEqual([[0, 1]]);
    expect(hits('rig-kick-and')).toEqual([[0, 1], [0.5, 0.625], [2, 1], [2.5, 0.625]]);
    // 1, a of 1, & of 2, e and & of 3, then the & of 4
    expect(beats('rig-kick-sync')).toEqual([0, 0.75, 1.5, 2.25, 2.5, 3.5]);
    expect(beats('rig-kick-four')).toEqual([0, 1, 2, 3]);
    expect(beats('rig-kick-worship-1')).toEqual([0, 1.5, 2]); expect(beats('rig-kick-worship-2')).toEqual([0, 1.75, 2, 2.5]);
    for (const id of RIG_PAD_PATTERNS.filter(x => x.startsWith('rig-kick'))) expect(by[id].tracks[0]).toMatchObject({ choke: true, src: { t: 'synth', id: 'thick-kick' } });
  });
  it('the build is eighth notes: a big downbeat, a drop, then a steady climb', () => {
    const h = hits('rig-kick-build');
    expect(h.map(x => x[0])).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    const v = h.map(x => x[1]);
    expect(v[0]).toBe(1); expect(v[1]).toBe(0.25);
    for (let i = 2; i < 8; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
    expect(v[7]).toBeGreaterThan(v[1] * 3); expect(v[7]).toBeLessThan(v[0]);
    expect(new Set(v).size).toBeGreaterThanOrEqual(6);                                 // needs more than three levels
  });
  it('one stomp on each downbeat, a different take every bar, and four two-bar cajon loops', () => {
    expect(renderPattern(by['rig-stomp-1']).map(e => [e.beat, e.track])).toEqual([[0, 0], [4, 1], [8, 2], [12, 3]]);
    for (const n of [1, 2, 3, 4]) {
      const p = by['rig-cajon-' + n], ev = renderPattern(p);
      expect(p.bars).toBe(2);
      expect(ev.some(e => e.track === 0 && e.beat === 0 && e.vel === 1)).toBe(true);     // bass on the downbeat
      expect(ev.filter(e => e.track === 1).length).toBeGreaterThanOrEqual(2);            // slaps
      expect(ev.filter(e => e.track === 2).every(e => e.vel <= 0.5)).toBe(true);         // taps stay under the main hits
    }
  });
});
