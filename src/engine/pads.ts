// The 16 pads: one shots, hold, free loops, tempo-synced loops and patterns, with quantized launch and stop.
import type { Engine } from './engine';
import { PadConfig, defaultPad } from '../store/model';
import { Source } from './scheduler';
import { quantBeats, nextBoundary, beatsPerBar, Quant } from './time';
import { Pattern, renderPattern, patternBeats, TrackSrc } from './patterns';

export type PadState = 'stopped' | 'queued' | 'playing' | 'stopping';
export interface PadView { state: PadState; progress: number; lit: boolean }

interface LiveSrc { src: AudioBufferSourceNode; bufferBpm: number; end: number }
interface Run {
  startBeat: number; stopBeat: number | null; fadeFrom: number | null;
  gain: GainNode; sched: number; len: number; live: Set<LiveSrc>; clockRun: number;
}
interface Voice { src: AudioBufferSourceNode; g: GainNode }
export interface PadRt {
  i: number; cfg: PadConfig; buffer: AudioBuffer | null;
  /** Loop pre-rendered at a tempo, pitch preserved. */
  stretched: { bpm: number; buffer: AudioBuffer } | null;
  voice: Voice | null; run: Run | null; litUntil: number;
}

export class PadPlayer implements Source {
  pads: PadRt[] = Array.from({ length: 16 }, (_, i) => ({ i, cfg: defaultPad(i), buffer: null, stretched: null, voice: null, run: null, litUntil: 0 }));
  globalQuant: Quant = 'bar';
  patterns: (id: string) => Pattern | undefined = () => undefined;
  trackBuffer: (src: TrackSrc) => AudioBuffer | null = () => null;
  /** Called when a stretch render would help: pad index and the tempo to render at. */
  wantStretch: (i: number, bpm: number) => void = () => {};

  constructor(private eng: Engine) {
    eng.clock.onChange.push((seg, newRun) => {
      if (newRun) return;
      // a tempo change was queued: retime what is already sounding and any pending stops
      for (const p of this.pads) {
        const r = p.run; if (!r) continue;
        for (const l of r.live) if (l.end > seg.time) { try { l.src.playbackRate.setValueAtTime(seg.bpm / l.bufferBpm, Math.max(seg.time, eng.now())); } catch { /* ended */ } }
        if (r.stopBeat !== null) this.applyStop(p, r);
      }
    });
  }

  setPad(i: number, cfg: PadConfig, buffer: AudioBuffer | null): void {
    const p = this.pads[i];
    const srcChanged = p.buffer !== buffer;
    p.cfg = cfg;
    if (srcChanged) { this.kill(p, 0.01); p.buffer = buffer; p.stretched = null; }
    if (p.voice) { p.voice.g.gain.setTargetAtTime(cfg.volume, this.eng.now(), 0.01); if (!this.synced(p)) p.voice.src.playbackRate.setTargetAtTime(Math.pow(2, cfg.pitch / 12), this.eng.now(), 0.01); }
    if (p.run && !this.synced(p)) this.kill(p, 0.01);
  }
  synced(p: PadRt): boolean { return p.cfg.mode === 'pattern' || (p.cfg.mode === 'loop' && p.cfg.sync !== 'off' && p.cfg.sourceBpm > 0 && p.cfg.lengthBeats > 0); }
  quantOf(p: PadRt): Quant {
    if (p.cfg.quantize !== 'global') return p.cfg.quantize;
    return this.synced(p) ? this.globalQuant : 'none';
  }
  private bus(p: PadRt) { return this.eng.mixer.input(p.cfg.mode === 'loop' ? 'loops' : 'drums'); }
  private lenOf(p: PadRt): number {
    if (p.cfg.mode === 'pattern') { const pat = this.patterns(p.cfg.patternId); return pat ? patternBeats(pat) : 0; }
    return p.cfg.lengthBeats;
  }
  /** Grid origin for quantize: the bar line where bar 0 of this run began. */
  private gridOrigin(beat: number): number {
    const g = this.eng.clock.segAtBeat(beat);
    return g.beat - g.bar * beatsPerBar(g.ts);
  }

  trigger(i: number, vel = 1): void {
    const p = this.pads[i], e = this.eng, now = e.now();
    if (this.synced(p)) return this.toggleSynced(p);
    if (!p.buffer) { p.litUntil = now + 0.09; return; }
    if (p.cfg.mode === 'loop' && p.voice) { this.stopVoice(p); return; }
    let when = now;
    const q = quantBeats(this.quantOf(p), e.clock.ts);
    if (q > 0 && e.transport.running) {
      const nb = e.clock.beatAt(now);
      when = Math.max(now, e.clock.timeAt(nextBoundary(nb, q, this.gridOrigin(nb))));
    }
    this.stopVoice(p, 0.006, when);
    const src = e.ctx.createBufferSource(), g = e.ctx.createGain();
    src.buffer = p.buffer; src.playbackRate.value = Math.pow(2, p.cfg.pitch / 12); src.loop = p.cfg.mode === 'loop';
    g.gain.value = p.cfg.volume * vel;
    src.connect(g); g.connect(this.bus(p));
    src.start(when);
    const v: Voice = { src, g };
    p.voice = v;
    src.onended = () => { if (p.voice === v) p.voice = null; try { g.disconnect(); } catch { /* fine */ } };
  }
  release(i: number): void { const p = this.pads[i]; if (p.cfg.mode === 'hold' && !this.synced(p)) this.stopVoice(p); }

