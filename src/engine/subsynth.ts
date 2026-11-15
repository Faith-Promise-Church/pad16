// Left-hand sub bass synth. Monophonic, lowest note wins. Oscillators run all the time and the amp envelope
// gates them, so a note sounds on the next audio block with no start-up cost.
import type { Engine } from './engine';
import { SubSettings, SubTarget, defaultSub } from '../store/model';
import { SubNotes, SubAction } from './subnote';
import { midiToHz } from './time';

const RAMP = 0.012;

export class SubSynth {
  notes = new SubNotes();
  settings: SubSettings = defaultSub();
  private osc: OscillatorNode; private sub: OscillatorNode; private oscG: GainNode; private subG: GainNode;
  private pre: GainNode; private shaper: WaveShaperNode; private post: GainNode;
  private f1: BiquadFilterNode; private f2: BiquadFilterNode; private amp: GainNode; private hp: BiquadFilterNode; private level: GainNode;
  private mod: Partial<Record<SubTarget, number>> = {};
  private lostTimer: any = null;
  onNote: (note: number | null) => void = () => {};

  constructor(private eng: Engine) {
    const c = eng.ctx;
    this.osc = c.createOscillator(); this.sub = c.createOscillator(); this.sub.type = 'sine';
    this.oscG = c.createGain(); this.subG = c.createGain(); this.pre = c.createGain(); this.post = c.createGain();
    this.shaper = c.createWaveShaper();
    const curve = new Float32Array(1025);
    for (let i = 0; i < curve.length; i++) { const x = (i / 1024) * 2 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    this.shaper.curve = curve as any;
    this.f1 = c.createBiquadFilter(); this.f2 = c.createBiquadFilter(); this.f1.type = this.f2.type = 'lowpass';
    this.amp = c.createGain(); this.amp.gain.value = 0;
    this.hp = c.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 30; this.hp.Q.value = 0.707;
    this.level = c.createGain(); this.level.gain.value = 0;
    this.osc.connect(this.oscG); this.sub.connect(this.subG);
    this.oscG.connect(this.pre); this.subG.connect(this.pre);
    this.pre.connect(this.shaper); this.shaper.connect(this.post); this.post.connect(this.f1); this.f1.connect(this.f2);
    this.f2.connect(this.amp); this.amp.connect(this.hp); this.hp.connect(this.level); this.level.connect(eng.mixer.input('sub'));
    this.osc.frequency.value = 55; this.sub.frequency.value = 27.5;
    this.osc.start(); this.sub.start();
    this.setSettings(this.settings);
  }

  setSettings(s: SubSettings): void {
    const wasOn = this.settings.on;
    this.settings = s;
    this.notes.pedalEnabled = s.pedal;
    this.act(this.notes.setRange(s.lo, s.hi));
    if (wasOn && !s.on) this.act(this.notes.allOff());
    this.applyParams();
  }
  private cutoff(): number { const p = this.settings.params; return Math.min(12000, p.cutoff * Math.pow(2, (this.mod.cutoff ?? 0) * 4)); }
  private applyParams(): void {
    const p = this.settings.params, t = this.eng.now();
    if (this.osc.type !== p.wave) this.osc.type = p.wave;
    const drive = Math.min(1, p.drive + (this.mod.drive ?? 0));
    this.oscG.gain.setTargetAtTime(0.8, t, RAMP);
    this.subG.gain.setTargetAtTime(Math.min(1, this.mod.subOsc ?? p.subOsc), t, RAMP);
    this.pre.gain.setTargetAtTime(0.5 + drive * 3, t, RAMP);
    this.post.gain.setTargetAtTime(1 / (0.75 + drive * 0.9), t, RAMP);
    const fc = this.cutoff();
    this.f1.frequency.setTargetAtTime(fc, t, RAMP); this.f1.Q.setTargetAtTime(p.resonance, t, RAMP);
    this.f2.frequency.setTargetAtTime(p.poles === 24 ? fc : 20000, t, RAMP); this.f2.Q.setTargetAtTime(p.poles === 24 ? 0.6 : 0.707, t, RAMP);
    this.level.gain.setTargetAtTime(this.settings.on ? this.settings.level * (this.mod.level ?? 1) : 0, t, RAMP);
    if (this.notes.sounding !== null) this.tune(this.notes.sounding, RAMP);
  }
  private tune(note: number, glide: number): void {
    const hz = midiToHz(note + 12 * this.settings.params.octave), t = this.eng.now();
    for (const [o, f] of [[this.osc, hz], [this.sub, hz / 2]] as Array<[OscillatorNode, number]>) {
      o.frequency.cancelScheduledValues(t);
      if (glide > 0.001) o.frequency.setTargetAtTime(f, t, glide / 3); else o.frequency.setValueAtTime(f, t);
    }
  }
  private hold(param: AudioParam, t: number): void {
    const any = param as any;
    if (typeof any.cancelAndHoldAtTime === 'function') any.cancelAndHoldAtTime(t);
    else { const v = param.value; param.cancelScheduledValues(t); param.setValueAtTime(v, t); }
  }
  private act(a: SubAction): void {
    if (!a) return;
    const p = this.settings.params, t = this.eng.now();
    if (a.type === 'release') {
      this.hold(this.amp.gain, t); this.amp.gain.setTargetAtTime(0, t, Math.max(0.005, p.release) / 3);
      this.onNote(null); return;
    }
    if (a.type === 'legato') { this.tune(a.note, p.glide); this.onNote(a.note); return; }
    this.tune(a.note, 0);
    this.hold(this.amp.gain, t);
    // setTarget curves start from wherever the envelope is, so a retrigger never jumps
    const atk = Math.max(0.002, p.attack);
    this.amp.gain.setTargetAtTime(1, t, atk / 4);
    this.amp.gain.setTargetAtTime(p.sustain, t + atk, Math.max(0.01, p.decay) / 3);
    if (p.envAmount > 0.001) {
      const base = this.cutoff(), top = Math.min(14000, base * Math.pow(2, p.envAmount * 4));
      for (const f of p.poles === 24 ? [this.f1, this.f2] : [this.f1]) {
        f.frequency.cancelScheduledValues(t); f.frequency.setValueAtTime(top, t);
        f.frequency.setTargetAtTime(base, t + Math.max(0.001, p.attack), Math.max(0.01, p.decay) / 3);
      }
    }
    this.onNote(a.note);
  }

  noteOn(n: number): void { if (!this.settings.on) return; this.clearLost(); this.act(this.notes.noteOn(n)); }
  noteOff(n: number): void { this.act(this.notes.noteOff(n)); }
  pedal(down: boolean): void { if (this.settings.pedal) this.act(this.notes.pedal(down)); }
  /** A controller mapped to a synth target, value 0..1. */
  control(target: SubTarget, v: number): void { if (target === 'off') return; this.mod[target] = v; this.applyParams(); }
  bend(v: number): void {
    if (this.settings.bend !== 'pitch') return;
    const t = this.eng.now();
    this.osc.detune.setTargetAtTime(v * 200, t, 0.005); this.sub.detune.setTargetAtTime(v * 200, t, 0.005);
  }
  allOff(): void { this.clearLost(); this.act(this.notes.allOff()); }
  /** The MIDI link dropped: let the note ring briefly, then release it so it never drones. */
  linkLost(holdMs = 1500): void {
    if (this.notes.sounding === null) return;
    this.clearLost();
    this.lostTimer = setTimeout(() => this.allOff(), holdMs);
  }
  private clearLost() { if (this.lostTimer) { clearTimeout(this.lostTimer); this.lostTimer = null; } }
  get currentNote(): number | null { return this.notes.sounding; }
}
