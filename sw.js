/**
 * @file This service worker uses a "Network-First" strategy for HTML/JS
 * to ensure clinicians always have the latest calculation logic.
 */
const CACHE_NAME = 'pallicalc-v22-diagnostic-tools';

const CRITICAL_FILES = [
  // Core
  './',
  './index.html',
  './app.html',
  './app.js',
  './style.css',
  './manifest.json',
  './app-dashboard.js',
  './patient-education.js',

  // Calculators
  './calculators/Opioid.html',
  './calculators/js/opioid.js',
  './calculators/Benzodiazepine.html',
  './calculators/js/benzodiazepine.js',
  './calculators/Infusion-dose.html',
  './calculators/infusion-volume.html',
  './calculators/demo-opioid.html',

  // Diagnostic Tools (Root)
  './diagnostic-c.html',
  './diagnostic-p.html',

  // Diagnostic Tools (Folder)
  './diagnostic/akps.html',
  './diagnostic/flacc.html',
  './diagnostic/rass.html',
  './diagnostic/rdos.html',
  './diagnostic/rug-adl.html',
  './diagnostic/scan.html',
  './diagnostic/spict.html',
  './diagnostic/diagnostic.css',
  './diagnostic/diagnostic.js',

  // Education
  './patient-education.html',
  './healthcare-guidelines.html'
];

// Install Event - Best Effort Pre-caching
self.addEventListener('install', (event) => {
  // console.log('[SW] Installing New Version:', CACHE_NAME);
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // console.log('[SW] Pre-caching critical files...');
      
      // Loop through files one by one (Best Effort)
      for (const file of CRITICAL_FILES) {
        try {
          const response = await fetch(file);
          if (response.ok) {
            await cache.put(file, response);
            // console.log(`[SW] Cached: ${file}`);
          } else {
            console.warn(`[SW] Skipping missing file (404): ${file}`);
          }
        } catch (error) {
          console.warn(`[SW] Failed to fetch ${file}:`, error);
        }
      }
      // console.log('[SW] Pre-caching complete.');
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          // console.log('[SW] Removing old cache:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const request = event.request;

  // 1. ⛔ NETWORK ONLY (Strict Exclusion)
  // If URL contains: /admin/, admin.html, index.html, register.html, or forgot-password.html.
  if (
    url.pathname.includes('/admin/') || 
    url.pathname.includes('/Admin/') || 
    url.pathname.includes('admin.html') || 
    url.pathname.includes('Admin.html') || 
    url.pathname.includes('index.html') || 
    url.pathname.endsWith('/') || // Often index.html
    url.pathname.includes('register.html') || 
    url.pathname.includes('forgot-password.html')
  ) {
    // Network Only
    return; 
  }

  // 2. ⚡ CACHE FIRST (Static Assets)
  // If file type is: Images (.png, .jpg, .svg), Fonts, or PDFs.
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|pdf|woff|woff2|ttf|eot)$/i)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          // Check if we received a valid response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. 🌐 NETWORK FIRST (Logic & Updates)
  // If file type is: .html, .js, .css, or .json.
  // Also acting as a default fall-through for other app resources.
  if (
    url.pathname.match(/\.(html|js|css|json)$/i)
  ) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Success: Put the new file in the cache and return it.
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fail (Offline): Return the cached version.
          return caches.match(request);
        })
    );
    return;
  }

  // Default fallback (Network)
  event.respondWith(fetch(request));
});
