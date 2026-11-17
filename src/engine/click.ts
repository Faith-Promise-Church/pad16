// Click. One interface, two implementations: Web Audio (this file) and the native cue route (src/native/nativeclick.ts).
import type { Engine } from './engine';
import { ClickSettings, defaultClick } from '../store/model';
import { clickEvents, ClickKind, TimeSig } from './time';
import { Source } from './scheduler';

export interface ClickBackend extends Source {
  readonly kind: 'web' | 'native';
  settings: ClickSettings;
  setSettings(s: ClickSettings): void;
  setSample(slot: ClickKind, buffer: AudioBuffer | null): void;
  /** Cut anything still ringing (transport stop, Panic). */
  silence(): void;
}

/** Click ticks for a beat window, across tempo-map segments. Shared by both backends and by the tests. */
export function clickPlan(eng: Engine, from: number, to: number, s: ClickSettings): Array<{ beat: number; time: number; kind: ClickKind; level: number }> {
  const out: Array<{ beat: number; time: number; kind: ClickKind; level: number }> = [];
  if (!eng.transport.running) return out;
  const segs = eng.clock.segments;
  for (let i = 0; i < segs.length; i++) {
    const a = Math.max(from, i === 0 ? -Infinity : segs[i].beat), b = Math.min(to, i + 1 < segs.length ? segs[i + 1].beat : Infinity);
    if (b <= a) continue;
    const ts: TimeSig = segs[i].ts;
    for (const ev of clickEvents(a, b, ts, s.sub, segs[i].beat)) {
      const countIn = ev.beat < -1e-9;
      if (!countIn && !s.on) continue;
      if (countIn && ev.kind === 'sub') continue;
      const level = ev.kind === 'accent' ? s.accent : ev.kind === 'beat' ? s.beat : s.subLevel;
      if (level > 0.001) out.push({ beat: ev.beat, time: eng.clock.timeAt(ev.beat), kind: ev.kind, level });
    }
  }
  return out;
}

export class WebClick implements ClickBackend {
  readonly kind = 'web' as const;
  settings: ClickSettings = defaultClick();
  private samples: Partial<Record<ClickKind, AudioBuffer | null>> = {};
  private live = new Set<{ src: AudioBufferSourceNode; g: GainNode }>();
  constructor(private eng: Engine) {}
  setSettings(s: ClickSettings) { this.settings = s; }
  setSample(slot: ClickKind, buffer: AudioBuffer | null) { this.samples[slot] = buffer; }
  /** True when this slot plays a loaded sample, false when it plays the built-in click. */
  hasSample(slot: ClickKind): boolean { return !!this.samples[slot]; }
  schedule(from: number, to: number): void {
    const e = this.eng, now = e.now();
    for (const ev of clickPlan(e, from, to, this.settings)) {
      const buffer = this.samples[ev.kind] || e.synthBuffer('click-' + (ev.kind === 'sub' ? 'sub' : ev.kind));
      if (!buffer || ev.time < now - 0.02) continue;
      const src = e.ctx.createBufferSource(), g = e.ctx.createGain(), v = { src, g };
      src.buffer = buffer; g.gain.value = ev.level;
      src.connect(g); g.connect(e.mixer.input('click'));
      src.start(Math.max(ev.time, now));
      this.live.add(v);
      src.onended = () => { this.live.delete(v); try { g.disconnect(); } catch { /* fine */ } };
    }
  }
  silence(): void {
    const t = this.eng.now();
    for (const v of this.live) { try { v.g.gain.setTargetAtTime(0, t, 0.005); v.src.stop(t + 0.03); } catch { /* fine */ } }
    this.live.clear();
  }
}