  private stopVoice(p: PadRt, fade = 0.025, at = this.eng.now()): void {
    const v = p.voice; if (!v) return;
    p.voice = null;
    try {
      v.g.gain.cancelScheduledValues(at); v.g.gain.setValueAtTime(v.g.gain.value, at);
      v.g.gain.linearRampToValueAtTime(0, at + fade); v.src.stop(at + fade + 0.01);
    } catch { /* already stopped */ }
  }

  private toggleSynced(p: PadRt): void {
    const e = this.eng, now = e.now(), r = p.run;
    if (r && r.clockRun === e.clock.run) {
      if (r.stopBeat !== null) {                      // queued to stop: cancel, keep playing
        r.stopBeat = null; r.fadeFrom = null;
        try { r.gain.gain.cancelScheduledValues(now); r.gain.gain.setTargetAtTime(1, now, 0.01); } catch { /* fine */ }
        return;
      }
      if (now < e.clock.timeAt(r.startBeat)) { this.kill(p, 0); return; }   // queued to start: cancel
      this.requestStop(p, r);
      return;
    }
    if (r) this.kill(p, 0);
    const len = this.lenOf(p);
    if (len <= 0 || (p.cfg.mode === 'loop' && !p.buffer)) { p.litUntil = now + 0.09; return; }
    let startBeat: number;
    if (!e.transport.running) {
      e.transport.start(e.padLaunchCountIn ? e.transport.countInBars : 0);
      startBeat = 0;
    } else {
      const nb = e.clock.beatAt(now + 0.004), q = quantBeats(this.quantOf(p), e.clock.segAtBeat(nb).ts);
      startBeat = q > 0 ? nextBoundary(nb, q, this.gridOrigin(nb)) : nb;
    }
    const gain = e.ctx.createGain();
    gain.connect(this.bus(p));
    p.run = { startBeat, stopBeat: null, fadeFrom: null, gain, sched: startBeat, len, live: new Set(), clockRun: e.clock.run };
    if (p.cfg.group) {
      for (const o of this.pads) {
        if (o === p || o.cfg.group !== p.cfg.group || !o.run) continue;
        if (o.run.startBeat >= startBeat - 1e-6) this.kill(o, 0);
        else { o.run.stopBeat = startBeat; o.run.fadeFrom = null; this.applyStop(o, o.run); }
      }
    }
    if (p.cfg.mode === 'loop' && p.cfg.sync === 'stretch') this.wantStretch(p.i, e.transport.targetBpm);
    this.scheduleRun(p, e.clock.beatAt(e.now() + e.scheduler.lookahead));
  }

