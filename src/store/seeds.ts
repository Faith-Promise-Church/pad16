// Ready-made sets and one-time changes to saved songs. Each is applied once, by id, and never again:
// what you edit or delete afterwards sticks. A set is added beside what is saved; a change touches only what it names.
import { TimeSig, TempoCount, isCompound } from '../engine/time';
import { renderPattern, starterPatterns, cajonLowFirst } from '../engine/patterns';
import { AppState, Song, SetList, defaultSong, defaultClick, rigPads, rigColor, isCajonLow, rigScenes, RIG_PAGES, RIG_KIT } from './model';

interface SeedSong { name: string; key: string; bpm: number; ts?: TimeSig; tempoCount?: TempoCount }
interface Seed { id: string; name: string; songs: SeedSong[] }
const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SIX_EIGHT: TimeSig = { num: 6, den: 8 };

export const SEEDS: Seed[] = [{
  id: 'set-2026-11-acoustic', name: 'Acoustic set',
  songs: [
    { name: 'Bless God', key: 'C', bpm: 72.5 },
    { name: 'Cornerstone', key: 'C', bpm: 72 },
    { name: 'No One Like the Lord', key: 'E', bpm: 72 },
    { name: 'Here Again', key: 'C', bpm: 68 },
    // 6/8 chart tempos count quarter notes: 74 means eighth notes at 148 and a pulse of 49.3
    { name: 'Great Are You Lord', key: 'Bb', bpm: 74, ts: SIX_EIGHT, tempoCount: 'quarter' },
    { name: 'I Surrender', key: 'E', bpm: 76.5, ts: SIX_EIGHT, tempoCount: 'quarter' },
    { name: 'Tremble', key: 'B', bpm: 74 },
    { name: 'Send Me', key: 'B', bpm: 66 },
    { name: 'Deliverance', key: 'A', bpm: 72 },
  ],
}];

/** Song n (from 0) of a seed set, on the default layout for its meter, with eighth-note click subdivisions. */
function seedSong(seed: Seed, n: number): Song {
  const x = seed.songs[n], ts = x.ts || { num: 4, den: 4 };
  return { ...defaultSong(x.name), id: `${seed.id}-${n + 1}`, bpm: x.bpm, ts, click: { ...defaultClick(), sub: '8' }, key: Math.max(0, KEYS.indexOf(x.key)), kit: RIG_KIT, pads: rigPads(ts), pageNames: [...RIG_PAGES], ...(x.tempoCount ? { tempoCount: x.tempoCount } : {}) };
}
/** Add a song that joined a seed set later to the end of the saved copy of that set, if the set is still there and has not got it. */
function appendSeedSong(st: AppState, seedId: string, n: number): void {
  const seed = SEEDS.find(s => s.id === seedId), set = st.sets.find(s => s.id === seedId);
  if (!seed || !seed.songs[n] || !set) return;
  const song = seedSong(seed, n);
  if (set.songIds.includes(song.id) || st.songs.some(s => s.id === song.id)) return;
  st.songs.push(song); set.songIds = [...set.songIds, song.id];
}
/** Add any seed set this state has not had yet. Returns the last set added, or null. */
export function applySeeds(state: AppState, seeds: Seed[] = SEEDS): SetList | null {
  const had = new Set(state.seeded || []);
  let added: SetList | null = null;
  for (const seed of seeds) {
    if (had.has(seed.id)) continue;
    const songs = seed.songs.map((x, n) => seedSong(seed, n));
    state.songs = state.songs.filter(s => !songs.some(n => n.id === s.id)).concat(songs);
    added = { id: seed.id, name: seed.name, songIds: songs.map(s => s.id) };
    state.sets = state.sets.filter(s => s.id !== seed.id).concat(added);
    had.add(seed.id);
  }
  state.seeded = [...had];
  return added;
}

/** One-time changes to songs that were saved before a default changed. Each only moves a value that is still at its old default. */
const PATCHES: Array<{ id: string; run: (state: AppState) => void }> = [
  // 4/4 songs: eighth-note click subdivisions
  { id: 'patch-1-click-eighths', run: st => { for (const s of st.songs) if (s.ts.num === 4 && s.ts.den === 4 && s.click.sub === 'off') s.click = { ...s.click, sub: '8' }; } },
  // the cajon bass loops join the cajon loops in group B
  { id: 'patch-2-cajon-group-b', run: st => { for (const s of st.songs) s.pads = s.pads.map(p => (isCajonLow(p) && p.group === 'C' ? { ...p, group: 'B' } : p)); } },
  // muted colors on the default layout's pads
  { id: 'patch-3-pad-colors', run: st => { for (const s of st.songs) s.pads = s.pads.map(p => { const c = p.color ? undefined : rigColor(p); return c ? { ...p, color: c } : p; }); } },
  // the cajon pads that began as the kick figures on the bass alone become full grooves, unless the saved copy was edited
  { id: 'patch-4-cajon-grooves', run: st => {
    const now = new Map(starterPatterns().map(p => [p.id, p])), same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    for (const first of cajonLowFirst()) {
      const i = st.patterns.findIndex(p => p.id === first.id), next = now.get(first.id);
      if (i >= 0 && next && same(renderPattern(st.patterns[i]), renderPattern(first)) && st.patterns[i].swing === first.swing) st.patterns[i] = next;
    }
  } },
  // 6/8 songs: eighth-note click subdivisions too (three to the pulse)
  { id: 'patch-5-click-eighths-compound', run: st => { for (const s of st.songs) if (isCompound(s.ts) && s.click.sub === 'off') s.click = { ...s.click, sub: '8' }; } },
  // Deliverance joins the end of the acoustic set
  { id: 'patch-6-add-deliverance', run: st => appendSeedSong(st, 'set-2026-11-acoustic', 8) },
  // songs on the default layout that were saved before scenes existed get the starter scenes
  { id: 'patch-7-starter-scenes', run: st => { for (const s of st.songs) if (s.kit === RIG_KIT && s.scenes === undefined) s.scenes = rigScenes(); } },
];
/** Apply the one-time changes this state has not had. Returns true when any ran. */
export function applyPatches(state: AppState): boolean {
  const had = new Set(state.seeded || []);
  let ran = false;
  for (const p of PATCHES) { if (had.has(p.id)) continue; p.run(state); had.add(p.id); ran = true; }
  state.seeded = [...had];
  return ran;
}
