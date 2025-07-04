self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('door-chitra-vani-cache').then((cache) => {
      return cache.addAll([
        '/',
        '/styles.css',
        '/script.js',
        '/index.html'
        // Add other essential files here
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});