  private requestStop(p: PadRt, r: Run): void {
    const e = this.eng, nb = e.clock.beatAt(e.now() + 0.004), mode = p.cfg.stopMode;
    r.fadeFrom = null;
    if (mode === 'fade') { r.fadeFrom = nb; r.stopBeat = nb + Math.min(16, Math.max(1, p.cfg.fadeBeats)); }
    else if (mode === 'end') r.stopBeat = nextBoundary(nb + 1e-3, r.len, r.startBeat);
    else if (mode === 'quantized') {
      const q = quantBeats(p.cfg.quantize === 'global' ? this.globalQuant : p.cfg.quantize, e.clock.segAtBeat(nb).ts);
      r.stopBeat = q > 0 ? nextBoundary(nb, q, this.gridOrigin(nb)) : nb;
    } else r.stopBeat = nb;
    this.applyStop(p, r);
  }
  /** Put the gain ramp and source stops for a run's stop point on the audio clock. */
  private applyStop(_p: PadRt, r: Run): void {
    const e = this.eng, now = e.now(), T = Math.max(now + 0.006, e.clock.timeAt(r.stopBeat!));
    const g = r.gain.gain;
    try {
      g.cancelScheduledValues(now);
      if (r.fadeFrom !== null) { g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, T); }
      else { g.setValueAtTime(1, Math.max(now, T - 0.005)); g.linearRampToValueAtTime(0, T); }
    } catch { /* fine */ }
  }
  /** Hard stop of whatever a pad is doing. */
  kill(p: PadRt, fade = 0.02): void {
    this.stopVoice(p, Math.max(0.004, fade));
    const r = p.run; if (!r) return;
    p.run = null;
    const now = this.eng.now(), g = r.gain;
    try { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + Math.max(0.004, fade)); } catch { /* fine */ }
    const at = now + Math.max(0.004, fade) + 0.005;
    for (const l of r.live) { try { l.src.stop(at); } catch { /* fine */ } }
    if (typeof setTimeout !== 'undefined') setTimeout(() => { try { g.disconnect(); } catch { /* fine */ } }, (fade + 0.2) * 1000);
  }
  stopAll(fade = 0.05): void { for (const p of this.pads) this.kill(p, fade); }

  schedule(_from: number, to: number): void {
    const e = this.eng, now = e.now();
    for (const p of this.pads) {
      const r = p.run; if (!r) continue;
      if (r.clockRun !== e.clock.run) { this.kill(p, 0.01); continue; }
      if (r.stopBeat !== null && e.clock.timeAt(r.stopBeat) <= now) { this.kill(p, 0.004); continue; }
      this.scheduleRun(p, to);
    }
  }

  private scheduleRun(p: PadRt, to: number): void {
    const r = p.run!, e = this.eng, now = e.now();
    const from = r.sched, end = r.stopBeat !== null ? Math.min(to, r.stopBeat - 1e-6) : to;
    if (end <= from) { r.sched = Math.max(r.sched, to); return; }
    r.sched = to;
    const k0 = Math.max(0, Math.floor((from - r.startBeat) / r.len + 1e-9)), k1 = Math.floor((end - r.startBeat) / r.len + 1e-9);
    if (p.cfg.mode === 'pattern') {
      const pat = this.patterns(p.cfg.patternId); if (!pat) return;
      const evs = renderPattern(pat);
      for (let k = k0; k <= k1; k++) for (const ev of evs) {
        const b = r.startBeat + k * r.len + ev.beat;
        if (b < from - 1e-9 || b >= end) continue;
        const buffer = this.trackBuffer(pat.tracks[ev.track].src); if (!buffer) continue;
        const t = e.clock.timeAt(b); if (t < now - 0.03) continue;
        const src = e.ctx.createBufferSource(), g = e.ctx.createGain();
        src.buffer = buffer; g.gain.value = ev.vel * p.cfg.volume;
        src.connect(g); g.connect(r.gain); src.start(Math.max(t, now));
        src.onended = () => { try { g.disconnect(); } catch { /* fine */ } };
      }
      return;
    }
    if (!p.buffer) return;
    for (let k = k0; k <= k1; k++) {
      const b = r.startBeat + k * r.len;
      if (b < from - 1e-9 || b >= end) continue;
      const bpm = e.clock.bpmAtBeat(b + 1e-6);
      const useStretch = p.cfg.sync === 'stretch' && p.stretched && Math.abs(p.stretched.bpm - bpm) < 0.05;
      const buffer = useStretch ? p.stretched!.buffer : p.buffer;
      const bufferBpm = useStretch ? p.stretched!.bpm : p.cfg.sourceBpm;
      if (p.cfg.sync === 'stretch' && !useStretch) this.wantStretch(p.i, bpm);
      const rate = bpm / bufferBpm, bufDur = Math.min(buffer.duration, (r.len * 60) / bufferBpm);
      let t = e.clock.timeAt(b), offset = 0;
      if (t < now) { offset = (now - t) * rate; t = now; if (offset >= bufDur) continue; }
      const src = e.ctx.createBufferSource(), g = e.ctx.createGain();
      src.buffer = buffer; src.playbackRate.value = rate; g.gain.value = p.cfg.volume;
      src.connect(g); g.connect(r.gain);
      const endTime = e.clock.timeAt(b + r.len);
      // tempo changes already queued inside this pass
      for (const s of e.clock.segments) if (s.time > t && s.time < endTime) src.playbackRate.setValueAtTime(s.bpm / bufferBpm, s.time);
      src.start(t, offset, bufDur - offset);
      const l: LiveSrc = { src, bufferBpm, end: endTime };
      r.live.add(l);
      src.onended = () => { r.live.delete(l); try { g.disconnect(); } catch { /* fine */ } };
    }
  }

  view(i: number): PadView {
    const p = this.pads[i], e = this.eng, now = e.now(), r = p.run;
    if (r && r.clockRun === e.clock.run) {
      const nb = e.clock.beatAt(now);
      if (nb < r.startBeat) return { state: 'queued', progress: 0, lit: false };
      const progress = (((nb - r.startBeat) % r.len) + r.len) % r.len / r.len;
      return { state: r.stopBeat !== null ? 'stopping' : 'playing', progress, lit: true };
    }
    if (p.voice) return { state: p.cfg.mode === 'loop' ? 'playing' : 'stopped', progress: 0, lit: true };
    return { state: 'stopped', progress: 0, lit: now < p.litUntil };
  }
}
