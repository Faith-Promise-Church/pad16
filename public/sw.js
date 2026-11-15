// Keeps Pad16 playable offline once it has been opened online.
//   Built assets (hashed names): served from the cache, fetched once.
//   Kit audio: served from the cache at once, and refreshed in the background when online. On stage nothing waits
//     on a slow network, and a sample replaced under the same file name is picked up by the launch after next.
//   The page and the kit index: network first, but only for 3 seconds, then the cached copy.
// Only caches named 'pad16-app-*' are ever cleaned up here, so the cache of the first version ('pad16-v1') is left alone.
const CACHE = 'pad16-app-v4';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'kits/index.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  // carry audio that an older cache already holds, so an update never costs the offline pads
  e.waitUntil((async () => {
    const keys = await caches.keys(), fresh = await caches.open(CACHE);
    for (const k of keys.filter(k => k.startsWith('pad16-app-') && k !== CACHE)) {
      const old = await caches.open(k);
      for (const req of await old.keys()) {
        if (new URL(req.url).pathname.includes('/kits/') && !(await fresh.match(req))) { const res = await old.match(req); if (res) await fresh.put(req, res); }
      }
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

const store = (req, res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return;
  const rel = url.pathname.slice(scope.length);

  if (rel.startsWith('assets/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => store(req, res))));
    return;
  }
  if (rel.startsWith('kits/') && !rel.endsWith('index.json')) {
    e.respondWith(caches.match(req).then(hit => {
      // 'no-cache' makes this a cheap conditional request when the file has not changed
      const refresh = fetch(req.url, { cache: 'no-cache' }).then(res => store(req, res)).catch(() => null);
      if (hit) { e.waitUntil(refresh); return hit; }
      return refresh.then(res => res || Response.error());
    }));
    return;
  }
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then(res => store(req, res));
    if (!cached) return net.catch(async () => (req.mode === 'navigate' ? (await caches.match('index.html')) || Response.error() : Response.error()));
    const slow = new Promise(r => setTimeout(() => r(null), 3000));
    return (await Promise.race([net.catch(() => null), slow])) || cached;
  })());
});
