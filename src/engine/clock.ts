// The one master clock. A tempo map of segments, each starting on a bar line (or at the run start).
// Beats are continuous inside a run; start() begins a new run at beat 0 (or a negative beat for a count-in).
import { TimeSig, beatsPerBar, barBeat, BarBeat, clampBeat } from './time';

export interface Segment { time: number; beat: number; bar: number; bpm: number; ts: TimeSig }

export class Clock {
  segments: Segment[];
  /** Bumps whenever a new run starts, so sources can drop state from the old run. */
  run = 0;
  onChange: Array<(seg: Segment, newRun: boolean) => void> = [];

  constructor(bpm = 96, ts: TimeSig = { num: 4, den: 4 }, time = 0) {
    this.segments = [{ time, beat: 0, bar: 0, bpm: clampBeat(bpm), ts }];
  }
  get last(): Segment { return this.segments[this.segments.length - 1]; }
  get bpm(): number { return this.last.bpm; }
  get ts(): TimeSig { return this.last.ts; }

  segAtTime(t: number): Segment {
    const s = this.segments;
    for (let i = s.length - 1; i > 0; i--) if (t >= s[i].time) return s[i];
    return s[0];
  }
  segAtBeat(b: number): Segment {
    const s = this.segments;
    for (let i = s.length - 1; i > 0; i--) if (b >= s[i].beat - 1e-9) return s[i];
    return s[0];
  }
  beatAt(t: number): number { const g = this.segAtTime(t); return g.beat + ((t - g.time) * g.bpm) / 60; }
  timeAt(b: number): number { const g = this.segAtBeat(b); return g.time + ((b - g.beat) * 60) / g.bpm; }
  bpmAtBeat(b: number): number { return this.segAtBeat(b).bpm; }
  barBeatAt(b: number): BarBeat & { ts: TimeSig } {
    const g = this.segAtBeat(b);
    return { ...barBeat(b, g.ts, g.beat, g.bar), ts: g.ts };
  }
  /** Beat of the first bar line at or after beat b. */
  nextBarLine(b: number): number {
    const g = this.segAtBeat(b);
    const bpb = beatsPerBar(g.ts);
    return g.beat + Math.ceil((b - g.beat - 1e-6) / bpb) * bpb;
  }

  /** Begin a new run: beat startBeat happens at time. Use a negative startBeat for a count-in. */
  restart(time: number, startBeat = 0, bpm = this.bpm, ts = this.ts): void {
    const bpb = beatsPerBar(ts);
    this.segments = [{ time, beat: startBeat, bar: Math.round(startBeat / bpb), bpm: clampBeat(bpm), ts }];
    this.run++;
    this.emit(true);
  }
  /** Change tempo or meter right now, keeping the beat position continuous (used while stopped, when bars do not matter). */
  setNow(time: number, bpm = this.bpm, ts = this.ts): void {
    const beat = this.beatAt(time);
    this.segments = [{ time, beat, bar: 0, bpm: clampBeat(bpm), ts }];
    this.emit(false);
  }
  /** Change tempo or meter at the next bar line after time (used while playing). Returns the beat it lands on. */
  setAtNextBar(time: number, bpm = this.bpm, ts = this.ts): number {
    // drop any change that was queued but has not happened yet
    this.segments = this.segments.filter((s, i) => i === 0 || s.time <= time);
    const now = this.beatAt(time);
    const beat = this.nextBarLine(now + 1e-4);
    const at = this.timeAt(beat);
    const bar = this.barBeatAt(beat - 1e-6).bar + 1;
    this.segments.push({ time: at, beat, bar, bpm: clampBeat(bpm), ts });
    this.emit(false);
    return beat;
  }
  /** Forget segments that ended before time. */
  prune(time: number): void {
    while (this.segments.length > 1 && this.segments[1].time < time) this.segments.shift();
  }
  private emit(newRun: boolean) { for (const f of this.onChange) f(this.last, newRun); }
}
