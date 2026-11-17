// Lookahead scheduler. A Worker ticks about every 25 ms; each tick places events for the next 120 ms on the audio clock.
// Nothing musical is timed by the tick itself: the tick only decides how far ahead to schedule.
import type { Engine } from './engine';

export interface Source { schedule(fromBeat: number, toBeat: number): void }

export class Scheduler {
  sources: Source[] = [];
  lookahead = 0.12;
  interval = 25;
  cursor = 0;
  /** Recent gaps between ticks, in ms, for the diagnostics panel. */
  tickGaps: number[] = [];
  private worker: Worker | null = null;
  private timer: any = null;
  private lastTick = 0;
  private run = -1;

  constructor(private eng: Engine) {
    eng.clock.onChange.push((_seg, newRun) => { if (newRun) { this.cursor = eng.clock.segments[0].beat; this.run = eng.clock.run; } });
    this.cursor = eng.clock.beatAt(eng.now());
  }
  /** Time up to which events are already placed. Tempo changes must land after this. */
  get horizon(): number { return this.eng.now() + this.lookahead; }

  start(): void {
    if (this.worker || this.timer) return;
    try {
      this.worker = new Worker(new URL('./tick.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = () => this.tick();
      this.worker.onerror = () => { this.worker?.terminate(); this.worker = null; this.fallback(); };
      this.worker.postMessage(this.interval);
    } catch { this.fallback(); }
  }
  private fallback() { this.timer = setInterval(() => this.tick(), this.interval); }
  stop(): void { this.worker?.terminate(); this.worker = null; if (this.timer) clearInterval(this.timer); this.timer = null; }

  tick(): void {
    const now = this.eng.now();
    if (typeof performance !== 'undefined') {
      const p = performance.now();
      if (this.lastTick) { this.tickGaps.push(p - this.lastTick); if (this.tickGaps.length > 200) this.tickGaps.shift(); }
      this.lastTick = p;
    }
    this.advanceTo(now + this.lookahead);
    this.eng.clock.prune(now - 2);
  }
  /** Schedule everything up to an audio time. Offline renders call this once with the full length. */
  advanceTo(time: number): void {
    const to = this.eng.clock.beatAt(time);
    if (to <= this.cursor) return;
    const from = this.cursor;
    this.cursor = to;
    for (const s of this.sources) {
      try { s.schedule(from, to); } catch (e) { console.warn('schedule failed', e); }
    }
  }
  /** Worst late tick in the recent window, beyond the nominal interval, in ms. */
  jitterMs(): number { return this.tickGaps.length ? Math.max(0, Math.max(...this.tickGaps) - this.interval) : 0; }
}
