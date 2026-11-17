// Stands in for the audio worklet scope inside a plain Worker, so the Signalsmith Stretch processor can be driven
// block by block with no audio context at all. Import this before the library: the library registers its processor
// with whatever registerProcessor it finds when it loads.
const g = globalThis as any;
let registered: any = null;
/** Messages the processor posts (ready, time updates, method results). */
export const port = { onPost: (_data: any[]) => {} };
g.sampleRate = 48000;
g.currentTime = 0;
g.AudioWorkletProcessor = class {
  port = { onmessage: null as ((e: { data: any[] }) => void) | null, postMessage: (data: any[]) => port.onPost(data) };
};
g.registerProcessor = (_name: string, cls: any) => { registered = cls; };
export const processorClass = () => registered;
export const setClock = (sampleRate: number, time: number) => { g.sampleRate = sampleRate; g.currentTime = time; };
