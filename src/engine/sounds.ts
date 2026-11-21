// Where the sound files come from. Every kit, pad set, click set and library file is asked for by one path, "kits/...".
//
//  1. Beside the app. The iOS app and a local build copy the private sounds repository in when they are built, so the files
//     are simply there. Nothing to set up on the device.
//  2. The private sounds repository on GitHub, read with an access key saved on this device. This is how the web version gets
//     sounds that are not published with it. A file fetched this way is kept in the browser's cache, so it downloads once
//     and plays offline afterwards.
//
// A folder is "beside the app" when the index that came with the app lists it. Anything else is asked of the repository.

export interface SoundsSetup { repo: string; ref: string; key: string }
export const DEFAULT_SOUNDS: SoundsSetup = { repo: 'Faith-Promise-Church/pad16-sounds', ref: 'main', key: '' };
export type SoundsState = 'bundled' | 'connected' | 'no-key' | 'bad-key' | 'unreachable';

const CACHE = 'pad16-sounds-v1';
let setup: SoundsSetup = { ...DEFAULT_SOUNDS };
let local = new Set<string>();            // top-level folders under kits/ that shipped with the app
let lastError: SoundsState | '' = '';

export const soundsSetup = (): SoundsSetup => ({ ...setup });
export function configureSounds(s: Partial<SoundsSetup>): void {
  setup = { repo: (s.repo || DEFAULT_SOUNDS.repo).trim(), ref: (s.ref || DEFAULT_SOUNDS.ref).trim(), key: (s.key || '').trim() };
  lastError = '';
}
export function setLocalFolders(dirs: Iterable<string>): void { local = new Set(dirs); }
export const hasKey = (): boolean => !!setup.key;
export const soundsError = (): SoundsState | '' => lastError;

const encode = (rel: string) => rel.split('/').map(encodeURIComponent).join('/');
const cacheKey = (rel: string) => `https://pad16-sounds.invalid/${encodeURIComponent(setup.repo)}/${encodeURIComponent(setup.ref)}/${encode(rel)}`;
const apiUrl = (rel: string) => `https://api.github.com/repos/${setup.repo}/contents/${encode(rel)}?ref=${encodeURIComponent(setup.ref)}`;
const folderOf = (rel: string) => rel.split('/')[1] || '';
const store = async (): Promise<Cache | null> => { try { return typeof caches === 'undefined' ? null : await caches.open(CACHE); } catch { return null; } };

/** A file that shipped with the app. A page of HTML in place of a missing file (a dev server does that) counts as missing. */
async function fromApp(rel: string, init?: RequestInit): Promise<Response | null> {
  try {
    const r = await fetch(encode(rel), init);
    return r.ok && !(r.headers.get('content-type') || '').includes('text/html') ? r : null;
  } catch { return null; }
}

/** A file from the private repository. Kept files are served first unless fresh is asked for (the index). */
async function fromRepo(rel: string, fresh: boolean): Promise<Response | null> {
  if (!setup.key) { lastError = 'no-key'; return null; }
  const c = await store(), key = cacheKey(rel);
  const kept = c ? await c.match(key).catch(() => undefined) : undefined;
  if (kept && !fresh) return kept;
  try {
    const r = await fetch(apiUrl(rel), { headers: { Authorization: `Bearer ${setup.key}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' }, cache: fresh ? 'no-cache' : 'default' });
    if (r.ok) {
      lastError = '';
      if (c) await c.put(key, r.clone()).catch(() => {});
      return r;
    }
    lastError = r.status === 401 || r.status === 403 || r.status === 404 ? 'bad-key' : 'unreachable';   // GitHub answers 404 for a private repo the key cannot see
  } catch { lastError = 'unreachable'; }
  return kept || null;                       // offline or refused: what was kept is better than nothing
}

/** Fetch one sound file by its path ("kits/Folder/File.wav"). Null when it cannot be had from anywhere. */
export async function soundFetch(rel: string, opts: { fresh?: boolean } = {}): Promise<Response | null> {
  if (local.has(folderOf(rel))) return (await fromApp(rel)) || fromRepo(rel, !!opts.fresh);
  return fromRepo(rel, !!opts.fresh);
}
/** The two indexes: the one that came with the app, and the repository's. Either can be missing. */
export async function soundIndexes(): Promise<{ app: any | null; repo: any | null }> {
  const a = await fromApp('kits/index.json', { cache: 'no-cache' });
  const app = a ? await a.json().catch(() => null) : null;
  let repo: any = null;
  if (setup.key) { const r = await fromRepo('kits/index.json', true); repo = r ? await r.json().catch(() => null) : null; }
  return { app, repo };
}
/** Is this file already on the device? Files beside the app always are in the iOS app; on the web the service worker decides. */
export async function soundKept(rel: string): Promise<boolean> {
  if (local.has(folderOf(rel))) return false;
  const c = await store();
  return !!(c && (await c.match(cacheKey(rel)).catch(() => undefined)));
}
/** Does this path come from the repository (and so need the access key)? */
export const isRemote = (rel: string): boolean => !local.has(folderOf(rel));
/** Forget every file fetched from the repository (the key was changed or removed). */
export async function forgetSounds(): Promise<void> { try { await caches.delete(CACHE); } catch { /* nothing kept */ } }
