// Offline time-stretch for loops, pitch preserved, using Signalsmith Stretch (MIT).
// The render runs in a Worker (stretch.worker.ts), never on the page thread and never inside an audio context.
// Any failure, including a silent or broken result, rejects; the caller keeps playing in Repitch mode.
export const stretchAmount = (sourceBpm: number, bpm: number) => (sourceBpm > 0 ? Math.abs(bpm / sourceBpm - 1) : 0);
export const STRETCH_WARN = 0.12;

const cache = new Map<string, Promise<AudioBuffer>>();
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('stretch timed out')), ms))]);

/** Render a loop at a new tempo. The result is exactly lengthBeats long at targetBpm, so it sits on the grid with no drift. */
export function stretchLoop(buffer: AudioBuffer, sourceBpm: number, targetBpm: number, lengthBeats: number, cacheKey = ''): Promise<AudioBuffer> {
  const key = cacheKey ? `${cacheKey}|${sourceBpm}|${targetBpm.toFixed(1)}|${lengthBeats}` : '';
  if (key && cache.has(key)) return cache.get(key)!;
  const p = render(buffer, sourceBpm, targetBpm, lengthBeats);
  if (key) {
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
  }
  return p;
}

let worker: Worker | null = null, seq = 0;
const jobs = new Map<number, { res: (o: Float32Array[]) => void; rej: (e: Error) => void }>();
function failAll(why: string) { for (const j of jobs.values()) j.rej(new Error(why)); jobs.clear(); try { worker?.terminate(); } catch { /* gone */ } worker = null; }
function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./stretch.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = e => {
    const j = jobs.get(e.data.id); if (!j) return;
    jobs.delete(e.data.id);
    if (e.data.error) j.rej(new Error(e.data.error)); else j.res(e.data.out);
  };
  w.onerror = () => failAll('stretch worker failed');
  return (worker = w);
}
/** Load the stretch worker now, while there is a network, so the service worker has it on stage. */
export function warmStretch(): void { try { getWorker(); } catch { /* stretching falls back to Repitch */ } }
const rms = (d: Float32Array) => { let e = 0, n = 0; for (let i = 0; i < d.length; i += 5) { const v = d[i]; if (!Number.isFinite(v)) return NaN; e += v * v; n++; } return Math.sqrt(e / Math.max(1, n)); };

async function render(buffer: AudioBuffer, sourceBpm: number, targetBpm: number, lengthBeats: number): Promise<AudioBuffer> {
  const sr = buffer.sampleRate, nc = buffer.numberOfChannels, rate = targetBpm / sourceBpm;
  const inLen = Math.min(buffer.length, Math.round(((lengthBeats * 60) / sourceBpm) * sr));
  const outLen = Math.round(((lengthBeats * 60) / targetBpm) * sr);
  const chans = Array.from({ length: nc }, (_, c) => buffer.getChannelData(c).slice(0, inLen));
  const before = chans.map(rms);
  const id = ++seq;
  const done = new Promise<Float32Array[]>((res, rej) => jobs.set(id, { res, rej }));
  getWorker().postMessage({ id, chans, sr, rate, inLen, outLen }, chans.map(c => c.buffer));
  let data: Float32Array[];
  try { data = await withTimeout(done, 20000); }
  catch (e) { if (jobs.has(id)) failAll('stretch timed out'); throw e; }      // a stuck worker is replaced, not waited on
  // never hand back a broken render: it would replace a loop that is playing
  for (let c = 0; c < nc; c++) {
    const after = data[c] && data[c].length === outLen ? rms(data[c]) : NaN;
    if (!Number.isFinite(after) || (before[c] > 1e-4 && (after < before[c] * 0.4 || after > before[c] * 2.5))) throw new Error('stretch render was not usable');
  }
  const out = new AudioBuffer({ numberOfChannels: nc, length: outLen, sampleRate: sr });
  for (let c = 0; c < nc; c++) out.getChannelData(c).set(data[c]);
  return out;
}
