/* 每次更新 index.html、mp3 或字體，請把版本號加一，iPad 才會取得新版本 */
const CACHE = 'rcgs-11-20-v4';
const FILES = [
 './index.html', './manifest.webmanifest',
 './icon-180.png', './icon-192.png', './icon-512.png',
 '../maths_thin_v2.ttf',
 '../audio/1.mp3', '../audio/2.mp3', '../audio/3.mp3', '../audio/4.mp3', '../audio/5.mp3',
 '../audio/6.mp3', '../audio/7.mp3', '../audio/8.mp3', '../audio/9.mp3', '../audio/10.mp3'
];
self.addEventListener('install', e => {
 e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
 e.waitUntil(
   caches.keys()
     .then(keys => Promise.all(keys.filter(k => k.startsWith('rcgs-11-20-') && k !== CACHE).map(k => caches.delete(k))))
     .then(() => self.clients.claim())
 );
});

self.addEventListener('fetch', e => {
 const req = e.request;
 if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

 /* 頁面：先試網絡（取得最新版），離線時用快取 */
 if (req.mode === 'navigate') {
   e.respondWith(
     fetch(req).then(res => {
       const copy = res.clone();
       caches.open(CACHE).then(c => c.put('./index.html', copy));
       return res;
     }).catch(() => caches.match('./index.html'))
   );
   return;
 }

 /* 聲音、字體、圖示：先用快取，沒有才下載 */
 e.respondWith(
   caches.match(req).then(hit => hit || fetch(req).then(res => {
     if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
     return res;
   }))
 );
});
