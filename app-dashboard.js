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

let currentUser = null;
let isVipUser = false;

// ==========================================
// 1. APP LOAD & LOGIN DETECTION
// ==========================================
window.addEventListener('load', () => {
    // 👉 Request Apple VIP Storage Armor immediately
    secureOfflineStorage();

    // HELPER: Unlocks the dashboard and starts the SW Engine
    window.unlockDashboardAndStart = function() {
        const overlay = document.getElementById('locked-overlay');
        const dashboard = document.getElementById('dashboard');
        if (overlay) overlay.style.display = 'none';
        if (dashboard) dashboard.style.display = 'block';

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then((reg) => {
                    console.log('✅ Service Worker Registered.', reg.scope);
                    setTimeout(startVisibleOfflineDownload, 1000);
                })
                .catch((err) => console.log('❌ SW Fail:', err));
        }

        detectBrowserAndShowInstructions();

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
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => { if(offlineMsg) offlineMsg.remove(); }, 5000);
        }
    };

    // 1. INSTANT OFFLINE CHECK (Checks local suitcase)
    if (localStorage.getItem('palliCalcLoginPassword')) {
        window.unlockDashboardAndStart();
    }

    // 2. 🔥 FIREBASE ONLINE CHECK (Detects login from index.html & updates UI) 🔥
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            checkAuthState(user);
        });
    }
});

// ==========================================
// 2. FIREBASE AUTH STATE & UI LOGIC
// ==========================================
async function checkAuthState(user) {
    currentUser = user;
    const userInfo = document.getElementById('user-info');

    if (user) {
        if (userInfo) userInfo.innerHTML = '<span style="font-size:13px; color:#475569">Verifying account...</span>';

        try {
            const getStatus = firebase.functions().httpsCallable('getUserStatus');
            const result = await getStatus();
            const statusData = result.data;

            if (statusData.isSuspended) {
                handleSuspension(statusData, statusData.institutionName || "your institution");
                return;
            }

            isVipUser = statusData.isVip;
            if (statusData.customRatios) {
                localStorage.setItem('palliCalc_customRatios', JSON.stringify(statusData.customRatios));
            }

            updateUIForLogin(statusData, user.email, false);
            window.unlockDashboardAndStart(); // Unlock everything!

        } catch(e) {
            console.warn('Network Error: Relying on local Suitcase.');
            isVipUser = !!localStorage.getItem('palliCalc_customRatios');
            updateUIForLogin({}, user.email, false);
            window.unlockDashboardAndStart(); 
        }
    } else {
        if (userInfo) {
            userInfo.innerHTML = '<button id="login-btn" class="login-btn" onclick="window.location.href=\'index.html\'">🔐 Login</button>';
        }
    }
}

function updateUIForLogin(userData, email, isSuspended) {
    const userInfo = document.getElementById('user-info');
    const vipBadge = document.getElementById('user-tier-badge');
    const vipLock = document.getElementById('vip-lock-opioid');
    const toolsSection = document.getElementById('tools-section');

    let displayName = userData.username || email.split('@')[0];
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

    if (!isSuspended) {
        if (toolsSection) {
            toolsSection.classList.add('visible');
            toolsSection.style.display = 'grid'; 
        }
        if (vipBadge) vipBadge.style.display = isVipUser ? 'inline' : 'none';
        if (vipLock) vipLock.style.display = isVipUser ? 'inline-block' : 'none';
    }
}

function handleSuspension(userData, instName) {
    localStorage.removeItem('palliCalc_customRatios');
    updateUIForLogin(userData, currentUser.email, true); 
    const toolsSection = document.getElementById('tools-section');
    if (toolsSection) {
        toolsSection.innerHTML = `
            <div style="border: 1px solid #e2e8f0; background: #fffafa; padding: 2rem; text-align: center; border-radius: 12px; margin: 20px auto;">
                <h3 style="color: #1e293b;">Service Temporarily Paused</h3>
                <p style="color: #475569;">Premium features for <strong>${instName}</strong> are unavailable.</p>
            </div>`;
        toolsSection.classList.add('visible');
        toolsSection.style.display = 'block'; 
    }
}

// ==========================================
// 3. LOGOUT SYSTEM
// ==========================================
function logout() {
    if (typeof firebase !== 'undefined' && firebase.auth) firebase.auth().signOut();
    localStorage.removeItem('palliCalcLoginPassword');
    localStorage.removeItem('palliCalc_customRatios');
    window.location.href = 'index.html';
}

// ==========================================
// 4. ROBUST UPDATE LOGIC
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
            console.error("Update failed:", error);
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
// 5. GLOBAL PWA PRE-FETCH (SILENT HEARTBEAT)
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
// 6. VISIBLE OFFLINE ASSET DOWNLOADER
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
      './patient-education.js', './
