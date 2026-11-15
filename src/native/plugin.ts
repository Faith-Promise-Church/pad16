// JavaScript side of the Pad16Native Capacitor plugin: CoreMIDI, the audio session, and the native cue click.
// In a browser none of this loads; isNative() is false and the web paths are used.
import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { ClockSegment, MidiBackend, MidiPort } from '../midi/types';
import type { Engine } from '../engine/engine';
import { ClickBackend, } from '../engine/click';
import { ClickSettings, defaultClick } from '../store/model';
import { ClickKind, beatsPerBar, subsPerBeat } from '../engine/time';
import { encodeWav } from '../engine/dsp';

export interface RouteInfo { name: string; type: string; channels: number; sampleRate: number; ioBufferMs: number; outputLatencyMs: number; bluetooth: boolean }
interface NativeClickSegment { startMs: number; firstBeatMs: number; beatMs: number; bpb: number; spb: number; firstBeatIndex: number }
export interface Pad16NativePlugin {
  now(): Promise<{ ms: number }>;
  audioInfo(): Promise<RouteInfo>;
  showRoutePicker(): Promise<void>;
  keepAwake(o: { on: boolean }): Promise<void>;
  midiPorts(): Promise<{ inputs: MidiPort[]; outputs: MidiPort[] }>;
  midiSend(o: { ports: string[]; data: number[]; atMs?: number }): Promise<void>;
  midiSetClock(o: { segments: ClockSegment[]; ports: string[]; offsets: Record<string, number> }): Promise<void>;
  midiBluetoothPicker(): Promise<void>;
  midiReconnect(o: { name: string }): Promise<void>;
  clickConfigure(o: { enabled: boolean; firstOutput: number; on: boolean; accent: number; beat: number; sub: number; offsetMs: number; master: number }): Promise<{ ok: boolean; channels: number; error?: string }>;
  clickSetSample(o: { slot: ClickKind; wavBase64: string }): Promise<void>;
  clickSync(o: { segments: NativeClickSegment[] }): Promise<void>;
  clickSilence(): Promise<void>;
  testTone(o: { output: number }): Promise<{ ok: boolean; error?: string }>;
  addListener(name: 'midi', cb: (e: { port: string; data: number[]; ms: number }) => void): Promise<PluginListenerHandle>;
  addListener(name: 'midiPorts' | 'interruption', cb: (e: any) => void): Promise<PluginListenerHandle>;
  addListener(name: 'route', cb: (e: RouteInfo) => void): Promise<PluginListenerHandle>;
}

export const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
export const Native: Pad16NativePlugin | null = isNative() ? registerPlugin<Pad16NativePlugin>('Pad16Native') : null;

/** Offset from performance.now() to the native clock, both in ms. Measured with a few round trips, keeping the tightest. */
let clockOffset = 0;
export async function syncNativeClock(): Promise<void> {
  if (!Native) return;
  let best = Infinity;
  for (let i = 0; i < 6; i++) {
    const a = performance.now(), r = await Native.now(), b = performance.now();
    if (b - a < best) { best = b - a; clockOffset = r.ms - (a + b) / 2; }
  }
}
export const toNativeMs = (perfMs: number) => perfMs + clockOffset;

