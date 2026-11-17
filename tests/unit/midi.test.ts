import { describe, it, expect } from 'vitest';
import { Clock } from '../../src/engine/clock';
import { ClockOut, clockPulses, clockSegments } from '../../src/midi/clockout';
import { MockMidi } from '../../src/midi/types';
import { MidiManager, MidiTargets } from '../../src/midi/manager';
import { SubNotes } from '../../src/engine/subnote';
import { defaultSettings, MidiAction } from '../../src/store/model';

const T44 = { num: 4, den: 4 } as const;
const host = (clock: Clock) => ({ clock, now: () => 0, toMs: (t: number) => t * 1000 });

describe('MIDI clock out', () => {
  it('sends 24 pulses per quarter note on the grid', () => {
    const clock = new Clock(120, T44, 0); clock.restart(0, 0);
    const midi = new MockMidi(), out = new ClockOut(host(clock), midi);
    out.ports = ['out1'];
    // schedule in uneven windows the way the live scheduler does
    let b = 0; for (const step of [0.31, 0.24, 0.26, 0.19, 1.0, 2.0]) { out.schedule(b, b + step); b += step; }
    const pulses = midi.sent.filter(m => m.data[0] === 0xf8);
    expect(pulses.length).toBe(96);                                    // 4 quarters
    pulses.forEach((p, i) => expect(Math.abs(p.atMs! - i * (500 / 24))).toBeLessThan(0.001));
  });
  it('follows a tempo change at the bar line with no gap or bunching', () => {
    const clock = new Clock(120, T44, 0); clock.restart(0, 0);
    clock.setAtNextBar(0.4, 90);                                       // lands on beat 4, t = 2 s
    const midi = new MockMidi(), out = new ClockOut(host(clock), midi);
    out.ports = ['out1']; out.schedule(0, 8);
    const t = midi.sent.map(m => m.atMs!);
    expect(t.length).toBe(192);
    for (let i = 1; i < 96; i++) expect(t[i] - t[i - 1]).toBeCloseTo(500 / 24, 6);
    expect(t[96]).toBeCloseTo(2000, 6);
    for (let i = 97; i < 192; i++) expect(t[i] - t[i - 1]).toBeCloseTo(60000 / 90 / 24, 6);
  });
  it('sends quarter-note clock in 6/8', () => {
    const clock = new Clock(60, { num: 6, den: 8 }, 0); clock.restart(0, 0);
    const p = clockPulses(clock, 0, 2);                                // one bar: 3 quarters
    expect(p.length).toBe(72);
    expect(p[1].time - p[0].time).toBeCloseTo(60 / 90 / 24, 9);
  });
  it('keeps running while stopped and never bunches pulses across a restart', () => {
    const clock = new Clock(100, T44, 0);
    const midi = new MockMidi(), out = new ClockOut(host(clock), midi);
    out.ports = ['out1'];
    out.schedule(0, clock.beatAt(1.0));
    clock.restart(1.003, 0);                                           // player pressed Start
    out.schedule(0, 2);
    const t = midi.sent.map(m => m.atMs!), period = 60000 / 100 / 24;
    for (let i = 1; i < t.length; i++) { expect(t[i] - t[i - 1]).toBeGreaterThan(period * 0.49); expect(t[i] - t[i - 1]).toBeLessThan(period * 1.51); }
    expect(t.some(x => Math.abs(x - 1003) < 1e-6)).toBe(true);        // a pulse sits on the downbeat
  });
  it('applies the per-device clock offset and can be switched off', () => {
    const clock = new Clock(120, T44, 0); clock.restart(0, 0);
    const midi = new MockMidi(), out = new ClockOut(host(clock), midi);
    out.ports = ['out1']; out.offsets = { out1: -12 }; out.schedule(0, 0.1);
    expect(midi.sent[0].atMs).toBeCloseTo(-12);
    out.enabled = false; midi.sent = []; out.schedule(0.1, 1);
    expect(midi.sent.length).toBe(0);
  });
  it('describes the tempo map for a native clock generator', () => {
    const clock = new Clock(120, T44, 0); clock.restart(1, 0); clock.setAtNextBar(1.2, 60);
    const segs = clockSegments(clock, t => t * 1000);
    expect(segs.length).toBe(2);
    expect(segs[0]).toMatchObject({ startMs: 1000, firstPulseMs: 1000 }); expect(segs[0].periodMs).toBeCloseTo(500 / 24);
    expect(segs[1].startMs).toBeCloseTo(3000); expect(segs[1].periodMs).toBeCloseTo(1000 / 24);
  });
  it('sends Start and Stop only when asked, with a timestamp', () => {
    const clock = new Clock(120, T44, 0), midi = new MockMidi(), out = new ClockOut(host(clock), midi);
    out.ports = ['out1']; out.sendTransport(true, 2); out.sendTransport(false);
    expect(midi.sent).toEqual([{ port: 'out1', data: [0xfa], atMs: 2000 }, { port: 'out1', data: [0xfc], atMs: undefined }]);
  });
});

