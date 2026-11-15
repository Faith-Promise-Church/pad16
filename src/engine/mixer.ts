// Buses, meters, the program limiter and the output stage (Stereo, Split, Multi-out).
import { BusId, BUS_IDS, Routing, defaultRouting } from '../store/model';

interface Bus { in: GainNode; fader: GainNode; meter: AnalyserNode }
const CEILING = 0.891; // -1 dBFS

/** Zero-latency limiter curve: clean below the knee, then eases into the ceiling. A look-ahead limiter would add delay to the sub synth. */
function limiterCurve(n = 2049): Float32Array {
  const c = new Float32Array(n), knee = 0.7, span = CEILING - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= knee ? a : knee + span * Math.tanh((a - knee) / span));
  }
  return c;
}

export class Mixer {
  buses = {} as Record<BusId, Bus>;
  mainSum: GainNode; cueSum: GainNode; master: GainNode; cue: GainNode; limiter: WaveShaperNode;
  masterMeter: AnalyserNode; subSolo: GainNode;
  routing: Routing = defaultRouting();
  /** Channels the destination reports and the number actually opened. */
  reported = 2; opened = 2;
  multiError = '';
  private merger: ChannelMergerNode | null = null;
  private stage: AudioNode[] = [];
  private scratch = new Float32Array(1024);

  constructor(public ctx: BaseAudioContext) {
    this.mainSum = ctx.createGain(); this.cueSum = ctx.createGain();
    this.limiter = ctx.createWaveShaper(); this.limiter.curve = limiterCurve() as any;
    this.master = ctx.createGain(); this.cue = ctx.createGain(); this.subSolo = ctx.createGain();
    this.masterMeter = ctx.createAnalyser(); this.masterMeter.fftSize = 1024;
    this.mainSum.connect(this.master).connect(this.limiter);
    this.limiter.connect(this.masterMeter);
    this.cueSum.connect(this.cue);
    for (const id of BUS_IDS) {
      const b: Bus = { in: ctx.createGain(), fader: ctx.createGain(), meter: ctx.createAnalyser() };
      b.meter.fftSize = 1024;
      b.in.connect(b.fader); b.fader.connect(b.meter);
      this.buses[id] = b;
    }
    this.apply(this.routing);
  }
  input(id: BusId): GainNode { return this.buses[id].in; }

  /** Rebuild the output stage for a routing. Safe to call at any time; levels are ramped. */
  apply(r: Routing): void {
    const ctx = this.ctx, t = ctx.currentTime, dest = ctx.destination;
    this.routing = r;
    this.reported = Math.max(2, dest.maxChannelCount || 2);
    let mode = r.mode;
    if (mode === 'multi' && this.reported < 4) mode = 'split';
    let n = 2;
    this.multiError = '';
    if (mode === 'multi') {
      try {
        dest.channelCount = this.reported; dest.channelCountMode = 'explicit'; dest.channelInterpretation = 'discrete';
        n = dest.channelCount;
        if (n < 4) throw new Error(`destination opened ${n} channels`);
      } catch (e) { this.multiError = String((e as Error).message || e); mode = 'split'; n = 2; }
    }
    if (mode !== 'multi') { try { dest.channelCount = 2; dest.channelCountMode = 'explicit'; dest.channelInterpretation = 'speakers'; } catch { /* keep going */ } }
    this.opened = n;

    for (const node of this.stage) { try { node.disconnect(); } catch { /* already gone */ } }
    try { this.limiter.disconnect(); this.cue.disconnect(); this.subSolo.disconnect(); } catch { /* first run */ }
    this.limiter.connect(this.masterMeter);
    this.stage = [];
    const merger = ctx.createChannelMerger(n);
    this.merger = merger; this.stage.push(merger);
    merger.connect(dest);

    const subAlone = mode === 'multi' && r.subOut >= 1 && r.subOut <= n;
    for (const id of BUS_IDS) {
      const b = this.buses[id], s = r.buses[id];
      b.fader.gain.setTargetAtTime(s.mute ? 0 : s.level, t, 0.012);
      try { b.fader.disconnect(); } catch { /* first run */ }
      b.fader.connect(b.meter);
      if (id === 'sub' && subAlone) b.fader.connect(this.subSolo);
      else b.fader.connect(s.dest === 'cue' ? this.cueSum : this.mainSum);
    }
    this.master.gain.setTargetAtTime(r.master, t, 0.012);
    this.cue.gain.setTargetAtTime(r.cueLevel, t, 0.012);

    const mono = (src: AudioNode) => { const g = ctx.createGain(); g.channelCount = 1; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers'; src.connect(g); this.stage.push(g); return g; };
    const split = (src: AudioNode) => { const s = ctx.createChannelSplitter(2); const g = ctx.createGain(); g.channelCount = 2; g.channelCountMode = 'explicit'; src.connect(g); g.connect(s); this.stage.push(g, s); return s; };
    if (mode === 'stereo') {
      const m = split(this.limiter), c = split(this.cue);
      m.connect(merger, 0, 0); m.connect(merger, 1, 1); c.connect(merger, 0, 0); c.connect(merger, 1, 1);
    } else if (mode === 'split') {
      // cue on the left, program on the right, unless swapped
      mono(this.cue).connect(merger, 0, r.swap ? 1 : 0);
      mono(this.limiter).connect(merger, 0, r.swap ? 0 : 1);
    } else {
      const m = split(this.limiter), c = split(this.cue);
      m.connect(merger, 0, 0); m.connect(merger, 1, 1);
      const cp = Math.min(Math.max(1, r.cuePair), n - 1) - 1;
      c.connect(merger, 0, cp); c.connect(merger, 1, cp + 1);
      if (subAlone) mono(this.subSolo).connect(merger, 0, r.subOut - 1);
    }
  }
  get activeMode(): 'stereo' | 'split' | 'multi' {
    const r = this.routing;
    return r.mode === 'multi' && this.opened < 4 ? 'split' : r.mode;
  }
  setBus(id: BusId, level: number, mute: boolean): void {
    this.buses[id].fader.gain.setTargetAtTime(mute ? 0 : level, this.ctx.currentTime, 0.012);
  }
  setMaster(v: number): void { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.012); }
  /** Peak level 0..1 for a bus or the program output. */
  level(id: BusId | 'master'): number {
    const a = id === 'master' ? this.masterMeter : this.buses[id].meter;
    a.getFloatTimeDomainData(this.scratch as any);
    let p = 0; for (let i = 0; i < this.scratch.length; i++) { const v = Math.abs(this.scratch[i]); if (v > p) p = v; }
    return p;
  }
  /** One second of tone on a single physical output, counted from 1. */
  testTone(output: number): void {
    if (!this.merger || output < 1 || output > this.opened) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 440; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.02);
    g.gain.setValueAtTime(0.25, t + 0.9); g.gain.linearRampToValueAtTime(0, t + 1);
    o.connect(g); g.connect(this.merger, 0, output - 1); o.start(t); o.stop(t + 1.05);
    o.onended = () => { try { g.disconnect(); } catch { /* fine */ } };
  }
}
