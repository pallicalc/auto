// ==========================================
// 1. SMART SERVICE WORKER REGISTRATION
// ==========================================
if ('serviceWorker' in navigator) {
    // Logic: Only register if NOT on the public pages.
    const path = window.location.pathname;
    const isPublicPage = path === '/' || 
                         path.endsWith('index.html') || 
                         path.endsWith('register.html') || 
                         path.endsWith('forgot-password.html');

    if (!isPublicPage) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => {
                    // console.log('✅ [App] Service Worker Registered');
                })
                .catch(err => {
                    console.warn('❌ [App] SW Registration Failed', err);
                });
        });
    }
}

// ==========================================
// 2. SMART FAVICON INJECTOR
// ==========================================
(function() {
    const version = '?v=2'; 

    const icons = [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' + version },
        { rel: 'mask-icon', href: '/favicon.svg' + version, color: '#5AAB8B' },
        { rel: 'apple-touch-icon', href: '/favicon.png' + version }
    ];

    icons.forEach(iconDef => {
        let existingLink = document.querySelector(`link[rel='${iconDef.rel}']`);
        if (existingLink) existingLink.remove();

        let link = document.createElement('link');
        link.rel = iconDef.rel;
        link.href = iconDef.href;
        if (iconDef.type) link.type = iconDef.type;
        if (iconDef.color) link.setAttribute('color', iconDef.color);
        document.head.appendChild(link);
    });
})();

// ==========================================
// 3. FIREBASE CONFIGURATION
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

let firebaseApp, auth, db, functions;
let currentUser = null;
let isVipUser = false;
let counterTimeout;

window.trackEvent = window.trackEvent || function() {};

// ==========================================
// 4. INITIALIZATION
// ==========================================
window.addEventListener('load', async () => {
    try {
        if (!firebase.apps.length) {
            firebaseApp = firebase.initializeApp(firebaseConfig);
        } else {
            firebaseApp = firebase.app();
        }
        
        auth = firebase.auth();
        db = firebase.firestore();
        
        if (firebase.functions) {
            functions = firebase.functions();
        }
        
        initApp();
    } catch (error) {
        console.error('Firebase init failed:', error);
    }
});

function initApp() {
    updateCounters();
    setInterval(() => debounceCounters(), 30000);
    
    auth.onAuthStateChanged((user) => {
        checkAuthState(user);
    });

    setupEventListeners();
    setupDisclaimerHandlers();
}

// ==========================================
// 5. CORE LOGIC
// ==========================================

function debounceCounters() {
    clearTimeout(counterTimeout);
    counterTimeout = setTimeout(updateCounters, 500);
}

async function updateCounters() {
    if (!db) return;
    try {
        const usersSnap = await db.collection('users').get();
        const uEl = document.getElementById('total-users');
        if(uEl) uEl.textContent = usersSnap.size;

        const instSnap = await db.collection('institutions').get();
        const iEl = document.getElementById('total-institutions');
        if(iEl) iEl.textContent = instSnap.size;
    } catch(e) { /* console.error(e) */ }
}

