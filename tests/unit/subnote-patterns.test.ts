import { describe, it, expect } from 'vitest';
import { SubNotes } from '../../src/engine/subnote';
import { renderPattern, starterPatterns, rigPatterns, cajonLowPatterns, rig68Patterns, RIG_44, RIG_68, upgradePattern, emptyPattern, resizePattern, patternSteps, patternBeats } from '../../src/engine/patterns';
import { rigPads, padTarget, normalizeState, normalizeSong, defaultState, PADS, PAGE } from '../../src/store/model';

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
  const RIG_PAD_PATTERNS = [...RIG_44.shared, ...RIG_44.kick, RIG_44.build, RIG_44.stomp];
  it('page 1 is all cajon, page 2 swaps in the kick loops and shares every other pad', () => {
    const pads = rigPads();
    expect(pads.length).toBe(PADS);
    expect(pads[0]).toMatchObject({ name: 'Shaker', mode: 'loop', sync: 'stretch', sourceBpm: 80, lengthBeats: 32 });
    expect(pads.slice(1, PAGE).every(p => p.mode === 'pattern')).toBe(true);
    expect(pads.slice(1, PAGE).map(p => p.patternId)).toEqual([...RIG_44.shared, ...RIG_44.cajon, RIG_44.build, RIG_44.stomp]);
    expect(pads.slice(0, PAGE).map(p => p.group).join('')).toBe('AA' + 'BBBB' + 'CCCCCCC');     // tambos, cajon loops, low loops and the build
    // page 2: slots 9 to 14 are kick loops of their own; the rest point at page 1, the build (slot 15) included
    expect(pads.slice(PAGE).map((p, slot) => p.link ?? p.patternId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, ...RIG_44.kick, 14, 15]);
    expect(Array.from({ length: PAGE }, (_, slot) => padTarget(pads, PAGE + slot))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 24, 25, 26, 27, 28, 29, 14, 15]);
    expect(pads.slice(24, 30).every(p => p.group === 'C')).toBe(true);                           // one group across both pages
    expect(pads[14].patternId).toBe('rig-kick-build');
    const all = Object.fromEntries(starterPatterns().map(p => [p.id, p]));
    for (const p of pads) if (p.mode === 'pattern') expect(all[p.patternId], p.patternId).toBeTruthy();
    expect(defaultState().songs[0]).toMatchObject({ bpm: 80, kit: 'rig', pageNames: ['Cajon', 'Kick'] });
  });
  it('the cajon bass loops play the same rhythms as the kick loops', () => {
    const low = Object.fromEntries(cajonLowPatterns().map(p => [p.id, p]));
    RIG_44.cajon.forEach((id, n) => {
      expect(renderPattern(low[id])).toEqual(renderPattern(by[RIG_44.kick[n]]));
      expect(low[id].tracks[0]).toMatchObject({ choke: true, src: { t: 'synth', id: 'cajon-bass' } });
    });
  });
  it('a link only resolves to a real pad, and an old 16-pad song gains an empty second page', () => {
    const pads = rigPads();
    expect(padTarget(pads, 3)).toBe(3);
    pads[20] = { ...pads[20], link: 21 };            // a link to a link is not followed
    expect(padTarget(pads, 20)).toBe(20);
    pads[20] = { ...pads[20], link: 99 }; expect(padTarget(pads, 20)).toBe(20);
    const old = normalizeSong({ id: 'x', name: 'Old', pads: rigPads().slice(0, PAGE) });
    expect(old.pads.length).toBe(PADS);
    expect(old.pads[2].patternId).toBe('rig-tambo-4');
    expect(old.pads.slice(PAGE).every(p => p.src.t === 'none' && p.link === undefined && p.mode === 'oneshot')).toBe(true);
  });
  it('a saved song still on the first default layout moves to two pages; one that was changed is left alone', () => {
    const first = rigPads().slice(0, PAGE).map((p, i) => (i >= 8 && i <= 13 ? { ...p, patternId: RIG_44.kick[i - 8] } : p));
    const saved = JSON.parse(JSON.stringify({ id: 'a', name: 'My pads', kit: 'rig', bpm: 80, pads: first }));
    const up = normalizeSong(saved);
    expect(up.pads).toEqual(rigPads()); expect(up.pageNames).toEqual(['Cajon', 'Kick']); expect(up.name).toBe('My pads');
    expect(up.pads[8].patternId).toBe('rig-cbass-1'); expect(up.pads[24].patternId).toBe('rig-kick-1');
    const changed = JSON.parse(JSON.stringify(saved)); changed.pads[9].volume = 0.7;
    const kept = normalizeSong(changed);
    expect(kept.pads[8].patternId).toBe('rig-kick-1'); expect(kept.pads[9].volume).toBe(0.7);
    expect(kept.pads.slice(PAGE).every(p => p.src.t === 'none' && p.link === undefined)).toBe(true); expect(kept.pageNames).toEqual([]);
    // loading it a second time changes nothing more
    expect(normalizeSong(JSON.parse(JSON.stringify(up))).pads).toEqual(rigPads());
  });
  it('6/8 gets the same layout from 6/8 patterns, with the shaker as a pattern of single strokes', () => {
    const pads = rigPads({ num: 6, den: 8 }), p68 = Object.fromEntries(rig68Patterns().map(p => [p.id, p]));
    expect(pads[0]).toMatchObject({ name: 'Shaker', mode: 'pattern', patternId: 'rig68-shaker' });
    expect(pads.slice(1, PAGE).map(p => p.patternId)).toEqual([...RIG_68.shared, ...RIG_68.cajon, RIG_68.build, RIG_68.stomp]);
    expect(pads.slice(24, 30).map(p => p.patternId)).toEqual(RIG_68.kick);
    expect(pads.slice(0, PAGE).map(p => p.name)).toEqual(['Shaker', 'Tambo on 4', 'Tambo Every Other Bar', 'Claps on 4', 'Cajon Basic', 'Cajon Push', 'Cajon Rolling', 'Cajon Half Time',
      'Cajon on 1', 'Cajon 1 and 4', 'Cajon 1 3 4', 'Cajon 1 4 6', 'Cajon Worship A', 'Cajon Worship B', 'Kick Build', 'Stomp on 1']);
    for (const p of Object.values(p68)) { expect(p.ts).toEqual({ num: 6, den: 8 }); expect(p.bpb).toBe(2); expect(p.spb).toBe(6); expect(renderPattern(p).length).toBeGreaterThan(0); }
    // beats are dotted quarters: eighth notes fall every third of a beat
    const at = (id: string) => renderPattern(p68[id]).map(e => [Math.round(e.beat * 1000) / 1000, e.vel]);
    expect(at('rig68-shaker').map(x => x[0])).toEqual([0, 0.333, 0.667, 0.833, 1, 1.333, 1.667, 1.833]);       // strong on 1 and 4, a pickup into each pulse
    expect(renderPattern(p68['rig68-shaker']).filter(e => e.vel === 1).map(e => e.beat)).toEqual([0, 1]);
    expect(at('rig68-tambo-4')).toEqual([[1, 1]]); expect(at('rig68-tambo-2bar')).toEqual([[3, 1]]);
    expect(renderPattern(p68['rig68-clap-4']).map(e => [e.beat, e.track])).toEqual([[1, 0], [3, 1], [5, 2], [7, 0]]);
    expect(at('rig68-kick-1')).toEqual([[0, 1]]); expect(at('rig68-kick-1-4')).toEqual([[0, 1], [1, 0.75]]);
    expect(at('rig68-kick-1-3-4').map(x => x[0])).toEqual([0, 0.667, 1]); expect(at('rig68-kick-1-4-6').map(x => x[0])).toEqual([0, 1, 1.667]);
    RIG_68.cajon.forEach((id, n) => expect(renderPattern(p68[id])).toEqual(renderPattern(p68[RIG_68.kick[n]])));
    const build = at('rig68-kick-build').map(x => x[1]);                                                       // six eighths: big, drop, climb
    expect(build).toEqual([1, 0.25, 0.375, 0.5, 0.625, 0.875]);
    for (const n of [1, 2, 3, 4]) {
      const ev = renderPattern(p68['rig68-cajon-' + n]);
      expect(ev.some(e => e.track === 0 && e.beat === 0 && e.vel === 1)).toBe(true);
      expect(ev.filter(e => e.track === 1 && e.vel === 1).length).toBeGreaterThanOrEqual(1);
      expect(ev.filter(e => e.track === 2).every(e => e.vel <= 0.5)).toBe(true);
    }
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
