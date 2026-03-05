window.addEventListener('load', () => {
    const storedPassword = localStorage.getItem('palliCalcLoginPassword');
    
    // 1. Check Login Status
    if (storedPassword) {
        // Unlock the UI
        const overlay = document.getElementById('locked-overlay');
        const dashboard = document.getElementById('dashboard');
        if (overlay) overlay.style.display = 'none';
        if (dashboard) dashboard.style.display = 'block';

        // ✅ CRITICAL RESTORATION: Start the Offline Engine & Trigger Download
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then((reg) => {
                    console.log('✅ Service Worker Registered.', reg.scope);
                    // 👉 TRIGGER THE PROGRESS BAR HERE:
                    setTimeout(startVisibleOfflineDownload, 1000);
                })
                .catch((err) => console.log('❌ SW Fail:', err));
        }

        detectBrowserAndShowInstructions();

        // 2. Offline Notification Logic (If redirected from sw.js)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('offline_mode') === 'true') {
            const offlineMsg = document.createElement('div');
            offlineMsg.innerHTML = `
                <div style="position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); 
                            background: #333; color: white; padding: 12px 24px; border-radius: 50px; 
                            box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; font-size: 14px; 
                            display: flex; align-items: center; gap: 10px; min-width: 280px;">
                    <i class="bi bi-wifi-off" style="font-size: 18px; color: #ffca2c;"></i>
                    <div>
                        <strong>You are Offline</strong><br>
                        Redirected to offline dashboard.
                    </div>
                    <button onclick="this.parentElement.remove()" style="background:none; border:none; color:#aaa; margin-left:auto; font-size:18px; cursor:pointer;">&times;</button>
                </div>
            `;
            document.body.appendChild(offlineMsg);
            // Clean the URL so the message doesn't appear on refresh
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => { if(offlineMsg) offlineMsg.remove(); }, 5000);
        }
    }
});

function logout() {
    localStorage.removeItem('palliCalcLoginPassword');
    window.location.href = 'index.html';
}

// ✅ ROBUST UPDATE LOGIC (From Version 2)
const updateBtn = document.getElementById('update-btn');
if (updateBtn) {
    updateBtn.addEventListener('click', async () => {
        // 1. Check Connection First
        if (!navigator.onLine) {
            alert("You are offline. Cannot update.");
            return;
        }

        // 2. Confirm
        if (!confirm("This will clear the cache and download the latest version. Continue?")) {
            return;
        }

        // 3. Loading State
        updateBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Updating...';
        updateBtn.disabled = true;

        try {
            // 4. Hard Reset of Caches

            // Unregister Service Workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                }
            }

            // Delete All Caches
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }

            // 👉 NEW: Clear the download flags so the progress bar runs again!
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('assets_downloaded_')) {
                    localStorage.removeItem(key);
                }
            });

            // Force Reload (true forces fetch from server)
            window.location.reload(true);

        } catch (error) {
            console.error("Update failed:", error);
            alert("Update failed. Please try again or manually clear browser data.");
            updateBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Update';
            updateBtn.disabled = false;
        }
    });
}

function detectBrowserAndShowInstructions() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroid = /Android/.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const isInApp = /FBAN|FBAV|Instagram|WhatsApp|Line|wv/.test(ua);

    const show = (id) => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'block';
    }

    if (isStandalone) { show('msg-installed'); return; }
    if (isInApp) { show('msg-inapp'); return; }
    if (isIOS) {
        const isSafari = /Safari/.test(ua) && !/CriOS/.test(ua) && !/FxiOS/.test(ua);
        show(isSafari ? 'msg-ios-safari' : 'msg-ios-chrome');
        return;
    }
    if (isAndroid) {
        if (/SamsungBrowser/.test(ua)) show('msg-samsung');
        else if (/Firefox/.test(ua)) show('msg-firefox');
        else show('msg-android-chrome');
        return;
    }
    show('msg-desktop');
}

/* =========================================
   GLOBAL PWA PRE-FETCH (SILENT HEARTBEAT)
   ========================================= */