// ==========================================
// ✅ AUTH STATE HANDLER (Persistence)
// ==========================================
async function checkAuthState(user) {
    currentUser = user;

    const userInfo = document.getElementById('user-info');
    const actionBtns = document.getElementById('action-buttons');
    const toolsSection = document.getElementById('tools-section');
    const featureSection = document.getElementById('features-section');
    const vipBadge = document.getElementById('user-tier-badge');
    const vipLock = document.getElementById('vip-lock-opioid');

    // --- USER LOGGED IN ---
    if (user) {
        // Hide UI immediately to prevent glitches
        if (toolsSection) toolsSection.style.display = 'none';
        if (featureSection) featureSection.style.display = 'none';
        if (actionBtns) actionBtns.classList.add('hidden');
        
        if (userInfo) userInfo.innerHTML = '<span style="font-size:13px; color:#475569">Verifying account...</span>';

        if (!user.emailVerified) {
            await auth.signOut();
            openLoginModal();
            const errDiv = document.getElementById('login-error-msg');
            if(errDiv) {
                errDiv.textContent = "Please verify your email first.";
                errDiv.style.display = 'block';
            }
            return;
        }

        try {
            await user.getIdToken(true);
            const getStatus = firebase.functions().httpsCallable('getUserStatus');
            const result = await getStatus();
            const statusData = result.data;

            // ⛔️ ADMIN REDIRECT LOGIC
            if (statusData.role === 'institutionAdmin') {
                if (!window.location.pathname.includes('Admin.html')) {
                    window.location.href = 'Admin.html';
                    return; 
                }
            }

            if (statusData.isSuspended) {
                handleSuspension(statusData, statusData.institutionName || "your institution");
                return;
            }

            isVipUser = statusData.isVip;
            if (statusData.customRatios) {
                localStorage.setItem('palliCalc_customRatios', JSON.stringify(statusData.customRatios));
                if (statusData.institutionName) {
                    localStorage.setItem('palliCalc_institutionName', statusData.institutionName);
                }
            }

            updateUIForLogin(statusData, user.email, false);

            if (toolsSection) {
                toolsSection.classList.add('visible');
                toolsSection.style.display = 'grid';
            }

        } catch(e) {
            console.error('Profile Error:', e);
            // Fallback for network issues
            isVipUser = false;
            updateUIForLogin({}, user.email, false);
            if (toolsSection) {
                toolsSection.classList.add('visible');
                toolsSection.style.display = 'grid';
            }
        }

    } 
    // --- USER LOGGED OUT ---
    else {
        localStorage.removeItem('palliCalc_customRatios');
        localStorage.removeItem('palliCalc_institutionName');

        if (userInfo) {
            userInfo.innerHTML = '<button id="login-btn" class="login-btn" aria-label="Login to access calculators">🔐 Login</button>';
            const newLoginBtn = document.getElementById('login-btn');
            if (newLoginBtn) newLoginBtn.addEventListener('click', openLoginModal);
        }

        if (actionBtns) actionBtns.classList.remove('hidden');

        if (toolsSection) {
            toolsSection.classList.remove('visible');
            toolsSection.style.display = 'none';
             toolsSection.innerHTML = `
                <h2 id="tools-title" style="text-align:center;font-size:24px;font-weight:700;color:#1e293b;margin-bottom:20px;">🛠️ Tools Available</h2>
                <a href="all-calculators.html" class="tool-btn"><span class="tool-icon">💊</span><span>All calculators</span></a>
                <a href="diagnostic-p.html" class="tool-btn"><span class="tool-icon">👤</span><span>Patient Measures (PROMs)</span></a>
                <a href="diagnostic-c.html" class="tool-btn"><span class="tool-icon">🩺</span><span>Clinician Assessments</span></a>
                <a href="patient-education.html" class="tool-btn"><span class="tool-icon">📄</span><span>Patient information pamphlets</span></a>
                <a href="healthcare-guidelines.html" class="tool-btn"><span class="tool-icon">📘</span><span>Healthcare guidelines</span></a>
            `;
        }

        if (featureSection) featureSection.style.display = 'block';
        if (vipBadge) vipBadge.style.display = 'none';
        if (vipLock) vipLock.style.display = 'none';
    }
}

// ==========================================
// 6. UI & SUSPENSION HELPERS
// ==========================================

function handleSuspension(userData, instName) {
    localStorage.removeItem('palliCalc_customRatios');
    localStorage.removeItem('palliCalc_institutionName');

    if (userData.role === 'institutionAdmin') {
        window.location.href = 'Admin/renewal.html';
        return;
    }

    updateUIForLogin(userData, currentUser.email, true); 
    showSuspensionNotice(instName);
}

