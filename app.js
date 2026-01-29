// 🔥 PRODUCTION FIREBASE CONFIG
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

// Initialize Firebase
window.addEventListener('load', async () => {
    try {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        // Initialize Functions if available (safeguard)
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
    auth.onAuthStateChanged(checkAuthState);
    setupEventListeners();
    setupDisclaimerHandlers();
}

// Debounced counters
function debounceCounters() {
    clearTimeout(counterTimeout);
    counterTimeout = setTimeout(updateCounters, 500);
}

// Counts ALL users and institutions
async function updateCounters() {
    if (!db) return;
    try {
        // Because rules allow 'list', this works even if specific docs are blocked
        const usersSnap = await db.collection('users').get();
        document.getElementById('total-users').textContent = usersSnap.size;

        const instSnap = await db.collection('institutions').get();
        document.getElementById('total-institutions').textContent = instSnap.size;
    } catch(e) {
        console.error('Counter Error:', e);
        document.getElementById('total-users').textContent = "-";
        document.getElementById('total-institutions').textContent = "-";
    }
}

// ✅ ROBUST AUTH HANDLER (The Gatekeeper)
async function checkAuthState(user) {
    currentUser = user;
    
    // UI Elements
    const userInfo = document.getElementById('user-info');
    const vipBadge = document.getElementById('user-tier-badge');
    const vipLock = document.getElementById('vip-lock-opioid');
    const actionBtns = document.getElementById('action-buttons');
    const toolsSection = document.getElementById('tools-section');
    const featureSection = document.getElementById('features-section');
    const toolsTitle = document.querySelector('#tools-section h2');
    const featureTitle = document.querySelector('#features-section h2');

    if (user) {
        // 1. Email Verification Check
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
            // 2. Get User Profile
            const userDoc = await db.collection('users').doc(user.uid).get();
            let userData = {};
            
            if (userDoc.exists) {
                userData = userDoc.data();
                const instId = userData.institutionId;

                // 🛑 GATEKEEPER LOGIC (Crucial Fix)
                if (instId) {
                    try {
                        // Attempt to read the institution document
                        const instDoc = await db.collection('institutions').doc(instId).get();
                        
                        // Check A: Read succeeded, check status field manually
                        if (instDoc.exists && instDoc.data().status === 'suspended') {
                            handleSuspension(userData, instDoc.data().name);
                            return; // STOP: Do not load tools
                        }
                        
                        // ✅ ACTIVE: Load Custom Ratios for Staff
                        if (userData.role === 'institutionUser' && instDoc.exists) {
                            const instData = instDoc.data();
                            if (instData.customRatios) {
                                localStorage.setItem('palliCalc_customRatios', JSON.stringify(instData.customRatios));
                                localStorage.setItem('palliCalc_institutionName', instData.name);
                            }
                        }

                    } catch (err) {
                        // Check B: Read FAILED (Security Rules blocked it)
                        // This implies the institution IS suspended because rules block 'get' on suspended docs
                        console.warn("Institution Blocked (Suspended):", err);
                        handleSuspension(userData, userData.institutionName || "your institution");
                        return; // STOP: Do not load tools
                    }
                }

                // 🟢 ACTIVE ACCOUNT (Proceed if not suspended)
                
                // If Admin -> Redirect to Dashboard
                if (userData.role === 'institutionAdmin') {
                    window.location.href = 'Admin.html';
                    return;
                }

                // Determine VIP Status
                isVipUser = userData.billingStatus === 'trial-free-lifetime' || 
                            userData.billingStatus === 'active-first-year' || 
                            userData.role === 'institutionUser';
            }

            // Update UI for Active User
            updateUIForLogin(userData, user.email, false);
            
        } catch(e) {
            console.error('Profile Load Error:', e);
        }
        
    } else {
        // ✅ LOGOUT STATE
        localStorage.removeItem('palliCalc_customRatios');
        localStorage.removeItem('palliCalc_institutionName');

        if (userInfo) userInfo.innerHTML = '<button id="login-btn" class="login-btn">🔐 Login</button>';
        
        if (actionBtns) actionBtns.classList.remove('hidden');
        
        if (toolsSection) {
            toolsSection.classList.remove('visible');
            toolsSection.style.display = ''; // Reset CSS
            toolsSection.innerHTML = `
                <h2 style="text-align:center;font-size:24px;font-weight:700;color:#1e293b;margin-bottom:20px;">
                    🛠️ Tools Available
                </h2>
                `;
            // Note: Ideally, you should restore the original HTML of tools-section here if it was modified
            // For now, reloading the page on logout is the cleanest way to reset the DOM
        }

        if (featureSection) featureSection.style.display = '';
        if (vipBadge) vipBadge.style.display = 'none';
        if (vipLock) vipLock.style.display = 'none';

        const newLoginBtn = document.getElementById('login-btn');
        if (newLoginBtn) newLoginBtn.addEventListener('click', openLoginModal);
    }
}



// 🛡️ HELPER: Handle Suspension (The "Lockout")
function handleSuspension(userData, instName) {
    // 1. Wipe Data
    localStorage.removeItem('palliCalc_customRatios');
    localStorage.removeItem('palliCalc_institutionName');

    // 2. Admin Redirect
    if (userData.role === 'institutionAdmin') {
        window.location.href = 'Admin/renewal.html';
        return;
    }

    // 3. Staff Notice (Stay on page, show alert)
    updateUIForLogin(userData, currentUser.email, true); 
    showSuspensionNotice(instName);
}

// Helper: Update UI Elements
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
        document.getElementById('logout-btn').addEventListener('click', handleLogout);
    }

    if (actionBtns) actionBtns.classList.add('hidden');
    if (featureSection) featureSection.style.display = 'none';
    
    // Only show standard tools if NOT suspended
    if (!isSuspended) {
        if (toolsSection) {
            toolsSection.classList.add('visible');
            toolsSection.style.display = 'block'; 
        }
        if (toolsTitle) toolsTitle.textContent = '🛠️ Tools Available';
        if (vipBadge) vipBadge.style.display = isVipUser ? 'inline' : 'none';
        if (vipLock) vipLock.style.display = isVipUser ? 'inline-block' : 'none';
    }
}

