// The app controller: owns the saved state, the engine, samples and MIDI, and is what the interface talks to.
import { Engine } from './engine/engine';
import { SampleBank, KitInfo } from './engine/bank';
import { stretchLoop, stretchAmount } from './engine/stretch';
import { detectTempo } from './engine/detect';
import { parseTags } from './engine/tags';
import { beatsPerBar, clampBpm, TimeSig, ClickKind } from './engine/time';
import { TrackSrc } from './engine/patterns';
import { KV, openKV } from './store/db';
import { loadState, STATE_KEY } from './store/migrate';
import { exportSet, importSet } from './store/exportimport';
import {
  AppState, Song, SetList, PadConfig, Routing, SampleRef, defaultPad, defaultRouting, defaultSong, normalizeRouting, uid, MidiAction, SUB_PRESETS, BusId,
} from './store/model';
import { MidiManager } from './midi/manager';
import { ClockOut } from './midi/clockout';
import { MidiBackend, NoMidi } from './midi/types';
import { WebMidi, hasWebMidi } from './midi/webmidi';
import { isNative, Native, NativeMidi, NativeClick, RouteInfo } from './native/plugin';
import { WebClick } from './engine/click';

export interface PadMeta { missing: boolean; stretch: 'none' | 'busy' | 'ready' | 'failed' }

export class App {
  state!: AppState; kv!: KV; ctx!: AudioContext; eng!: Engine; bank!: SampleBank;
  midi!: MidiManager; clockOut!: ClockOut; backend!: MidiBackend;
  webClick!: WebClick; nativeClick: NativeClick | null = null;
  route: RouteInfo | null = null;
  sinkId = '';
  selected = 0;
  unlocked = false; needsResume = false; migrated = false;
  padMeta: PadMeta[] = Array.from({ length: 16 }, () => ({ missing: false, stretch: 'none' as const }));
  toastMsg = ''; private toastTimer: any = null;
  private subs = new Set<() => void>();
  private saveTimer: any = null;
  private msOffset: number | null = null;
  private loadToken = 0;

  static async create(): Promise<App> { const a = new App(); await a.init(); return a; }

  on(f: () => void) { this.subs.add(f); return () => this.subs.delete(f); }
  emit() { for (const f of this.subs) { try { f(); } catch (e) { console.warn(e); } } }
  toast(msg: string, ms = 3600) { this.toastMsg = msg; clearTimeout(this.toastTimer); if (ms) this.toastTimer = setTimeout(() => { this.toastMsg = ''; this.emit(); }, ms); this.emit(); }