function updateUIForLogin(userData, email, isSuspended) {
    const userInfo = document.getElementById('user-info');
    const vipBadge = document.getElementById('user-tier-badge');
    const vipLock = document.getElementById('vip-lock-opioid');
    const actionBtns = document.getElementById('action-buttons');
    const toolsSection = document.getElementById('tools-section');
    const featureSection = document.getElementById('features-section');
    const toolsTitle = document.querySelector('#tools-section h2');

    let displayName = userData.username || email.split('@')[0];
    let welcomeText = `Welcome, ${displayName}`;
    if (isVipUser) welcomeText += ' PRO';

    if (userInfo) {
        userInfo.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">
                <span class="welcome-text">${welcomeText}</span>
                <button id="logout-btn" style="width: 100%; padding: 6px 12px; font-size: 13px;">
                    <i class="bi bi-box-arrow-right"></i> Logout
                </button>
            </div>`;
        const logoutBtn = document.getElementById('logout-btn');
        if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    }

    if (actionBtns) actionBtns.classList.add('hidden');
    if (featureSection) featureSection.style.display = 'none';
    
    if (!isSuspended) {
        if (toolsSection) {
            toolsSection.classList.add('visible');
            toolsSection.style.display = 'grid'; 
        }
        if (toolsTitle) toolsTitle.textContent = '🛠️ Tools Available';
        if (vipBadge) vipBadge.style.display = isVipUser ? 'inline' : 'none';
        if (vipLock) vipLock.style.display = isVipUser ? 'inline-block' : 'none';
    }
}

function showSuspensionNotice(instName) {
    const toolsSection = document.getElementById('tools-section');
    if (toolsSection) {
        toolsSection.innerHTML = `
            <div class="suspended-alert-card" style="border: 1px solid #e2e8f0; background: #fffafa; padding: 2rem; text-align: center; border-radius: 12px; margin: 20px auto;">
                <i class="bi bi-shield-lock" style="color: #ef4444; font-size: 2.5rem; display:block; margin-bottom:1rem;"></i>
                <h3 style="color: #1e293b; margin-bottom: 0.5rem;">Service Temporarily Paused</h3>
                <p style="color: #475569; margin-bottom: 15px;">
                    The premium features for <strong>${instName}</strong> are currently unavailable.
                </p>
                <div id="notify-action-area" style="margin-top: 20px;">
                    <button id="notify-admin-btn" class="btn btn-outline-secondary">
                        <i class="bi bi-envelope"></i> Notify Admin
                    </button>
                </div>
            </div>
        `;
        toolsSection.classList.add('visible');
        toolsSection.style.display = 'block'; 

        const btn = document.getElementById('notify-admin-btn');
        if (btn) {
            btn.addEventListener('click', async function() {
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = 'Sending...';
                try {
                    const sendReminder = firebase.functions().httpsCallable('sendSuspensionReminder');
                    await sendReminder();
                    document.getElementById('notify-action-area').innerHTML = `<div style="color:green">Notification Sent</div>`;
                } catch (error) {
                    console.error("Reminder Failed:", error);
                    btn.innerHTML = 'Failed';
                }
            });
        }
    }
}

// ==========================================
// 7. EVENT LISTENERS
// ==========================================

async function handleLogout() {
    try {
        await auth.signOut();
        localStorage.removeItem('palliCalcLoginPassword');
        localStorage.removeItem('palliCalc_customRatios');
        window.location.reload(); 
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function setupEventListeners() {
    const loginForm = document.getElementById('login-form');
    const errorMsgDiv = document.getElementById('login-error-msg'); 

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(errorMsgDiv) errorMsgDiv.style.display = 'none';
            
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const submitBtn = loginForm.querySelector('.login-btn-submit');
            
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Logging in...';
            
            try {
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                localStorage.setItem('palliCalcLoginPassword', password);
                
                // 1. Get Token & Role Immediately
                const user = userCredential.user;
                const token = await user.getIdTokenResult(true);
                
                console.log("Login Role:", token.claims.role);

                // 2. FORCE REDIRECT FOR ADMIN
                if (token.claims.role === 'institutionAdmin') {
                    window.location.href = 'Admin.html';
                } else {
                    // 3. REGULAR USER: JUST RELOAD CURRENT PAGE (Index.html)
                    // This updates the UI state without sending them to app.html
                    window.location.reload();
                }
                
                closeLoginModal();
            } catch (error) {
                console.error("Login Error:", error.code);
                let userMessage = "Login failed. Please check credentials.";
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                      userMessage = "Incorrect email or password.";
                }
                if (errorMsgDiv) {
                    errorMsgDiv.textContent = userMessage;
                    errorMsgDiv.style.display = 'block';
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }

    // Modal Triggers
    document.addEventListener('click', function(e) {
        if (e.target.matches('#login-btn, #login-btn *')) openLoginModal();
        if (e.target.matches('#login-close, .login-close *')) closeLoginModal();
        if (e.target.matches('#login-modal')) closeLoginModal();
    });
}

function setupDisclaimerHandlers() {
    const disclaimerModal = document.getElementById('disclaimer-modal');
    const disclaimerAgree = document.getElementById('disclaimer-agree');
    const disclaimerProceed = document.getElementById('disclaimer-proceed');
    const disclaimerClose = document.getElementById('disclaimer-close');
    const demoBtn = document.getElementById('demo-btn');
    const registerBtn = document.getElementById('register-btn');

    if (!disclaimerModal || !demoBtn || !registerBtn) return;

    disclaimerAgree.addEventListener('change', function() {
        disclaimerProceed.disabled = !this.checked;
        disclaimerProceed.style.background = this.checked ? 'var(--primary-gradient)' : '#94a3b8';
    });

    demoBtn.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        showDisclaimer('demo');
    });

    registerBtn.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        showDisclaimer('register');
    });

    disclaimerProceed.addEventListener('click', function() {
        if (!disclaimerAgree.checked) return;
        const action = disclaimerProceed.dataset.action;
        closeDisclaimer();
        if (action === 'demo') window.location.href = 'calculators/demo-opioid.html'; 
        else if (action === 'register') window.location.href = 'register.html';
    });

    disclaimerClose.addEventListener('click', closeDisclaimer);
    disclaimerModal.addEventListener('click', function(e) {
        if (e.target === disclaimerModal) closeDisclaimer();
    });
}

function showDisclaimer(action) {
    const d = document.getElementById('disclaimer-modal');
    const p = document.getElementById('disclaimer-proceed');
    const a = document.getElementById('disclaimer-agree');
    d.style.display = 'flex';
    p.dataset.action = action;
    a.checked = false;
    p.disabled = true;
    p.style.background = '#94a3b8';
}

function closeDisclaimer() { document.getElementById('disclaimer-modal').style.display = 'none'; }
function openLoginModal() { document.getElementById('login-modal').style.display = 'flex'; }
function closeLoginModal() { document.getElementById('login-modal').style.display = 'none'; }