// 📢 SHOW NOTICE (With forced visibility)
function showSuspensionNotice(instName) {
    const toolsSection = document.getElementById('tools-section');
    if (toolsSection) {
        // Inject the Alert Card
        toolsSection.innerHTML = `
            <div class="suspended-alert-card" style="border: 1px solid #e2e8f0; background: #fffafa; padding: 2rem; text-align: center; border-radius: 12px; margin: 20px auto;">
                <i class="bi bi-shield-lock" style="color: #ef4444; font-size: 2.5rem; display:block; margin-bottom:1rem;"></i>
                <h3 style="color: #1e293b; margin-bottom: 0.5rem;">Service Temporarily Paused</h3>
                <p style="color: #475569; margin-bottom: 15px;">
                    The premium features for <strong>${instName}</strong> are currently unavailable.
                </p>
                
                <div id="notify-action-area" style="margin-top: 20px;">
                    <button id="notify-admin-btn" class="btn btn-outline-secondary" style="font-size: 13px; border-radius: 20px; padding: 8px 20px; cursor: pointer; background: #fff; border: 1px solid #94a3b8; color: #475569;">
                        <i class="bi bi-envelope"></i> Notify Admin
                    </button>
                </div>
                
                <div style="margin-top: 20px; font-size: 13px; color: #0f5132; background: #f0fdf4; padding: 8px; border-radius: 6px; display: inline-block;">
                    <i class="bi bi-check-circle"></i> Standard PalliCalc tools remain active.
                </div>
            </div>
        `;
        
        toolsSection.classList.add('visible');
        toolsSection.style.display = 'block'; // FORCE VISIBILITY to override any hidden state

        // Add Click Listener for Notify Button
        const btn = document.getElementById('notify-admin-btn');
        if (btn) {
            btn.addEventListener('click', async function() {
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
                
                try {
                    if (!firebase.functions) throw new Error("Functions SDK not loaded");
                    const sendReminder = firebase.functions().httpsCallable('sendSuspensionReminder');
                    await sendReminder();
                    
                    document.getElementById('notify-action-area').innerHTML = `
                        <div style="color: #475569; background: #f1f5f9; padding: 15px; border-radius: 8px; margin-top: 10px;">
                            <i class="bi bi-send-check"></i> <strong>Notification Sent</strong><br>
                            Your admin has been updated.
                        </div>
                    `;
                } catch (error) {
                    console.error("Reminder Failed:", error);
                    btn.innerHTML = '❌ Failed. Try again.';
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                    }, 3000);
                }
            });
        }
    }
}

// Handle logout
async function handleLogout() {
    try {
        await auth.signOut();
        localStorage.removeItem('palliCalcLoginPassword');
        window.location.reload(); // Refresh to clean state
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Event listeners setup
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
                await auth.signInWithEmailAndPassword(email, password);
                localStorage.setItem('palliCalcLoginPassword', password);
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

// DISCLAIMER MODAL HANDLERS
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