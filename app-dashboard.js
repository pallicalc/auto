window.addEventListener('load', () => {
    const storedPassword = localStorage.getItem('palliCalcLoginPassword');
    
    if (storedPassword) {
        document.getElementById('locked-overlay').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then((reg) => console.log('✅ Service Worker Registered.', reg.scope))
                .catch((err) => console.log('❌ SW Fail:', err));
        }

        detectBrowserAndShowInstructions();

        // Offline Notification Logic
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
    }
});

function logout() {
    localStorage.removeItem('palliCalcLoginPassword');
    window.location.href = 'index.html';
}

const updateBtn = document.getElementById('update-btn');
if (updateBtn) {
    updateBtn.addEventListener('click', async () => {
        if (!confirm("This will clear the cache and re-download the latest version of all files. Continue?")) return;

        updateBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Updating...';
        updateBtn.disabled = true;

        try {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                }
            }
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            alert("Update complete! App will reload to download fresh files.");
            window.location.reload();
        } catch (error) {
            console.error(error);
            alert("Update failed. Please manually clear browser data.");
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