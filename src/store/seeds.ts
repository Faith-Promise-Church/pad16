// Ready-made sets. Each is added to the saved data once, by id, and never again: editing or deleting it sticks.
// Nothing already saved is changed.
import { TimeSig, TempoCount } from '../engine/time';
import { AppState, Song, SetList, defaultSong, rigPads, RIG_PAGES, RIG_KIT } from './model';

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
  ],
}];

/** Add any seed set this state has not had yet. Returns the last set added, or null. */
export function applySeeds(state: AppState, seeds: Seed[] = SEEDS): SetList | null {
  const had = new Set(state.seeded || []);
  let added: SetList | null = null;
  for (const seed of seeds) {
    if (had.has(seed.id)) continue;
    const songs = seed.songs.map((x, n): Song => {
      const ts = x.ts || { num: 4, den: 4 };
      return { ...defaultSong(x.name), id: `${seed.id}-${n + 1}`, bpm: x.bpm, ts, key: Math.max(0, KEYS.indexOf(x.key)), kit: RIG_KIT, pads: rigPads(ts), pageNames: [...RIG_PAGES], ...(x.tempoCount ? { tempoCount: x.tempoCount } : {}) };
    });
    state.songs = state.songs.filter(s => !songs.some(n => n.id === s.id)).concat(songs);
    added = { id: seed.id, name: seed.name, songIds: songs.map(s => s.id) };
    state.sets = state.sets.filter(s => s.id !== seed.id).concat(added);
    had.add(seed.id);
  }
  state.seeded = [...had];
  return added;
}
