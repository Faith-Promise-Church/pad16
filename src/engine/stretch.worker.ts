// Time-stretch a loop off the page thread and without an audio context.
// Safari returns silence when this library runs as a worklet inside an OfflineAudioContext, so the same processor is
// driven directly here: 128 frames at a time, exactly as the audio thread would, in every browser.
import { port, processorClass, setClock } from './worklet-shim';
// @ts-ignore: the package ships no types
import 'signalsmith-stretch';

interface Job { id: number; chans: Float32Array[]; sr: number; rate: number; inLen: number; outLen: number }
const BLOCK = 128;

async function render(j: Job): Promise<Float32Array[]> {
  const Proc = processorClass();
  if (!Proc) throw new Error('stretch processor did not load');
  const nc = j.chans.length;
  setClock(j.sr, 0);
  const ready = new Promise<void>(res => { port.onPost = d => { if (d[0] === 'ready') res(); }; });
  const proc = new Proc({ numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [nc] });
  await ready;
  port.onPost = () => {};
  const call = (method: string, ...args: any[]) => proc.port.onmessage({ data: [0, method, ...args] });
  call('addBuffers', j.chans);
  call('schedule', { output: 0, active: true, input: 0, rate: j.rate, loopStart: 0, loopEnd: j.inLen / j.sr });
  // Render the loop twice around and keep the second pass: its start and end have real audio on both sides, so the seam is clean.
  const out = j.chans.map(() => new Float32Array(j.outLen)), block = j.chans.map(() => new Float32Array(BLOCK));
  const total = j.outLen * 2;
  for (let n = 0; n < total; n += BLOCK) {
    setClock(j.sr, n / j.sr);
    proc.process([], [block], {});
    const from = Math.max(n, j.outLen), to = Math.min(n + BLOCK, total);
    if (to > from) for (let c = 0; c < nc; c++) out[c].set(block[c].subarray(from - n, to - n), from - j.outLen);
  }
  return out;
}

// one job at a time: the processor reads its clock from globals
let chain: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<Job>) => {
  const j = e.data;
  chain = chain.then(async () => {
    try { const out = await render(j); (self as any).postMessage({ id: j.id, out }, out.map(o => o.buffer)); }
    catch (err) { (self as any).postMessage({ id: j.id, error: String(err) }); }
  });
};
