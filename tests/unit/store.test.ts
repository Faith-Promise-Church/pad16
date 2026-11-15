import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openKV, memoryKV } from '../../src/store/db';
import { loadState, STATE_KEY, audioKey } from '../../src/store/migrate';
import { normalizeState, defaultState } from '../../src/store/model';

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
    expect(migrated).toBe(false); expect(state.songs.length).toBe(1); expect(state.patterns.length).toBe(21);
    expect(state.songs[0].pads[0]).toMatchObject({ name: 'Shaker', mode: 'loop' });      // a fresh install gets the default layout
    const mem = await loadState(memoryKV());
    expect(mem.state.songs[0].pads.length).toBe(16);
  });
  it('repairs partial or damaged saves', () => {
    expect(normalizeState(null).songs.length).toBe(1);
    const s = normalizeState({ songs: [{ name: 'X', pads: [{ name: 'only one' }], sub: { on: true } }], settings: { theme: 'light' } });
    expect(s.songs[0].pads.length).toBe(16); expect(s.songs[0].pads[0].name).toBe('only one'); expect(s.songs[0].pads[5].src).toEqual({ t: 'builtin', i: 5 });
    expect(s.songs[0].sub.on).toBe(true); expect(s.songs[0].sub.params.wave).toBe('sine'); expect(s.settings.theme).toBe('light');
    expect(s.settings.midi.clockOut).toBe(true); expect(s.sets[0].songIds).toEqual([s.songs[0].id]);
    expect(defaultState().settings.midi.startStop).toBe(false);
  });
});
