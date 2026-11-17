// Looping tonic pad in any of 12 keys, with equal-power fades and key crossfades.
import type { Engine } from './engine';
import { TonicSettings, defaultTonic } from '../store/model';
import { bakeLoopCrossfade, fadeCurve } from './dsp';

export interface PadSetInfo { name: string; dir: string; keys: Record<string, { file: string; baked?: boolean }> }
interface Voice { src: AudioBufferSourceNode; g: GainNode; key: number }
export type TonicStatus = 'off' | 'loading' | 'on' | 'missing';

export class TonicPad {
  settings: TonicSettings = defaultTonic();
  set: PadSetInfo | null = null;
  key = 0;
  status: TonicStatus = 'off';
  /** True when the sounding key is a pitch-shifted copy of another key's sample. */
  fallback = false;
  /** Fetch and decode one file of a pad set. Set by the app. */
  load: (set: PadSetInfo, file: string) => Promise<AudioBuffer> = async () => { throw new Error('no loader'); };
  onChange: () => void = () => {};
  private cache = new Map<string, AudioBuffer>();
  private voice: Voice | null = null;
  private lp: BiquadFilterNode; private hp: BiquadFilterNode; private level: GainNode;
  private token = 0;

  constructor(private eng: Engine) {
    const c = eng.ctx;
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
    this.hp = c.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 20;
    this.level = c.createGain();
    this.hp.connect(this.lp); this.lp.connect(this.level); this.level.connect(eng.mixer.input('pad'));
  }

  setSettings(s: TonicSettings): void {
    const was = this.settings.on;
    this.settings = s;
    const t = this.eng.now();
    this.level.gain.setTargetAtTime(s.level, t, 0.02);
    this.lp.frequency.setTargetAtTime(Math.min(20000, Math.max(200, s.lp)), t, 0.02);
    this.hp.frequency.setTargetAtTime(Math.min(2000, Math.max(20, s.hp)), t, 0.02);
    // 12 dB per octave below the low cut; flat when it is off
    this.hp.Q.setTargetAtTime(0.707, t, 0.02);
    if (s.on !== was) { if (s.on) this.play(s.fadeIn); else this.fadeOut(s.fadeOut); }
  }
  setSet(set: PadSetInfo | null): void {
    if (this.set?.dir === set?.dir) return;
    this.set = set; this.cache.clear();
    if (this.settings.on) this.play(this.settings.xfade);
  }
  setKey(key: number): void {
    key = ((key % 12) + 12) % 12;
    if (key === this.key && (this.voice || !this.settings.on)) return;
    this.key = key;
    if (this.settings.on) this.play(this.settings.xfade);
    else this.onChange();
  }
  /** Decode a key ahead of time, for the next song. */
  preload(key: number): void { this.buffer(((key % 12) + 12) % 12).catch(() => {}); }

  /** Which file plays for a key, and how far it is pitch-shifted. */
  pick(key: number): { file: string; baked: boolean; shift: number } | null {
    if (!this.set) return null;
    const names = Object.keys(this.set.keys);
    if (!names.length) return null;
    const exact = this.set.keys[String(key)];
    if (exact) return { file: exact.file, baked: !!exact.baked, shift: 0 };
    let best = names[0], bestD = 99;
    for (const k of names) { let d = key - +k; d = ((d + 18) % 12) - 6; if (Math.abs(d) < Math.abs(bestD)) { bestD = d; best = k; } }
    return { file: this.set.keys[best].file, baked: !!this.set.keys[best].baked, shift: bestD };
  }
  private async buffer(key: number): Promise<{ buffer: AudioBuffer; shift: number } | null> {
    const pk = this.pick(key), set = this.set;
    if (!pk || !set) return null;
    const id = set.dir + '/' + pk.file;
    let b = this.cache.get(id);
    if (b) { this.cache.delete(id); this.cache.set(id, b); return { buffer: b, shift: pk.shift }; }
    const raw = await this.load(set, pk.file);
    b = pk.baked ? raw : this.bake(raw);
    this.cache.set(id, b);
    // keep at most three decoded pads: this key, the last one and the next song's
    while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value!);
    return { buffer: b, shift: pk.shift };
  }
  private bake(raw: AudioBuffer): AudioBuffer {
    const x = Math.floor(Math.min(2, raw.duration / 4) * raw.sampleRate);
    const chs = Array.from({ length: raw.numberOfChannels }, (_, c) => bakeLoopCrossfade(raw.getChannelData(c), x));
    const out = this.eng.ctx.createBuffer(chs.length, chs[0].length, raw.sampleRate);
    chs.forEach((c, i) => out.getChannelData(i).set(c));
    return out;
  }

  private async play(fade: number): Promise<void> {
    const my = ++this.token, key = this.key;
    if (!this.voice) { this.status = 'loading'; this.onChange(); }
    let got: { buffer: AudioBuffer; shift: number } | null = null;
    try { got = await this.buffer(key); } catch { got = null; }
    if (my !== this.token || !this.settings.on) return;
    if (!got) { this.status = 'missing'; this.fallback = false; this.fadeOut(1, true); this.onChange(); return; }
    const c = this.eng.ctx, t = this.eng.now() + 0.01, dur = Math.max(0.05, fade);
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = got.buffer; src.loop = true; src.playbackRate.value = Math.pow(2, got.shift / 12);
    g.gain.setValueAtTime(0, t); g.gain.setValueCurveAtTime(fadeCurve('in') as any, t, dur);
    src.connect(g); g.connect(this.hp); src.start(t);
    const old = this.voice;
    this.voice = { src, g, key };
    if (old) this.release(old, dur, t);
    this.fallback = got.shift !== 0; this.status = 'on';
    this.onChange();
  }
  private release(v: Voice, dur: number, t: number): void {
    try {
      const cur = v.g.gain.value;
      v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(cur, t);
      v.g.gain.setValueCurveAtTime(fadeCurve('out').map(x => x * cur) as any, t, dur);
      v.src.stop(t + dur + 0.05);
      v.src.onended = () => { try { v.g.disconnect(); } catch { /* fine */ } };
    } catch { try { v.src.stop(); } catch { /* fine */ } }
  }
  private fadeOut(dur: number, keepStatus = false): void {
    this.token++;
    const v = this.voice; this.voice = null;
    if (v) this.release(v, Math.max(0.05, dur), this.eng.now() + 0.01);
    if (!keepStatus) { this.status = 'off'; this.onChange(); }
  }
  /** Panic: out in 50 ms. The on/off switch is left to the caller. */
  cut(): void { this.fadeOut(0.05); }
  get sounding(): boolean { return !!this.voice; }
}
