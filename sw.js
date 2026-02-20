const CACHE_NAME = 'pallicalc-smart-v24-final'; // Bumped to v24 to force update

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
  './app.js',
  './js/ga-tracking.js' // Added tracking script just in case
];

// ==========================================
// 2. SECONDARY FILES (Education, Calculators, PDFs)
// ==========================================
const SECONDARY_FILES = [
  // --- ROOT PAGES & SCRIPTS ---
  './app-dashboard.js',     
  './patient-education.js', 
  './all-calculators.html',
  './healthcare-guidelines.html',
  './patient-education.html',

  // --- CALCULATORS FOLDER ---
  './calculators/Benzodiazepine.html',
  './calculators/demo-opioid.html',
  './calculators/Infusion-dose.html',
  './calculators/infusion-volume.html',
  './calculators/Opioid.html',
  './calculators/calculator.css',

  // --- FUNCTIONS (JS LOGIC) ---
  './calculators/js/benzodiazepine.js',
  './calculators/js/demo-opioid.js',
  './calculators/js/opioid.js',

  // --- GUIDES FOLDER ---
  './guides/Benzodiazepines-conversion.html',
  './guides/infusion-dose.html',
  './guides/opioid-conversion.html',
  './guides/prn-calculation.html',

  // --- DIAGNOSTIC TOOLS (Added from your v2 list) ---
  './diagnostic-c.html',
  './diagnostic-p.html',
  './diagnostic/akps.html',
  './diagnostic/flacc.html',
  './diagnostic/rass.html',
  './diagnostic/rdos.html',
  './diagnostic/rug-adl.html',
  './diagnostic/scan.html',
  './diagnostic/spict.html',
  './diagnostic/diagnostic.css',
  './diagnostic/diagnostic.js',

  // --- EDUCATION ASSETS ---
  './education/education.css',
  './education/education.js',

  // --- EDUCATION: OPIOIDS (Includes PDFs) ---
  './education/opioids/ch.html',
  './education/opioids/ch.pdf',
  './education/opioids/eng.html',
  './education/opioids/eng.pdf',
  './education/opioids/bm.html',
  './education/opioids/bm.pdf',

  // --- EDUCATION: IMAGES & HTML ---
  // Bleeding
  './education/bleeding/eng.html', './education/bleeding/bm.html', './education/bleeding/ch.html', './education/bleeding/1.jpg', './education/bleeding/2.jpg',
  // Breathlessness
  './education/breathlessness/eng.html', './education/breathlessness/bm.html', './education/breathlessness/ch.html', './education/breathlessness/1.jpg', './education/breathlessness/2.jpg', './education/breathlessness/3.jpg', './education/breathlessness/4.jpg', './education/breathlessness/5.jpg', './education/breathlessness/6.jpg', './education/breathlessness/7.jpg',
  // Buccal
  './education/buccal/eng.html', './education/buccal/bm.html', './education/buccal/ch.html', './education/buccal/1.jpg', './education/buccal/2.jpg',
  // Delirium
  './education/delirium/eng.html', './education/delirium/bm.html', './education/delirium/ch.html', './education/delirium/1.jpg', './education/delirium/2.jpg',
  // EOL
  './education/EOL/eng.html', './education/EOL/bm.html', './education/EOL/ch.html', './education/EOL/1a.jpg', './education/EOL/1b.jpg', './education/EOL/2a.jpg', './education/EOL/2b.jpg', './education/EOL/3a.jpg', './education/EOL/3b.jpg', './education/EOL/4a.jpg', './education/EOL/4b.jpg', './education/EOL/5a.jpg', './education/EOL/5b.jpg',
  // Facing EOL
  './education/facing-EOL/eng.html', './education/facing-EOL/bm.html', './education/facing-EOL/ch.html',
  // MBO
  './education/mbo/eng.html', './education/mbo/bm.html', './education/mbo/ch.html',
  // Pain
  './education/pain/eng.html', './education/pain/bm.html', './education/pain/ch.html',
  // Seizure
  './education/seizure/eng.html', './education/seizure/bm.html', './education/seizure/ch.html', './education/10mins.png', './education/seizure/seizure.png', './education/seizure/sideway.png', './education/seizure/Xmouth.png',
  // Subcutaneous
  './education/subcutaneous/eng.html', './education/subcutaneous/bm.html', './education/subcutaneous/ch.html', './education/1.jpg', './education/subcutaneous/2.jpg', './education/subcutaneous/3.jpg',
  // TD Fentanyl
  './education/td-fentanyl/eng.html', './education/td-fentanyl/bm.html', './education/td-fentanyl/ch.html', './education/td-fentanyl/1.jpg', './education/td-fentanyl/2.jpg',

  // --- EXTERNAL ASSETS ---
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// ==========================================
// 3. EXCLUSION LIST (Never Cache These)
// ==========================================
const DO_NOT_CACHE = [
  'index.html',
  'register.html',
  'forgot-password.html',
  'admin.html',
  'Admin.html',       // Explicit exclude
  'admin.js',         // Explicit exclude
  'admin-style.css',  // Explicit exclude
  '/Admin/',          // Exclude Admin folder
  '/'
];

// --- HELPER: CLOUDFLARE CLEAN FETCH ---
// Helps load pages even if .html extension is missing
async function fetchClean(url) {
  if (url.endsWith('.html')) {
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
      console.log('🚀 [SW] V23 Installing...');

      // A. Critical Files (Must Succeed)
      for (const file of CRITICAL_FILES) {
        try {
          const response = await fetchClean(file);
          if (!response.ok) throw new Error(`Status ${response.status}`);
          await cache.put(file, response);
        } catch (e) {
          console.error(`❌ FATAL: ${file} failed.`);
        }
      }

      // B. Secondary Files (Best Effort - Don't fail install if one image is missing)
      const downloadPromises = SECONDARY_FILES.map(async (file) => {
        try {
          const response = await fetchClean(file);
          if (response.ok) await cache.put(file, response);
        } catch (e) {
          console.warn('⚠️ Skipped:', file);
        }
      });

      await Promise.allSettled(downloadPromises);
      console.log('🎉 V23 Ready!');
    })
  );
  self.skipWaiting();
});

// ==========================================
// ACTIVATE EVENT (Cleanup Old Caches)
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
// FETCH EVENT (The Traffic Cop)
// ==========================================
self.addEventListener('fetch', (event) => {
  // Ignore Google/Firebase API calls
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
          // If offline on an admin page, redirect to App Dashboard
          if (event.request.mode === 'navigate') {
             const appUrl = new URL('./app.html?offline_mode=true', self.location).href;
             return Response.redirect(appUrl, 302);
          }
          return null;
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
        
        // Offline Fallback for HTML
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;
        
        // If query param exists, return cached app shell
        if (url.searchParams.get('offline_mode')) return cache.match('./app.html');
        
        // Final Fallback: Redirect to Dashboard with offline flag
        const appUrl = new URL('./app.html?offline_mode=true', self.location).href;
        return Response.redirect(appUrl, 302);
      }

      // 3. CACHE FIRST (For Static Assets: Images, CSS, Fonts, PDFs)
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) return cachedResponse;

      try {
        const networkResponse = await fetchClean(event.request.url);
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        return null;
      }
    })()
  );
});