function rig() {
  const midi = new MockMidi(), notes = new SubNotes(), settings = defaultSettings().midi;
  const log: string[] = [];
  const act = (a: ReturnType<SubNotes['noteOn']>) => { if (a) log.push(a.type + ('note' in a ? ':' + a.note : '')); };
  const targets: MidiTargets = {
    subInRange: n => notes.inRange(n), noteOn: n => act(notes.noteOn(n)), noteOff: n => act(notes.noteOff(n)), pedal: d => act(notes.pedal(d)),
    control: (t, v) => log.push(`ctl:${t}:${v.toFixed(2)}`), bend: v => log.push('bend:' + v.toFixed(2)),
    padTrigger: i => log.push('pad:' + i), padRelease: i => log.push('padoff:' + i), action: (a: MidiAction) => log.push('act:' + a),
    programChange: n => log.push('pc:' + n), linkLost: () => { act(notes.allOff()); log.push('lost'); }, cc1: () => 'cutoff', cc11: () => 'level',
  };
  const mgr = new MidiManager(midi, () => settings, targets);
  return { midi, notes, settings, log, mgr };
}

describe('MIDI in', () => {
  it('low note wins', async () => {
    const r = rig(); await r.mgr.init();
    r.midi.receive([0x90, 40, 100]); r.midi.receive([0x90, 43, 100]); r.midi.receive([0x90, 36, 100]);
    expect(r.notes.sounding).toBe(36);
    r.midi.receive([0x80, 36, 0]);
    expect(r.notes.sounding).toBe(40);
    r.midi.receive([0x90, 40, 0]);                                     // note on with velocity 0 is a note off
    expect(r.notes.sounding).toBe(43);
    expect(r.log).toEqual(['attack:40', 'legato:36', 'legato:40', 'legato:43']);
  });
  it('pedal holds the bass note and a new key replaces it', async () => {
    const r = rig(); await r.mgr.init();
    r.midi.receive([0x90, 33, 90]); r.midi.receive([0xb0, 64, 127]); r.midi.receive([0x80, 33, 0]);
    expect(r.notes.sounding).toBe(33);
    r.midi.receive([0x90, 38, 90]);
    expect(r.notes.sounding).toBe(38);
    r.midi.receive([0x80, 38, 0]); r.midi.receive([0xb0, 64, 0]);
    expect(r.notes.sounding).toBeNull();
    expect(r.log).toEqual(['attack:33', 'attack:38', 'release']);
  });
  it('routes mod wheel, expression and pitch bend', async () => {
    const r = rig(); await r.mgr.init();
    r.midi.receive([0xb0, 1, 127]); r.midi.receive([0xb0, 11, 64]); r.midi.receive([0xe0, 0, 64]); r.midi.receive([0xe0, 127, 127]);
    expect(r.log).toEqual(['ctl:cutoff:1.00', 'ctl:level:0.50', 'bend:0.00', 'bend:1.00']);
  });
  it('keeps notes above the bass range away from the synth, and can send them to pads', async () => {
    const r = rig(); await r.mgr.init();
    r.midi.receive([0x90, 60, 100]);
    expect(r.log).toEqual([]);
    r.settings.padZone = { on: true, low: 60 };
    r.midi.receive([0x90, 63, 100]); r.midi.receive([0x80, 63, 0]);
    expect(r.log).toEqual(['pad:3', 'padoff:3']);
  });
  it('learns a control and fires the mapped action on press only', async () => {
    const r = rig(); await r.mgr.init();
    r.mgr.startLearn(b => { r.settings.maps.nextSong = b; });
    r.midi.receive([0xb1, 20, 127]);
    expect(r.settings.maps.nextSong).toEqual({ kind: 'cc', ch: 2, num: 20 });
    r.midi.receive([0xb1, 20, 127]); r.midi.receive([0xb1, 20, 0]);
    expect(r.log).toEqual(['act:nextSong']);
  });
  it('selects songs by program change only when enabled', async () => {
    const r = rig(); await r.mgr.init();
    r.midi.receive([0xc0, 3]);
    r.settings.programChange = true; r.midi.receive([0xc0, 3]);
    expect(r.log).toEqual(['pc:3']);
  });
  it('releases the note when the device drops, and reports the link state', async () => {
    const r = rig(); await r.mgr.init();
    expect(r.mgr.link).toBe('connected');
    r.midi.receive([0x90, 30, 100]);
    r.settings.lastBle = 'WIDI Master';
    r.midi.unplug('in1'); r.midi.unplug('out1');
    expect(r.notes.sounding).toBeNull(); expect(r.log).toContain('lost'); expect(r.mgr.link).toBe('searching');
    r.midi.plug({ id: 'in1', name: 'WIDI Master', kind: 'ble' }, 'in');
    expect(r.mgr.link).toBe('connected');
    r.midi.receive([0x90, 30, 100]);
    expect(r.notes.sounding).toBe(30);
  });
  it('never echoes input to output and ignores disabled devices', async () => {
    const r = rig(); await r.mgr.init();
    r.midi.receive([0x90, 30, 100]); r.midi.receive([0xb0, 1, 5]); r.midi.receive([0xf8]);
    expect(r.midi.sent.length).toBe(0);
    r.settings.disabled.in1 = true; r.midi.receive([0x90, 25, 100]);
    expect(r.notes.held).toEqual([30]);
  });
});
