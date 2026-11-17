// Routes incoming MIDI to the sub synth, pads and mapped actions. Tracks devices, hot-plug and the Bluetooth reconnect.
import { MidiBackend, MidiPort } from './types';
import { MidiAction, MidiBinding, MidiSettings, SubTarget } from '../store/model';

export interface MidiTargets {
  subInRange(note: number): boolean;
  noteOn(note: number, vel: number): void;
  noteOff(note: number): void;
  pedal(down: boolean): void;
  control(target: SubTarget, v: number): void;
  bend(v: number): void;
  padTrigger(i: number, vel: number): void;
  padRelease(i: number): void;
  action(a: MidiAction): void;
  programChange(n: number): void;
  linkLost(): void;
  cc1(): SubTarget; cc11(): SubTarget;
}
export type LinkState = 'connected' | 'searching' | 'off';

export class MidiManager {
  monitor: string[] = [];
  onChange: () => void = () => {};
  private learn: ((b: MidiBinding) => void) | null = null;
  private known = new Set<string>();
  ready = false;

  constructor(public backend: MidiBackend, private settings: () => MidiSettings, private targets: MidiTargets) {
    backend.onMessage = (port, data) => this.handle(port, data);
    backend.onPorts = () => this.portsChanged();
  }
  async init(): Promise<boolean> {
    this.ready = await this.backend.init();
    this.known = new Set(this.activeInputs().map(p => p.id));
    this.onChange();
    return this.ready;
  }
  enabled(id: string): boolean { return !this.settings().disabled[id]; }
  activeInputs(): MidiPort[] { return this.backend.inputs().filter(p => this.enabled(p.id)); }
  activeOutputs(): MidiPort[] { return this.backend.outputs().filter(p => this.enabled(p.id)); }

  get link(): LinkState {
    if (!this.ready) return 'off';
    if (this.activeInputs().length || this.activeOutputs().length) return 'connected';
    return this.settings().lastBle ? 'searching' : 'off';
  }
  private portsChanged(): void {
    const now = new Set(this.activeInputs().map(p => p.id));
    // an input we were listening to went away: let the sub note go so it cannot drone
    for (const id of this.known) if (!now.has(id)) { this.targets.linkLost(); break; }
    this.known = now;
    this.onChange();
  }
  /** Capture the next control, note or program change for MIDI Learn. */
  startLearn(cb: (b: MidiBinding) => void): void { this.learn = cb; }
  cancelLearn(): void { this.learn = null; }

  handle(port: string, data: ArrayLike<number>): void {
    const st = data[0];
    if (st === undefined || st >= 0xf0) return;                    // clock and system messages from the Nord are ignored
    if (!this.enabled(port)) return;
    const s = this.settings(), type = st & 0xf0, ch = (st & 0x0f) + 1, d1 = data[1] ?? 0, d2 = data[2] ?? 0;
    this.log(port, type, ch, d1, d2);
    if (this.learn && (type === 0xb0 || (type === 0x90 && d2 > 0) || type === 0xc0)) {
      const cb = this.learn; this.learn = null;
      cb({ kind: type === 0xb0 ? 'cc' : type === 0x90 ? 'note' : 'pc', ch, num: d1 });
      return;
    }
    const hit = (kind: MidiBinding['kind']) => (Object.keys(s.maps) as MidiAction[]).filter(a => { const b = s.maps[a]!; return b.kind === kind && b.num === d1 && (b.ch === 0 || b.ch === ch); });
    if (s.channel && ch !== s.channel) return;
    const t = this.targets;
    if (type === 0x90 && d2 > 0) {
      const mapped = hit('note');
      if (mapped.length) { mapped.forEach(a => t.action(a)); return; }
      if (t.subInRange(d1)) { t.noteOn(d1, d2 / 127); return; }
      if (s.padZone.on && d1 >= s.padZone.low && d1 < s.padZone.low + 16) t.padTrigger(d1 - s.padZone.low, Math.max(0.2, d2 / 127));
    } else if (type === 0x80 || type === 0x90) {
      t.noteOff(d1);
      if (s.padZone.on && d1 >= s.padZone.low && d1 < s.padZone.low + 16) t.padRelease(d1 - s.padZone.low);
    } else if (type === 0xb0) {
      const mapped = hit('cc');
      if (mapped.length) { if (d2 >= 64) mapped.forEach(a => t.action(a)); return; }
      if (d1 === 64) t.pedal(d2 >= 64);
      else if (d1 === 1) t.control(t.cc1(), d2 / 127);
      else if (d1 === 11) t.control(t.cc11(), d2 / 127);
      else if (d1 === 123 || d1 === 120) t.linkLost();
    } else if (type === 0xe0) {
      t.bend(((d2 << 7) | d1) / 8192 - 1);
    } else if (type === 0xc0) {
      const mapped = hit('pc');
      if (mapped.length) mapped.forEach(a => t.action(a));
      else if (s.programChange) t.programChange(d1);
    }
  }
  private log(port: string, type: number, ch: number, d1: number, d2: number): void {
    const name = ({ 0x80: 'Note off', 0x90: d2 ? 'Note on' : 'Note off', 0xb0: 'CC', 0xc0: 'Program', 0xe0: 'Bend', 0xa0: 'Aftertouch', 0xd0: 'Pressure' } as Record<number, string>)[type] || 'Other';
    const dev = this.backend.inputs().find(p => p.id === port)?.name || port;
    this.monitor.unshift(`${name} ${d1}${type === 0xc0 ? '' : ' ' + d2}  ch ${ch}  ${dev}`);
    if (this.monitor.length > 40) this.monitor.pop();
  }
}
