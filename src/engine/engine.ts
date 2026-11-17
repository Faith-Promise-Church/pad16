// The audio engine. Takes any BaseAudioContext, so the same code runs live and inside OfflineAudioContext for tests.
import { Clock } from './clock';
import { Mixer } from './mixer';
import { Scheduler } from './scheduler';
import { Transport } from './transport';
import { ClickBackend, WebClick } from './click';
import { PadPlayer } from './pads';
import { SubSynth } from './subsynth';
import { TonicPad } from './tonicpad';
import { SOUND_BY_ID } from './synthkit';
import { TimeSig } from './time';

export interface EngineOpts { offline?: boolean; bpm?: number; ts?: TimeSig }

export class Engine {
  clock: Clock; mixer: Mixer; scheduler: Scheduler; transport: Transport; click: ClickBackend;
  pads: PadPlayer; sub: SubSynth; tonic: TonicPad;
  offline: boolean;
  /** In offline renders the caller moves time by hand. */
  virtualNow = 0;
  padLaunchCountIn = false;
  private synth = new Map<string, AudioBuffer | null>();

  constructor(public ctx: BaseAudioContext, opts: EngineOpts = {}) {
    this.offline = !!opts.offline;
    this.clock = new Clock(opts.bpm ?? 96, opts.ts ?? { num: 4, den: 4 }, this.now());
    this.mixer = new Mixer(ctx);
    this.scheduler = new Scheduler(this);
    this.transport = new Transport(this);
    this.pads = new PadPlayer(this);
    this.click = new WebClick(this);
    this.sub = new SubSynth(this);
    this.tonic = new TonicPad(this);
    this.scheduler.sources.push(this.pads, { schedule: (a, b) => this.click.schedule(a, b) });
  }
  now(): number { return this.offline ? this.virtualNow : this.ctx.currentTime; }

  setClick(backend: ClickBackend): void {
    const old = this.click;
    backend.setSettings(old.settings);
    old.silence();
    this.click = backend;
  }
  toBuffer(channels: Float32Array[], sampleRate = this.ctx.sampleRate): AudioBuffer {
    const b = this.ctx.createBuffer(channels.length, channels[0].length, sampleRate);
    channels.forEach((c, i) => b.getChannelData(i).set(c));
    return b;
  }
  /** A synthesized stand-in by id, rendered once at the context rate. Never throws. */
  synthBuffer(id: string): AudioBuffer | null {
    if (this.synth.has(id)) return this.synth.get(id)!;
    let b: AudioBuffer | null = null;
    try { const s = SOUND_BY_ID[id]; if (s) b = this.toBuffer([s.make(this.ctx.sampleRate)]); } catch { b = null; }
    this.synth.set(id, b);
    return b;
  }
  /** All notes off, everything stopped with a 50 ms fade. */
  panic(): void {
    this.transport.stop();
    this.pads.stopAll(0.05);
    this.click.silence();
    this.sub.allOff();
    this.tonic.cut();
  }
}
