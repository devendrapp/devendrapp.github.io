const CACHE_NAME = 'doorchitravani-cache'; // Update the version number
const urlsToCache = [
  '/',
  '/scripts/indexedDB.js',
  '/scripts/searchDatalist.js',
  '/scripts/staticAppFeatures.js',
  '/scripts/util.js',
  '/tracker.html',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', event => {
    if (event.request.cache === 'reload') {
        console.log('Bypassing cache for:', event.request.url);
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((cacheName) => cacheName !== CACHE_NAME).map((cacheName) => caches.delete(cacheName))
      );
    })
  );
});