// The saved shape of everything: songs, sets, patterns, settings. Plain JSON.
import { TimeSig, Quant, Subdivision, TempoCount, isCompound } from '../engine/time';
import { PadMode } from '../engine/tags';
import { Pattern, starterPatterns, upgradePattern, RIG_44, RIG_68 } from '../engine/patterns';

export type SampleRef = { t: 'none' } | { t: 'builtin'; i: number } | { t: 'synth'; id: string } | { t: 'kit'; kit: string; file: string } | { t: 'audio'; id: string };
export type SyncMode = 'stretch' | 'repitch' | 'off';
export type StopMode = 'immediate' | 'quantized' | 'end' | 'fade';
export type Group = '' | 'A' | 'B' | 'C' | 'D';
export interface PadConfig {
  name: string; src: SampleRef; volume: number; pitch: number; mode: PadMode;
  sync: SyncMode; sourceBpm: number; lengthBeats: number; conf: number;
  quantize: Quant | 'global'; stopMode: StopMode; fadeBeats: number; group: Group; patternId: string;
  /** This slot shows another pad (by index) instead of holding one of its own, so one pad can sit on both pages. */
  link?: number;
  /** A muted color to tell pads apart at a glance. It never stands for a state: playing, queued and stopping keep their own colors. */
  color?: PadColor;
}
export const PAD_COLORS = ['sand', 'clay', 'rose', 'plum', 'slate', 'teal', 'sage', 'stone'] as const;
export type PadColor = (typeof PAD_COLORS)[number];
/** Pads on a page, pages in a song, and pads in a song. */
export const PAGE = 16, PAGES = 2, PADS = PAGE * PAGES;
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
  /** In 6/8, 9/8 and 12/8: what the tempo number counts. Unset means the dotted-quarter pulse. */
  tempoCount?: TempoCount;
  /** Names for the two pad pages. */
  pageNames?: string[];
  click: ClickSettings; sub: SubSettings; tonic: TonicSettings; notes: string;
  /** Up to eight scenes, in the order they show. Unset on songs saved before scenes existed. */
  scenes?: Scene[];
}
/** A scene is a named set of pads that should be sounding: launching it starts the ones that are not and stops the loops that are not in it,
 *  all on the same bar line. One shots in a scene fire once on that bar line. Ambient, bass and click can be switched with it, or left alone. */
