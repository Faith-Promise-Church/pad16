// One MIDI interface, several backends: CoreMIDI through the native shell, Web MIDI where the browser has it, and a mock for tests.
export interface MidiPort { id: string; name: string; kind: 'usb' | 'ble' | 'other'; }
/** A stretch of steady clock: pulses at firstPulseMs + k * periodMs until the next segment starts. Times in performance.now() ms. */
export interface ClockSegment { startMs: number; firstPulseMs: number; periodMs: number }

export interface MidiBackend {
  readonly kind: 'web' | 'native' | 'mock' | 'none';
  /** True when the backend generates clock itself from the tempo map (native CoreMIDI). */
  readonly nativeClock: boolean;
  /** Whether send timestamps are honored. 'unknown' is treated as no for a backend that is not the browser's own. */
  timestamps: 'yes' | 'no' | 'unknown';
  init(): Promise<boolean>;
  inputs(): MidiPort[];
  outputs(): MidiPort[];
  onMessage: (portId: string, data: ArrayLike<number>, timeMs: number) => void;
  onPorts: () => void;
  /** Send bytes to the given outputs. atMs is a performance.now() time; omit it to send now. */
  send(portIds: string[], data: number[], atMs?: number): void;
  setClock?(segments: ClockSegment[], portIds: string[], offsets: Record<string, number>): void;
  openBluetoothPicker?(): Promise<void>;
  /** Look for a remembered Bluetooth device and reconnect to it, on launch and after a dropout. */
  reconnect?(name: string): void;
}

export class MockMidi implements MidiBackend {
  readonly kind = 'mock' as const;
  readonly nativeClock = false;
  timestamps: 'yes' | 'no' | 'unknown' = 'yes';
  ins: MidiPort[] = [{ id: 'in1', name: 'Mock In', kind: 'usb' }];
  outs: MidiPort[] = [{ id: 'out1', name: 'Mock Out', kind: 'usb' }];
  sent: Array<{ port: string; data: number[]; atMs: number | undefined }> = [];
  onMessage: MidiBackend['onMessage'] = () => {};
  onPorts = () => {};
  async init() { return true; }
  inputs() { return this.ins; }
  outputs() { return this.outs; }
  send(portIds: string[], data: number[], atMs?: number) { for (const port of portIds) this.sent.push({ port, data, atMs }); }
  /** Test helper: deliver a message as if it came from the first input. */
  receive(data: number[], port = 'in1') { this.onMessage(port, data, 0); }
  unplug(id: string) { this.ins = this.ins.filter(p => p.id !== id); this.outs = this.outs.filter(p => p.id !== id); this.onPorts(); }
  plug(p: MidiPort, dir: 'in' | 'out') { (dir === 'in' ? this.ins : this.outs).push(p); this.onPorts(); }
}

export class NoMidi implements MidiBackend {
  readonly kind = 'none' as const; readonly nativeClock = false; timestamps: 'yes' | 'no' | 'unknown' = 'no';
  onMessage: MidiBackend['onMessage'] = () => {}; onPorts = () => {};
  async init() { return false; } inputs() { return []; } outputs() { return []; } send() {}
}
