// The saved shape of everything: songs, sets, patterns, settings. Plain JSON.
import { TimeSig, Quant, Subdivision } from '../engine/time';
import { PadMode } from '../engine/tags';
import { Pattern, starterPatterns } from '../engine/patterns';

export type SampleRef = { t: 'none' } | { t: 'builtin'; i: number } | { t: 'synth'; id: string } | { t: 'kit'; kit: string; file: string } | { t: 'audio'; id: string };
export type SyncMode = 'stretch' | 'repitch' | 'off';
export type StopMode = 'immediate' | 'quantized' | 'end' | 'fade';
export type Group = '' | 'A' | 'B' | 'C' | 'D';
export interface PadConfig {
  name: string; src: SampleRef; volume: number; pitch: number; mode: PadMode;
  sync: SyncMode; sourceBpm: number; lengthBeats: number; conf: number;
  quantize: Quant | 'global'; stopMode: StopMode; fadeBeats: number; group: Group; patternId: string;
}
export interface ClickSettings {
  on: boolean; sub: Subdivision; accent: number; beat: number; subLevel: number; countIn: 0 | 1 | 2;
  samples: { accent?: string; beat?: string; sub?: string };
}
export type SubWave = 'sine' | 'triangle' | 'sawtooth' | 'square';
export interface SubParams {
  wave: SubWave; subOsc: number; drive: number; poles: 12 | 24; cutoff: number; resonance: number; envAmount: number;
  attack: number; decay: number; sustain: number; release: number; glide: number; octave: number;
}
export type SubTarget = 'off' | 'cutoff' | 'level' | 'drive' | 'subOsc';
export interface SubSettings {
  on: boolean; preset: string; params: SubParams; lo: number; hi: number; level: number; pedal: boolean;
  cc1: SubTarget; cc11: SubTarget; bend: 'pitch' | 'off';
}
export interface TonicSettings { on: boolean; set: string; level: number; fadeIn: number; fadeOut: number; xfade: number; lp: number; hp: number }
export interface Song {
  id: string; name: string; bpm: number; ts: TimeSig; key: number; kit: string; pads: PadConfig[]; quantize: Quant;
  click: ClickSettings; sub: SubSettings; tonic: TonicSettings; notes: string;
}
export interface SetList { id: string; name: string; songIds: string[] }

