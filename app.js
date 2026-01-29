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

let firebaseApp, auth, db;
let currentUser = null;
let isVipUser = false;
let counterTimeout;

// Initialize Firebase
window.addEventListener('load', async () => {
    try {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
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
        const usersSnap = await db.collection('users').get();
        document.getElementById('total-users').textContent = usersSnap.size;

        const instSnap = await db.collection('institutions').get();
        document.getElementById('total-institutions').textContent = instSnap.size;

        console.log("Counters updated:", usersSnap.size, instSnap.size);

    } catch(e) {
        console.error('Counter Error:', e);
        document.getElementById('total-users').textContent = "-";
        document.getElementById('total-institutions').textContent = "-";
    }
}

// ✅ UPDATED: Auth state handler with SUSPENSION GATEKEEPER
async function checkAuthState(user) {
    currentUser = user;
    const userInfo = document.getElementById('user-info');
    
    // UI Elements
    const vipBadge = document.getElementById('user-tier-badge');
    const vipLock = document.getElementById('vip-lock-opioid');
    const actionBtns = document.getElementById('action-buttons');
    const toolsSection = document.getElementById('tools-section');
    const featureSection = document.getElementById('features-section');
    const toolsTitle = document.querySelector('#tools-section h2');
    const featureTitle = document.querySelector('#features-section h2');
    
    if (user) {
        // 🛑 SECURITY CHECK: IS EMAIL VERIFIED?
        if (!user.emailVerified) {
            console.log("User email not verified. Logging out.");
            await auth.signOut();
            const errorDiv = document.getElementById('login-error-msg');
            if(errorDiv) {
                errorDiv.textContent = "Please verify your email address before logging in. Check your inbox (and spam).";
                errorDiv.style.display = 'block';
            }
            openLoginModal();
            return;
        }

        try {
            // 1. Get User Profile
            const userDoc = await db.collection('users').doc(user.uid).get();
            let userData = {};
            
            if (userDoc.exists) {
                userData = userDoc.data();
                const instId = userData.institutionId;

                // 🛑 GATEKEEPER: Check if Institution is SUSPENDED
                if (instId) {
                    const instDoc = await db.collection('institutions').doc(instId).get();
                    if (instDoc.exists && instDoc.data().status === 'suspended') {
                        
                        // A. Wipe Premium Data Immediately
                        localStorage.removeItem('palliCalc_customRatios');
                        localStorage.removeItem('palliCalc_institutionName');

                        // B. Handle Admin vs Staff
                        if (userData.role === 'institutionAdmin') {
                            console.log("Admin Suspended. Redirecting...");
                            window.location.href = 'Admin/renewal.html';
                            return;
                        } else {
                            // Staff: Show polite lockout and STOP here
                            updateUIForLogin(userData, user.email, true); // True = show logout button
                            showSuspensionNotice(instDoc.data().name || "your institution");
                            return; 
                        }
                    }
                }

                // 🟢 ACTIVE ACCOUNT LOGIC
                
                // If Admin -> Go to Dashboard
                if (userData.role === 'institutionAdmin') {
                    console.log("Admin detected. Redirecting to Dashboard...");
                    window.location.href = 'Admin.html';
                    return;
                }

                // If Institution User -> Load Custom Ratios
                if (userData.role === 'institutionUser' && instId) {
                    const instDoc = await db.collection('institutions').doc(instId).get();
                    if (instDoc.exists) {
                        const instData = instDoc.data();
                        if (instData.customRatios) {
                            localStorage.setItem('palliCalc_customRatios', JSON.stringify(instData.customRatios));
                            localStorage.setItem('palliCalc_institutionName', instData.name);
                        }
                    }
                } else {
                    localStorage.removeItem('palliCalc_customRatios');
                    localStorage.removeItem('palliCalc_institutionName');
                }

                isVipUser = userData.billingStatus === 'trial-free-lifetime' || userData.billingStatus === 'active-first-year' || userData.role === 'institutionUser';
            }

            // Update UI for successful login
            updateUIForLogin(userData, user.email, false);
            
        } catch(e) {
            console.error('Error fetching profile:', e);
        }
        
    } else {
        // ✅ LOGOUT STATE
        localStorage.removeItem('palliCalc_customRatios');
        localStorage.removeItem('palliCalc_institutionName');

        if (userInfo) {
            userInfo.innerHTML = '<button id="login-btn" class="login-btn" aria-label="Login to access tools">🔐 Login</button>';
        }
        
        if (actionBtns) actionBtns.classList.remove('hidden');
        if (toolsSection) toolsSection.classList.remove('visible');
        if (featureSection) featureSection.style.display = '';
        if (featureTitle) featureTitle.textContent = "What You'll Get";
        
        if (vipBadge) vipBadge.style.display = 'none';
        if (vipLock) vipLock.style.display = 'none';

        const newLoginBtn = document.getElementById('login-btn');
        if (newLoginBtn) newLoginBtn.addEventListener('click', openLoginModal);
    }
}

// Helper to update UI elements (Shared between active and suspended states)
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
                <button id="logout-btn" aria-label="Logout" style="width: 100%; padding: 6px 12px; font-size: 13px;">
                    <i class="bi bi-box-arrow-right"></i> Logout
                </button>
            </div>`;
    }
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    if (actionBtns) actionBtns.classList.add('hidden');
    if (featureSection) featureSection.style.display = 'none';
    
    // If not suspended, show tools normaly
    if (!isSuspended) {
        if (toolsSection) toolsSection.classList.add('visible');
        if (toolsTitle) toolsTitle.textContent = '🛠️ Tools Available';
        if (vipBadge) vipBadge.style.display = isVipUser ? 'inline' : 'none';
        if (vipLock) vipLock.style.display = isVipUser ? 'inline-block' : 'none';
    }
}

// 📢 NEW: Polite Suspension Notice
function showSuspensionNotice(instName) {
    const toolsSection = document.getElementById('tools-section');
    if (toolsSection) {
        toolsSection.innerHTML = `
            <div class="suspended-alert-card">
                <i class="bi bi-shield-lock"></i>
                <h3>Access Temporarily Paused</h3>
                <p>The premium features for <strong>${instName}</strong> are currently unavailable.</p>
                <p class="note">Please contact your <strong>Institution Admin</strong> to renew the departmental subscription.</p>
                <p style="font-size:12px; margin-top:10px; color:#94a3b8;">Standard demo tools remain accessible.</p>
            </div>
        `;
        toolsSection.classList.add('visible');
    }
}

// Handle logout
async function handleLogout() {
    try {
        await auth.signOut();
        localStorage.removeItem('palliCalcLoginPassword');
        console.log('Logged out successfully');
    } catch (error) {
        console.error('Logout error:', error);
        auth.signOut();
    }
}

// Event listeners
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
                let userMessage = "An unexpected error occurred. Please try again.";
                
                switch (error.code) {
                    case 'auth/invalid-credential':
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        userMessage = "Incorrect email or password.";
                        break;
                    case 'auth/invalid-email':
                        userMessage = "Invalid email address format.";
                        break;
                    case 'auth/too-many-requests':
                        userMessage = "Too many failed attempts. Try again later.";
                        break;
                    case 'auth/user-disabled':
                        userMessage = "This account has been disabled.";
                        break;
                }

                if (errorMsgDiv) {
                    errorMsgDiv.textContent = userMessage;
                    errorMsgDiv.style.display = 'block';
                } else {
                    alert(userMessage);
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }

    const feedbackForm = document.getElementById('feedback-form');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!db) {
                alert('Feedback saved locally. Email: support@pallicalc.com');
                return;
            }
            const feedback = document.getElementById('feedback-text').value.trim();
            const email = document.getElementById('feedback-email').value.trim();
            
            try {
                await db.collection('feedback').add({
                    feedback: feedback,
                    email: email || 'anonymous',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userId: currentUser?.uid || null,
                    isVip: isVipUser
                });
                alert('✅ Thank you for your feedback!');
                feedbackForm.reset();
            } catch(e) {
                alert('Feedback saved locally. Email: support@pallicalc.com');
            }
        });
    }

    document.addEventListener('click', function(e) {
        if (e.target.matches('#login-btn, #login-btn *')) openLoginModal();
        if (e.target.matches('#login-close, .login-close *')) closeLoginModal();
        if (e.target.matches('#login-modal')) closeLoginModal();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeLoginModal();
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
        e.preventDefault();
        e.stopPropagation();
        showDisclaimer('demo');
    });

    registerBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showDisclaimer('register');
    });

    disclaimerProceed.addEventListener('click', function() {
        if (!disclaimerAgree.checked) return;
        const action = disclaimerProceed.dataset.action;
        closeDisclaimer();
        
        if (action === 'demo') {
            window.location.href = 'calculators/demo-opioid.html'; 
        } else if (action === 'register') {
            window.location.href = 'register.html';
        }
    });

    disclaimerClose.addEventListener('click', closeDisclaimer);
    disclaimerModal.addEventListener('click', function(e) {
        if (e.target === disclaimerModal) closeDisclaimer();
    });
}

function showDisclaimer(action) {
    const disclaimerModal = document.getElementById('disclaimer-modal');
    const disclaimerProceed = document.getElementById('disclaimer-proceed');
    const disclaimerAgree = document.getElementById('disclaimer-agree');
    
    disclaimerModal.style.display = 'flex';
    disclaimerProceed.dataset.action = action;
    disclaimerAgree.checked = false;
    disclaimerProceed.disabled = true;
    disclaimerProceed.style.background = '#94a3b8';
    disclaimerAgree.focus();
}

function closeDisclaimer() {
    document.getElementById('disclaimer-modal').style.display = 'none';
}

function openLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
    document.getElementById('login-email').focus();
}

function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('login-form').reset();
    
    const errorDiv = document.getElementById('login-error-msg');
    if(errorDiv) errorDiv.style.display = 'none';
}
