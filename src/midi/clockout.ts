// MIDI clock out: 24 pulses per quarter note, locked to the master tempo map.
import { Clock } from '../engine/clock';
import { beatLenQ } from '../engine/time';
import { ClockSegment, MidiBackend } from './types';

export const PPQ = 24;

/** Clock pulses in [from, to) beats. Pulses sit on a grid anchored at beat 0 of the run, so bar lines always carry a pulse. */
export function clockPulses(clock: Clock, from: number, to: number): Array<{ beat: number; time: number }> {
  const out: Array<{ beat: number; time: number }> = [];
  const segs = clock.segments;
  for (let i = 0; i < segs.length; i++) {
    const a = Math.max(from, i === 0 ? -Infinity : segs[i].beat), b = Math.min(to, i + 1 < segs.length ? segs[i + 1].beat : Infinity);
    if (b <= a) continue;
    const ppb = PPQ * beatLenQ(segs[i].ts);
    for (let n = Math.ceil(a * ppb - 1e-6); n / ppb < b - 1e-9; n++) out.push({ beat: n / ppb, time: clock.timeAt(n / ppb) });
  }
  return out;
}

/** The tempo map as steady clock stretches, for a backend that generates clock itself. toMs converts audio time to performance.now() ms. */
export function clockSegments(clock: Clock, toMs: (t: number) => number): ClockSegment[] {
  return clock.segments.map(s => {
    const ppb = PPQ * beatLenQ(s.ts), first = Math.ceil(s.beat * ppb - 1e-6) / ppb;
    return { startMs: toMs(s.time), firstPulseMs: toMs(clock.timeAt(first)), periodMs: 60000 / (s.bpm * ppb) };
  });
}

export interface ClockHost { clock: Clock; now(): number; toMs(audioTime: number): number }

export class ClockOut {
  enabled = true;
  ports: string[] = [];
  offsets: Record<string, number> = {};
  /** 'timestamp' sends ahead with timestamps. 'immediate' sends each pulse from a timer at its due time: looser, flagged approximate. */
  mode: 'timestamp' | 'immediate' = 'timestamp';
  /** How late immediate sends actually went out, in ms, for the diagnostics panel. */
  sendErrors: number[] = [];
  private lastPulseMs: Record<string, number> = {};
  private run = -1;

  constructor(private host: ClockHost, public backend: MidiBackend) {
    host.clock.onChange.push(() => this.pushNative());
  }
  get approximate(): boolean { return !this.backend.nativeClock && this.mode === 'immediate'; }

  /** Native backends take the tempo map and make their own pulses. */
  pushNative(): void {
    if (!this.backend.nativeClock || !this.backend.setClock) return;
    this.backend.setClock(this.enabled ? clockSegments(this.host.clock, t => this.host.toMs(t)) : [], this.ports, this.offsets);
  }

  schedule(from: number, to: number): void {
    if (!this.enabled || !this.ports.length || this.backend.nativeClock) return;
    const { clock } = this.host;
    const newRun = clock.run !== this.run;
    this.run = clock.run;
    for (const p of clockPulses(clock, from, to)) {
      const base = this.host.toMs(p.time), period = 60000 / (clock.bpmAtBeat(p.beat) * PPQ * beatLenQ(clock.segAtBeat(p.beat).ts));
      for (const port of this.ports) {
        const at = base + (this.offsets[port] || 0);
        // after a restart the grid moves: never let two pulses land closer than half a period
        if (newRun && this.lastPulseMs[port] !== undefined && at - this.lastPulseMs[port] < period * 0.5) continue;
        this.lastPulseMs[port] = at;
        if (this.mode === 'timestamp') this.backend.send([port], [0xf8], at);
        else this.sendAt(port, at);
      }
    }
  }
  private sendAt(port: string, at: number): void {
    const wait = at - performance.now() - 1.5;
    setTimeout(() => {
      while (performance.now() < at) { /* short spin for the last millisecond or so */ }
      this.backend.send([port], [0xf8]);
      this.sendErrors.push(performance.now() - at);
      if (this.sendErrors.length > 240) this.sendErrors.shift();
    }, Math.max(0, wait));
  }
  /** Start (0xFA) or Stop (0xFC), sent only when the player turned that on. */
  sendTransport(start: boolean, atAudioTime?: number): void {
    if (!this.ports.length) return;
    const at = atAudioTime === undefined ? undefined : this.host.toMs(atAudioTime);
    for (const port of this.ports) this.backend.send([port], [start ? 0xfa : 0xfc], at === undefined || this.mode === 'immediate' ? undefined : at + (this.offsets[port] || 0));
  }
  jitterMs(): number {
    if (!this.sendErrors.length) return 0;
    const s = this.sendErrors.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length * 0.95)] - s[0];
  }
}