function startGlobalRatioSync() {
    // 1. Only run if online and Firebase is fully loaded
    if (!navigator.onLine || typeof firebase === 'undefined' || !firebase.apps.length) return;
    
    const user = firebase.auth().currentUser;
    if (!user) return; // Fails safely if Firebase is still loading the login state
    
    const uid = user.uid;

    const db = firebase.firestore();

    // 2. Check the user's role
    db.collection("users").doc(uid).get().then(snap => {
        if (!snap.exists) return;
        const profile = snap.data();
        
        // 3. Only sync for Institutional Users
        if (profile.role === "institutionUser" && profile.institutionId) {
            const instId = profile.institutionId;
            
            // 👉 ADDED: The Master Key so Education module knows who it is offline!
            localStorage.setItem('palliCalc_currentInstId', instId);
            
            console.log("🔄 Global Sync: Pre-fetching clinical ratios in background...");

            // Fetch & Save Benzodiazepine Rules
            db.collection("benzoRatios").doc(instId).get().then(doc => {
                if (doc.exists) {
                    localStorage.setItem('palliCalc_customRatios_benzo', JSON.stringify(doc.data()));
                }
            }).catch(e => console.warn("Global Sync (Benzo) failed:", e));

            // Fetch & Save Opioid Rules
            db.collection("opioidRatios").doc(instId).get().then(doc => {
                if (doc.exists) {
                    // 👉 FIXED: opioid.js looks for 'palliCalc_customRatios', NOT '_opioid' at the end!
                    localStorage.setItem('palliCalc_customRatios', JSON.stringify(doc.data()));
                    // (Keeping the old one just in case a cached version still looks for it)
                    localStorage.setItem('palliCalc_customRatios_opioid', JSON.stringify(doc.data()));
                }
            }).catch(e => console.warn("Global Sync (Opioid) failed:", e));

            
            // Fetch & Save Education Branding Data
            db.collection("institutions").doc(instId).get().then(doc => {
                if (doc.exists) {
                    const instData = doc.data();
                    // Saves it exactly how education.js expects it to be saved
                    localStorage.setItem('cached_inst_' + instId, JSON.stringify(instData));
                    
                    // Also updates the generic fallback settings
                    localStorage.setItem('institutionSettings', JSON.stringify({
                        name: instData.headerName || instData.name,
                        contact: instData.headerContact || instData.contact,
                        logos: instData.headerLogos || (instData.logo ? [instData.logo] : []),
                        logo: instData.logo
                    }));
                    
                    // 👉 THE MISSING KEY FOR CALCULATORS:
                    localStorage.setItem('palliCalc_institutionName', instData.headerName || instData.name || "Institution");
                    
                    console.log("✅ Global Sync: Education branding updated.");
                }
            }).catch(e => console.warn("Global Sync (Education) failed:", e));

                }
            
    }).catch(err => console.error("Global sync auth check failed:", err));
}

// --- TRIGGERS FOR THE SILENT HEARTBEAT ---

function triggerSync() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
        if (firebase.auth().currentUser) {
            // If already logged in, run immediately
            startGlobalRatioSync();
        } else {
            // Otherwise, wait for auth to finish
            const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                if (user && navigator.onLine) {
                    startGlobalRatioSync();
                    unsubscribe(); 
                }
            });
        }
    }
}

// 1. Run 2 seconds after load (Aggressively packs the Local Storage)
window.addEventListener('load', () => {
    setTimeout(triggerSync, 2000); 
});

// 2. Run silently if the doctor walks out of a dead zone (regains Wi-Fi)
window.addEventListener('online', triggerSync);

// 3. Run silently if the doctor unlocks their phone or switches back to the app
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
        triggerSync();
    }
});
/* =========================================
   VISIBLE OFFLINE ASSET DOWNLOADER
   ========================================= */
