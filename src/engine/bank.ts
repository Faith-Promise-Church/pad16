// Finds the audio behind a sample reference: built-in kit, synthesized stand-in, kit file from the repo, or imported audio.
// Every failure falls back to a stand-in so a pad always has something to play.
import type { Engine } from './engine';
import { SampleRef, uid } from '../store/model';
import { KV } from '../store/db';
import { audioKey, StoredAudio } from '../store/migrate';
import { renderBuiltinKit, BUILTIN_NAMES } from './builtinkit';
import { PadSetInfo } from './tonicpad';
import { PadMode } from './tags';

export interface KitPad { pad: number; file: string; name: string; mode?: PadMode; bpm?: number; bars?: number; group?: string }
export interface KitInfo { name: string; dir: string; pads: KitPad[]; extras?: Array<{ file: string; name: string }> }
export interface ClickSetInfo { name: string; dir: string; files: Partial<Record<'accent' | 'beat' | 'sub', string>> }
export interface KitIndex { kits: KitInfo[]; padsets: PadSetInfo[]; clicksets: ClickSetInfo[] }
export interface Resolved { buffer: AudioBuffer | null; missing: boolean }

export const kitUrl = (dir: string, file: string) => 'kits/' + dir.split('/').map(encodeURIComponent).join('/') + '/' + encodeURIComponent(file);

export class SampleBank {
  builtin: Array<AudioBuffer | null> = [];
  index: KitIndex = { kits: [], padsets: [], clicksets: [] };
  private cache = new Map<string, Promise<AudioBuffer | null>>();
  constructor(private eng: Engine, private kv: KV) {}

  async init(): Promise<void> {
    this.builtin = await renderBuiltinKit().catch(() => []);
    await this.loadIndex();
  }
  /** True once the list of kits, pad sets and click sets has arrived. Without it the pads fall back to stand-in sounds. */
  indexLoaded = false;
  async loadIndex(): Promise<boolean> {
    try {
      const r = await fetch('kits/index.json', { cache: 'no-cache' });
      const j = r.ok ? await r.json() : {};
      this.index = {
        kits: Array.isArray(j.kits) ? j.kits.filter((k: any) => k && k.name && Array.isArray(k.pads)) : [],
        padsets: Array.isArray(j.padsets) ? j.padsets.filter((k: any) => k && k.name && k.keys) : [],
        clicksets: Array.isArray(j.clicksets) ? j.clicksets.filter((k: any) => k && k.name && k.files) : [],
      };
      this.indexLoaded = r.ok;
    } catch { this.index = { kits: [], padsets: [], clicksets: [] }; this.indexLoaded = false; }
    return this.indexLoaded;
  }
  private key(ref: SampleRef): string {
    return ref.t === 'kit' ? `kit:${ref.kit}/${ref.file}` : ref.t === 'audio' ? `audio:${ref.id}` : ref.t === 'synth' ? `synth:${ref.id}` : ref.t === 'builtin' ? `builtin:${ref.i}` : 'none';
  }
  decode(raw: ArrayBuffer): Promise<AudioBuffer> { return this.eng.ctx.decodeAudioData(raw.slice(0)); }

  /** Raw bytes for export, or null for sounds that are not stored as files. */
  async raw(ref: SampleRef): Promise<{ name: string; data: ArrayBuffer } | null> {
    try {
      if (ref.t === 'audio') { const a = await this.kv.get<StoredAudio>(audioKey(ref.id)); return a ? { name: a.name, data: a.data } : null; }
      if (ref.t === 'kit') { const r = await fetch(kitUrl(ref.kit, ref.file)); return r.ok ? { name: ref.file, data: await r.arrayBuffer() } : null; }
    } catch { /* fall through */ }
    return null;
  }
  private load(ref: SampleRef): Promise<AudioBuffer | null> {
    const k = this.key(ref);
    let p = this.cache.get(k);
    if (!p) {
      p = (async () => {
        if (ref.t === 'builtin') return this.builtin[ref.i] ?? null;
        if (ref.t === 'synth') return this.eng.synthBuffer(ref.id);
        if (ref.t === 'none') return null;
        const raw = await this.raw(ref);
        return raw ? this.decode(raw.data) : null;
      })().catch(() => null);
      this.cache.set(k, p);
      p.then(b => { if (!b && (ref.t === 'kit' || ref.t === 'audio')) this.cache.delete(k); });
    }
    return p;
  }
  /** Buffer for a reference. A file that cannot be read gives the stand-in for that pad and missing = true. */
  async resolve(ref: SampleRef, padIndex = 0): Promise<Resolved> {
    const b = await this.load(ref);
    if (b || ref.t === 'none' || ref.t === 'builtin' || ref.t === 'synth') return { buffer: b, missing: false };
    return { buffer: this.builtin[padIndex % 16] ?? this.eng.synthBuffer('stomp'), missing: true };
  }
  /** Decoded already? Synchronous lookup for the scheduler. A file that fails to download is tried again:
   *  after 2 seconds, then 4, 8 and so on up to every 30. It is never given up on, and never asked for on every call. */
  private ready = new Map<string, AudioBuffer | null>();
  private loading = new Set<string>();
  private failed = new Map<string, { at: number; n: number }>();
  peek(ref: SampleRef): AudioBuffer | null {
    const k = this.key(ref);
    if (this.ready.has(k)) return this.ready.get(k)!;
    if (this.loading.has(k)) return null;
    const f = this.failed.get(k);
    if (f && performance.now() - f.at < Math.min(30000, 1000 * 2 ** f.n)) return null;
    this.loading.add(k);
    this.load(ref).then(b => {
      this.loading.delete(k);
      if (b || (ref.t !== 'kit' && ref.t !== 'audio')) { this.ready.set(k, b); this.failed.delete(k); }
      else this.failed.set(k, { at: performance.now(), n: (f?.n || 0) + 1 });
    });
    return null;
  }
  /** Where a sample stands: decoded, on its way, or failed and waiting for the next try. */
  status(ref: SampleRef): 'ready' | 'loading' | 'failed' {
    const k = this.key(ref);
    return this.ready.has(k) ? 'ready' : this.failed.has(k) && !this.loading.has(k) ? 'failed' : 'loading';
  }
  /** Try failed downloads again now (the network just came back). */
  retryNow(): void { for (const f of this.failed.values()) f.at = -1e9; }
  /** Store an imported file and return a reference to it. Throws if the browser cannot decode it. */
  async importAudio(name: string, data: ArrayBuffer, id = uid()): Promise<{ ref: SampleRef; buffer: AudioBuffer }> {
    const buffer = await this.decode(data);
    await this.kv.put(audioKey(id), { name, data } satisfies StoredAudio);
    const ref: SampleRef = { t: 'audio', id };
    this.cache.set(this.key(ref), Promise.resolve(buffer)); this.ready.set(this.key(ref), buffer);
    return { ref, buffer };
  }
  builtinName(i: number): string { return BUILTIN_NAMES[i] || `Pad ${i + 1}`; }
}
