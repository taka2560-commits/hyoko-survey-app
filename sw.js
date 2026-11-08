const CACHE_NAME = 'osr-elevation-cache-v6';
const urlsToCache = [
  './',
  './index.html',
  './hyoko-core.js',
  './manifest.json',
  './icon.png',
  './henjo.html',
  './henjo-core.js',
  './henjo_haichi.jpg',
  './henjo_haichi.pdf',
  './hyoko_haichi.pdf'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