export class NativeMidi implements MidiBackend {
  readonly kind = 'native' as const;
  readonly nativeClock = true;
  timestamps: 'yes' | 'no' | 'unknown' = 'yes';
  onMessage: MidiBackend['onMessage'] = () => {};
  onPorts = () => {};
  private ins: MidiPort[] = []; private outs: MidiPort[] = [];
  async init(): Promise<boolean> {
    if (!Native) return false;
    try {
      await syncNativeClock();
      await Native.addListener('midi', e => this.onMessage(e.port, e.data, e.ms - clockOffset));
      await Native.addListener('midiPorts', () => this.refresh());
      await this.refresh();
      return true;
    } catch { return false; }
  }
  private async refresh() {
    try { const p = await Native!.midiPorts(); this.ins = p.inputs; this.outs = p.outputs; } catch { /* keep the last list */ }
    this.onPorts();
  }
  inputs() { return this.ins; }
  outputs() { return this.outs; }
  send(ports: string[], data: number[], atMs?: number) { Native?.midiSend({ ports, data, atMs: atMs === undefined ? undefined : toNativeMs(atMs) }).catch(() => {}); }
  setClock(segments: ClockSegment[], ports: string[], offsets: Record<string, number>) {
    const segs = segments.map(s => ({ startMs: toNativeMs(s.startMs), firstPulseMs: toNativeMs(s.firstPulseMs), periodMs: s.periodMs }));
    Native?.midiSetClock({ segments: segs, ports, offsets }).catch(() => {});
  }
  async openBluetoothPicker() { await Native?.midiBluetoothPicker(); await this.refresh(); }
  /** Ask the shell to find and reconnect a remembered Bluetooth MIDI device by name. */
  reconnect(name: string) { Native?.midiReconnect({ name }).catch(() => {}); }
}

/** Click played by the native shell on its own output pair, for interfaces where the web view only opens two channels. */
export class NativeClick implements ClickBackend {
  readonly kind = 'native' as const;
  settings: ClickSettings = defaultClick();
  firstOutput = 2; offsetMs = 0; level = 0.8;
  ok = false; error = ''; channels = 0;
  constructor(private eng: Engine, private toMs: (t: number) => number) {
    eng.clock.onChange.push(() => this.sync());
    eng.transport.onState.push(() => this.sync());
  }
  async enable(firstOutput: number, offsetMs: number, level: number): Promise<boolean> {
    this.firstOutput = firstOutput; this.offsetMs = offsetMs; this.level = level;
    await this.configure(true);
    if (this.ok) for (const k of ['accent', 'beat', 'sub'] as ClickKind[]) this.setSample(k, null);
    return this.ok;
  }
  async disable() { await Native?.clickConfigure({ enabled: false, firstOutput: 0, on: false, accent: 0, beat: 0, sub: 0, offsetMs: 0, master: 0 }).catch(() => {}); this.ok = false; }
  private async configure(enabled: boolean) {
    const s = this.settings;
    try {
      const r = await Native!.clickConfigure({ enabled, firstOutput: this.firstOutput, on: s.on, accent: s.accent, beat: s.beat, sub: s.subLevel, offsetMs: this.offsetMs, master: this.level });
      this.ok = r.ok; this.channels = r.channels; this.error = r.error || '';
    } catch (e) { this.ok = false; this.error = String(e); }
  }
  setSettings(s: ClickSettings) { this.settings = s; if (this.ok) { this.configure(true); this.sync(); } }
  setSample(slot: ClickKind, buffer: AudioBuffer | null) {
    const b = buffer || this.eng.synthBuffer('click-' + slot);
    if (!b || !Native) return;
    const wav = encodeWav(Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), b.sampleRate);
    let bin = ''; for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode(...wav.subarray(i, i + 0x8000));
    Native.clickSetSample({ slot, wavBase64: btoa(bin) }).catch(() => {});
  }
  schedule() { /* the native side makes its own ticks from the tempo map */ }
  sync() {
    if (!this.ok || !Native) return;
    const e = this.eng;
    if (!e.transport.running) { Native.clickSync({ segments: [] }).catch(() => {}); return; }
    const segments = e.clock.segments.map(s => ({
      startMs: toNativeMs(this.toMs(s.time)), firstBeatMs: toNativeMs(this.toMs(s.time)), beatMs: 60000 / s.bpm,
      bpb: beatsPerBar(s.ts), spb: subsPerBeat(s.ts, this.settings.sub), firstBeatIndex: Math.round(s.beat),
    }));
    Native.clickSync({ segments }).catch(() => {});
  }
  silence() { Native?.clickSilence().catch(() => {}); }
}
