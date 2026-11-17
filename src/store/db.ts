// IndexedDB storage, best effort. Same database and store the first version used: 'pad16', version 1, store 'kv'.
// The version is not bumped on purpose: the app on main opens version 1, and a higher version would lock it out
// while both builds are served from the same site. New data lives under 'v2:' keys beside the old s0..s15 and a0..a15.
export interface KV {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, val: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export function openKV(factory: IDBFactory | undefined = (globalThis as any).indexedDB): Promise<KV> {
  return new Promise(res => {
    const mem = memoryKV();
    if (!factory) return res(mem);
    try {
      const r = factory.open('pad16', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
      r.onerror = () => res(mem);
      r.onblocked = () => res(mem);
      r.onsuccess = () => {
        const db = r.result;
        const tx = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest, fallback: T) => new Promise<T>(ok => {
          try { const q = f(db.transaction('kv', mode).objectStore('kv')); q.onsuccess = () => ok(q.result as T); q.onerror = () => ok(fallback); }
          catch { ok(fallback); }
        });
        res({
          get: k => tx('readonly', s => s.get(k), undefined as any),
          put: (k, v) => tx('readwrite', s => s.put(v, k), undefined).then(() => undefined),
          del: k => tx('readwrite', s => s.delete(k), undefined).then(() => undefined),
          keys: () => tx<IDBValidKey[]>('readonly', s => s.getAllKeys(), []).then(a => a.map(String)),
        });
      };
    } catch { res(mem); }
  });
}
export function memoryKV(): KV {
  const m = new Map<string, unknown>();
  return {
    get: async k => m.get(k) as any, put: async (k, v) => { m.set(k, v); }, del: async k => { m.delete(k); }, keys: async () => [...m.keys()],
  };
}
