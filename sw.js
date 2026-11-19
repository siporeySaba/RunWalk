const CACHE = 'runwalk-v3';
const CLIP_CACHE = 'runwalk-clips-v1'; // הקלטות הקול – נשמרות גם בין עדכונים
const SHELL = ['./', './index.html', './style.css', './app.js', './clips.js', './gps.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== CLIP_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // הקלטות: קודם מהמטמון (הן לא משתנות)
  if (url.origin === location.origin && url.pathname.includes('/clips/')) {
    e.respondWith(caches.open(CLIP_CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }))));
    return;
  }
  // כל השאר: קודם רשת (כדי לקבל עדכונים), ואם אין רשת – מהמטמון
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && url.origin === location.origin) {
        const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