async function startVisibleOfflineDownload() {
    const ASSET_CACHE_NAME = 'pallicalc-smart-v37'; // Bumping to v37
    const downloadFlag = `assets_downloaded_${ASSET_CACHE_NAME}`;
    if (localStorage.getItem(downloadFlag) === 'true') return; // Already downloaded

    const container = document.getElementById('offline-progress-container');
    const progressBar = document.getElementById('offline-progress-bar');
    const progressText = document.getElementById('offline-progress-text');
    const progressPercent = document.getElementById('offline-progress-percent');

    if (!container || !navigator.onLine) return;
    
    container.style.display = 'block';

    // Copying your exact list of heavy files from your old sw.js
    const filesToDownload = [
      './patient-education.js', './all-calculators.html', './js/qr.min.js', './healthcare-guidelines.html',
      './patient-education.html', './calculators/Benzodiazepine.html', './calculators/demo-opioid.html',
      './calculators/Infusion-dose.html', './calculators/infusion-volume.html', './calculators/Opioid.html',
      './calculators/calculator.css', './calculators/js/benzodiazepine.js', './calculators/js/demo-opioid.js',
      './calculators/js/opioid.js', './guides/Benzodiazepines-conversion.html', './guides/infusion-dose.html',
      './guides/opioid-conversion.html', './guides/prn-calculation.html', './diagnostic.js', './diagnostic-c.html',
      './diagnostic-p.html', './diagnostic/distress/eng.html', './diagnostic/distress/bm.html', './diagnostic/distress/ch.html',
      './diagnostic/hads/eng.html', './diagnostic/hads/bm.html', './diagnostic/hads/ch.html', './diagnostic/ipos/eng.html',
      './diagnostic/ipos/bm.html', './diagnostic/ipos/ch.html', './diagnostic/akps.html', './diagnostic/flacc.html',
      './diagnostic/rass.html', './diagnostic/rdos.html', './diagnostic/rug-adl.html', './diagnostic/scan.html',
      './diagnostic/spict.html', './diagnostic/diagnostic.css', './diagnostic/diagnostic.js', './education/education.css',
      './education/education.js', './education/opioids/ch.html', './education/opioids/ch.pdf', './education/opioids/eng.html',
      './education/opioids/eng.pdf', './education/opioids/bm.html', './education/opioids/bm.pdf', './education/bleeding/eng.html',
      './education/bleeding/bm.html', './education/bleeding/ch.html', './education/bleeding/1.jpg', './education/bleeding/2.jpg',
      './education/breathlessness/eng.html', './education/breathlessness/bm.html', './education/breathlessness/ch.html',
      './education/breathlessness/1.jpg', './education/breathlessness/2.jpg', './education/breathlessness/3.jpg',
      './education/breathlessness/4.jpg', './education/breathlessness/5.jpg', './education/breathlessness/6.jpg',
      './education/breathlessness/7.jpg', './education/buccal/eng.html', './education/buccal/bm.html', './education/buccal/ch.html',
      './education/buccal/1.jpg', './education/buccal/2.jpg', './education/delirium/eng.html', './education/delirium/bm.html',
      './education/delirium/ch.html', './education/delirium/1.jpg', './education/delirium/2.jpg', './education/EOL/eng.html',
      './education/EOL/bm.html', './education/EOL/ch.html', './education/EOL/1a.jpg', './education/EOL/1b.jpg',
      './education/EOL/2a.jpg', './education/EOL/2b.jpg', './education/EOL/3a.jpg', './education/EOL/3b.jpg',
      './education/EOL/4a.jpg', './education/EOL/4b.jpg', './education/EOL/5a.jpg', './education/EOL/5b.jpg',
      './education/facing-EOL/eng.html', './education/facing-EOL/bm.html', './education/facing-EOL/ch.html',
      './education/mbo/eng.html', './education/mbo/bm.html', './education/mbo/ch.html', './education/pain/eng.html',
      './education/pain/bm.html', './education/pain/ch.html', './education/seizure/eng.html', './education/seizure/bm.html',
      './education/seizure/ch.html', './education/10mins.png', './education/seizure/seizure.png', './education/seizure/sideway.png',
      './education/seizure/Xmouth.png', './education/subcutaneous/eng.html', './education/subcutaneous/bm.html',
      './education/subcutaneous/ch.html', './education/1.jpg', './education/subcutaneous/2.jpg', './education/subcutaneous/3.jpg',
      './education/td-fentanyl/eng.html', './education/td-fentanyl/bm.html', './education/td-fentanyl/ch.html',
      './education/td-fentanyl/1.jpg', './education/td-fentanyl/2.jpg'
    ];

    try {
        const cache = await caches.open(ASSET_CACHE_NAME);
        let loadedCount = 0;
        const totalFiles = filesToDownload.length;

        for (const file of filesToDownload) {
            try {
                let fetchUrl = file.endsWith('.html') ? file.slice(0, -5) : file;
                const response = await fetch(fetchUrl);
                if (response.ok) await cache.put(file, response.clone());
            } catch (e) { /* skip safely */ }

            loadedCount++;
            const percent = Math.round((loadedCount / totalFiles) * 100);
            progressBar.style.width = percent + '%';
            progressPercent.innerText = percent + '%';
            
            // Give the iPad a tiny 50ms break to update the screen smoothly
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        localStorage.setItem(downloadFlag, 'true');
        progressText.innerText = '✅ Offline assets ready!';
        progressBar.style.backgroundColor = '#10b981'; 
        setTimeout(() => { container.style.display = 'none'; }, 4000);

    } catch (error) {
        progressText.innerText = '⚠️ Download paused.';
        progressBar.style.backgroundColor = '#f59e0b'; 
    }
}
