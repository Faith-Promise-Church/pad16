// Transport: start, stop, count-in, tempo and meter changes, tap tempo.
import type { Engine } from './engine';
import { TimeSig, beatsPerBar, clampBpm } from './time';

export class Transport {
  running = false;
  /** Tempo the player asked for; the clock catches up at the next bar line while playing. */
  targetBpm: number;
  targetTs: TimeSig;
  countInBars: 0 | 1 | 2 = 0;
  onState: Array<() => void> = [];
  private taps: number[] = [];

  constructor(private eng: Engine) { this.targetBpm = eng.clock.bpm; this.targetTs = eng.clock.ts; }

  /** Start on a downbeat. Returns the audio time of beat 0 (after any count-in). */
  start(countIn: number = this.countInBars): number {
    const e = this.eng, t0 = e.now() + 0.06, bpb = beatsPerBar(this.targetTs);
    e.pads.stopAll(0.01);
    e.clock.restart(t0, -countIn * bpb, this.targetBpm, this.targetTs);
    this.running = true;
    e.scheduler.tick();
    this.emit();
    return e.clock.timeAt(0);
  }
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.eng.pads.stopAll(0.03);
    this.eng.click.silence();
    // keep the clock free-running at the target tempo so MIDI clock never pauses
    this.eng.clock.setNow(this.eng.now(), this.targetBpm, this.targetTs);
    this.emit();
  }
  toggle(): void { this.running ? this.stop() : this.start(); }

  setBpm(bpm: number): void {
    this.targetBpm = clampBpm(bpm);
    const e = this.eng;
    if (this.running) e.clock.setAtNextBar(e.scheduler.horizon, this.targetBpm, this.targetTs);
    else e.clock.setNow(e.now(), this.targetBpm, this.targetTs);
    this.emit();
  }
  setTs(ts: TimeSig): void {
    this.targetTs = ts;
    const e = this.eng;
    if (this.running) e.clock.setAtNextBar(e.scheduler.horizon, this.targetBpm, ts);
    else e.clock.setNow(e.now(), this.targetBpm, ts);
    this.emit();
  }
  /** True while a tempo or meter change is waiting for the bar line. */
  get pending(): boolean { return this.running && this.eng.clock.last.time > this.eng.now(); }

  /** Tap tempo: average of the last four taps, reset after two seconds. Takes a time in ms. */
  tap(ms: number): number | null {
    if (this.taps.length && ms - this.taps[this.taps.length - 1] > 2000) this.taps = [];
    this.taps.push(ms);
    if (this.taps.length > 5) this.taps.shift();
    const bpm = tapTempo(this.taps);
    if (bpm) this.setBpm(bpm);
    return bpm;
  }
  private emit() { for (const f of this.onState) f(); }
}

/** Tempo from tap times in ms: the average of the last four gaps. */
export function tapTempo(taps: number[]): number | null {
  if (taps.length < 2) return null;
  const t = taps.slice(-5);
  const avg = (t[t.length - 1] - t[0]) / (t.length - 1);
  return avg > 0 ? clampBpm(60000 / avg) : null;
}
