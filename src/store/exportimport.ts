// A whole set as one file: set.json plus the imported audio, zipped. Used for backup and to move between devices.
// Kit samples are not copied: they ship with the app, so every device already has them.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { KV } from './db';
import { AppState, SampleRef, SetList, Song, normalizeSong, uid } from './model';
import { audioKey, StoredAudio } from './migrate';
import { Pattern, upgradePattern } from '../engine/patterns';

interface SetFile { format: 'pad16-set'; version: 1; set: SetList; songs: Song[]; patterns: Pattern[]; audio: Record<string, string> }

function audioIds(songs: Song[], patterns: Pattern[]): string[] {
  const ids = new Set<string>();
  for (const s of songs) {
    for (const p of s.pads) if (p.src.t === 'audio') ids.add(p.src.id);
    for (const id of Object.values(s.click.samples)) if (id) ids.add(id);
  }
  for (const p of patterns) for (const t of p.tracks) if (t.src.t === 'audio') ids.add(t.src.id);
  return [...ids];
}

export async function exportSet(state: AppState, setId: string, kv: KV): Promise<Uint8Array> {
  const set = state.sets.find(s => s.id === setId) || state.sets[0];
  const songs = set.songIds.map(id => state.songs.find(s => s.id === id)).filter(Boolean) as Song[];
  const used = new Set(songs.flatMap(s => s.pads.map(p => p.patternId)).filter(Boolean));
  const patterns = state.patterns.filter(p => used.has(p.id));
  const files: Record<string, Uint8Array> = {};
  const audio: Record<string, string> = {};
  for (const id of audioIds(songs, patterns)) {
    const a = await kv.get<StoredAudio>(audioKey(id));
    if (!a) continue;
    audio[id] = a.name;
    files['audio/' + id] = new Uint8Array(a.data);
  }
  const doc: SetFile = { format: 'pad16-set', version: 1, set, songs, patterns, audio };
  files['set.json'] = strToU8(JSON.stringify(doc, null, 1));
  // audio is already compressed or large PCM: store it, do not spend time deflating
  return zipSync(files, { level: 0 });
}

/** Add a set file to the state. Everything gets fresh ids, so importing twice never overwrites. Returns the new set's id. */
export async function importSet(bytes: Uint8Array, state: AppState, kv: KV): Promise<string> {
  const files = unzipSync(bytes);
  if (!files['set.json']) throw new Error('This is not a Pad16 set file');
  const doc = JSON.parse(strFromU8(files['set.json'])) as SetFile;
  if (doc.format !== 'pad16-set' || !Array.isArray(doc.songs)) throw new Error('This is not a Pad16 set file');
  const audioMap = new Map<string, string>();
  for (const [oldId, name] of Object.entries(doc.audio || {})) {
    const data = files['audio/' + oldId];
    if (!data) continue;
    const id = uid();
    audioMap.set(oldId, id);
    await kv.put(audioKey(id), { name, data: data.slice().buffer } satisfies StoredAudio);
  }
  const mapRef = <T extends { t: string }>(r: T): T => (r.t === 'audio' && audioMap.has((r as any).id) ? { ...r, id: audioMap.get((r as any).id)! } : r);
  const patMap = new Map<string, string>();
  for (const p of (doc.patterns || []).map(upgradePattern)) {
    const same = state.patterns.find(x => x.id === p.id);
    const copy: Pattern = { ...p, tracks: p.tracks.map(t => ({ ...t, src: mapRef(t.src) })) };
    if (same && JSON.stringify(same) === JSON.stringify(copy)) continue;
    if (same) { copy.id = uid(); patMap.set(p.id, copy.id); }
    state.patterns.push(copy);
  }
  const songIds: string[] = [];
  for (const raw of doc.songs) {
    const s = normalizeSong(raw);
    s.id = uid();
    s.pads = s.pads.map(p => ({ ...p, src: mapRef(p.src) as SampleRef, patternId: patMap.get(p.patternId) || p.patternId }));
    for (const k of Object.keys(s.click.samples) as Array<keyof Song['click']['samples']>) { const v = s.click.samples[k]; if (v && audioMap.has(v)) s.click.samples[k] = audioMap.get(v); }
    state.songs.push(s); songIds.push(s.id);
  }
  const set: SetList = { id: uid(), name: (doc.set?.name || 'Imported set') + (state.sets.some(x => x.name === doc.set?.name) ? ' (imported)' : ''), songIds };
  state.sets.push(set);
  return set.id;
}
