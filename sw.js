const CACHE_NAME = 'pallicalc-smart-v37'; // Bumped to v37 to force clean update

// ==========================================
// 1. CRITICAL APP SHELL (Must load for app to start)
// ==========================================
const CRITICAL_FILES = [
  './app.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './kkm-logo.png', 
  './pc-logo.png',
  './style.css',       
  './app-dashboard.js', 
  './js/ga-tracking.js'
];

// ==========================================
// 3. EXCLUSION LIST (Never Cache These)
// ==========================================
const DO_NOT_CACHE = [
  'index.html',
  'register.html',
  'forgot-password.html',
  'admin.html',
  'Admin.html',       
  'admin.js',         
  'admin-style.css',  
  '/Admin/',          
  '/'
];

// --- HELPER: CLOUDFLARE CLEAN FETCH (Kept intact) ---
async function fetchClean(url) {
  if (typeof url === 'string' && url.endsWith('.html')) {
    try {
      const cleanUrl = url.slice(0, -5);
      const cleanResponse = await fetch(cleanUrl);
      if (cleanResponse.ok) return cleanResponse;
    } catch (e) { /* Ignore */ }
  }
  return fetch(url);
}

// ==========================================
// INSTALL EVENT
// ==========================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('🚀 [SW] Installing Version:', CACHE_NAME);

      for (const file of CRITICAL_FILES) {
        try {
          const response = await fetchClean(file);
          if (!response.ok) throw new Error(`Status ${response.status}`);
          await cache.put(file, response);
        } catch (e) {
          console.error(`❌ FATAL: ${file} failed.`);
        }
      }

      console.log('🎉 Install Complete!');
    })
  );
  self.skipWaiting();
});

// ==========================================
// ACTIVATE EVENT 
// ==========================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => Promise.all(keyList.map((key) => {
      if (key !== CACHE_NAME) return caches.delete(key);
    })))
  );
  self.clients.claim();
});

// ==========================================
// FETCH EVENT (Redirect logic completely removed)
// ==========================================
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('googleapis') || event.request.url.includes('firebase')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const url = new URL(event.request.url);

      // 1. EXCLUSION CHECK
      const isExcluded = DO_NOT_CACHE.some(x => url.pathname.endsWith(x)) || url.pathname.includes('/Admin/') || url.pathname.includes('/admin/');

      if (isExcluded) {
        try {
          return await fetch(event.request, { redirect: 'manual' });
        } catch (error) {
          // If offline and requesting root/index, serve cached app.html instead
          if (url.pathname === '/' || url.pathname.endsWith('index.html') || url.pathname.endsWith('index')) {
            const offlineApp = await cache.match('./app.html');
            if (offlineApp) return offlineApp;
          }
          // Safely fails for other excluded files (like admin pages)
          return new Response('', { status: 503, statusText: 'Offline' });
        }
      }

      // 2. NETWORK FIRST (For HTML Pages & Logic)
      if (event.request.mode === 'navigate' || event.request.destination === 'document' || url.pathname.match(/\.(html|js|json)$/i)) {
        try {
          const networkResponse = await fetchClean(event.request.url);
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }
        } catch (error) {
          console.log('Using Offline Cache for:', url.pathname);
        }

        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;

        // Redirect completely removed. Safely fails if offline.
        return new Response('', { status: 503, statusText: 'Offline' });
      }

      // 3. CACHE FIRST (For Static Assets: Images, CSS, Fonts, PDFs)
      const cachedAsset = await cache.match(event.request);
      if (cachedAsset) return cachedAsset;

      try {
        const networkAsset = await fetchClean(event.request.url);
        if (networkAsset.ok) {
          cache.put(event.request, networkAsset.clone());
        }
        return networkAsset;
      } catch (error) {
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
