import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openKV, memoryKV } from '../../src/store/db';
import { loadState, STATE_KEY, audioKey } from '../../src/store/migrate';
import { normalizeState, defaultState, rigPads, PADS } from '../../src/store/model';
import { applySeeds, applyPatches, SEEDS } from '../../src/store/seeds';
import { pulseBpm } from '../../src/engine/time';

/** Write data the way the first version of the app did. */
async function seedV1(f: IDBFactory) {
  await new Promise<void>((res, rej) => {
    const r = f.open('pad16', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('kv', 'readwrite'), s = tx.objectStore('kv');
      s.put({ name: 'My Loop', volume: 1.2, pitch: -3, mode: 'loop', custom: true }, 's2');
      s.put(new Uint8Array([1, 2, 3, 4]).buffer, 'a2');
      s.put({ name: 'Kick', volume: 0.5, pitch: 0, mode: 'hold', custom: false }, 's0');
      s.put('Sunday Loops', 'kit');
      tx.oncomplete = () => { r.result.close(); res(); };
    };
  });
}

describe('saved data migration', () => {
  it('carries version 1 pads into the first song and leaves the old keys untouched', async () => {
    const f = new IDBFactory();
    await seedV1(f);
    const kv = await openKV(f);
    const { state, migrated } = await loadState(kv);
    expect(migrated).toBe(true);
    const song = state.songs[0];
    expect(song.kit).toBe('Sunday Loops'); expect(song.bpm).toBe(96);
    expect(song.pads[7]).toMatchObject({ mode: 'oneshot', src: { t: 'builtin', i: 7 } });   // untouched old pads stay on the built-in drums
    expect(song.pads[0]).toMatchObject({ name: 'Kick', volume: 0.5, mode: 'hold', src: { t: 'builtin', i: 0 } });
    expect(song.pads[2]).toMatchObject({ name: 'My Loop', volume: 1.2, pitch: -3, mode: 'loop', sync: 'off' });
    expect(song.pads[2].src.t).toBe('audio');
    const stored = await kv.get<any>(audioKey((song.pads[2].src as any).id));
    expect(new Uint8Array(stored.data)).toEqual(new Uint8Array([1, 2, 3, 4]));
    // old data still there for the app on main
    expect(await kv.get('s2')).toMatchObject({ name: 'My Loop', custom: true });
    expect(new Uint8Array((await kv.get<ArrayBuffer>('a2'))!)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(await kv.get('kit')).toBe('Sunday Loops');
    expect(await kv.get(STATE_KEY)).toBeTruthy();
  });
  it('still opens as database version 1 so the old app keeps working', async () => {
    const f = new IDBFactory();
    await seedV1(f);
    await loadState(await openKV(f));
    const v = await new Promise<number>(res => { const r = f.open('pad16', 1); r.onsuccess = () => res(r.result.version); r.onerror = () => res(-1); });
    expect(v).toBe(1);
  });
  it('does not migrate twice', async () => {
    const f = new IDBFactory();
    await seedV1(f);
    const kv = await openKV(f);
    const a = await loadState(kv);
    a.state.songs[0].name = 'Renamed';
    await kv.put(STATE_KEY, a.state);
    const b = await loadState(kv);
    expect(b.migrated).toBe(false); expect(b.state.songs[0].name).toBe('Renamed');
  });
  it('starts clean with no old data and with no IndexedDB at all', async () => {
    const { state, migrated } = await loadState(await openKV(new IDBFactory()));
    expect(migrated).toBe(false); expect(state.songs.length).toBe(1); expect(state.patterns.length).toBe(defaultState().patterns.length); expect(state.songs[0].pads.length).toBe(PADS);
    expect(state.songs[0].pads[0]).toMatchObject({ name: 'Shaker', mode: 'loop' });      // a fresh install gets the default layout
    const mem = await loadState(memoryKV());
    expect(mem.state.songs[0].pads.length).toBe(PADS);
  });
  it('repairs partial or damaged saves', () => {
    expect(normalizeState(null).songs.length).toBe(1);
    const s = normalizeState({ songs: [{ name: 'X', pads: [{ name: 'only one' }], sub: { on: true } }], settings: { theme: 'light' } });
    expect(s.songs[0].pads.length).toBe(PADS); expect(s.songs[0].pads[0].name).toBe('only one'); expect(s.songs[0].pads[5].src).toEqual({ t: 'builtin', i: 5 });
    expect(s.songs[0].sub.on).toBe(true); expect(s.songs[0].sub.params.wave).toBe('sine'); expect(s.settings.theme).toBe('light');
    expect(s.settings.midi.clockOut).toBe(true); expect(s.sets[0].songIds).toEqual([s.songs[0].id]);
    expect(defaultState().settings.midi.startStop).toBe(false);
  });
});

describe('the ready-made set', () => {
  it('is added once, beside what is saved, and never comes back after it is deleted', () => {
    const state = defaultState();
    state.songs[0].name = 'Mine'; state.songs[0].bpm = 101;
    const set = applySeeds(state)!;
    expect(set.name).toBe('Acoustic set');
    expect(state.sets.length).toBe(2); expect(state.sets[0].songIds).toEqual([state.songs[0].id]);
    expect(state.songs[0]).toMatchObject({ name: 'Mine', bpm: 101 });                    // saved songs are untouched
    const songs = set.songIds.map(id => state.songs.find(s => s.id === id)!);
    expect(songs.map(s => `${s.name} ${'C Db D Eb E F Gb G Ab A Bb B'.split(' ')[s.key]} ${s.bpm} ${s.ts.num}/${s.ts.den}`)).toEqual([
      'Bless God C 72.5 4/4', 'Cornerstone C 72 4/4', 'No One Like the Lord E 72 4/4', 'Here Again C 68 4/4',
      'Great Are You Lord Bb 74 6/8', 'I Surrender E 76.5 6/8', 'Tremble B 74 4/4', 'Send Me B 66 4/4']);
    for (const s of songs) { expect(s.pads.length).toBe(PADS); expect(s.kit).toBe('rig'); expect(s.pageNames).toEqual(['Cajon', 'Kick']); }
    // eighth-note click subdivisions on the 4/4 songs only
    expect(songs.map(s => s.click.sub)).toEqual(['8', '8', '8', '8', 'off', 'off', '8', '8']);
    // the two 6/8 songs count their tempo in quarter notes, and use the 6/8 patterns
    expect(songs.filter(s => s.tempoCount === 'quarter').map(s => s.name)).toEqual(['Great Are You Lord', 'I Surrender']);
    expect(pulseBpm(songs[4].bpm, songs[4].ts, songs[4].tempoCount)).toBeCloseTo(49.333, 3);
    expect(pulseBpm(songs[5].bpm, songs[5].ts, songs[5].tempoCount)).toBeCloseTo(51, 6);
    expect(songs[4].pads[0].patternId).toBe('rig68-shaker'); expect(songs[0].pads[0].mode).toBe('loop');
    // again: nothing new. Deleted: stays deleted, also across a save and load
    expect(applySeeds(state)).toBeNull();
    state.sets = state.sets.filter(s => s.id !== set.id); state.songs = state.songs.filter(s => !set.songIds.includes(s.id));
    const back = normalizeState(JSON.parse(JSON.stringify(state)));
    expect(back.seeded).toEqual(SEEDS.map(s => s.id));
    expect(defaultState().songs[0].click.sub).toBe('8');
    expect(applySeeds(back)).toBeNull(); expect(back.sets.length).toBe(1); expect(back.songs.length).toBe(1);
  });
  it('songs saved before the defaults changed get eighth-note click, cajon in group B and pad colors, once', () => {
    const state = defaultState(), set = applySeeds(state)!;
    // put the set back the way the earlier version saved it
    for (const s of state.songs) {
      s.click = { ...s.click, sub: 'off' };
      s.pads = s.pads.map((p, i) => { const { color: _c, ...old } = p; return i >= 8 && i <= 13 ? { ...old, group: 'C' as const } : old; });
    }
    const mine = state.songs[0], six = state.songs.find(s => s.name === 'Great Are You Lord')!, four = state.songs.find(s => s.name === 'Tremble')!;
    mine.pads[4] = { ...mine.pads[4], color: 'plum' };                       // a color chosen by hand
    const saved = normalizeState(JSON.parse(JSON.stringify(state)));
    expect(applyPatches(saved)).toBe(true);
    const get = (id: string) => saved.songs.find(s => s.id === id)!;
    expect(get(four.id).click.sub).toBe('8'); expect(get(mine.id).click.sub).toBe('8'); expect(get(six.id).click.sub).toBe('off');
    for (const s of saved.songs) {
      expect(s.pads.slice(8, 14).map(p => p.group).join(''), s.name).toBe('BBBBBB');
      expect(s.pads[14].group).toBe('C'); expect(s.pads.slice(24, 30).every(p => p.group === 'C')).toBe(true);
    }
    expect(get(four.id).pads).toEqual(rigPads()); expect(get(six.id).pads).toEqual(rigPads({ num: 6, den: 8 }));
    expect(get(mine.id).pads[4].color).toBe('plum');                         // kept
    // once only: a later choice is not undone
    get(four.id).click = { ...get(four.id).click, sub: 'off' };
    get(four.id).pads[8] = { ...get(four.id).pads[8], group: 'C' }; delete get(four.id).pads[0].color;
    const again = normalizeState(JSON.parse(JSON.stringify(saved)));
    expect(applyPatches(again)).toBe(false);
    const t = again.songs.find(s => s.id === four.id)!;
    expect([t.click.sub, t.pads[8].group, t.pads[0].color]).toEqual(['off', 'C', undefined]);
    expect(set.songIds.length).toBe(8);
  });
});
