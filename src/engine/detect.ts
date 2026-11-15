// Loop tempo detection. Order: file-name tags, then bar-length math, then onsets as a cross-check.
import { TimeSig, beatsPerBar } from './time';
import { Tags } from './tags';

export interface TempoGuess { bpm: number; bars: number; lengthBeats: number; confidence: number; method: 'tag' | 'bars' | 'onset' | 'manual'; onsetBpm?: number }

/** Onset times in seconds from a mono signal, using positive energy flux. */
export function findOnsets(x: Float32Array, sr: number): number[] {
  const hop = Math.max(64, Math.round(sr * 0.005)), win = hop * 2;
  const n = Math.max(0, Math.floor((x.length - win) / hop));
  // two bands: the full signal, and a pre-emphasised copy so quiet bright hits (shakers, hats) still register
  const full = new Float32Array(n), high = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0, h = 0; const o = i * hop;
    for (let k = 0; k < win; k++) { const v = x[o + k], d = v - (o + k > 0 ? x[o + k - 1] : 0); e += v * v; h += d * d; }
    full[i] = Math.log10(1e-7 + e / win); high[i] = Math.log10(1e-8 + h / win);
  }
  const flux = new Float32Array(n);
  let mean = 0;
  for (let i = 1; i < n; i++) { flux[i] = Math.max(0, full[i] - full[i - 1]) + Math.max(0, high[i] - high[i - 1]); mean += flux[i]; }
  mean /= Math.max(1, n);
  let sd = 0; for (let i = 0; i < n; i++) sd += (flux[i] - mean) ** 2;
  sd = Math.sqrt(sd / Math.max(1, n));
  const thr = Math.max(0.25, mean + 0.8 * sd), minGap = Math.round(0.06 / (hop / sr));
  const out: number[] = [];
  let last = -minGap;
  for (let i = 1; i < n - 1; i++) {
    if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && i - last >= minGap) { out.push((i * hop) / sr); last = i; }
  }
  return out;
}

/** Tempo from onset spacing by autocorrelating an onset train, 60 to 180 BPM. Returns 0 when there is nothing to go on. */
export function onsetTempo(onsets: number[], duration: number): number {
  if (onsets.length < 4) return 0;
  const res = 0.005, n = Math.ceil(duration / res) + 1;
  const train = new Float32Array(n);
  for (const t of onsets) { const i = Math.round(t / res); for (let k = -2; k <= 2; k++) if (i + k >= 0 && i + k < n) train[i + k] += 1 - Math.abs(k) / 3; }
  let best = 0, bestBpm = 0;
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = 60 / bpm / res;
    let s = 0;
    for (const mult of [1, 2, 4]) {
      const L = Math.round(lag * mult); if (L >= n) break;
      let a = 0; for (let i = 0; i + L < n; i++) a += train[i] * train[i + L];
      s += a / (n - L) / mult;
    }
    if (s > best) { best = s; bestBpm = bpm; }
  }
  return bestBpm;
}

const related = (a: number, b: number) => [1, 2, 0.5, 1.5, 2 / 3, 3, 1 / 3, 4, 0.25].some(r => Math.abs(a * r - b) / b < 0.03);

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const c of channels) for (let i = 0; i < out.length; i++) out[i] += c[i] / channels.length;
  return out;
}

/** Best guess of a loop's tempo and length. */
export function detectTempo(channels: Float32Array[], sr: number, ts: TimeSig, tags: Partial<Tags> = {}): TempoGuess {
  const dur = channels[0].length / sr, bpb = beatsPerBar(ts);
  const mk = (bpm: number, bars: number, confidence: number, method: TempoGuess['method'], onsetBpm?: number): TempoGuess =>
    ({ bpm: Math.round(bpm * 100) / 100, bars, lengthBeats: bars * bpb, confidence, method, onsetBpm });
  if (tags.bpm && tags.bars) return mk(tags.bpm, tags.bars, 1, 'tag');
  if (tags.bpm) {
    const bars = Math.max(1, Math.round((dur * tags.bpm) / 60 / bpb));
    return mk(tags.bpm, bars, 1, 'tag');
  }
  if (tags.bars) return mk((tags.bars * bpb * 60) / dur, tags.bars, 0.95, 'tag');

  const onsets = findOnsets(mixToMono(channels), sr);
  const ob = onsetTempo(onsets, dur);
  const cands = [1, 2, 4, 8, 16].map(bars => ({ bars, bpm: (bars * bpb * 60) / dur }));
  const inRange = cands.filter(c => c.bpm >= 69.5 && c.bpm <= 140.5);
  let pick = inRange[0];
  if (inRange.length > 1) {
    // 70 against 140: take the reading that puts about two onsets on each beat
    const score = (c: { bpm: number }) => Math.abs(Math.log2(Math.max(0.01, onsets.length / ((dur * c.bpm) / 60)) / 2));
    pick = inRange.slice().sort((a, b) => score(a) - score(b))[0];
  }
  if (!pick) pick = cands.slice().sort((a, b) => Math.abs(Math.log2(a.bpm / 100)) - Math.abs(Math.log2(b.bpm / 100)))[0];
  if (dur < 0.4 || !isFinite(pick.bpm)) return mk(ob || 120, 1, 0.1, 'onset', ob);
  let conf = inRange.length ? 0.6 : 0.3;
  if (ob && related(ob, pick.bpm)) conf += 0.3;
  else if (!ob) conf -= 0.1;
  return mk(pick.bpm, pick.bars, Math.max(0.1, Math.min(0.95, conf)), 'bars', ob || undefined);
}

export const confidenceLabel = (c: number) => (c >= 0.85 ? 'High' : c >= 0.55 ? 'Medium' : 'Low');
