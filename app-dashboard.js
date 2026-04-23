// ==========================================
// 0. FIREBASE INIT & GLOBAL VARIABLES
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAioaDxAEh3Cd-8Bvad9RgWXoOzozGeE_s",
  authDomain: "pallicalc-eabdc.firebaseapp.com",
  projectId: "pallicalc-eabdc",
  storageBucket: "pallicalc-eabdc.firebasestorage.app",
  messagingSenderId: "347532270864",
  appId: "1:347532270864:web:bfe5bd1b92ccec22dc5995",
  measurementId: "G-6G9C984F8E"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

let isVipUser = false;

// ==========================================
// 1. APP LOAD & BULLETPROOF LOGIN DETECTION
// ==========================================
window.addEventListener('load', () => {
    secureOfflineStorage();

    // SCENARIO A: Instant Offline Check
    if (localStorage.getItem('palliCalcLoginPassword')) {
        unlockScreen();
    }

    // SCENARIO B: Online Firebase Check (Catches index.html logins)
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // 1. Drop the lock screen immediately
                unlockScreen();

                // 2. Fix the Suitcase if index.html forgot to pack it
                if (!localStorage.getItem('palliCalcLoginPassword')) {
                    localStorage.setItem('palliCalcLoginPassword', 'firebase-token');
                }

                // 3. Update the UI to say Welcome safely
                let displayName = user.email ? user.email.split('@')[0] : 'Doctor';
                
                try {
                    if (firebase.functions) {
                        const getStatus = firebase.functions().httpsCallable('getUserStatus');
                        const result = await getStatus();
                        if (result && result.data) {
                            if (result.data.customRatios) {
                                localStorage.setItem('palliCalc_customRatios', JSON.stringify(result.data.customRatios));
                                isVipUser = true;
                            }
                            if (result.data.username) displayName = result.data.username;
                        }
                    }
                } catch (e) {
                    if (localStorage.getItem('palliCalc_customRatios')) isVipUser = true;
                }

                updateUI(displayName);
            } else {
                // User is NOT logged in. Show the login button.
                if (!localStorage.getItem('palliCalcLoginPassword')) {
                    const overlay = document.getElementById('locked-overlay');
                    const dashboard = document.getElementById('dashboard');
                    const userInfo = document.getElementById('user-info');
                    
                    if (overlay) overlay.style.display = 'flex';
                    if (dashboard) dashboard.style.display = 'none';
                    if (userInfo) userInfo.innerHTML = '<button id="login-btn" class="login-btn" onclick="window.location.href=\'index.html\'">🔐 Login</button>';
                }
            }
        });
    }
});

// ==========================================
// 2. UI & LOGOUT HELPERS
// ==========================================
function unlockScreen() {
    const overlay = document.getElementById('locked-overlay');
    const dashboard = document.getElementById('dashboard');
    if (overlay) overlay.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => { setTimeout(startVisibleOfflineDownload, 1000); })
            .catch((err) => console.log('SW Fail:', err));
    }

    detectBrowserAndShowInstructions();
}

