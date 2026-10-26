// Offline-Betrieb der installierten App: Seite zuerst aus dem Netz (neue Versionen kommen sofort an), bei fehlender
// Verbindung aus dem Zwischenspeicher; Programmteile, Bilder und Klänge (Namen mit Prüfsumme, ändern sich nie) aus dem
// Zwischenspeicher, sonst aus dem Netz – was einmal geladen war, geht danach auch offline.
const CACHE = 'x4-sektorbau-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon-192.png', './icon-512.png']).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('x4-sektorbau-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return res; }).catch(() => caches.match('./').then((r) => r ?? Response.error())));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
