// ==========================================
// 2. SMART FAVICON INJECTOR
// ==========================================
(function() {
    const version = '?v=2'; 

    const icons = [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' + version },
        { rel: 'mask-icon', href: '/favicon.svg' + version, color: '#5AAB8B' },
        { rel: 'apple-touch-icon', href: '/icon-192.png' + version } 
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
// INITIALIZE FIREBASE INSTANCES
// ==========================================
// NOTE: Firebase is already initialized in Admin.html
// We just grab the existing instances here.
const auth = firebase.auth();
const db = firebase.firestore();

// ==========================================
// 🔐 SECURITY & AUTH LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Attach event listeners
    const logoutBtn = document.getElementById('logoutBtn');
    if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    const transferBtn = document.getElementById('transferBtn');
    if(transferBtn) transferBtn.addEventListener('click', requestTransferLink);

    const feedbackBtn = document.getElementById('submitFeedbackBtn');
    if(feedbackBtn) feedbackBtn.addEventListener('click', submitFeedback);

    // Monitor Auth State (Master Unified Version)
    auth.onAuthStateChanged(async (user) => {
        const SUPER_ADMIN_EMAIL = "chai.alison@moh.gov.my";
        
        // UI Elements
        const loader = document.getElementById('pageLoader');
        const loginMsg = document.getElementById('loginMessage');
        const statusBar = document.getElementById('statusBar');
        const mainWrapper = document.getElementById('main-wrapper');
        const feedbackSection = document.getElementById('feedbackSection');
        
        // 1. Always hide the loader first!
        if (loader) loader.style.display = 'none';

        // Reset UI to hidden state
        if(loginMsg) loginMsg.classList.add('d-none');
        if(statusBar) statusBar.classList.add('d-none');
        if(mainWrapper) mainWrapper.classList.add('d-none');
        if(feedbackSection) feedbackSection.classList.add('d-none');

        // 2. Check if User exists (Not logged in)
        if (!user) {
            if(loginMsg) loginMsg.classList.remove('d-none');
            return;
        }

        try {
            // 3. Fetch Data & Check Security Role
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            // 🛑 STRICT SECURITY CHECK
            if (!userDoc.exists || userDoc.data().role !== 'institutionAdmin') {
                console.warn("Security Alert: Unauthorized access attempt.");
                if(loginMsg) {
                    // Overwrite the login form with an access denied message
                    loginMsg.innerHTML = `
                        <div class="card-body p-4 text-center">
                            <h4 class="card-title text-danger mb-4"><i class="bi bi-x-circle fs-2"></i><br>Access Denied</h4>
                            <p>You are logged in as <strong>${user.email}</strong>, but this account is not an Institution Admin.</p>
                            <hr>
                            <button onclick="handleLogout()" class="btn btn-danger w-100 mb-2">Logout</button>
                            <button onclick="window.location.href='index.html'" class="btn btn-outline-danger w-100">Go to User Home</button>
                        </div>`;
                    loginMsg.classList.remove('d-none');
                }
                return;
            }

            // 4. Access Granted! Set up the Dashboard
            const data = userDoc.data();
            const email = user.email.toLowerCase().trim();
            const isGov = email.endsWith('.gov.my') || email.endsWith('.moh.gov.my');
            const isPremium = data.isPremium === true;

            // Reveal the Main Content
            if(statusBar) statusBar.classList.remove('d-none');
            if(mainWrapper) mainWrapper.classList.remove('d-none');
            if(feedbackSection) feedbackSection.classList.remove('d-none');
            
            const adminEmailDisplay = document.getElementById('adminEmail');
            if(adminEmailDisplay) adminEmailDisplay.textContent = user.email;

            // 5. Card Visibility Logic
            
            // Super Admin
            const superCard = document.getElementById('superAdminCard');
            if (superCard && email === SUPER_ADMIN_EMAIL) {
                superCard.classList.remove('d-none');
            }

            // Upgrade Premium Card
            const upgradeCard = document.getElementById('upgradePremiumCard');
            if (upgradeCard) {
                if (isPremium) upgradeCard.classList.add('d-none');
                else upgradeCard.classList.remove('d-none');
            }

            // Billing Card
            const billingCard = document.getElementById('billingCard');
            if (billingCard) {
                if (isGov) billingCard.classList.add('d-none');
                else billingCard.classList.remove('d-none');
            }

        } catch (error) {
            console.error('Auth check failed:', error);
            if(loginMsg) {
                loginMsg.innerHTML = `<div class="alert alert-danger mx-auto mt-5" style="max-width: 400px;">Error: ${error.message}</div>`;
                loginMsg.classList.remove('d-none');
            }
        }
    });
});

function handleLogout() {
    auth.signOut().then(() => window.location.href = 'index.html');
}

// ==========================================
// 📧 TRANSFER ACCOUNT LOGIC
// ==========================================
async function requestTransferLink() {
    const status = document.getElementById('transferStatus');
    const btn = document.getElementById('transferBtn'); 
    const user = auth.currentUser;

    if (!user) return alert("Please log in first.");

    // Disable button immediately
    btn.disabled = true;
    const originalText = '<i class="bi bi-envelope me-2"></i> Send Transfer Link';
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
    
    try {
        const idToken = await user.getIdToken();

        // Call Backend Function
        const response = await fetch('https://us-central1-pallicalc-eabdc.cloudfunctions.net/requestTransferLink', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (response.ok) {
            status.innerHTML = `
            <div class="alert alert-success alert-dismissible fade show mt-2">
                <strong>Email Sent!</strong><br>
                ⚠️ <strong>Please Wait:</strong> Due to firewall security, the email may take <strong>up to 10 minutes</strong> to arrive.<br>
                Please do not press send again.
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
            `;
            
            alert("✅ Email Sent!\n\nNOTE: Due to government firewall security, it may take up to 10 MINUTES to arrive.\n\nPlease be patient.");

            // Anti-Spam Timer (2 minutes)
            btn.innerText = "Email Sent (Wait 2m)";
            btn.classList.add('btn-secondary'); // Visual disable style
            btn.classList.remove('btn-warning');
            
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalText;
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-warning');
            }, 120000); 

        } else {
            throw new Error(data.error || "Server rejected request.");
        }

    } catch (error) {
        status.innerHTML = `<div class="alert alert-danger mt-2">Failed: ${error.message}</div>`;
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ==========================================
// 💬 FEEDBACK LOGIC
// ==========================================
async function submitFeedback() {
    const title = document.getElementById('feedbackTitle').value.trim();
    const text = document.getElementById('feedbackText').value.trim();
    const status = document.getElementById('feedbackStatus');
    const user = auth.currentUser;

    if (!title || !text) {
        status.innerHTML = '<div class="alert alert-warning">Please fill title and message</div>';
        return;
    }

    status.innerHTML = '<div class="alert alert-info">Sending feedback...</div>';

    try {
        await db.collection('adminFeedback').add({
            title, 
            text,
            adminEmail: user.email,
            uid: user.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        status.innerHTML = `<div class="alert alert-success alert-dismissible fade show">Thank you! Feedback received.<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`;
        document.getElementById('feedbackTitle').value = '';
        document.getElementById('feedbackText').value = '';
    } catch (error) {
        status.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}

// ==========================================
// 🔑 IN-PAGE LOGIN LOGIC
// ==========================================
async function handleAdminLogin(event) {
    event.preventDefault(); // Stops the page from refreshing

    const email = document.getElementById('adminLoginEmail').value.trim();
    const password = document.getElementById('adminLoginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const submitBtn = document.getElementById('loginSubmitBtn');

    // Reset UI for loading state
    errorDiv.classList.add('d-none');
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verifying...';
    submitBtn.disabled = true;

    try {
        // Log the user in
        await auth.signInWithEmailAndPassword(email, password);
        
        // SUCCESS! 
        // We don't need redirect code here. The existing auth.onAuthStateChanged 
        // listener above will automatically hide the login form and show the dashboard!
        
    } catch (error) {
        // Handle incorrect passwords or emails
        console.error("Login Error:", error);
        errorDiv.textContent = "Invalid email or password. Please try again.";
        errorDiv.classList.remove('d-none');
        
        // Reset the button so they can try again
        submitBtn.innerHTML = 'Sign In to Dashboard';
        submitBtn.disabled = false;
    }
}