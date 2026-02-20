window.addEventListener('load', () => {
    const storedPassword = localStorage.getItem('palliCalcLoginPassword');
    
    // 1. Check Login Status
    if (storedPassword) {
        // Unlock the UI
        const overlay = document.getElementById('locked-overlay');
        const dashboard = document.getElementById('dashboard');
        if (overlay) overlay.style.display = 'none';
        if (dashboard) dashboard.style.display = 'block';

        // ✅ CRITICAL RESTORATION: Start the Offline Engine (Service Worker)
        // This was missing in your 2nd version. Without this, the app won't work offline.
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then((reg) => console.log('✅ Service Worker Registered.', reg.scope))
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
