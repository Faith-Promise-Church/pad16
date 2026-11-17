// Web MIDI backend. Found by feature, never by browser name, so it also runs inside browsers that add Web MIDI on iPad.
import { MidiBackend, MidiPort } from './types';

export const hasWebMidi = () => typeof navigator !== 'undefined' && typeof (navigator as any).requestMIDIAccess === 'function';

export class WebMidi implements MidiBackend {
  readonly kind = 'web' as const;
  readonly nativeClock = false;
  timestamps: 'yes' | 'no' | 'unknown' = 'unknown';
  onMessage: MidiBackend['onMessage'] = () => {};
  onPorts = () => {};
  private access: any = null;

  async init(): Promise<boolean> {
    if (!hasWebMidi()) return false;
    try {
      // A built-in implementation honors timestamps. One added by a host app or script may not, so it starts as unknown.
      const native = /\[native code\]/.test(Function.prototype.toString.call((navigator as any).requestMIDIAccess));
      this.timestamps = native ? 'yes' : 'unknown';
      this.access = await (navigator as any).requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => { this.bind(); this.onPorts(); };
      this.bind();
      return true;
    } catch { return false; }
  }
  private bind() {
    this.access?.inputs.forEach((inp: any) => {
      inp.onmidimessage = (e: any) => { if (e.data) this.onMessage(inp.id, e.data, e.timeStamp || performance.now()); };
    });
  }
  private list(map: any): MidiPort[] {
    const out: MidiPort[] = [];
    map?.forEach((p: any) => {
      if (p.state === 'disconnected') return;
      const name = p.name || p.manufacturer || 'MIDI device';
      out.push({ id: p.id, name, kind: /bluetooth|ble|widi/i.test(name) ? 'ble' : 'usb' });
    });
    return out;
  }
  inputs() { return this.list(this.access?.inputs); }
  outputs() { return this.list(this.access?.outputs); }
  send(portIds: string[], data: number[], atMs?: number): void {
    for (const id of portIds) {
      const o = this.access?.outputs.get(id);
      if (!o) continue;
      try { atMs !== undefined && this.timestamps !== 'no' ? o.send(data, atMs) : o.send(data); } catch { /* port went away */ }
    }
  }
}
