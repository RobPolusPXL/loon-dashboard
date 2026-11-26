// App-bestanden cachen zodat de app snel opent en offline start. Data komt uit Firestore (eigen offline cache).
const CACHE = 'loon-v6';
const BESTANDEN = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/loonfiche.js', 'js/timestatement.js', 'js/werk.js', 'firebase-config.js', 'manifest.webmanifest', 'icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BESTANDEN.map((b) => new Request(b, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Eigen bestanden: eerst netwerk (nieuwste versie), cache als je offline bent.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    const kopie = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, kopie));
    return r;
  }).catch(() => caches.match(e.request)));
});
