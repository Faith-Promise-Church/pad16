// Spoken count-in: "one, two, three, four" over the count-in clicks, on the click bus so it follows the click to the ears.
// Each word is started early by the time its vowel takes to arrive, so the vowel (which is what the ear hears as the beat)
// lands on the beat. In 6/8 it counts the six eighth notes when the tempo is slow enough to say them, otherwise the two pulses.
import type { Engine } from './engine';
import { Source } from './scheduler';
import { beatsPerBar, isCompound, TimeSig } from './time';

/** The count-in words for a window of beats: which number, and the beat it belongs on. Shared with the tests. */
export function countPlan(from: number, to: number, ts: TimeSig, pulseSeconds: number, have: (n: number) => boolean): Array<{ beat: number; n: number }> {
  const out: Array<{ beat: number; n: number }> = [], end = Math.min(to, 0);
  if (from >= end) return out;
  const bpb = beatsPerBar(ts);
  // compound time: say every eighth note when there is room for the words (about a quarter of a second each) and words enough
  const eighths = isCompound(ts) && pulseSeconds / 3 >= 0.26 && have(ts.num);
  const step = eighths ? 1 / 3 : 1, perBar = Math.round(bpb / step);
  for (let k = Math.ceil(from / step - 1e-6); k * step < end - 1e-6; k++) {
    const n = (((k % perBar) + perBar) % perBar) + 1;
    if (have(n)) out.push({ beat: k * step, n });
  }
  return out;
}

export class CountVoice implements Source {
  on = true;
  level = 1;
  private words = new Map<number, { buffer: AudioBuffer; anchor: number }>();
  private live = new Set<AudioBufferSourceNode>();
  constructor(private eng: Engine) {}
  setWord(n: number, buffer: AudioBuffer | null, anchorSeconds = 0): void { if (buffer) this.words.set(n, { buffer, anchor: anchorSeconds }); else this.words.delete(n); }
  get ready(): number { return this.words.size; }
  clear(): void { this.words.clear(); }
  schedule(from: number, to: number): void {
    const e = this.eng;
    if (!this.on || !this.words.size || !e.transport.running || from >= 0) return;
    const now = e.now(), seg = e.clock.segments[0];
    for (const w of countPlan(from, to, seg.ts, 60 / seg.bpm, n => this.words.has(n))) {
      const word = this.words.get(w.n)!, at = e.clock.timeAt(w.beat) - word.anchor;
      const late = Math.max(0, now - at);                       // the very first word can be due before now: start it part way in, still on the beat
      if (late > word.anchor + 0.05) continue;
      const src = e.ctx.createBufferSource(), g = e.ctx.createGain();
      src.buffer = word.buffer; g.gain.value = this.level;
      src.connect(g); g.connect(e.mixer.input('click'));
      src.start(Math.max(at, now), late);
      this.live.add(src);
      src.onended = () => { this.live.delete(src); try { g.disconnect(); } catch { /* fine */ } };
    }
  }
  silence(): void { for (const s of this.live) { try { s.stop(); } catch { /* fine */ } } this.live.clear(); }
}
