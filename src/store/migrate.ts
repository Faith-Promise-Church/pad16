// First run of the new app: carry the old pads over. Old keys are read and left exactly as they were.
import { KV } from './db';
import { AppState, defaultState, normalizeState, uid } from './model';
import { PadMode } from '../engine/tags';

export const STATE_KEY = 'v2:state';
export const audioKey = (id: string) => 'v2:audio:' + id;
export interface StoredAudio { name: string; data: ArrayBuffer }

export async function loadState(kv: KV): Promise<{ state: AppState; migrated: boolean }> {
  const saved = await kv.get<AppState>(STATE_KEY);
  if (saved) return { state: normalizeState(saved), migrated: false };
  const state = defaultState();
  const song = state.songs[0];
  let migrated = false;
  for (let i = 0; i < 16; i++) {
    const s = await kv.get<any>('s' + i);
    if (!s) continue;
    migrated = true;
    const pad = song.pads[i];
    if (typeof s.volume === 'number') pad.volume = s.volume;
    if (typeof s.pitch === 'number') pad.pitch = s.pitch;
    if (['oneshot', 'hold', 'loop'].includes(s.mode)) pad.mode = s.mode as PadMode;
    // old loops ran free, so keep them unsynced until the player sets a tempo
    if (pad.mode === 'loop') pad.sync = 'off';
    if (s.custom) {
      const raw = await kv.get<ArrayBuffer>('a' + i);
      if (raw) {
        const id = uid();
        await kv.put(audioKey(id), { name: s.name || `Pad ${i + 1}`, data: raw } satisfies StoredAudio);
        pad.src = { t: 'audio', id };
      }
    }
    if (typeof s.name === 'string' && (s.custom || s.name)) pad.name = s.name;
  }
  const kit = await kv.get<string>('kit');
  if (typeof kit === 'string' && kit && kit !== '__custom') song.kit = kit;
  await kv.put(STATE_KEY, state);
  return { state, migrated };
}
