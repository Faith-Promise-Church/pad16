import { describe, it, expect } from 'vitest';
import { memoryKV } from '../../src/store/db';
import { defaultState, defaultSong } from '../../src/store/model';
import { audioKey } from '../../src/store/migrate';
import { exportSet, importSet } from '../../src/store/exportimport';

describe('set export and import', () => {
  it('round-trips songs, patterns and audio with fresh ids', async () => {
    const kv = memoryKV(), state = defaultState();
    const a = state.songs[0], b = defaultSong('Second');
    state.songs.push(b); state.sets[0].songIds.push(b.id);
    a.bpm = 132.5; a.ts = { num: 6, den: 8 }; a.key = 7; a.notes = 'capo 2';
    a.pads[3] = { ...a.pads[3], name: 'My loop', src: { t: 'audio', id: 'aud1' }, mode: 'loop', sourceBpm: 92, lengthBeats: 8, group: 'B' };
    a.pads[4] = { ...a.pads[4], mode: 'pattern', patternId: state.patterns[1].id };
    a.click.samples.accent = 'aud2';
    await kv.put(audioKey('aud1'), { name: 'loop.wav', data: new Uint8Array([9, 8, 7, 6, 5]).buffer });
    await kv.put(audioKey('aud2'), { name: 'tick.wav', data: new Uint8Array([1, 1, 2]).buffer });

    const zip = await exportSet(state, state.sets[0].id, kv);
    const kv2 = memoryKV(), state2 = defaultState();
    const setId = await importSet(zip, state2, kv2);
    const set = state2.sets.find(s => s.id === setId)!;
    expect(set.songIds.length).toBe(2);
    const a2 = state2.songs.find(s => s.id === set.songIds[0])!;
    expect(a2).toMatchObject({ name: 'My pads', bpm: 132.5, ts: { num: 6, den: 8 }, key: 7, notes: 'capo 2' });
    expect(a2.id).not.toBe(a.id);
    const ref = a2.pads[3].src as { t: 'audio'; id: string };
    expect(ref.t).toBe('audio'); expect(ref.id).not.toBe('aud1');
    expect(new Uint8Array((await kv2.get<any>(audioKey(ref.id))).data)).toEqual(new Uint8Array([9, 8, 7, 6, 5]));
    expect(a2.pads[3]).toMatchObject({ name: 'My loop', sourceBpm: 92, lengthBeats: 8, group: 'B' });
    expect(new Uint8Array((await kv2.get<any>(audioKey(a2.click.samples.accent!))).data)).toEqual(new Uint8Array([1, 1, 2]));
    expect(state2.patterns.some(p => p.id === a2.pads[4].patternId)).toBe(true);
    expect(state2.patterns.length).toBe(6);                   // identical starter pattern is not duplicated
  });
  it('keeps an edited pattern apart from the local one with the same id', async () => {
    const kv = memoryKV(), state = defaultState();
    state.songs[0].pads[0] = { ...state.songs[0].pads[0], mode: 'pattern', patternId: state.patterns[0].id };
    state.patterns[0].tracks[0].steps[1] = 3;
    const zip = await exportSet(state, state.sets[0].id, kv);
    const state2 = defaultState();
    const setId = await importSet(zip, state2, memoryKV());
    expect(state2.patterns.length).toBe(7);
    const song = state2.songs.find(s => s.id === state2.sets.find(x => x.id === setId)!.songIds[0])!;
    expect(song.pads[0].patternId).not.toBe(state.patterns[0].id);
    expect(state2.patterns.find(p => p.id === song.pads[0].patternId)!.tracks[0].steps[1]).toBe(3);
  });
  it('rejects files that are not sets', async () => {
    await expect(importSet(new Uint8Array([1, 2, 3]), defaultState(), memoryKV())).rejects.toThrow();
  });
});