export interface Scene {
  id: string; name: string; color?: PadColor;
  /** Pad indices (real pads, never linked slots). */
  pads: number[];
  /** true switches it on with the scene, false switches it off, unset leaves it as it is. */
  tonic?: boolean; sub?: boolean; click?: boolean;
}
export const MAX_SCENES = 8;
export const SCENE_NAMES = ['Intro', 'Verse', 'Pre', 'Chorus', 'Bridge', 'Tag', 'Build', 'Down', 'Outro'];
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
export type SceneAction = 'scene1' | 'scene2' | 'scene3' | 'scene4' | 'scene5' | 'scene6' | 'scene7' | 'scene8';
export type MidiAction = 'nextSong' | 'prevSong' | 'startStop' | 'tap' | 'clickToggle' | 'panic' | 'tonicToggle' | 'subToggle' | 'padPage' | 'nextScene' | 'prevScene' | SceneAction;
export const MIDI_ACTIONS: Record<MidiAction, string> = {
  nextSong: 'Next song', prevSong: 'Previous song', startStop: 'Start and stop', tap: 'Tap tempo',
  clickToggle: 'Click on and off', panic: 'Panic', tonicToggle: 'Ambient pad on and off', subToggle: 'Bass on and off', padPage: 'Switch pad page',
  nextScene: 'Next scene', prevScene: 'Previous scene',
  scene1: 'Scene 1', scene2: 'Scene 2', scene3: 'Scene 3', scene4: 'Scene 4', scene5: 'Scene 5', scene6: 'Scene 6', scene7: 'Scene 7', scene8: 'Scene 8',
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
  /** What a page-turner pedal (arrow and page keys) steps through. */
  pedalMode: 'song' | 'scene';
  /** The Edit destination last open. */
  dest: EditDest;
  /** Which click sound to use: 'builtin', the name of a click set from kits/, or '' for the default (a click set when one exists). */
  clickSound: string;
}
export type EditDest = 'pads' | 'loops' | 'song' | 'mix' | 'setup';
export const EDIT_DESTS: Array<{ id: EditDest; label: string }> = [{ id: 'pads', label: 'Pads' }, { id: 'loops', label: 'Loops' }, { id: 'song', label: 'Song' }, { id: 'mix', label: 'Mix' }, { id: 'setup', label: 'Setup' }];
export interface AppState {
  schema: 2; songs: Song[]; sets: SetList[]; currentSet: string; currentSong: string; patterns: Pattern[]; settings: Settings;
  /** Ready-made sets that have been added once already (see seeds.ts). Deleting one keeps it deleted. */
  seeded?: string[];
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const SUB_PRESETS: Record<string, SubParams> = {
  'Pure Sub': { wave: 'sine', subOsc: 0.3, drive: 0.1, poles: 12, cutoff: 400, resonance: 0.5, envAmount: 0, attack: 0.006, decay: 0.2, sustain: 1, release: 0.18, glide: 0.03, octave: 0 },
  'Warm Saw': { wave: 'sawtooth', subOsc: 0.6, drive: 0.3, poles: 24, cutoff: 320, resonance: 1.2, envAmount: 0.35, attack: 0.008, decay: 0.35, sustain: 0.8, release: 0.22, glide: 0.04, octave: 0 },
  'Round Triangle': { wave: 'triangle', subOsc: 0.5, drive: 0.2, poles: 12, cutoff: 700, resonance: 0.7, envAmount: 0.15, attack: 0.008, decay: 0.3, sustain: 0.9, release: 0.25, glide: 0.05, octave: 0 },
  '808 Hold': { wave: 'sine', subOsc: 0, drive: 0.55, poles: 12, cutoff: 900, resonance: 0.5, envAmount: 0.5, attack: 0.002, decay: 1.6, sustain: 0.55, release: 0.5, glide: 0.08, octave: 0 },
  'Organ Pedal': { wave: 'square', subOsc: 0.7, drive: 0.15, poles: 24, cutoff: 260, resonance: 0.6, envAmount: 0, attack: 0.02, decay: 0.1, sustain: 1, release: 0.12, glide: 0, octave: 0 },
};

/** A fresh pad. Page 1 starts on the first version's built-in drums; page 2 starts empty. */
export const defaultPad = (i: number): PadConfig => ({
  name: '', src: i < PAGE ? { t: 'builtin', i } : { t: 'none' }, volume: 0.9, pitch: 0, mode: 'oneshot', sync: 'repitch', sourceBpm: 0, lengthBeats: 0, conf: 0,
  quantize: 'global', stopMode: 'quantized', fadeBeats: 4, group: '', patternId: '',
});
/** The default layout, two pages. Page 1 is all cajon: shaker, tambourine, claps, four cajon loops, six cajon bass loops,
 *  the kick build and the stomp. Page 2 swaps the six cajon bass loops for kick loops; every other slot is the same pad as on page 1.
 *  In 6/8 (and 9/8, 12/8) the same layout is built from the 6/8 patterns, with the shaker as a pattern of single strokes. */
export const RIG_KIT = 'rig';
export const RIG_PAGES = ['Cajon', 'Kick'];
export function rigPads(ts: TimeSig = { num: 4, den: 4 }): PadConfig[] {
  const L = isCompound(ts) ? RIG_68 : RIG_44, six = L === RIG_68;
  // every cajon pad is group B, so only one cajon part plays at a time; the kick loops and the build are group C
  const group = (i: number): Group => { const slot = i % PAGE; return slot === 1 || slot === 2 ? 'A' : slot >= 4 && slot <= 7 ? 'B' : slot >= 8 && slot <= 13 ? (i < PAGE ? 'B' : 'C') : slot === 14 ? 'C' : ''; };
  // 6/8 pattern names carry "6/8" so they can be told apart in the pattern list; on the pad that is noise
  const pat = (i: number, id: string): PadConfig => ({ ...defaultPad(i), src: { t: 'none' }, mode: 'pattern', patternId: id, group: group(i), name: six ? patternLabel(id) : '', ...(RIG_COLOR.has(id) ? { color: RIG_COLOR.get(id) } : {}) });
  const page1 = [L.shaker, ...L.shared, ...L.cajon, L.build, L.stomp].map((id, i): PadConfig => id ? (i === 0 ? { ...pat(0, id), name: 'Shaker' } : pat(i, id))
    : { ...defaultPad(0), name: 'Shaker', src: { t: 'kit', kit: 'Acoustic Set', file: 'Shaker 80 [loop] [80bpm] [8bars].wav' }, mode: 'loop', sync: 'stretch', sourceBpm: 80, lengthBeats: 32, conf: 1, color: 'sage' });
  const page2 = Array.from({ length: PAGE }, (_, slot): PadConfig => slot >= 8 && slot <= 13 ? pat(PAGE + slot, L.kick[slot - 8]) : { ...defaultPad(PAGE + slot), link: slot });
  return [...page1, ...page2];
}
/** Colors of the default layout, by instrument: shaker sage, tambourine teal, claps rose, cajon loops clay, cajon bass loops sand, kick slate, build plum, stomp stone. */
const RIG_COLOR = new Map<string, PadColor>();
for (const L of [RIG_44, RIG_68]) {
  if (L.shaker) RIG_COLOR.set(L.shaker, 'sage');
  L.shared.forEach((id, n) => RIG_COLOR.set(id, n < 2 ? 'teal' : n === 2 ? 'rose' : 'clay'));
  for (const id of L.cajon) RIG_COLOR.set(id, 'sand');
  for (const id of L.kick) RIG_COLOR.set(id, 'slate');
  RIG_COLOR.set(L.build, 'plum'); RIG_COLOR.set(L.stomp, 'stone');
}
const CAJON_LOW = new Set([...RIG_44.cajon, ...RIG_68.cajon]);
/** The default layout's color for a pad, or undefined when the pad is not one of its parts. */
export function rigColor(p: PadConfig): PadColor | undefined {
  if (p.mode === 'pattern') return RIG_COLOR.get(p.patternId);
  return p.mode === 'loop' && p.src.t === 'kit' && /^Shaker/i.test(p.src.file) ? 'sage' : undefined;
}
export const isCajonLow = (p: PadConfig) => p.mode === 'pattern' && CAJON_LOW.has(p.patternId);
const LABELS = new Map<string, string>();
function patternLabel(id: string): string {
  if (!LABELS.size) for (const p of starterPatterns()) LABELS.set(p.id, p.name.replace(/^6\/8 /, ''));
  return LABELS.get(id) || '';
}
/** The default layout as it was before it had two pages: 16 pads, kick loops on pads 9 to 14. */
function firstRigPads(): PadConfig[] {
  const one = rigPads();
  return one.slice(0, PAGE).map((p, i) => { const { color: _c, ...old } = i >= 8 && i <= 13 ? { ...p, patternId: RIG_44.kick[i - 8], group: 'C' as Group } : p; return old; });
}
const canon = (o: any) => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
/** True for a saved song still on that first default layout with nothing changed, which can move to the two-page layout safely. */
export function isUntouchedFirstRig(s: any): boolean {
  if (!s || s.kit !== RIG_KIT || !Array.isArray(s.pads) || s.pads.length !== PAGE) return false;
  const first = firstRigPads();
  return s.pads.every((p: any, i: number) => canon(p) === canon(first[i]));
}
/** Where a slot's pad really lives: itself, or the pad it links to. */
export function padTarget(pads: PadConfig[], i: number): number {
  const l = pads[i]?.link;
  return typeof l === 'number' && l >= 0 && l < pads.length && l !== i && pads[l].link === undefined ? l : i;
}
/** Starter scenes for the default layout, the same pad slots in 4/4 and in 6/8: 1 shaker, 2 tambourine, 5 cajon groove, 9 cajon on 1, 15 kick build.
 *  They are a starting point to rename and rebuild. */
export function rigScenes(): Scene[] {
  const mk = (name: string, color: PadColor, pads: number[]): Scene => ({ id: uid(), name, color, pads });
  return [mk('Intro', 'sage', [0]), mk('Verse', 'sand', [0, 8]), mk('Chorus', 'clay', [0, 1, 4]), mk('Build', 'plum', [0, 1, 14]), mk('Down', 'stone', [])];
}
/** Clean up scenes from a saved song or an import: at most eight, known pads only, each pad once. */
export function normalizeScenes(raw: any, pads: PadConfig[]): Scene[] {
  if (!Array.isArray(raw)) return [];
  const tri = (v: any) => (v === true || v === false ? v : undefined);
  return raw.filter(x => x && typeof x === 'object').slice(0, MAX_SCENES).map((x: any): Scene => {
    const list = Array.isArray(x.pads) ? x.pads.map((n: any) => Math.floor(Number(n))).filter((n: number) => n >= 0 && n < pads.length).map((n: number) => padTarget(pads, n)) : [];
    const sc: Scene = { id: String(x.id || uid()), name: String(x.name ?? '').slice(0, 24), pads: [...new Set<number>(list)].sort((a, b) => a - b) };
    if (PAD_COLORS.includes(x.color)) sc.color = x.color;
    for (const k of ['tonic', 'sub', 'click'] as const) { const v = tri(x[k]); if (v !== undefined) sc[k] = v; }
    return sc;
  });
}
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
  id: uid(), name, bpm: 80, ts: { num: 4, den: 4 }, key: 0, kit: RIG_KIT, pads: rigPads(), pageNames: [...RIG_PAGES],
  quantize: 'bar', click: { ...defaultClick(), sub: '8' }, sub: defaultSub(), tonic: defaultTonic(), notes: '', scenes: rigScenes(),
});
export const defaultSettings = (): Settings => ({
  theme: 'dark', editLock: false, edit: false, countInOnPadLaunch: false, routingByDevice: {}, cueOffsetMs: 0, clickBackend: 'auto', pedalKeys: true, pedalMode: 'song', dest: 'pads', clickSound: '',
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
  const patterns: Pattern[] = (Array.isArray(raw.patterns) ? raw.patterns : []).map(upgradePattern);
  for (const sp of starters) if (!patterns.some(p => p.id === sp.id)) patterns.push(sp);
  const currentSet = sets.some(s => s.id === raw.currentSet) ? raw.currentSet : sets[0].id;
  const currentSong = songs.some(s => s.id === raw.currentSong) ? raw.currentSong : songs[0].id;
  const seeded = Array.isArray(raw.seeded) ? raw.seeded.map(String) : undefined;
  return { schema: 2, songs, sets, currentSet, currentSong, patterns, settings, ...(seeded ? { seeded } : {}) };
}
export function normalizeSong(s: any, ds = defaultSong()): Song {
  const ts: TimeSig = { num: s.ts?.num || 4, den: s.ts?.den || 4 };
  // a song still on the first default layout, unchanged, moves to the two-page one: cajon on page 1, its kick layout on page 2
  const moved = isUntouchedFirstRig(s);
  const pads = moved ? rigPads(ts) : Array.from({ length: PADS }, (_, i) => ({ ...defaultPad(i), ...((s.pads || [])[i] || {}) }));
  return {
    ...ds, ...s, id: s.id || uid(), pads, pageNames: moved ? [...RIG_PAGES] : Array.isArray(s.pageNames) ? s.pageNames.map(String) : [],
    ts: { num: s.ts?.num || 4, den: s.ts?.den || 4 },
    click: { ...ds.click, ...(s.click || {}), samples: { ...(s.click?.samples || {}) } },
    sub: { ...ds.sub, ...(s.sub || {}), params: { ...ds.sub.params, ...(s.sub?.params || {}) } },
    tonic: { ...ds.tonic, ...(s.tonic || {}) },
    // a song saved before scenes existed has none; the starter scenes reach it once, through a patch (see seeds.ts)
    ...(Array.isArray(s.scenes) ? { scenes: normalizeScenes(s.scenes, pads) } : { scenes: undefined }),
  };
}
export function normalizeRouting(r: any): Routing {
  const d = defaultRouting();
  const buses = { ...d.buses };
  for (const b of BUS_IDS) buses[b] = { ...d.buses[b], ...((r?.buses || {})[b] || {}) };
  return { ...d, ...(r || {}), buses };
}
