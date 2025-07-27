
//Below constants are duplicated in script.js. Maintain accordingly for a while
const CACHE_NAME = 'doorchitravani-cache'; // Update the version number
const urlsToCache = [
  '/',
  '/css/styles.css',
  '/scripts/script.js',
  '/tracker.html',
  '/index.html',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  'favicon.ico',
  
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const promises = urlsToCache.map((url) => {
        return cache.add(url).catch((error) => {
          console.error(`Failed to cache ${url}:`, error);
        });
      });
      return Promise.all(promises);
    })
  );
  self.skipWaiting(); // Take control of the page immediately
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request, { ignoreVary: true }).then(response => {
      return response || fetch(event.request).catch(() => {
        console.log('Fetch failed for:', event.request.url);
      });
    })
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
  self.clients.claim(); // Take control of all pages under its scope
});