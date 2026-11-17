// Pure musical math. No audio, no DOM. Everything here is unit tested.
// Position unit is the felt beat: the denominator note in simple meters, the dotted quarter in compound meters.

export type Den = 2 | 4 | 8 | 16;
export interface TimeSig { num: number; den: Den }
export type Subdivision = 'off' | '8' | '16' | '3';
export type Quant = 'none' | '1/16' | '1/8' | 'beat' | '1/2bar' | 'bar' | '2bars' | '4bars';
export const QUANTS: Quant[] = ['none', '1/16', '1/8', 'beat', '1/2bar', 'bar', '2bars', '4bars'];
export const QUANT_LABEL: Record<Quant, string> = {
  none: 'None', '1/16': '1/16', '1/8': '1/8', beat: '1 beat', '1/2bar': '1/2 bar', bar: '1 bar', '2bars': '2 bars', '4bars': '4 bars',
};

export const isCompound = (ts: TimeSig) => ts.den === 8 && ts.num >= 6 && ts.num % 3 === 0;
/** Length of one felt beat, in quarter notes. */
export const beatLenQ = (ts: TimeSig) => (isCompound(ts) ? 1.5 : 4 / ts.den);
export const beatsPerBar = (ts: TimeSig) => (isCompound(ts) ? ts.num / 3 : ts.num);
/** Quarter notes per minute for a felt-beat tempo. MIDI clock runs at 24 pulses per quarter. */
export const quarterBpm = (bpm: number, ts: TimeSig) => bpm * beatLenQ(ts);
export const clampBpm = (bpm: number) => Math.round(Math.min(240, Math.max(40, bpm)) * 10) / 10;
/** The clock's own limit for the felt beat. Finer than the tempo you type, because a 6/8 song typed as 74 (in quarter notes) has a pulse of 49.333. */
export const clampBeat = (bpm: number) => Math.round(Math.min(300, Math.max(20, bpm)) * 1e4) / 1e4;
/** How a compound-meter tempo is counted: by the dotted-quarter pulse, or in quarter notes the way worship charts print it (74 in 6/8 means eighths at 148). */
export type TempoCount = 'pulse' | 'quarter';
export const pulseBpm = (bpm: number, ts: TimeSig, count: TempoCount | undefined) => (count === 'quarter' && isCompound(ts) ? bpm / 1.5 : bpm);
export const shownBpm = (pulse: number, ts: TimeSig, count: TempoCount | undefined) => (count === 'quarter' && isCompound(ts) ? pulse * 1.5 : pulse);

export function subsPerBeat(ts: TimeSig, sub: Subdivision): number {
  if (sub === 'off') return 1;
  if (isCompound(ts)) return sub === '16' ? 6 : 3;
  if (sub === '3') return 3;
  const q = beatLenQ(ts);
  return Math.max(1, Math.round(q / (sub === '8' ? 0.5 : 0.25)));
}

/** Quantize step in beats. 0 means no quantize. */
export function quantBeats(q: Quant, ts: TimeSig): number {
  const bpb = beatsPerBar(ts);
  switch (q) {
    case 'none': return 0;
    case '1/16': return 0.25 / beatLenQ(ts);
    case '1/8': return 0.5 / beatLenQ(ts);
    case 'beat': return 1;
    case '1/2bar': return bpb / 2;
    case 'bar': return bpb;
    case '2bars': return bpb * 2;
    case '4bars': return bpb * 4;
  }
}

/** First grid line at or after pos. origin is where the grid starts (a bar line). */
export function nextBoundary(pos: number, step: number, origin = 0, eps = 1e-6): number {
  if (step <= 0) return pos;
  return origin + Math.ceil((pos - origin - eps) / step) * step;
}

export interface BarBeat { bar: number; beat: number; frac: number }
/** Zero-based bar and beat for a position, counted from a bar line at originBeat that is bar originBar. */
export function barBeat(pos: number, ts: TimeSig, originBeat = 0, originBar = 0): BarBeat {
  const bpb = beatsPerBar(ts);
  const rel = pos - originBeat;
  const whole = Math.floor(rel + 1e-9);
  const bar = Math.floor(whole / bpb);
  return { bar: originBar + bar, beat: whole - bar * bpb, frac: rel - whole };
}

export type ClickKind = 'accent' | 'beat' | 'sub';
export interface ClickEvent { beat: number; kind: ClickKind }
/** Click ticks in [from, to). origin is a bar line. Integer stepping, so there is no drift. */
export function clickEvents(from: number, to: number, ts: TimeSig, sub: Subdivision, origin = 0): ClickEvent[] {
  const spb = subsPerBeat(ts, sub);
  const bpb = beatsPerBar(ts);
  const out: ClickEvent[] = [];
  let n = Math.ceil((from - origin) * spb - 1e-6);
  for (; ; n++) {
    const beat = origin + n / spb;
    if (beat >= to - 1e-9) break;
    const inBeat = ((n % spb) + spb) % spb;
    if (inBeat !== 0) { out.push({ beat, kind: 'sub' }); continue; }
    const bi = Math.round(n / spb);
    out.push({ beat, kind: ((bi % bpb) + bpb) % bpb === 0 ? 'accent' : 'beat' });
  }
  return out;
}

/** Delay, in steps, of a step under swing. Swing 50 is straight, 66.7 is a triplet feel, 75 is the hardest. */
export function swingOffset(step: number, swing: number): number {
  if (step % 2 === 0) return 0;
  const s = Math.min(75, Math.max(50, swing));
  return (s / 100) * 2 - 1;
}

export const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const midiToName = (n: number) => NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
export const midiToHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
/** Parse a key name such as C, Db, C#, F#m into 0..11, or -1. */
export function keyIndex(name: string): number {
  const m = /^([A-Ga-g])([#b♯♭]?)/.exec(name.trim());
  if (!m) return -1;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase() as 'C']!;
  const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  return (base + acc + 12) % 12;
}