  private async init(): Promise<void> {
    this.kv = await openKV();
    const loaded = await loadState(this.kv);
    this.state = loaded.state; this.migrated = loaded.migrated;
    try { if ((navigator as any).audioSession) (navigator as any).audioSession.type = 'playback'; } catch { /* not Safari */ }
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.eng = new Engine(this.ctx, { bpm: this.song.bpm, ts: this.song.ts });
    this.webClick = this.eng.click as WebClick;
    this.bank = new SampleBank(this.eng, this.kv);
    this.eng.pads.patterns = id => this.state.patterns.find(p => p.id === id);
    this.eng.pads.trackBuffer = (src: TrackSrc) => (src.t === 'pad' ? this.eng.pads.pads[src.i]?.buffer ?? null : this.bank.peek(src as SampleRef));
    this.eng.pads.wantStretch = (i, bpm) => this.ensureStretch(i, bpm);
    this.eng.sub.onNote = () => this.emit();
    this.eng.tonic.onChange = () => this.emit();
    this.eng.tonic.load = async (set, file) => {
      const r = await this.bank.resolve({ t: 'kit', kit: set.dir, file });
      if (!r.buffer || r.missing) throw new Error('pad sample missing');
      return r.buffer;
    };
    this.eng.transport.onState.push(() => {
      if (this.state.settings.midi.startStop) this.clockOut.sendTransport(this.eng.transport.running, this.eng.transport.running ? this.eng.clock.timeAt(0) : undefined);
      this.emit();
    });

    // MIDI: native CoreMIDI in the iOS app, Web MIDI where the browser has it, otherwise none.
    this.backend = isNative() ? new NativeMidi() : hasWebMidi() ? new WebMidi() : new NoMidi();
    this.clockOut = new ClockOut({ clock: this.eng.clock, now: () => this.eng.now(), toMs: t => this.toMs(t) }, this.backend);
    this.eng.scheduler.sources.push(this.clockOut);
    this.midi = new MidiManager(this.backend, () => this.state.settings.midi, {
      subInRange: n => this.song.sub.on && this.eng.sub.notes.inRange(n),
      noteOn: n => this.eng.sub.noteOn(n), noteOff: n => this.eng.sub.noteOff(n), pedal: d => this.eng.sub.pedal(d),
      control: (t, v) => this.eng.sub.control(t, v), bend: v => this.eng.sub.bend(v),
      padTrigger: (i, v) => this.eng.pads.trigger(i, v), padRelease: i => this.eng.pads.release(i),
      action: a => this.action(a), programChange: n => { const id = this.set.songIds[n]; if (id) this.selectSong(id); },
      linkLost: () => this.eng.sub.linkLost(), cc1: () => this.song.sub.cc1, cc11: () => this.song.sub.cc11,
    });
    this.midi.onChange = () => { this.syncMidi(); this.emit(); };

    this.ctx.onstatechange = () => this.checkAudio();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { this.checkAudio(); this.wake(); } else this.flush();
    });
    window.addEventListener('pagehide', () => this.flush());

    await this.bank.init();
    if (Native) {
      try {
        this.route = await Native.audioInfo();
        await Native.addListener('route', r => { this.route = r; this.applyRouting(); this.emit(); });
        await Native.addListener('interruption', (e: any) => { if (e.ended) this.ctx.resume().catch(() => {}).finally(() => this.checkAudio()); else { this.needsResume = this.unlocked; this.emit(); } });
        Native.keepAwake({ on: true }).catch(() => {});
      } catch { /* run as a plain web app */ }
    }
    this.applyRouting();
    await this.applySong(true);
    this.midi.init().then(() => this.syncMidi());
    this.eng.scheduler.start();
  }

  /* ---------- time ---------- */
  /** Audio-clock time to performance.now() milliseconds, for MIDI timestamps. Smoothed so clock does not wobble. */
  toMs(t: number): number {
    const c = this.ctx as any;
    let off: number;
    const ts = typeof c.getOutputTimestamp === 'function' ? c.getOutputTimestamp() : null;
    if (ts && ts.performanceTime > 0 && ts.contextTime > 0) off = ts.performanceTime - ts.contextTime * 1000;
    else off = performance.now() - (this.ctx.currentTime - (c.outputLatency || this.ctx.baseLatency || 0)) * 1000;
    if (this.msOffset === null || Math.abs(off - this.msOffset) > 40) this.msOffset = off;
    else this.msOffset += (off - this.msOffset) * 0.05;
    return this.msOffset + t * 1000;
  }

  /* ---------- audio lifecycle ---------- */
  async unlock(): Promise<void> {
    try { await this.ctx.resume(); } catch { /* try again on the next tap */ }
    this.unlocked = this.ctx.state === 'running';
    this.needsResume = !this.unlocked;
    this.wake();
    this.emit();
  }
  private checkAudio() {
    const bad = this.unlocked && this.ctx.state !== 'running';
    if (bad !== this.needsResume) { this.needsResume = bad; this.emit(); }
  }
  private wakeLock: any = null;
  private async wake() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !this.wakeLock) { this.wakeLock = await (navigator as any).wakeLock.request('screen'); this.wakeLock.addEventListener('release', () => { this.wakeLock = null; }); } } catch { /* not allowed right now */ }
  }
  panic(): void { this.eng.panic(); this.song.tonic = { ...this.song.tonic, on: false }; this.patchSong({}, true); this.changed(); }

  /* ---------- saving ---------- */
  save(): void { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.flush(), 250); }
  flush(): void { clearTimeout(this.saveTimer); this.kv.put(STATE_KEY, this.state).catch(() => {}); }
  changed(): void { this.save(); this.emit(); }

  /* ---------- songs and sets ---------- */
  get song(): Song { return this.state.songs.find(s => s.id === this.state.currentSong) || this.state.songs[0]; }
  get set(): SetList { return this.state.sets.find(s => s.id === this.state.currentSet) || this.state.sets[0]; }
  get setSongs(): Song[] { return this.set.songIds.map(id => this.state.songs.find(s => s.id === id)).filter(Boolean) as Song[]; }
  get nextSongInSet(): Song | null { const s = this.setSongs, i = s.findIndex(x => x.id === this.song.id); return i >= 0 && i + 1 < s.length ? s[i + 1] : null; }

  async selectSong(id: string): Promise<void> {
    if (!this.state.songs.some(s => s.id === id) || id === this.state.currentSong) return;
    this.state.currentSong = id;
    this.changed();
    await this.applySong(false);
  }
  nextSong() { const n = this.nextSongInSet; if (n) this.selectSong(n.id); }
  prevSong() { const s = this.setSongs, i = s.findIndex(x => x.id === this.song.id); if (i > 0) this.selectSong(s[i - 1].id); }
  addSong(copyOf?: Song): Song {
    const s: Song = copyOf ? { ...JSON.parse(JSON.stringify(copyOf)), id: uid(), name: copyOf.name + ' copy' } : defaultSong('New song');
    this.state.songs.push(s);
    const ids = this.set.songIds, at = ids.indexOf(this.song.id);
    ids.splice(at < 0 ? ids.length : at + 1, 0, s.id);
    this.selectSong(s.id);
    return s;
  }
  deleteSong(id: string) {
    if (this.state.songs.length <= 1) return;
    const wasCurrent = id === this.state.currentSong;
    this.state.songs = this.state.songs.filter(s => s.id !== id);
    for (const set of this.state.sets) set.songIds = set.songIds.filter(x => x !== id);
    if (wasCurrent) { this.state.currentSong = (this.setSongs[0] || this.state.songs[0]).id; this.applySong(false); }
    if (!this.set.songIds.length) this.set.songIds.push(this.state.currentSong);
    this.changed();
  }
  moveSong(id: string, dir: -1 | 1) {
    const ids = this.set.songIds, i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    this.eng.tonic.preload(this.nextSongInSet?.key ?? this.song.key);
    this.changed();
  }
  addSet(): void { const s: SetList = { id: uid(), name: 'New set', songIds: [this.song.id] }; this.state.sets.push(s); this.state.currentSet = s.id; this.changed(); }
  selectSet(id: string) { const s = this.state.sets.find(x => x.id === id); if (!s) return; this.state.currentSet = id; if (!s.songIds.includes(this.song.id) && s.songIds[0]) this.selectSong(s.songIds[0]); this.changed(); }
  deleteSet(id: string) { if (this.state.sets.length <= 1) return; this.state.sets = this.state.sets.filter(s => s.id !== id); if (this.state.currentSet === id) this.selectSet(this.state.sets[0].id); this.changed(); }
  async exportCurrentSet(): Promise<{ name: string; data: Uint8Array }> {
    this.flush();
    return { name: (this.set.name || 'set').replace(/[^\w\- ]+/g, '').trim() + '.pad16set', data: await exportSet(this.state, this.set.id, this.kv) };
  }
  async importSetFile(data: ArrayBuffer): Promise<void> {
    const id = await importSet(new Uint8Array(data), this.state, this.kv);
    this.state.currentSet = id;
    const first = this.set.songIds[0];
    this.changed();
    if (first) await this.selectSong(first);
  }

  /** Change song fields and push them to the engine. */
  patchSong(patch: Partial<Song>, engineOnly = false): void {
    const s = this.song, e = this.eng;
    Object.assign(s, patch);
    if (patch.bpm !== undefined) { s.bpm = clampBpm(patch.bpm); e.transport.setBpm(s.bpm); this.restretch(); }
    if (patch.ts) e.transport.setTs(s.ts);
    if (patch.quantize) e.pads.globalQuant = s.quantize;
    if (patch.click || engineOnly) { e.click.setSettings(s.click); e.transport.countInBars = s.click.countIn; if (patch.click) this.loadClickSamples(); }
    if (patch.sub || engineOnly) e.sub.setSettings(s.sub);
    if (patch.tonic || engineOnly) { e.tonic.setSet(this.bank.index.padsets.find(p => p.name === s.tonic.set) || this.bank.index.padsets[0] || null); e.tonic.setSettings(s.tonic); }
    if (patch.key !== undefined) e.tonic.setKey(s.key);
    if (!engineOnly) this.changed();
  }
  tap(): void { const bpm = this.eng.transport.tap(performance.now()); if (bpm) { this.song.bpm = bpm; this.restretch(); this.changed(); } }

  private async loadClickSamples() {
    for (const k of ['accent', 'beat', 'sub'] as ClickKind[]) {
      const id = this.song.click.samples[k];
      const b = id ? (await this.bank.resolve({ t: 'audio', id })).buffer : null;
      this.webClick.setSample(k, b); this.nativeClick?.setSample(k, b);
    }
  }
  async setClickSample(slot: ClickKind, file: File | null): Promise<void> {
    const samples = { ...this.song.click.samples };
    if (!file) delete samples[slot];
    else {
      try { const r = await this.bank.importAudio(file.name, await file.arrayBuffer()); samples[slot] = (r.ref as any).id; }
      catch { this.toast(`Could not read ${file.name}. The built-in click stays.`); return; }
    }
    this.patchSong({ click: { ...this.song.click, samples } });
  }

  private async applySong(initial: boolean): Promise<void> {
    const s = this.song, e = this.eng, my = ++this.loadToken;
    e.transport.setBpm(s.bpm); e.transport.setTs(s.ts);
    e.pads.globalQuant = s.quantize;
    this.patchSong({}, true);
    this.loadClickSamples();
    e.tonic.setKey(s.key);
    e.tonic.preload(this.nextSongInSet?.key ?? s.key);
    await Promise.all(s.pads.map((cfg, i) => this.loadPad(i, cfg, my)));
    if (!initial) this.emit();
  }
  private async loadPad(i: number, cfg: PadConfig, token = this.loadToken): Promise<void> {
    const r = await this.bank.resolve(cfg.src, i);
    if (token !== this.loadToken || this.song.pads[i] !== cfg) return;
    this.padMeta[i] = { missing: r.missing, stretch: 'none' };
    this.eng.pads.setPad(i, cfg, r.buffer);
    if (cfg.mode === 'pattern') this.warmPattern(cfg.patternId);
    this.ensureStretch(i, this.song.bpm);
    this.emit();
  }
  /** Decode a pattern's track samples ahead of time so the first pass is complete. */
  warmPattern(id: string) { const p = this.state.patterns.find(x => x.id === id); if (p) for (const t of p.tracks) if (t.src.t !== 'pad') this.bank.peek(t.src as SampleRef); }

  /* ---------- pads ---------- */
  padName(i: number): string {
    const c = this.song.pads[i];
    if (c.name) return c.name;
    if (c.mode === 'pattern') return this.state.patterns.find(p => p.id === c.patternId)?.name || 'Pattern';
    return c.src.t === 'builtin' ? this.bank.builtinName(c.src.i) : c.src.t === 'none' ? 'Empty' : 'Untitled';
  }
  patchPad(i: number, patch: Partial<PadConfig>): void {
    const cfg = { ...this.song.pads[i], ...patch };
    this.song.pads[i] = cfg;
    const p = this.eng.pads.pads[i];
    if (patch.src) { this.loadPad(i, cfg); }
    else {
      const retime = patch.sourceBpm !== undefined || patch.lengthBeats !== undefined || patch.sync !== undefined;
      if (retime) p.stretched = null;
      this.eng.pads.setPad(i, cfg, p.buffer);
      if (patch.mode === 'pattern' || patch.patternId) this.warmPattern(cfg.patternId);
      if (retime || patch.mode) this.ensureStretch(i, this.song.bpm);
    }
    this.changed();
  }
  /** Work out a loop's tempo from its name and audio. */
  detectPad(i: number, name = ''): void {
    const p = this.eng.pads.pads[i]; if (!p.buffer) return;
    const chs = Array.from({ length: p.buffer.numberOfChannels }, (_, c) => p.buffer!.getChannelData(c));
    const g = detectTempo(chs, p.buffer.sampleRate, this.song.ts, parseTags(name || this.song.pads[i].name));
    this.patchPad(i, { sourceBpm: g.bpm, lengthBeats: g.lengthBeats, conf: g.confidence });
  }
  async loadFiles(files: File[], start: number): Promise<void> {
    let i = start, loaded = 0; const failed: string[] = [];
    for (const f of files) {
      if (i > 15) break;
      try {
        const { ref, buffer } = await this.bank.importAudio(f.name, await f.arrayBuffer());
        const t = parseTags(f.name), bpb = beatsPerBar(this.song.ts);
        const cfg: PadConfig = { ...defaultPad(i), name: t.name || 'Untitled', src: ref, mode: t.mode || 'oneshot', group: t.group || '' };
        if (cfg.mode === 'loop') {
          const chs = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
          const g = detectTempo(chs, buffer.sampleRate, this.song.ts, t);
          Object.assign(cfg, { sourceBpm: g.bpm, lengthBeats: g.lengthBeats || bpb, conf: g.confidence, sync: 'repitch' });
        }
        this.song.pads[i] = cfg;
        await this.loadPad(i, cfg);
        loaded++; i++;
      } catch { failed.push(f.name); }
    }
    this.selected = Math.min(start + Math.max(loaded - 1, 0), 15);
    if (failed.length) this.toast(`Could not read ${failed.join(', ')}. Try WAV, MP3 or M4A.`);
    else if (loaded > 1) this.toast(`Loaded ${loaded} samples onto pads ${start + 1} to ${start + loaded}.`);
    this.changed();
  }
  resetPad(i: number): void { this.patchPad(i, defaultPad(i)); }

  /** Put a kit from the repo on the pads. 'builtin' restores the built-in drums. */
  async loadKit(name: string): Promise<void> {
    const s = this.song;
    if (name === 'builtin') { s.kit = ''; s.pads = s.pads.map((_, i) => defaultPad(i)); }
    else {
      const k = this.bank.index.kits.find(x => x.name === name); if (!k) return;
      s.kit = k.name; s.pads = this.kitPads(k);
    }
    this.changed();
    this.toast(name === 'builtin' ? 'Built-in drums loaded.' : `Loading ${name}`, name === 'builtin' ? 3000 : 0);
    const my = ++this.loadToken;
    await Promise.all(s.pads.map((cfg, i) => this.loadPad(i, cfg, my)));
    // loops without a tempo tag: measure them now that they are decoded
    s.pads.forEach((cfg, i) => { if (cfg.mode === 'loop' && cfg.sync !== 'off' && !cfg.sourceBpm) this.detectPad(i, k2name(cfg)); });
    const miss = this.padMeta.filter(m => m.missing).length;
    if (name !== 'builtin') this.toast(miss ? `Loaded ${name}. ${miss} file${miss === 1 ? '' : 's'} could not be read and play a stand-in.` : `Loaded ${name}.`);
    function k2name(c: PadConfig) { return c.src.t === 'kit' ? c.src.file : c.name; }
  }
  private kitPads(k: KitInfo): PadConfig[] {
    const bpb = beatsPerBar(this.song.ts);
    return Array.from({ length: 16 }, (_, i) => {
      const e = k.pads.find(p => p.pad === i + 1);
      if (!e) return defaultPad(i);
      const cfg: PadConfig = { ...defaultPad(i), name: e.name, src: { t: 'kit', kit: k.dir, file: e.file }, mode: e.mode || 'oneshot', group: (e.group as any) || '' };
      if (cfg.mode === 'loop') { cfg.sync = 'repitch'; if (e.bpm) { cfg.sourceBpm = e.bpm; cfg.conf = 1; } if (e.bars) cfg.lengthBeats = e.bars * bpb; }
      return cfg;
    });
  }

  /* ---------- stretch ---------- */
  ensureStretch(i: number, bpm: number): void {
    const p = this.eng.pads.pads[i], cfg = p.cfg, meta = this.padMeta[i];
    if (cfg.mode !== 'loop' || cfg.sync !== 'stretch' || !p.buffer || !(cfg.sourceBpm > 0) || !(cfg.lengthBeats > 0)) { meta.stretch = 'none'; return; }
    if (p.stretched && Math.abs(p.stretched.bpm - bpm) < 0.05) { meta.stretch = 'ready'; return; }
    if (Math.abs(bpm - cfg.sourceBpm) < 0.05) { p.stretched = { bpm, buffer: p.buffer }; meta.stretch = 'ready'; return; }
    if (meta.stretch === 'busy') return;
    meta.stretch = 'busy';
    const buffer = p.buffer, key = JSON.stringify(cfg.src);
    stretchLoop(buffer, cfg.sourceBpm, bpm, cfg.lengthBeats, key).then(out => {
      if (p.buffer !== buffer || p.cfg.sync !== 'stretch') return;
      p.stretched = { bpm, buffer: out }; meta.stretch = 'ready';
      // the tempo moved on while this rendered: go again
      if (Math.abs(this.eng.transport.targetBpm - bpm) > 0.05) { meta.stretch = 'none'; this.ensureStretch(i, this.eng.transport.targetBpm); }
      this.emit();
    }).catch(() => { if (p.buffer === buffer) meta.stretch = 'failed'; this.emit(); });
    this.emit();
  }
  private restretch() { for (let i = 0; i < 16; i++) { if (this.padMeta[i].stretch !== 'busy') this.padMeta[i].stretch = 'none'; this.ensureStretch(i, this.eng.transport.targetBpm); } }
  stretchWarning(i: number): boolean { const c = this.song.pads[i]; return c.mode === 'loop' && c.sync === 'stretch' && stretchAmount(c.sourceBpm, this.song.bpm) > 0.12; }

  /* ---------- outputs ---------- */
  get deviceKey(): string { return this.route ? `${this.route.name}|${this.route.channels}` : 'web:' + (this.sinkId || 'default'); }
  get routing(): Routing {
    const map = this.state.settings.routingByDevice, k = this.deviceKey;
    if (!map[k]) map[k] = normalizeRouting(map['web:default'] ? JSON.parse(JSON.stringify(map['web:default'])) : defaultRouting());
    return map[k];
  }
  /** Channels the hardware has, as far as we can tell. */
  get hardwareChannels(): number { return Math.max(this.route?.channels || 0, this.eng.mixer.reported); }
  get multiAvailable(): boolean { return this.hardwareChannels >= 4; }
  /** True when the click is played by the native shell on its own outputs. */
  get nativeCue(): boolean { return this.eng.click.kind === 'native'; }
  patchRouting(patch: Partial<Routing>): void { Object.assign(this.routing, patch); this.applyRouting(); this.changed(); }
  patchBus(id: BusId, patch: Partial<Routing['buses'][BusId]>): void {
    const b = this.routing.buses[id]; Object.assign(b, patch);
    if (patch.dest) this.applyRouting(); else this.eng.mixer.setBus(id, b.level, b.mute);
    this.changed();
  }
  async applyRouting(): Promise<void> {
    const r = this.routing, m = this.eng.mixer;
    m.apply(r);
    const wantNative = !!Native && r.mode === 'multi' && m.opened < 4 && (this.route?.channels || 0) >= 4 && this.state.settings.clickBackend !== 'web';
    if (wantNative) {
      if (!this.nativeClick) this.nativeClick = new NativeClick(this.eng, t => this.toMs(t));
      const ok = await this.nativeClick.enable(Math.max(0, r.cuePair - 1), this.state.settings.cueOffsetMs, r.buses.click.mute ? 0 : r.buses.click.level * r.cueLevel);
      if (ok) {
        // music stays in the web view on outputs 1 and 2; only the click moves to the native cue pair
        m.apply({ ...r, mode: 'stereo' }); m.routing = r;
        if (this.eng.click !== this.nativeClick) this.eng.setClick(this.nativeClick);
        this.loadClickSamples(); this.nativeClick.sync();
      } else if (this.eng.click !== this.webClick) this.eng.setClick(this.webClick);
    } else if (this.eng.click !== this.webClick) { this.nativeClick?.disable(); this.eng.setClick(this.webClick); }
    this.emit();
  }
  get canPickSink(): boolean { return typeof (this.ctx as any).setSinkId === 'function'; }
  async setSink(id: string): Promise<void> {
    try { await (this.ctx as any).setSinkId(id); this.sinkId = id; this.applyRouting(); } catch { this.toast('That output could not be opened.'); }
  }
  get bluetoothAudio(): boolean { return !!this.route?.bluetooth; }

  /* ---------- MIDI ---------- */
  syncMidi(): void {
    const s = this.state.settings.midi, outs = this.midi.activeOutputs();
    const ble = [...this.backend.inputs(), ...this.backend.outputs()].find(p => p.kind === 'ble');
    if (ble && s.lastBle !== ble.name) { s.lastBle = ble.name; this.save(); }
    this.clockOut.enabled = s.clockOut;
    this.clockOut.ports = outs.map(p => p.id);
    this.clockOut.offsets = Object.fromEntries(outs.map(p => [p.id, s.clockOffset[p.name] || 0]));
    this.clockOut.mode = s.clockMode === 'auto' ? (this.backend.timestamps === 'yes' ? 'timestamp' : 'immediate') : s.clockMode;
    this.clockOut.pushNative();
  }
  action(a: MidiAction): void {
    const s = this.song;
    if (a === 'nextSong') this.nextSong();
    else if (a === 'prevSong') this.prevSong();
    else if (a === 'startStop') this.eng.transport.toggle();
    else if (a === 'tap') this.tap();
    else if (a === 'clickToggle') this.patchSong({ click: { ...s.click, on: !s.click.on } });
    else if (a === 'panic') this.panic();
    else if (a === 'tonicToggle') this.patchSong({ tonic: { ...s.tonic, on: !s.tonic.on } });
    else if (a === 'subToggle') this.patchSong({ sub: { ...s.sub, on: !s.sub.on } });
  }
  setSubPreset(name: string) { const p = SUB_PRESETS[name]; if (p) this.patchSong({ sub: { ...this.song.sub, preset: name, params: { ...p, octave: this.song.sub.params.octave } } }); }
  setTs(ts: TimeSig) { this.patchSong({ ts }); }
}