function updateUI(displayName) {
    const userInfo = document.getElementById('user-info');
    const vipBadge = document.getElementById('user-tier-badge');
    const vipLock = document.getElementById('vip-lock-opioid');
    const toolsSection = document.getElementById('tools-section');

    let welcomeText = `Welcome, ${displayName}`;
    if (isVipUser) welcomeText += ' PRO';

    if (userInfo) {
        userInfo.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">
                <span class="welcome-text">${welcomeText}</span>
                <button onclick="logout()" style="width: 100%; padding: 6px 12px; font-size: 13px; cursor:pointer;">
                    <i class="bi bi-box-arrow-right"></i> Logout
                </button>
            </div>`;
    }

    if (toolsSection) {
        toolsSection.classList.add('visible');
        toolsSection.style.display = 'grid'; 
    }
    if (vipBadge) vipBadge.style.display = isVipUser ? 'inline' : 'none';
    if (vipLock) vipLock.style.display = isVipUser ? 'inline-block' : 'none';
}

function logout() {
    if (typeof firebase !== 'undefined' && firebase.auth) firebase.auth().signOut();
    localStorage.removeItem('palliCalcLoginPassword');
    localStorage.removeItem('palliCalc_customRatios');
    window.location.href = 'index.html';
}

// ==========================================
// 3. ROBUST UPDATE LOGIC
// ==========================================
const updateBtn = document.getElementById('update-btn');
if (updateBtn) {
    updateBtn.addEventListener('click', async () => {
        if (!navigator.onLine) { alert("You are offline. Cannot update."); return; }
        if (!confirm("This will clear the cache and download the latest version. Continue?")) return;

        updateBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Updating...';
        updateBtn.disabled = true;

        try {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) await registration.unregister();
            }
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('assets_downloaded_')) localStorage.removeItem(key);
            });
            window.location.reload(true);
        } catch (error) {
            alert("Update failed. Please try again.");
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

    const show = (id) => { const el = document.getElementById(id); if(el) el.style.display = 'block'; }

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

// ==========================================
// 4. GLOBAL PWA PRE-FETCH (SILENT HEARTBEAT)
// ==========================================
function startGlobalRatioSync() {
    if (!navigator.onLine || typeof firebase === 'undefined' || !firebase.apps.length) return;
    const user = firebase.auth().currentUser;
    if (!user) return; 

    const uid = user.uid;
    const db = firebase.firestore();

    db.collection("users").doc(uid).get().then(snap => {
        if (!snap.exists) return;
        const profile = snap.data();

        if (profile.role === "institutionUser" && profile.institutionId) {
            const instId = profile.institutionId;
            localStorage.setItem('palliCalc_currentInstId', instId);

            db.collection("benzoRatios").doc(instId).get().then(doc => {
                if (doc.exists) localStorage.setItem('palliCalc_customRatios_benzo', JSON.stringify(doc.data()));
            }).catch(e => console.warn(e));

            db.collection("opioidRatios").doc(instId).get().then(doc => {
                if (doc.exists) {
                    localStorage.setItem('palliCalc_customRatios', JSON.stringify(doc.data()));
                    localStorage.setItem('palliCalc_customRatios_opioid', JSON.stringify(doc.data()));
                }
            }).catch(e => console.warn(e));

            db.collection("institutions").doc(instId).get().then(doc => {
                if (doc.exists) {
                    const instData = doc.data();
                    localStorage.setItem('cached_inst_' + instId, JSON.stringify(instData));
                    localStorage.setItem('institutionSettings', JSON.stringify({
                        name: instData.headerName || instData.name,
                        contact: instData.headerContact || instData.contact,
                        logos: instData.headerLogos || (instData.logo ? [instData.logo] : []),
                        logo: instData.logo
                    }));
                    localStorage.setItem('palliCalc_institutionName', instData.headerName || instData.name || "Institution");
                }
            }).catch(e => console.warn(e));
        }
    }).catch(err => console.error(err));
}

function triggerSync() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
        if (firebase.auth().currentUser) {
            startGlobalRatioSync();
        } else {
            const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                if (user && navigator.onLine) {
                    startGlobalRatioSync();
                    unsubscribe(); 
                }
            });
        }
    }
}

window.addEventListener('load', () => setTimeout(triggerSync, 2000));
window.addEventListener('online', triggerSync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) triggerSync(); });

// ==========================================
// 5. VISIBLE OFFLINE ASSET DOWNLOADER
// ==========================================
async function startVisibleOfflineDownload() {
    const ASSET_CACHE_NAME = 'pallicalc-smart-v51'; 
    const downloadFlag = `assets_downloaded_${ASSET_CACHE_NAME}`;
    if (localStorage.getItem(downloadFlag) === 'true') return; 

    const container = document.getElementById('offline-progress-container');
    const progressBar = document.getElementById('offline-progress-bar');
    const progressText = document.getElementById('offline-progress-text');
    const progressPercent = document.getElementById('offline-progress-percent');

    if (!container || !navigator.onLine) return;

    container.style.display = 'block';

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
      './education/seizure/ch.html', './education/seizure/10mins.png', './education/seizure/seizure.png', './education/seizure/sideway.png',
      './education/seizure/Xmouth.png', './education/subcutaneous/eng.html', './education/subcutaneous/bm.html',
      './education/subcutaneous/ch.html', './education/subcutaneous/1.jpg', './education/subcutaneous/2.jpg', './education/subcutaneous/3.jpg',
      './education/td-fentanyl/eng.html', './education/td-fentanyl/bm.html', './education/td-fentanyl/ch.html',
      './education/td-fentanyl/1.jpg', './education/td-fentanyl/2.jpg', './research.html', './diagnostic/ohat.html', './diagnostic/cods.html', './diagnostic/sxi.html', './generate.html', './js/html5-qrcode.min.js'
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

// ==========================================
// 6. STORAGE ARMOR
// ==========================================
async function secureOfflineStorage() {
    if (navigator.storage && navigator.storage.persist) {
        try {
            const isPersisted = await navigator.storage.persist();
            if (isPersisted) {
                console.log("🛡️ VIP Storage Granted: Apple will not silently delete PalliCalc.");
            }
        } catch (error) {
            console.error("Storage persist request failed:", error);
        }
    }
}
