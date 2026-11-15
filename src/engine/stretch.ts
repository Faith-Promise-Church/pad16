// Offline time-stretch for loops, pitch preserved, using Signalsmith Stretch (MIT) inside an OfflineAudioContext.
// The render happens on the audio rendering thread, not the page thread, and never during playback.
// Any failure rejects; the caller keeps playing in Repitch mode.
// @ts-ignore: the package ships no types
import SignalsmithStretch from 'signalsmith-stretch';

export const stretchAmount = (sourceBpm: number, bpm: number) => (sourceBpm > 0 ? Math.abs(bpm / sourceBpm - 1) : 0);
export const STRETCH_WARN = 0.12;

const cache = new Map<string, Promise<AudioBuffer>>();
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('stretch timed out')), ms))]);

/** Render a loop at a new tempo. The result is exactly lengthBeats long at targetBpm, so it sits on the grid with no drift. */
export function stretchLoop(buffer: AudioBuffer, sourceBpm: number, targetBpm: number, lengthBeats: number, cacheKey = ''): Promise<AudioBuffer> {
  const key = cacheKey ? `${cacheKey}|${sourceBpm}|${targetBpm.toFixed(1)}|${lengthBeats}` : '';
  if (key && cache.has(key)) return cache.get(key)!;
  const p = withTimeout(render(buffer, sourceBpm, targetBpm, lengthBeats), 20000);
  if (key) {
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
  }
  return p;
}

async function render(buffer: AudioBuffer, sourceBpm: number, targetBpm: number, lengthBeats: number): Promise<AudioBuffer> {
  const sr = buffer.sampleRate, nc = buffer.numberOfChannels, rate = targetBpm / sourceBpm;
  const inLen = Math.min(buffer.length, Math.round(((lengthBeats * 60) / sourceBpm) * sr));
  const outLen = Math.round(((lengthBeats * 60) / targetBpm) * sr);
  const OAC: typeof OfflineAudioContext = (globalThis as any).OfflineAudioContext || (globalThis as any).webkitOfflineAudioContext;
  // Render the loop twice around and keep the second pass: its start and end have real context on both sides, so the seam is clean.
  const oc = new OAC(nc, outLen * 2, sr);
  const node: any = await SignalsmithStretch(oc, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [nc] });
  const chans = Array.from({ length: nc }, (_, c) => buffer.getChannelData(c).slice(0, inLen));
  await node.addBuffers(chans);
  node.schedule({ output: 0, active: true, input: 0, rate, loopStart: 0, loopEnd: inLen / sr });
  node.connect(oc.destination);
  const full = await oc.startRendering();
  const out = new AudioBuffer({ numberOfChannels: nc, length: outLen, sampleRate: sr });
  for (let c = 0; c < nc; c++) out.getChannelData(c).set(full.getChannelData(c).subarray(outLen, outLen * 2));
  return out;
}