export type BusId = 'drums' | 'loops' | 'click' | 'pad' | 'sub';
export const BUS_IDS: BusId[] = ['drums', 'loops', 'click', 'pad', 'sub'];
export const BUS_LABEL: Record<BusId, string> = { drums: 'Drums', loops: 'Loops', click: 'Click', pad: 'Pad', sub: 'Sub' };
export interface BusState { level: number; mute: boolean; dest: 'main' | 'cue' }
export type OutputMode = 'stereo' | 'split' | 'multi';
export interface Routing {
  mode: OutputMode; swap: boolean; cuePair: number; subOut: number; master: number; cueLevel: number;
  buses: Record<BusId, BusState>;
}
export interface MidiBinding { kind: 'cc' | 'note' | 'pc'; ch: number; num: number }
export type MidiAction = 'nextSong' | 'prevSong' | 'startStop' | 'tap' | 'clickToggle' | 'panic' | 'tonicToggle' | 'subToggle';
export const MIDI_ACTIONS: Record<MidiAction, string> = {
  nextSong: 'Next song', prevSong: 'Previous song', startStop: 'Start and stop', tap: 'Tap tempo',
  clickToggle: 'Click on and off', panic: 'Panic', tonicToggle: 'Tonic pad on and off', subToggle: 'Sub synth on and off',
};
export interface MidiSettings {
  disabled: Record<string, boolean>; lastBle: string; clockOut: boolean; startStop: boolean;
  clockOffset: Record<string, number>; clockMode: 'auto' | 'timestamp' | 'immediate'; channel: number;
  padZone: { on: boolean; low: number }; programChange: boolean; maps: Partial<Record<MidiAction, MidiBinding>>;
}
export interface Settings {
  theme: 'dark' | 'light'; editLock: boolean; edit: boolean; countInOnPadLaunch: boolean;
  routingByDevice: Record<string, Routing>; midi: MidiSettings; cueOffsetMs: number; clickBackend: 'auto' | 'web' | 'native';
  pedalKeys: boolean;
}
export interface AppState {
  schema: 2; songs: Song[]; sets: SetList[]; currentSet: string; currentSong: string; patterns: Pattern[]; settings: Settings;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const SUB_PRESETS: Record<string, SubParams> = {
  'Pure Sub': { wave: 'sine', subOsc: 0.3, drive: 0.1, poles: 12, cutoff: 400, resonance: 0.5, envAmount: 0, attack: 0.006, decay: 0.2, sustain: 1, release: 0.18, glide: 0.03, octave: 0 },
  'Warm Saw': { wave: 'sawtooth', subOsc: 0.6, drive: 0.3, poles: 24, cutoff: 320, resonance: 1.2, envAmount: 0.35, attack: 0.008, decay: 0.35, sustain: 0.8, release: 0.22, glide: 0.04, octave: 0 },
  'Round Triangle': { wave: 'triangle', subOsc: 0.5, drive: 0.2, poles: 12, cutoff: 700, resonance: 0.7, envAmount: 0.15, attack: 0.008, decay: 0.3, sustain: 0.9, release: 0.25, glide: 0.05, octave: 0 },
  '808 Hold': { wave: 'sine', subOsc: 0, drive: 0.55, poles: 12, cutoff: 900, resonance: 0.5, envAmount: 0.5, attack: 0.002, decay: 1.6, sustain: 0.55, release: 0.5, glide: 0.08, octave: 0 },
  'Organ Pedal': { wave: 'square', subOsc: 0.7, drive: 0.15, poles: 24, cutoff: 260, resonance: 0.6, envAmount: 0, attack: 0.02, decay: 0.1, sustain: 1, release: 0.12, glide: 0, octave: 0 },
};

export const defaultPad = (i: number): PadConfig => ({
  name: '', src: { t: 'builtin', i }, volume: 0.9, pitch: 0, mode: 'oneshot', sync: 'repitch', sourceBpm: 0, lengthBeats: 0, conf: 0,
  quantize: 'global', stopMode: 'quantized', fadeBeats: 4, group: '', patternId: '',
});
export const defaultClick = (): ClickSettings => ({ on: false, sub: 'off', accent: 1, beat: 0.8, subLevel: 0.5, countIn: 0, samples: {} });
export const defaultSub = (): SubSettings => ({
  on: false, preset: 'Pure Sub', params: { ...SUB_PRESETS['Pure Sub'] }, lo: 21, hi: 47, level: 0.8, pedal: true, cc1: 'cutoff', cc11: 'level', bend: 'pitch',
});
export const defaultTonic = (): TonicSettings => ({ on: false, set: '', level: 0.7, fadeIn: 4, fadeOut: 6, xfade: 4, lp: 20000, hp: 20 });
export const defaultRouting = (): Routing => ({
  mode: 'stereo', swap: false, cuePair: 3, subOut: 0, master: 0.85, cueLevel: 1,
  buses: {
    drums: { level: 0.85, mute: false, dest: 'main' }, loops: { level: 0.85, mute: false, dest: 'main' },
    click: { level: 0.8, mute: false, dest: 'cue' }, pad: { level: 0.8, mute: false, dest: 'main' }, sub: { level: 0.85, mute: false, dest: 'main' },
  },
});
export const defaultSong = (name = 'New song'): Song => ({
  id: uid(), name, bpm: 96, ts: { num: 4, den: 4 }, key: 0, kit: '', pads: Array.from({ length: 16 }, (_, i) => defaultPad(i)),
  quantize: 'bar', click: defaultClick(), sub: defaultSub(), tonic: defaultTonic(), notes: '',
});
export const defaultSettings = (): Settings => ({
  theme: 'dark', editLock: false, edit: false, countInOnPadLaunch: false, routingByDevice: {}, cueOffsetMs: 0, clickBackend: 'auto', pedalKeys: true,
  midi: { disabled: {}, lastBle: '', clockOut: true, startStop: false, clockOffset: {}, clockMode: 'auto', channel: 0, padZone: { on: false, low: 48 }, programChange: false, maps: {} },
});
export function defaultState(): AppState {
  const song = defaultSong('My pads');
  const set: SetList = { id: uid(), name: 'My set', songIds: [song.id] };
  return { schema: 2, songs: [song], sets: [set], currentSet: set.id, currentSong: song.id, patterns: starterPatterns(), settings: defaultSettings() };
}

/** Fill in anything a saved state is missing, so old saves and imports always load. */
export function normalizeState(raw: any): AppState {
  const d = defaultState();
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.songs) || !raw.songs.length) return d;
  const ds = defaultSong();
  const songs: Song[] = raw.songs.map((s: any) => normalizeSong(s, ds));
  const sets: SetList[] = Array.isArray(raw.sets) && raw.sets.length
    ? raw.sets.map((x: any) => ({ id: x.id || uid(), name: String(x.name || 'Set'), songIds: (x.songIds || []).filter((id: string) => songs.some(s => s.id === id)) }))
    : [{ id: uid(), name: 'My set', songIds: songs.map(s => s.id) }];
  const dset = defaultSettings(), rs = raw.settings || {};
  const settings: Settings = { ...dset, ...rs, midi: { ...dset.midi, ...(rs.midi || {}), padZone: { ...dset.midi.padZone, ...(rs.midi?.padZone || {}) } }, routingByDevice: rs.routingByDevice || {} };
  for (const k of Object.keys(settings.routingByDevice)) settings.routingByDevice[k] = normalizeRouting(settings.routingByDevice[k]);
  const starters = starterPatterns();
  const patterns: Pattern[] = Array.isArray(raw.patterns) ? raw.patterns : [];
  for (const sp of starters) if (!patterns.some(p => p.id === sp.id)) patterns.push(sp);
  const currentSet = sets.some(s => s.id === raw.currentSet) ? raw.currentSet : sets[0].id;
  const currentSong = songs.some(s => s.id === raw.currentSong) ? raw.currentSong : songs[0].id;
  return { schema: 2, songs, sets, currentSet, currentSong, patterns, settings };
}
export function normalizeSong(s: any, ds = defaultSong()): Song {
  const pads = Array.from({ length: 16 }, (_, i) => ({ ...defaultPad(i), ...((s.pads || [])[i] || {}) }));
  return {
    ...ds, ...s, id: s.id || uid(), pads,
    ts: { num: s.ts?.num || 4, den: s.ts?.den || 4 },
    click: { ...ds.click, ...(s.click || {}), samples: { ...(s.click?.samples || {}) } },
    sub: { ...ds.sub, ...(s.sub || {}), params: { ...ds.sub.params, ...(s.sub?.params || {}) } },
    tonic: { ...ds.tonic, ...(s.tonic || {}) },
  };
}
export function normalizeRouting(r: any): Routing {
  const d = defaultRouting();
  const buses = { ...d.buses };
  for (const b of BUS_IDS) buses[b] = { ...d.buses[b], ...((r?.buses || {})[b] || {}) };
  return { ...d, ...(r || {}), buses };
}
