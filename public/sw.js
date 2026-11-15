// Keeps Pad16 playable offline once it has been opened online.
// App files: network first, cached copy when offline. Built assets, kit audio and fonts: cached after first load.
// Only caches named 'pad16-app-*' are ever cleaned up here, so the cache of the first version ('pad16-v1') is left alone.
const CACHE = 'pad16-app-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'kits/index.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pad16-app-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return;
  const rel = url.pathname.slice(scope.length);
  const immutable = rel.startsWith('assets/') || (rel.startsWith('kits/') && !rel.endsWith('index.json'));
  if (immutable) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.open(CACHE).then(c => c.match(req).then(hit => hit || c.match('index.html')))));
});
