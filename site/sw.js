const STATIC_CACHE = 'pokemon-odyssey-static-v1';
const SPRITE_CACHE = 'pokemon-odyssey-sprites-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './pokedex.html',
  './pokemon.html',
  './moves.html',
  './move.html',
  './abilities.html',
  './ability.html',
  './items.html',
  './item.html',
  './type-chart.html',
  './team-builder.html',
  './assets/style.css',
  './assets/pwa.js',
  './assets/types.js',
  './assets/app.js',
  './assets/detail.js',
  './assets/abilities-list.js',
  './assets/ability.js',
  './assets/item.js',
  './assets/items-list.js',
  './assets/move.js',
  './assets/moves-list.js',
  './assets/team-builder.js',
  './assets/type-chart.js',
  './assets/PokemonOdysseyLogo.png',
  './assets/YggdrasilProjectFull.png',
  './assets/icons/icon.svg',
  './assets/icons/icon-maskable.svg',
  './data/meta.json',
  './data/abilities.json',
  './data/items.json',
  './data/moves.json',
  './data/pokedex.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== SPRITE_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // External URLs (e.g. PokemonShowdown sprites) — pass through, no caching
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // Images — cache-first (large files that rarely change)
  // Variant sprites go into their own cache; other images into the static cache
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(path)) {
    const cacheName = path.includes('/assets/variants/') ? SPRITE_CACHE : STATIC_CACHE;
    event.respondWith(
      caches.open(cacheName).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => new Response('', { status: 404 }));
        })
      )
    );
    return;
  }

  // HTML, CSS, JS, JSON — network-first so updates are picked up automatically;
  // fall back to cache when offline.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached ?? new Response('Offline', { status: 503 })))
  );
});
