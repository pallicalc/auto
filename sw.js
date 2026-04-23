const CACHE_NAME = 'pallicalc-smart-v53'; 

const CRITICAL_FILES = [
  './app.html',
  './manifest.json',
  './style.css',       
  './app-dashboard.js', 
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js'
];

// 1. INSTALL: Clean the slate
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CRITICAL_FILES);
    })
  );
});

// 2. ACTIVATE: Kill all old ghost caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. FETCH: The "Bypass" Logic
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip Firebase/Google internal calls
  if (url.origin.includes('googleapis') || url.origin.includes('firebase')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // 🔥 STRATEGY: Always try the Network first for Logic/HTML
      if (event.request.mode === 'navigate' || url.pathname.endsWith('.js') || url.pathname.endsWith('.html')) {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }
        } catch (e) {
          // Only if Network is DEAD, check cache
          const cachedResponse = await cache.match(event.request);
          if (cachedResponse) return cachedResponse;
        }
      }

      // Default: Check cache first, then network
      const asset = await cache.match(event.request);
      return asset || fetch(event.request);
    })()
  );
});
